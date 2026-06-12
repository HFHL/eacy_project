import React, { useCallback } from 'react'
import { Button, Tag, Tooltip, message } from 'antd'
import { FileTextOutlined, PictureOutlined } from '@ant-design/icons'

import { deleteDocument } from '@/api/document'
import { CONFIDENCE_CONFIG } from '../data/constants'

export const usePatientDetailActions = ({
  aiSummary,
  documents,
  setActiveTab,
  setExportModalVisible,
  syncPatientStatsAfterDocumentChange,
  token,
}) => {
  const getDocumentIcon = useCallback((type) => {
    switch (type) {
      case 'PDF':
        return <FileTextOutlined style={{ color: token.colorError }} />
      case 'Image':
        return <PictureOutlined style={{ color: token.colorSuccess }} />
      case 'Excel':
        return <FileTextOutlined style={{ color: token.colorPrimary }} />
      default:
        return <FileTextOutlined />
    }
  }, [token.colorError, token.colorPrimary, token.colorSuccess])

  const getConfidenceTag = useCallback((confidence) => {
    if (!confidence && confidence !== 0) return null

    let confidenceLevel
    if (typeof confidence === 'number') {
      if (confidence >= 0.9) {
        confidenceLevel = 'high'
      } else if (confidence >= 0.7) {
        confidenceLevel = 'medium'
      } else {
        confidenceLevel = 'low'
      }
    } else {
      confidenceLevel = confidence
    }

    const config = CONFIDENCE_CONFIG[confidenceLevel]
    if (!config) return null

    const { color, text } = config
    return <Tag color={color} size="small">{text}</Tag>
  }, [])

  const handleDocumentClick = useCallback((doc) => {
    console.log('文档点击:', doc)
  }, [])

  const handleExportData = useCallback(() => {
    setExportModalVisible(true)
  }, [setExportModalVisible])

  const handleConfirmExport = useCallback(() => {
    message.success('数据导出已开始，请稍后下载')
    setExportModalVisible(false)
  }, [setExportModalVisible])

  const handleDeleteDocument = useCallback(async (docId) => {
    if (!docId) return
    try {
      const response = await deleteDocument(docId, true)
      if (response.success) {
        message.success('文档删除成功')
        await syncPatientStatsAfterDocumentChange?.()
      } else {
        message.error(response.message || '删除失败')
      }
    } catch (error) {
      console.error('删除文档失败:', error)
      message.error(error?.data?.detail || error?.message || '删除文档失败')
    }
  }, [syncPatientStatsAfterDocumentChange])

  const handleViewSourceDocument = useCallback((docId) => {
    const doc = documents.find((item) => item.id === docId)
    if (doc) {
      handleDocumentClick(doc)
      setActiveTab('documents')
    }
  }, [documents, handleDocumentClick, setActiveTab])

  const renderSummaryWithFootnotes = useCallback((content) => {
    const parts = content.split(/(\[[0-9]+\])/)
    return parts.map((part, index) => {
      const footnoteMatch = part.match(/\[([0-9]+)\]/)
      if (footnoteMatch) {
        const sourceDoc = aiSummary.sourceDocuments.find((doc) => doc.ref === part)
        return (
          <Tooltip key={index} title={`点击查看: ${sourceDoc?.name}`}>
            <Button
              type="link"
              size="small"
              style={{
                padding: 0,
                height: 'auto',
                fontSize: 12,
                color: token.colorPrimary,
                textDecoration: 'underline',
              }}
              onClick={() => sourceDoc && handleViewSourceDocument(sourceDoc.id)}
            >
              {part}
            </Button>
          </Tooltip>
        )
      }
      return <span key={index}>{part}</span>
    })
  }, [aiSummary.sourceDocuments, handleViewSourceDocument, token.colorPrimary])

  const handleConfirmChange = useCallback(() => {
    message.success('变更已确认')
  }, [])

  const handleRevertChange = useCallback(() => {
    message.success('变更已撤销')
  }, [])

  return {
    getConfidenceTag,
    getDocumentIcon,
    handleConfirmChange,
    handleConfirmExport,
    handleDeleteDocument,
    handleDocumentClick,
    handleExportData,
    handleRevertChange,
    handleViewSourceDocument,
    renderSummaryWithFootnotes,
  }
}
