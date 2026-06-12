import { useCallback, useState } from 'react'
import { message } from 'antd'

import { hasRenderablePolygon } from '@/api/_evidence'
import { resolveTraceDocumentPreviewUrl } from '@/api/document'
import { getEhrFieldEvidence, getEhrFieldHistory } from '@/api/patient'
import { resolveFallbackDocument } from './useEhrGroupSelection'

export const useEhrFieldSource = ({
  ehrDocuments,
  patientId,
}) => {
  const [selectedField, setSelectedField] = useState(null)
  const [fieldHistory, setFieldHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [documentImageUrl, setDocumentImageUrl] = useState(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [sourceLocation, setSourceLocation] = useState(null)
  const [fallbackDocument, setFallbackDocument] = useState(null)

  const clearFieldSource = () => {
    setFieldHistory([])
    setDocumentImageUrl(null)
    setSourceLocation(null)
    setFallbackDocument(null)
  }

  const loadTraceDocumentPreview = async ({
    evidenceLocations,
    field,
    history,
    traceableEvidence,
  }) => {
    const traceableHistory = history.find((item) => item.source_document_id)
    const traceDocumentId = traceableEvidence?.document_id || traceableHistory?.source_document_id

    if (traceDocumentId) {
      if (evidenceLocations.length === 0 && traceableHistory?.source_location) {
        setSourceLocation(traceableHistory.source_location)
      }
      setImageLoading(true)
      try {
        const tracePageNo = evidenceLocations[0]?.page || evidenceLocations[0]?.page_no || 1
        const preview = await resolveTraceDocumentPreviewUrl(traceDocumentId, { pageNo: tracePageNo })
        console.log('文档预览响应:', preview)
        if (preview?.url) {
          if (evidenceLocations.length > 0) {
            setSourceLocation(evidenceLocations.map((location) => ({
              ...location,
              file_name: preview.fileName,
              mime_type: preview.mimeType,
            })))
          }
          setDocumentImageUrl(preview.url)
        }
      } catch (error) {
        console.error('获取文档URL失败:', error)
      } finally {
        setImageLoading(false)
      }
      return
    }

    console.log('无可溯源的变更历史，启动兜底匹配')
    const matched = resolveFallbackDocument(field, ehrDocuments)
    if (!matched) return

    setFallbackDocument(matched)
    setImageLoading(true)
    try {
      const preview = await resolveTraceDocumentPreviewUrl(matched.id, {
        fileName: matched.name || matched.fileName,
        fileType: matched.fileType || matched.file_type,
      })
      if (preview?.url) {
        setDocumentImageUrl(preview.url)
      }
    } catch (error) {
      console.error('获取兜底文档URL失败:', error)
    } finally {
      setImageLoading(false)
    }
  }

  const handleFieldViewSource = useCallback(async (field) => {
    if (!field || !patientId) {
      console.log('字段信息不完整，无法加载溯源历史')
      return
    }

    const fieldId = field.apiFieldId || field.id || field.fieldId
    if (!fieldId) {
      console.log('缺少字段ID')
      return
    }

    console.log('🔍 加载字段溯源历史:', { fieldId, fieldName: field.name, apiFieldId: field.apiFieldId })
    const sourceOptions = {
      recordInstanceId: field.recordInstanceId || field.record_instance_id || null,
    }

    setSelectedField(field)
    setHistoryLoading(true)
    clearFieldSource()

    try {
      const [historyRes, evidenceRes] = await Promise.all([
        getEhrFieldHistory(patientId, fieldId, sourceOptions),
        getEhrFieldEvidence(patientId, fieldId, sourceOptions),
      ])
      console.log('溯源历史响应:', historyRes)
      console.log('溯源证据响应:', evidenceRes)

      if (historyRes.success && historyRes.data) {
        const history = Array.isArray(historyRes.data) ? historyRes.data : (historyRes.data.history || [])
        const evidences = evidenceRes.success && Array.isArray(evidenceRes.data) ? evidenceRes.data : []
        const evidenceLocations = evidences
          .map((item) => item.source_location)
          .filter((location) => hasRenderablePolygon(location))

        setFieldHistory(history)
        if (evidenceLocations.length > 0) {
          setSourceLocation(evidenceLocations)
        }

        const traceableEvidence = evidences.find((item) => item.document_id)
        await loadTraceDocumentPreview({
          evidenceLocations,
          field,
          history,
          traceableEvidence,
        })
      }
    } catch (error) {
      console.error('获取溯源历史失败:', error)
      message.error('获取溯源历史失败')
    } finally {
      setHistoryLoading(false)
    }
  }, [ehrDocuments, patientId])

  const handleViewFullDocument = useCallback(async (documentId) => {
    if (!documentId) return

    try {
      const preview = await resolveTraceDocumentPreviewUrl(documentId)
      if (preview?.url) {
        window.open(preview.url, '_blank')
      } else {
        message.error('获取文档URL失败')
      }
    } catch (error) {
      console.error('获取文档URL失败:', error)
      message.error('获取文档URL失败')
    }
  }, [])

  return {
    fieldSourceProps: {
      documentImageUrl,
      fallbackDocument,
      fieldHistory,
      historyLoading,
      imageLoading,
      selectedField,
      sourceLocation,
    },
    handleFieldViewSource,
    handleViewFullDocument,
  }
}
