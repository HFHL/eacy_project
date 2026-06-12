import { useState } from 'react'
import {
  getDocumentDetail,
  getDocumentTempUrl,
  getFreshDocumentPdfStreamUrl,
} from '../../../api/document'
import { isPdfFileLike } from './documentData'

export const useAIProcessingPreview = ({ message }) => {
  const [extractionResultVisible, setExtractionResultVisible] = useState(false)
  const [extractionResultData, setExtractionResultData] = useState(null)
  const [extractionResultLoading, setExtractionResultLoading] = useState(false)
  const [extractionDocName, setExtractionDocName] = useState('')

  const [docPreviewVisible, setDocPreviewVisible] = useState(false)
  const [docPreviewLoading, setDocPreviewLoading] = useState(false)
  const [docPreviewDocumentId, setDocPreviewDocumentId] = useState(null)
  const [docPreviewName, setDocPreviewName] = useState('')
  const [docPreviewTempUrl, setDocPreviewTempUrl] = useState('')
  const [docPreviewFileType, setDocPreviewFileType] = useState('')
  const [docPreviewExtractionRecord, setDocPreviewExtractionRecord] = useState(null)
  const [docPreviewTab, setDocPreviewTab] = useState('original')

  const handleViewExtractionResult = async (documentId, documentName) => {
    setExtractionDocName(documentName || '文档')
    setExtractionResultVisible(true)
    setExtractionResultLoading(true)
    setExtractionResultData(null)

    try {
      const response = await getDocumentDetail(documentId, { include_extracted: true })
      if (response.success && response.data) {
        const extractionRecords = response.data.extraction_records || []
        if (extractionRecords.length > 0) {
          setExtractionResultData(extractionRecords[0])
        } else {
          message.warning('该文档暂无 AI 抽取结果')
          setExtractionResultVisible(false)
        }
      } else {
        message.error(response.message || '获取抽取结果失败')
        setExtractionResultVisible(false)
      }
    } catch (error) {
      console.error('获取抽取结果失败:', error)
      message.error('获取抽取结果失败')
      setExtractionResultVisible(false)
    } finally {
      setExtractionResultLoading(false)
    }
  }

  const handleCopyJson = () => {
    if (!extractionResultData?.extracted_ehr_data) return
    const jsonStr = JSON.stringify(extractionResultData.extracted_ehr_data, null, 2)
    navigator.clipboard.writeText(jsonStr).then(() => {
      message.success('已复制到剪贴板')
    }).catch(() => {
      message.error('复制失败')
    })
  }

  const openDocumentPreview = async (documentId, documentName) => {
    if (!documentId) return
    setDocPreviewVisible(true)
    setDocPreviewLoading(true)
    setDocPreviewDocumentId(documentId)
    setDocPreviewName(documentName || '文档')
    setDocPreviewTempUrl('')
    setDocPreviewFileType('')
    setDocPreviewExtractionRecord(null)
    setDocPreviewTab('original')

    try {
      const [tempUrlResponse, detailResponse] = await Promise.all([
        getDocumentTempUrl(documentId).catch((error) => ({ success: false, error })),
        getDocumentDetail(documentId, { include_extracted: true }).catch((error) => ({ success: false, error })),
      ])

      let resolvedFileType = tempUrlResponse?.data?.file_type || tempUrlResponse?.data?.mime_type || ''
      let resolvedFileName = documentName || tempUrlResponse?.data?.file_name || ''
      let resolvedTempUrl = tempUrlResponse?.success ? (tempUrlResponse?.data?.temp_url || '') : ''

      if (detailResponse?.success && detailResponse?.data) {
        const records = detailResponse.data.extraction_records || []
        setDocPreviewExtractionRecord(records.length > 0 ? records[0] : null)
        resolvedFileType = resolvedFileType || detailResponse.data.file_type || detailResponse.data.mime_type || ''
        resolvedFileName = resolvedFileName || detailResponse.data.file_name || detailResponse.data.original_filename || ''
      }

      const isPdf = isPdfFileLike({
        fileType: resolvedFileType,
        fileName: resolvedFileName,
        fileUrl: resolvedTempUrl,
      })

      if (isPdf) {
        resolvedTempUrl = await getFreshDocumentPdfStreamUrl(documentId)
        setDocPreviewTempUrl(resolvedTempUrl)
        setDocPreviewFileType('pdf')
      } else if (resolvedTempUrl) {
        setDocPreviewTempUrl(resolvedTempUrl)
        setDocPreviewFileType(resolvedFileType || '')
      } else if (resolvedFileType) {
        setDocPreviewFileType(resolvedFileType)
      }

      if (!tempUrlResponse?.success && !detailResponse?.success) {
        message.error('加载文档预览失败')
      }
    } catch (error) {
      console.error('加载文档预览失败:', error)
      message.error('加载文档预览失败')
    } finally {
      setDocPreviewLoading(false)
    }
  }

  return {
    docPreviewDocumentId,
    docPreviewExtractionRecord,
    docPreviewFileType,
    docPreviewLoading,
    docPreviewName,
    docPreviewTab,
    docPreviewTempUrl,
    docPreviewVisible,
    extractionDocName,
    extractionResultData,
    extractionResultLoading,
    extractionResultVisible,
    handleCopyJson,
    handleViewExtractionResult,
    openDocumentPreview,
    setDocPreviewTab,
    setDocPreviewVisible,
    setExtractionResultVisible,
  }
}
