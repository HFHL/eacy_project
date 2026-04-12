/**
 * 上传管理器 Hook
 * 支持：并发上传、状态持久化、失败重试、断点续传
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { uploadDocument } from '../api/document'

// localStorage 存储键前缀（实际键为 upload_manager_state_${userId}，按账号隔离）
const STORAGE_KEY_PREFIX = 'upload_manager_state'
const getStorageKey = (userId) => `${STORAGE_KEY_PREFIX}_${userId ?? 'anonymous'}`

// 上传状态枚举
export const UploadStatus = {
  PENDING: 'pending',     // 待上传
  UPLOADING: 'uploading', // 上传中
  SUCCESS: 'success',     // 上传成功
  FAILED: 'failed',       // 上传失败
  CANCELLED: 'cancelled', // 已取消
}

// 生成文件指纹（用于去重和断点续传）
const generateFileFingerprint = (file) => {
  return `${file.name}_${file.size}_${file.lastModified}`
}

// 生成唯一任务ID
const generateTaskId = () => {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 上传管理器 Hook
 * @param {Object} options 配置选项
 * @param {string} options.userId 当前用户 ID，用于按账号隔离 localStorage 缓存（换账号后不显示上一账号的上传队列）
 * @param {number} options.concurrency 并发数量，默认 3
 * @param {number} options.maxRetries 最大重试次数，默认 3
 * @param {Function} options.onTaskComplete 单个任务完成回调
 * @param {Function} options.onAllComplete 全部任务完成回调
 */
