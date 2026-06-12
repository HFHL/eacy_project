import { useCallback, useRef } from 'react'
import { validateUploadBatch, validateUploadFile } from '../../../constants/uploadLimits'

export const useFileListUploadControls = ({
  message,
  setUploadModalVisible,
  uploadManager,
}) => {
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)

  const handleFileUpload = useCallback(async (files) => {
    const batchCheck = validateUploadBatch(files)
    if (!batchCheck.ok) {
      message.error(batchCheck.message)
      return
    }
    const validFiles = []
    batchCheck.validFiles.forEach((file) => {
      const result = validateUploadFile(file)
      if (!result.ok) {
        message.error(result.message)
        return
      }
      validFiles.push(file)
    })
    if (!validFiles.length) return
    const addedCount = uploadManager.addFiles(validFiles)
    if (addedCount > 0) {
      message.info(`已添加 ${addedCount} 个文件到上传队列`)
      uploadManager.startUpload()
    }
  }, [message, uploadManager])

  const handleFileInputChange = useCallback((event) => {
    if (event.target.files?.length > 0) {
      handleFileUpload(Array.from(event.target.files))
      event.target.value = ''
      setUploadModalVisible(false)
    }
  }, [handleFileUpload, setUploadModalVisible])

  const handleFolderInputChange = useCallback((event) => {
    if (event.target.files?.length > 0) {
      const files = Array.from(event.target.files)
      const batchCheck = validateUploadBatch(files)
      if (!batchCheck.ok) {
        message.error(batchCheck.message)
        event.target.value = ''
        setUploadModalVisible(false)
        return
      }
      const valid = batchCheck.validFiles.filter((file) => validateUploadFile(file).ok)
      if (!valid.length) {
        message.warning('文件夹中没有支持的文件')
        event.target.value = ''
        setUploadModalVisible(false)
        return
      }
      const processed = valid.map((file) => (
        new File([file], file.name.split('/').pop(), { type: file.type })
      ))
      handleFileUpload(processed)
      event.target.value = ''
      setUploadModalVisible(false)
    }
  }, [handleFileUpload, message, setUploadModalVisible])

  return {
    fileInputRef,
    folderInputRef,
    handleFileInputChange,
    handleFileUpload,
    handleFolderInputChange,
  }
}
