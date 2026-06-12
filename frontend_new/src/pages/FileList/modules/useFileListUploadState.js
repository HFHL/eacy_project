import { useState } from 'react'
import { useSelector } from 'react-redux'
import { UploadStatus, useUploadManager } from '../../../hooks/useUploadManager'
import { useFileListUploadControls } from './useFileListUploadControls'

export const useFileListUploadState = ({ message, refreshAll }) => {
  const [uploadModalVisible, setUploadModalVisible] = useState(false)
  const userId = useSelector((state) => state.user.userInfo?.id)

  const uploadManager = useUploadManager({
    userId,
    concurrency: 3,
    maxRetries: 3,
    onTaskComplete: (task) => {
      if (task.status === UploadStatus.SUCCESS) refreshAll({ forceTree: true })
    },
    onAllComplete: ({ successCount, failedCount }) => {
      if (successCount > 0 && failedCount === 0) message.success(`全部 ${successCount} 个文件上传成功`)
      else if (successCount > 0) message.warning(`上传完成：${successCount} 个成功，${failedCount} 个失败`)
      else if (failedCount > 0) message.error(`${failedCount} 个文件上传失败`)
      refreshAll({ forceTree: true })
    },
  })

  const {
    fileInputRef,
    folderInputRef,
    handleFileInputChange,
    handleFolderInputChange,
  } = useFileListUploadControls({
    message,
    setUploadModalVisible,
    uploadManager,
  })

  return {
    fileInputRef,
    folderInputRef,
    handleFileInputChange,
    handleFolderInputChange,
    setUploadModalVisible,
    uploadManager,
    uploadModalVisible,
  }
}
