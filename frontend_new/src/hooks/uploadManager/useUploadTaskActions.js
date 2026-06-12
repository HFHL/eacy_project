import { useCallback } from 'react'
import {
  generateFileFingerprint,
  UploadStatus,
} from './model'

export const useUploadTaskActions = ({
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
}) => {
  const cancelTask = useCallback((taskId) => {
    const abortController = abortControllersRef.current.get(taskId)
    if (abortController) {
      abortController.abort()
    }
    updateTask(taskId, { status: UploadStatus.CANCELLED, error: '已取消' })
  }, [abortControllersRef, updateTask])

  const retryTask = useCallback((taskId) => {
    const task = tasks.find((item) => item.id === taskId)
    if (task && fileMapRef.current.has(taskId)) {
      updateTask(taskId, {
        status: UploadStatus.PENDING,
        progress: 0,
        error: null,
        retryCount: 0,
      })
      if (!isUploading) startUpload()
    } else {
      updateTask(taskId, { needsFile: true, error: '请重新选择文件' })
    }
  }, [fileMapRef, isUploading, startUpload, tasks, updateTask])

  const retryAllFailed = useCallback(() => {
    const failedTasks = tasks.filter((task) => task.status === UploadStatus.FAILED)
    failedTasks.forEach((task) => {
      if (fileMapRef.current.has(task.id)) {
        updateTask(task.id, {
          status: UploadStatus.PENDING,
          progress: 0,
          error: null,
          retryCount: 0,
        })
      }
    })
    if (!isUploading) startUpload()
  }, [fileMapRef, isUploading, startUpload, tasks, updateTask])

  const clearCompleted = useCallback(() => {
    setTasks((previous) => {
      const remaining = previous.filter((task) => (
        task.status !== UploadStatus.SUCCESS && task.status !== UploadStatus.CANCELLED
      ))
      previous.forEach((task) => {
        if (task.status === UploadStatus.SUCCESS || task.status === UploadStatus.CANCELLED) {
          fileMapRef.current.delete(task.id)
        }
      })
      saveState(remaining)
      return remaining
    })
  }, [fileMapRef, saveState, setTasks])

  const clearAll = useCallback(() => {
    abortControllersRef.current.forEach((controller) => controller.abort())
    abortControllersRef.current.clear()
    fileMapRef.current.clear()
    setTasks([])
    setIsUploading(false)
    setIsPaused(false)
    clearStoredState()
  }, [
    abortControllersRef,
    clearStoredState,
    fileMapRef,
    setIsPaused,
    setIsUploading,
    setTasks,
  ])

  const removeTask = useCallback((taskId) => {
    cancelTask(taskId)
    setTasks((previous) => {
      const remaining = previous.filter((task) => task.id !== taskId)
      fileMapRef.current.delete(taskId)
      saveState(remaining)
      return remaining
    })
  }, [cancelTask, fileMapRef, saveState, setTasks])

  const bindFileToTask = useCallback((taskId, file) => {
    fileMapRef.current.set(taskId, file)
    updateTask(taskId, {
      needsFile: false,
      status: UploadStatus.PENDING,
      fingerprint: generateFileFingerprint(file),
    })
  }, [fileMapRef, updateTask])

  return {
    bindFileToTask,
    cancelTask,
    clearAll,
    clearCompleted,
    removeTask,
    retryAllFailed,
    retryTask,
  }
}
