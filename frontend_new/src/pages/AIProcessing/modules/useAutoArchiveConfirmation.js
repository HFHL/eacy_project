import { useState } from 'react'
import {
  batchConfirmAutoArchive,
  confirmAutoArchive,
} from '../../../api/document'

export const useAutoArchiveConfirmation = ({
  autoArchivedDocs,
  fetchAutoArchivedDocs,
  message,
  setAutoArchivedDocs,
  setSelectedAutoDocs,
}) => {
  const [confirmingDocId, setConfirmingDocId] = useState(null)
  const [batchConfirming, setBatchConfirming] = useState(false)

  const handleConfirmAutoArchive = async (documentId) => {
    setConfirmingDocId(documentId)
    try {
      const response = await confirmAutoArchive(documentId)
      if (response.success) {
        message.success('确认归档成功')
        setAutoArchivedDocs((prev) => prev.filter((doc) => doc.id !== documentId))
        setSelectedAutoDocs((prev) => prev.filter((id) => id !== documentId))
      } else {
        message.error(response.message || '确认归档失败')
      }
    } catch (error) {
      console.error('确认归档失败:', error)
      message.error('确认归档失败')
    } finally {
      setConfirmingDocId(null)
    }
  }

  const handleBatchConfirmAutoArchive = async (ids) => {
    const documentIds = ids || autoArchivedDocs.map((doc) => doc.id)
    if (documentIds.length === 0) {
      message.info('没有待确认的自动归档文档')
      return
    }

    setBatchConfirming(true)
    try {
      const response = await batchConfirmAutoArchive(documentIds)
      if (response.success) {
        message.success(`确认完成：成功 ${response.data.success_count} 个，失败 ${response.data.failed_count} 个`)
        fetchAutoArchivedDocs()
        if (ids) setSelectedAutoDocs([])
      } else {
        message.error(response.message || '批量确认失败')
      }
    } catch (error) {
      console.error('批量确认失败:', error)
      message.error('批量确认失败')
    } finally {
      setBatchConfirming(false)
    }
  }

  return {
    batchConfirming,
    confirmingDocId,
    handleBatchConfirmAutoArchive,
    handleConfirmAutoArchive,
  }
}