export const useUploadManager = (options = {}) => {
  const {
    userId = null,
    concurrency = 3,
    maxRetries = 3,
    onTaskComplete,
    onAllComplete,
  } = options

  // 上传任务列表
  const [tasks, setTasks] = useState([])
  // 上传面板是否可见
  const [panelVisible, setPanelVisible] = useState(false)
  // 是否正在上传
  const [isUploading, setIsUploading] = useState(false)
  // 是否暂停
  const [isPaused, setIsPaused] = useState(false)
  
  // 文件对象映射（File 对象不能序列化，需要单独存储）
  const fileMapRef = useRef(new Map())
  // 当前正在上传的任务数量
  const activeCountRef = useRef(0)
  // 是否已暂停
  const isPausedRef = useRef(false)
  // AbortController 映射，用于取消上传
  const abortControllersRef = useRef(new Map())
  // 防止同一个任务被队列调度重复启动（避免同一文件出现两条 document 记录）
  const inFlightTaskIdsRef = useRef(new Set())
  // 当前生效的 userId（用于 saveState 时取正确的 key）
  const userIdRef = useRef(userId)

  userIdRef.current = userId

  // 同步暂停状态到 ref
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  // 按账号隔离：换账号时清空当前内存状态，并从该账号的 localStorage 恢复（若无则空列表）；登出时不恢复
  useEffect(() => {
    abortControllersRef.current.forEach(controller => controller.abort())
    abortControllersRef.current.clear()
    fileMapRef.current.clear()
    setTasks([])
    setIsUploading(false)
    setIsPaused(false)

    if (userId == null) {
      // 未登录：不恢复任何缓存，避免登出后仍显示上一账号数据
      return
    }

    try {
      const storageKey = getStorageKey(userId)
      const savedState = localStorage.getItem(storageKey)
      if (savedState) {
        const { tasks: savedTasks } = JSON.parse(savedState)
        const restoredTasks = savedTasks
          .filter(t => t.status !== UploadStatus.SUCCESS)
          .map(t => ({
            ...t,
            status: t.status === UploadStatus.UPLOADING ? UploadStatus.PENDING : t.status,
            progress: 0,
            needsFile: true,
          }))
        if (restoredTasks.length > 0) {
          setTasks(restoredTasks)
          setPanelVisible(true)
        }
      }
    } catch (e) {
      console.error('恢复上传状态失败:', e)
    }
  }, [userId])

  // 保存状态到当前账号对应的 localStorage
  const saveState = useCallback((tasksToSave) => {
    try {
      const storageKey = getStorageKey(userIdRef.current)
      const stateToSave = {
        tasks: tasksToSave.map(({ file, ...rest }) => rest),
        savedAt: Date.now(),
      }
      localStorage.setItem(storageKey, JSON.stringify(stateToSave))
    } catch (e) {
      console.error('保存上传状态失败:', e)
    }
  }, [])

  // 更新任务状态
  const updateTask = useCallback((taskId, updates) => {
    setTasks(prev => {
      const newTasks = prev.map(t => 
        t.id === taskId ? { ...t, ...updates } : t
      )
      saveState(newTasks)
      return newTasks
    })
  }, [saveState])

  // 执行单个上传任务
  const executeUpload = useCallback(async (task) => {
    // 二次保护：同一 task 只允许进入一次
    if (inFlightTaskIdsRef.current.has(task.id)) {
      return
    }
    inFlightTaskIdsRef.current.add(task.id)

    const file = fileMapRef.current.get(task.id)
    if (!file) {
      updateTask(task.id, { 
        status: UploadStatus.FAILED, 
        error: '文件对象丢失，请重新选择文件' 
      })
      inFlightTaskIdsRef.current.delete(task.id)
      return
    }

    // 创建 AbortController
    const abortController = new AbortController()
    abortControllersRef.current.set(task.id, abortController)

    updateTask(task.id, { status: UploadStatus.UPLOADING, progress: 0 })
    activeCountRef.current++

    try {
      const response = await uploadDocument(file, (percent) => {
        updateTask(task.id, { progress: percent })
      }, abortController.signal)

      if (response.success) {
        updateTask(task.id, { 
          status: UploadStatus.SUCCESS, 
          progress: 100,
          completedAt: Date.now(),
          documentId: response.data?.id
        })
        onTaskComplete?.(task, response.data)
      } else {
        throw new Error(response.message || '上传失败')
      }
    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        updateTask(task.id, { 
          status: UploadStatus.CANCELLED, 
          error: '上传已取消' 
        })
      } else {
        const retryCount = (task.retryCount || 0) + 1
        if (retryCount < maxRetries) {
          // 自动重试
          updateTask(task.id, { 
            status: UploadStatus.PENDING, 
            retryCount,
            error: `${error.message}，将自动重试 (${retryCount}/${maxRetries})`
          })
        } else {
          updateTask(task.id, { 
            status: UploadStatus.FAILED, 
            error: error.response?.data?.message || error.message || '上传失败',
            retryCount
          })
        }
      }
    } finally {
      activeCountRef.current--
      abortControllersRef.current.delete(task.id)
      inFlightTaskIdsRef.current.delete(task.id)
    }
  }, [updateTask, maxRetries, onTaskComplete])

  // 处理上传队列
  const processQueue = useCallback(() => {
    if (isPausedRef.current) return

    setTasks(currentTasks => {
      const pendingTasks = currentTasks.filter(t =>
        t.status === UploadStatus.PENDING &&
        !t.needsFile &&
        !inFlightTaskIdsRef.current.has(t.id)
      )
      const availableSlots = concurrency - activeCountRef.current

      if (availableSlots <= 0 || pendingTasks.length === 0) {
        // 检查是否全部完成
        const hasActiveOrPending = currentTasks.some(
          t => t.status === UploadStatus.UPLOADING || 
               (t.status === UploadStatus.PENDING && !t.needsFile)
        )
        if (!hasActiveOrPending && currentTasks.length > 0) {
          setIsUploading(false)
          const successCount = currentTasks.filter(t => t.status === UploadStatus.SUCCESS).length
          const failedCount = currentTasks.filter(t => t.status === UploadStatus.FAILED).length
          onAllComplete?.({ successCount, failedCount, total: currentTasks.length })
        }
        return currentTasks
      }

      // 启动新的上传任务
      const tasksToStart = pendingTasks.slice(0, availableSlots)
      tasksToStart.forEach(task => {
        executeUpload(task)
      })

      return currentTasks
    })
  }, [concurrency, executeUpload, onAllComplete])

  // 监听任务状态变化，处理队列
  useEffect(() => {
    if (isUploading && !isPaused) {
      const timer = setTimeout(processQueue, 100)
      return () => clearTimeout(timer)
    }
  }, [tasks, isUploading, isPaused, processQueue])

  // 添加文件到上传队列
  const addFiles = useCallback((files, existingFingerprints = new Set()) => {
    const newTasks = []
    
    files.forEach(file => {
      const fingerprint = generateFileFingerprint(file)
      
      // 检查是否已存在（去重）
      if (existingFingerprints.has(fingerprint)) {
        console.log(`跳过已上传文件: ${file.name}`)
        return
      }

      // 检查当前队列是否已有
      const existsInQueue = tasks.some(t => t.fingerprint === fingerprint)
      if (existsInQueue) {
        console.log(`跳过队列中已存在的文件: ${file.name}`)
        return
      }

      const taskId = generateTaskId()
      const task = {
        id: taskId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fingerprint,
        status: UploadStatus.PENDING,
        progress: 0,
        error: null,
        retryCount: 0,
        createdAt: Date.now(),
        completedAt: null,
        needsFile: false,
      }

      // 存储文件对象
      fileMapRef.current.set(taskId, file)
      newTasks.push(task)
    })

    if (newTasks.length > 0) {
      setTasks(prev => {
        const updated = [...prev, ...newTasks]
        saveState(updated)
        return updated
      })
      setPanelVisible(true)
    }

    return newTasks.length
  }, [tasks, saveState])

  // 开始上传
  const startUpload = useCallback(() => {
    setIsUploading(true)
    setIsPaused(false)
    processQueue()
  }, [processQueue])

  // 暂停上传
  const pauseUpload = useCallback(() => {
    setIsPaused(true)
  }, [])

  // 恢复上传
  const resumeUpload = useCallback(() => {
    setIsPaused(false)
    processQueue()
  }, [processQueue])

  // 取消单个任务
  const cancelTask = useCallback((taskId) => {
    const abortController = abortControllersRef.current.get(taskId)
    if (abortController) {
      abortController.abort()
    }
    updateTask(taskId, { status: UploadStatus.CANCELLED, error: '已取消' })
  }, [updateTask])

  // 重试单个任务
  const retryTask = useCallback((taskId) => {
    const task = tasks.find(t => t.id === taskId)
    if (task && fileMapRef.current.has(taskId)) {
      updateTask(taskId, { 
        status: UploadStatus.PENDING, 
        progress: 0, 
        error: null,
        retryCount: 0 
      })
      if (!isUploading) {
        startUpload()
      }
    } else {
      updateTask(taskId, { needsFile: true, error: '请重新选择文件' })
    }
  }, [tasks, updateTask, isUploading, startUpload])

  // 重试所有失败的任务
  const retryAllFailed = useCallback(() => {
    const failedTasks = tasks.filter(t => t.status === UploadStatus.FAILED)
    failedTasks.forEach(task => {
      if (fileMapRef.current.has(task.id)) {
        updateTask(task.id, { 
          status: UploadStatus.PENDING, 
          progress: 0, 
          error: null,
          retryCount: 0 
        })
      }
    })
    if (!isUploading) {
      startUpload()
    }
  }, [tasks, updateTask, isUploading, startUpload])

  // 清除已完成的任务
  const clearCompleted = useCallback(() => {
    setTasks(prev => {
      const remaining = prev.filter(t => 
        t.status !== UploadStatus.SUCCESS && t.status !== UploadStatus.CANCELLED
      )
      // 清理文件映射
      prev.forEach(t => {
        if (t.status === UploadStatus.SUCCESS || t.status === UploadStatus.CANCELLED) {
          fileMapRef.current.delete(t.id)
        }
      })
      saveState(remaining)
      return remaining
    })
  }, [saveState])

  // 清除所有任务
  const clearAll = useCallback(() => {
    abortControllersRef.current.forEach(controller => controller.abort())
    abortControllersRef.current.clear()
    fileMapRef.current.clear()
    setTasks([])
    setIsUploading(false)
    setIsPaused(false)
    localStorage.removeItem(getStorageKey(userIdRef.current))
  }, [])

  // 移除单个任务
  const removeTask = useCallback((taskId) => {
    cancelTask(taskId)
    setTasks(prev => {
      const remaining = prev.filter(t => t.id !== taskId)
      fileMapRef.current.delete(taskId)
      saveState(remaining)
      return remaining
    })
  }, [cancelTask, saveState])

  // 为需要重新选择文件的任务绑定文件
  const bindFileToTask = useCallback((taskId, file) => {
    fileMapRef.current.set(taskId, file)
    updateTask(taskId, { 
      needsFile: false, 
      status: UploadStatus.PENDING,
      fingerprint: generateFileFingerprint(file)
    })
  }, [updateTask])

  // 统计信息
  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === UploadStatus.PENDING).length,
    uploading: tasks.filter(t => t.status === UploadStatus.UPLOADING).length,
    success: tasks.filter(t => t.status === UploadStatus.SUCCESS).length,
    failed: tasks.filter(t => t.status === UploadStatus.FAILED).length,
    cancelled: tasks.filter(t => t.status === UploadStatus.CANCELLED).length,
    needsFile: tasks.filter(t => t.needsFile).length,
  }

  return {
    // 状态
    tasks,
    stats,
    isUploading,
    isPaused,
    panelVisible,
    
    // 面板控制
    setPanelVisible,
    
    // 操作方法
    addFiles,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelTask,
    retryTask,
    retryAllFailed,
    removeTask,
    clearCompleted,
    clearAll,
    bindFileToTask,
  }
}

export default useUploadManager
