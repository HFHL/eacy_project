/**
 * 上传管理器 Hook
 * 支持：并发上传、状态持久化、失败重试、断点续传
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { message } from 'antd'
import { uploadDocument } from '../api/document'
import { validateUploadBatch } from '../constants/uploadLimits'
import {
  createUploadTask,
  getUploadStats,
  UploadStatus,
} from './uploadManager/model'
import { useUploadPersistence } from './uploadManager/useUploadPersistence'
import { useUploadTaskActions } from './uploadManager/useUploadTaskActions'

export { UploadStatus } from './uploadManager/model'

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

  // 同步暂停状态到 ref
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  const { clearStoredState, saveState } = useUploadPersistence({
    abortControllersRef,
    fileMapRef,
    setIsPaused,
    setIsUploading,
    setPanelVisible,
    setTasks,
    userId,
  })

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
    const batchResult = validateUploadBatch(files)
    if (!batchResult.ok) {
      message.error(batchResult.message)
      return 0
    }

    const newTasks = []

    batchResult.validFiles.forEach(file => {
      const task = createUploadTask(file)

      // 存储文件对象
      fileMapRef.current.set(task.id, file)
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
  }, [saveState])

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

  const {
    bindFileToTask,
    cancelTask,
    clearAll,
    clearCompleted,
    removeTask,
    retryAllFailed,
    retryTask,
  } = useUploadTaskActions({
    abortControllersRef,
    clearStoredState,
    fileMapRef,
    isUploading,
    saveState,
    setIsPaused,
    setIsUploading,
    setTasks,
    startUpload,
    tasks,
    updateTask,
  })

  // 统计信息
  const stats = getUploadStats(tasks)

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
