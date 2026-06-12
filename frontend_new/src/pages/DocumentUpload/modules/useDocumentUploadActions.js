import { useCallback, useRef, useState } from 'react'
import { message } from 'antd'

import { deleteDocument, getDocumentTempUrl, uploadDocument } from '../../../api/document'
import { validateUploadBatch, validateUploadFile } from '../../../constants/uploadLimits'
import { buildUploadFile } from './documentUploadUtils'

export const useDocumentUploadActions = ({
  fetchUnparsedDocuments,
  fileInputRef,
  folderInputRef,
  selectedFile,
  setCurrentStep,
  setPreviewModalVisible,
  setSelectedFile,
  setShowProcessSteps,
  setUnparsedDocuments,
  setUploadFiles,
  uploadFiles,
}) => {
  const [deletingFileId, setDeletingFileId] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const processedFilesRef = useRef(new Set())

  const resetInputs = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }, [fileInputRef, folderInputRef])

  const uploadOneFile = useCallback(async (file) => {
    setUploadFiles((prev) => prev.map((item) => (
      item.id === file.id ? { ...item, uploadStatus: 'uploading' } : item
    )))

    const response = await uploadDocument(file.originFileObj, (percent) => {
      setUploadFiles((prev) => prev.map((item) => (
        item.id === file.id ? { ...item, uploadProgress: percent } : item
      )))
    })

    if (response.success) {
      setUploadFiles((prev) => prev.map((item) => (
        item.id === file.id
          ? {
              ...item,
              uploadStatus: 'success',
              uploadProgress: 100,
              documentId: response.data.document_id,
              fileUrl: response.data.file_url,
            }
          : item
      )))
      return true
    }
    return false
  }, [setUploadFiles])

  const handleFileUpload = useCallback(async (fileList) => {
    resetInputs()
    const batchCheck = validateUploadBatch(fileList)
    if (!batchCheck.ok) {
      message.error(batchCheck.message)
      return
    }

    const newFiles = fileList.map(buildUploadFile)
    setUploadFiles((prev) => [...prev, ...newFiles])

    const validFiles = newFiles.filter((file) => file.status === 'valid')
    if (validFiles.length === 0) {
      message.warning('没有有效的文件可以上传')
      return
    }

    message.info(`正在上传 ${validFiles.length} 个文件...`)
    setShowProcessSteps(true)
    setCurrentStep(1)
    setUploading(true)

    let successCount = 0
    let failedCount = 0

    for (const file of validFiles) {
      try {
        const ok = await uploadOneFile(file)
        if (ok) successCount += 1
      } catch (error) {
        failedCount += 1
        setUploadFiles((prev) => prev.map((item) => (
          item.id === file.id
            ? {
                ...item,
                uploadStatus: 'failed',
                error: error.response?.data?.message || error.message || '上传失败',
              }
            : item
        )))
      }
    }

    setUploading(false)
    resetInputs()
    if (failedCount === 0 && successCount > 0) {
      message.success(`全部 ${successCount} 个文档上传成功`)
      fetchUnparsedDocuments()
    } else if (successCount > 0) {
      message.warning(`上传完成：${successCount} 个成功，${failedCount} 个失败`)
      fetchUnparsedDocuments()
    } else if (failedCount > 0) {
      message.error('所有文件上传失败，请检查后重试')
    }
  }, [
    fetchUnparsedDocuments,
    resetInputs,
    setCurrentStep,
    setShowProcessSteps,
    setUploadFiles,
    uploadOneFile,
  ])

  const handleRemoveFile = useCallback(async (file) => {
    const documentId = file.documentId || file.id
    const fileId = file.id

    if (!documentId) {
      setUploadFiles((prev) => prev.filter((item) => item.id !== fileId))
      message.info('文件已移除')
      return
    }

    setDeletingFileId(fileId)
    try {
      const response = await deleteDocument(documentId)
      if (response.success) {
        setUploadFiles((prev) => prev.filter((item) => item.id !== fileId && item.documentId !== documentId))
        setUnparsedDocuments((prev) => prev.filter((item) => item.id !== documentId))
        message.success('文档删除成功')
      }
    } catch (error) {
      console.error('删除文档失败:', error)
      message.error(error.response?.data?.message || '删除文档失败')
    } finally {
      setDeletingFileId(null)
    }
  }, [setUnparsedDocuments, setUploadFiles])

  const handleIgnoreFile = useCallback((fileId) => {
    setUploadFiles((prev) => prev.filter((file) => file.id !== fileId))
    message.info('已忽略该文件')
  }, [setUploadFiles])

  const handleRetryUpload = useCallback(async (file) => {
    if (!file.originFileObj) {
      message.error('无法重试：原始文件不存在')
      return
    }

    try {
      const ok = await uploadOneFile({ ...file, uploadProgress: 0, error: null })
      if (ok) {
        message.success(`文件 "${file.name}" 上传成功`)
        fetchUnparsedDocuments()
      }
    } catch (error) {
      setUploadFiles((prev) => prev.map((item) => (
        item.id === file.id
          ? {
              ...item,
              uploadStatus: 'failed',
              error: error.response?.data?.message || error.message || '上传失败',
            }
          : item
      )))
      message.error(`文件 "${file.name}" 上传失败`)
    }
  }, [fetchUnparsedDocuments, setUploadFiles, uploadOneFile])

  const handleDownloadFile = useCallback(async (file) => {
    const documentId = file?.documentId || file?.id
    if (!documentId) {
      message.warning('该文件尚未上传，无法下载')
      return
    }

    setDownloading(true)
    try {
      const response = await getDocumentTempUrl(documentId)
      if (response.success && response.data?.temp_url) {
        window.open(response.data.temp_url, '_blank')
        message.success('成功')
      } else {
        message.error(response.message || '获取下载链接失败')
      }
    } catch (error) {
      console.error('下载文件失败:', error)
      message.error(error.response?.data?.message || '下载文件失败')
    } finally {
      setDownloading(false)
    }
  }, [])

  const handleSaveFileInfo = useCallback((values) => {
    setUploadFiles((prev) => prev.map((file) => (
      file.id === selectedFile.id
        ? {
            ...file,
            category: values.category,
            extractedInfo: {
              ...file.extractedInfo,
              patientName: values.patientName,
              reportDate: values.reportDate,
              reportType: values.reportType,
            },
          }
        : file
    )))
    setPreviewModalVisible(false)
    message.success('文件信息已更新')
  }, [selectedFile, setPreviewModalVisible, setUploadFiles])

  const handleIgnoreAllFailed = useCallback(() => {
    const failedFiles = uploadFiles.filter((file) => file.uploadStatus === 'failed' || file.status === 'invalid')
    if (failedFiles.length === 0) {
      message.info('没有失败的文件')
      return
    }
    setUploadFiles((prev) => prev.filter((file) => (
      file.uploadStatus === 'success' || (file.uploadStatus !== 'failed' && file.status !== 'invalid')
    )))
    message.success(`已忽略 ${failedFiles.length} 个失败的文件`)
  }, [setUploadFiles, uploadFiles])

  const handleClearFiles = useCallback(() => {
    setUploadFiles([])
    setCurrentStep(0)
    setShowProcessSteps(false)
    message.info('文件列表已清空')
  }, [setCurrentStep, setShowProcessSteps, setUploadFiles])

  const handleEditFile = useCallback((file) => {
    setSelectedFile(file)
    setPreviewModalVisible(true)
  }, [setPreviewModalVisible, setSelectedFile])

  const markProcessedFile = useCallback((file) => {
    const fileKey = `${file.name}_${file.size}_${file.lastModified}`
    if (processedFilesRef.current.has(fileKey)) return false
    processedFilesRef.current.add(fileKey)
    setTimeout(() => {
      processedFilesRef.current.delete(fileKey)
    }, 5000)
    return true
  }, [])

  const handleDroppedFiles = useCallback((files) => {
    const newFiles = files.filter(markProcessedFile)
    const validFiles = []
    const invalidMessages = []

    newFiles.forEach((file) => {
      const result = validateUploadFile(file)
      if (result.ok) validFiles.push(file)
      else invalidMessages.push(result.message)
    })

    if (validFiles.length === 0) {
      message.warning(invalidMessages[0] || '没有找到支持的文件格式')
      return
    }
    if (invalidMessages.length > 0) {
      message.info(`部分文件已跳过：${invalidMessages.length} 个不符合要求`)
    }

    const batchCheck = validateUploadBatch(validFiles)
    if (!batchCheck.ok) {
      message.error(batchCheck.message)
      return
    }
    handleFileUpload(batchCheck.validFiles)
  }, [handleFileUpload, markProcessedFile])

  return {
    deletingFileId,
    downloading,
    handleClearFiles,
    handleDownloadFile,
    handleDroppedFiles,
    handleEditFile,
    handleFileUpload,
    handleIgnoreAllFailed,
    handleIgnoreFile,
    handleRemoveFile,
    handleRetryUpload,
    handleSaveFileInfo,
    markProcessedFile,
    uploading,
  }
}
