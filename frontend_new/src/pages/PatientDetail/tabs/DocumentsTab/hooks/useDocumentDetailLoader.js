import { useCallback, useEffect, useState } from 'react'
import { getDocumentDetail } from '../../../../../api/document'

export function useDocumentDetailLoader({
  document,
  documentDetail,
  fetchPreviewUrl,
  refreshTrigger,
  resetImageTransform,
  resetOcrDisplay,
  resetOperationHistory,
  resetPreview,
  setActiveTab,
  setDocumentDetail,
  showTaskStatus,
  visible,
}) {
  const [detailLoading, setDetailLoading] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(
    showTaskStatus ? 'pending_confirm_review' : document?.status
  )

  const fetchDocumentDetail = useCallback(async (documentId, { silent = false } = {}) => {
    if (!silent) setDetailLoading(true)
    try {
      const response = await getDocumentDetail(documentId, {
        include_content: false,
        include_versions: false,
        include_patients: true,
        include_extracted: true,
      })

      if (response.success && response.data) {
        setDocumentDetail(response.data)
        if (!silent) {
          const rawType = response.data?.file_type || document?.fileType || document?.file_type || ''
          const fileName = response.data?.file_name || document?.fileName || document?.file_name || ''
          const normalizedType = String(rawType).toLowerCase()
          if (!normalizedType.includes('pdf') && !String(fileName).toLowerCase().endsWith('.pdf')) {
            fetchPreviewUrl(documentId)
          }
        }
      } else {
        console.error('获取文档详情失败:', response.message)
      }
    } catch (error) {
      console.error('获取文档详情失败:', error)
    } finally {
      if (!silent) setDetailLoading(false)
    }
  }, [
    document?.fileName,
    document?.fileType,
    document?.file_name,
    document?.file_type,
    fetchPreviewUrl,
    setDocumentDetail,
  ])

  useEffect(() => {
    if (visible && document?.id) {
      if (refreshTrigger === 0 || !documentDetail) {
        resetImageTransform()
      }
      if (showTaskStatus && !documentDetail) {
        setCurrentStatus('pending_confirm_review')
      } else if (!documentDetail) {
        setCurrentStatus(document?.status)
      }
      fetchDocumentDetail(document.id)
    } else {
      setDocumentDetail(null)
      resetPreview()
      resetOcrDisplay()
      if (showTaskStatus) {
        setCurrentStatus('pending_confirm_review')
      } else {
        setCurrentStatus(document?.status)
      }
      setActiveTab('metadata')
      resetOperationHistory()
    }
  }, [
    visible,
    document?.id,
    showTaskStatus,
    refreshTrigger,
    resetImageTransform,
    resetOcrDisplay,
    resetOperationHistory,
    resetPreview,
    fetchDocumentDetail,
  ])

  useEffect(() => {
    if (showTaskStatus) {
      if (detailLoading) {
        setCurrentStatus('loading')
      } else if (documentDetail?.task?.status) {
        setCurrentStatus(documentDetail.task.status)
      } else if (documentDetail && !documentDetail.task) {
        setCurrentStatus('pending_confirm_review')
      }
    } else {
      setCurrentStatus(document?.status)
    }
  }, [document?.status, documentDetail, detailLoading, showTaskStatus])

  return {
    currentStatus,
    detailLoading,
    fetchDocumentDetail,
  }
}
