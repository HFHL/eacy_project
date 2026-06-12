import { useCallback, useEffect, useRef } from 'react'
import {
  getStorageKey,
  restoreUploadTasks,
  serializeUploadState,
} from './model'

export const useUploadPersistence = ({
  abortControllersRef,
  fileMapRef,
  setIsPaused,
  setIsUploading,
  setPanelVisible,
  setTasks,
  userId,
}) => {
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  useEffect(() => {
    abortControllersRef.current.forEach((controller) => controller.abort())
    abortControllersRef.current.clear()
    fileMapRef.current.clear()
    setTasks([])
    setIsUploading(false)
    setIsPaused(false)

    if (userId == null) return

    try {
      const restoredTasks = restoreUploadTasks(localStorage.getItem(getStorageKey(userId)))
      if (restoredTasks.length > 0) {
        setTasks(restoredTasks)
        setPanelVisible(true)
      }
    } catch (error) {
      console.error('恢复上传状态失败:', error)
    }
  }, [
    abortControllersRef,
    fileMapRef,
    setIsPaused,
    setIsUploading,
    setPanelVisible,
    setTasks,
    userId,
  ])

  const saveState = useCallback((tasksToSave) => {
    try {
      localStorage.setItem(
        getStorageKey(userIdRef.current),
        JSON.stringify(serializeUploadState(tasksToSave))
      )
    } catch (error) {
      console.error('保存上传状态失败:', error)
    }
  }, [])

  const clearStoredState = useCallback(() => {
    localStorage.removeItem(getStorageKey(userIdRef.current))
  }, [])

  return { clearStoredState, saveState, userIdRef }
}
