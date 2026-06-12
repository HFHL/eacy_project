import { useState } from 'react'
import {
  extractEhrData,
  getDocumentAiMatchInfo,
  getDocumentTempUrl,
} from '../../../api/document'
import { convertDocToDocument } from './documentData'

const buildMatchDocument = (doc) => ({
  id: doc.id,
  name: doc.fileName || doc.file_name || doc.name || '未知文档',
  fileName: doc.fileName || doc.file_name,
  createdAt: doc.created_at || doc.createdAt,
  confidence: doc.confidence || doc.matchScore || 0,
  extractedInfo: {},
  candidates: [],
  aiRecommendation: null,
  aiReason: null,
  matchResult: null,
  isFromAutoArchived: false,
  archivedPatientId: null,
  archivedPatientInfo: null,
})

const mapCandidate = (candidate) => ({
  id: candidate.id,
  name: candidate.name,
  patientCode: candidate.patient_code,
  similarity: candidate.similarity || 0,
  matchReasoning: candidate.match_reasoning,
  keyEvidence: candidate.key_evidence || [],
  concerns: candidate.concerns || [],
  matchFeatures: (candidate.key_evidence && candidate.key_evidence.length > 0)
    ? candidate.key_evidence
    : (candidate.concerns && candidate.concerns.length > 0)
      ? candidate.concerns
      : ['待AI分析'],
  gender: candidate.gender || '',
  age: candidate.age || '',
})

export const useAIProcessingDocumentActions = ({
  autoArchivedDocs,
  fetchAutoArchivedDocs,
  fetchNeedsReviewDocs,
  fetchNewPatientDocs,
  message,
  needsReviewDocs,
  newPatientDocs,
  setPatientMatchVisible,
  setPatientSearchResults,
  setPatientSearchValue,
  setSelectedDocument,
  setSelectedMatchPatient,
  setShowSearchResults,
}) => {
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [matchInfoLoading, setMatchInfoLoading] = useState(false)
  const [selectedDocumentForDetail, setSelectedDocumentForDetail] = useState(null)

  const handleDocumentClick = (doc) => {
    setSelectedDocumentForDetail(convertDocToDocument(doc))
    setDetailModalVisible(true)
  }

  const handleDetailModalClose = () => {
    setDetailModalVisible(false)
    setSelectedDocumentForDetail(null)
    fetchNeedsReviewDocs()
    fetchAutoArchivedDocs()
    fetchNewPatientDocs()
  }

  const handleFieldSave = (documentId, editedFields) => {
    console.log('保存字段修改:', documentId, editedFields)
    message.info('字段保存功能待实现')
  }

  const handleReExtract = async (documentId) => {
    try {
      const response = await extractEhrData(documentId)
      if (response.success) {
        message.success('重新抽取成功')
        fetchNeedsReviewDocs()
        fetchAutoArchivedDocs()
      } else {
        message.error(response.message || '重新抽取失败')
      }
    } catch (error) {
      console.error('重新抽取失败:', error)
      message.error('重新抽取失败')
    }
  }

  const handleChangePatient = () => {
    message.info('更换患者功能待实现')
  }

  const handleArchivePatient = async (documentId) => {
    const doc = [
      ...needsReviewDocs,
      ...autoArchivedDocs,
      ...newPatientDocs,
    ].find(item => item.id === documentId)

    if (!doc) {
      message.warning('文档不存在')
      return
    }

    const docData = buildMatchDocument(doc)
    setSelectedDocument(docData)
    setPatientMatchVisible(true)
    setMatchInfoLoading(true)
    setSelectedMatchPatient(null)
    setPatientSearchValue('')
    setPatientSearchResults([])
    setShowSearchResults(false)

    try {
      const matchResponse = await getDocumentAiMatchInfo(documentId)
      if (matchResponse.success && matchResponse.data) {
        const matchData = matchResponse.data
        setSelectedDocument({
          ...docData,
          documentMetadata: matchData.document_metadata || {},
          extractedInfo: matchData.extracted_info || {},
          matchScore: matchData.match_score || 0,
          confidence: matchData.confidence || 0,
          candidates: (matchData.candidates || []).map(mapCandidate),
          aiRecommendation: matchData.ai_recommendation,
          aiReason: matchData.ai_reason,
          matchResult: matchData.match_result || 'matched',
        })
      } else {
        message.error('获取文档匹配信息失败')
        setPatientMatchVisible(false)
        setSelectedDocument(null)
      }
    } catch (error) {
      console.error('获取文档匹配信息失败:', error)
      message.error('获取文档匹配信息失败')
      setPatientMatchVisible(false)
      setSelectedDocument(null)
    } finally {
      setMatchInfoLoading(false)
    }
  }

  const handleDownload = async (documentId) => {
    try {
      const response = await getDocumentTempUrl(documentId)
      if (response.success && response.data?.temp_url) {
        window.open(response.data.temp_url, '_blank')
      } else {
        message.error('获取文档URL失败')
      }
    } catch (error) {
      console.error('下载文档失败:', error)
      message.error('下载文档失败')
    }
  }

  const handleViewOcr = (documentId) => {
    window.open(`/document/ocr-viewer/${documentId}`, '_blank')
  }

  const handleExtractSuccess = () => {
    fetchNeedsReviewDocs()
    fetchAutoArchivedDocs()
  }

  return {
    detailModalVisible,
    handleArchivePatient,
    handleChangePatient,
    handleDetailModalClose,
    handleDocumentClick,
    handleDownload,
    handleExtractSuccess,
    handleFieldSave,
    handleReExtract,
    handleViewOcr,
    matchInfoLoading,
    selectedDocumentForDetail,
  }
}
