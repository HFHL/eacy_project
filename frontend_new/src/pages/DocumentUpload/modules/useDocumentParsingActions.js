import { useCallback, useState } from 'react'
import { message } from 'antd'

import { markDocumentReview, parseDocument } from '../../../api/document'

export const useDocumentParsingActions = ({
  fetchParsingDocuments,
  setUnparsedDocuments,
  setUploadFiles,
}) => {
  const [parsingFileId, setParsingFileId] = useState(null)
  const [markingReviewFileId, setMarkingReviewFileId] = useState(null)

  const handleParseDocument = useCallback(async (file) => {
    const documentId = file?.documentId || file?.id
    const fileId = file.id
    if (!documentId) {
      message.warning('该文件尚未上传，无法解析')
      return
    }

    setParsingFileId(fileId)
    try {
      const response = await parseDocument(documentId, 'textin')
      if (response.success && response.code === 0) {
        message.success(`文档 "${file.name}" 解析任务已启动`)
        setUploadFiles((prev) => prev.filter((item) => item.id !== fileId && item.documentId !== documentId))
        setUnparsedDocuments((prev) => prev.filter((item) => item.id !== documentId))
        fetchParsingDocuments(false)
      } else {
        message.error(response.message || '启动解析失败')
      }
    } catch (error) {
      console.error('解析文档失败:', error)
      message.error(error.response?.data?.message || '解析文档失败')
    } finally {
      setParsingFileId(null)
    }
  }, [fetchParsingDocuments, setUnparsedDocuments, setUploadFiles])

  const handleReParseDocument = useCallback(async (file) => {
    const documentId = file?.documentId || file?.id
    const fileId = file.id
    if (!documentId) {
      message.warning('该文件不存在，无法重新解析')
      return
    }

    setParsingFileId(fileId)
    try {
      const response = await parseDocument(documentId, 'textin')
      if (response.success && response.code === 0) {
        message.success(`文档 "${file.name}" 重新解析任务已启动`)
        fetchParsingDocuments(false)
      } else {
        message.error(response.message || '启动重新解析失败')
      }
    } catch (error) {
      console.error('重新解析文档失败:', error)
      message.error(error.response?.data?.message || '重新解析文档失败')
    } finally {
      setParsingFileId(null)
    }
  }, [fetchParsingDocuments])

  const handleMarkForReview = useCallback(async (file, requiresReview) => {
    const documentId = file?.documentId || file?.id
    if (!documentId) {
      message.warning('该文件不存在，无法标记审核')
      return
    }

    setMarkingReviewFileId(documentId)
    try {
      const response = await markDocumentReview(documentId, requiresReview)
      if (response.success && response.code === 0) {
        const actionText = requiresReview ? '需要人工审核' : '不需要审核'
        message.success(`文档 "${file.name}" 已标记为${actionText}`)
        fetchParsingDocuments(false)
      } else {
        message.error(response.message || '标记审核失败')
      }
    } catch (error) {
      console.error('标记审核失败:', error)
      message.error(error.response?.data?.message || '标记审核失败')
    } finally {
      setMarkingReviewFileId(null)
    }
  }, [fetchParsingDocuments])

  return {
    handleMarkForReview,
    handleParseDocument,
    handleReParseDocument,
    markingReviewFileId,
    parsingFileId,
  }
}
