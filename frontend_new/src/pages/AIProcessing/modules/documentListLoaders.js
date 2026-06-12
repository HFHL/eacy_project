import {
  getDocumentAiMatchInfo,
  getDocumentList,
} from '../../../api/document'
import { DEFAULT_EXTRACTED_DATA } from './documentData'

const normalizeCandidate = (candidate) => ({
  id: candidate.id,
  name: candidate.name,
  patientCode: candidate.patient_code,
  similarity: candidate.similarity || 0,
  matchReasoning: candidate.match_reasoning,
  keyEvidence: candidate.key_evidence || [],
  concerns: candidate.concerns || [],
  matchFeatures: candidate.key_evidence?.length
    ? candidate.key_evidence
    : candidate.concerns?.length
      ? candidate.concerns
      : ['待AI分析'],
  department: '待确认',
  lastVisit: '待确认',
  gender: candidate.gender || '',
  age: candidate.age || '',
})

const loadAiMatchResults = async (docs) => Promise.all(
  docs.map((doc) =>
    getDocumentAiMatchInfo(doc.id).catch((error) => {
      console.warn(`获取文档 ${doc.id} AI匹配信息失败:`, error)
      return null
    })
  )
)

export const loadNeedsReviewDocuments = async ({ page, pageSize }) => {
  const response = await getDocumentList({
    page,
    page_size: pageSize,
    task_status: 'pending_confirm_review,pending_confirm_uncertain',
  })

  if (!response.success || !response.data) {
    return { docs: [], total: 0 }
  }

  const basicDocs = response.data.map((doc) => ({
    id: doc.id,
    name: doc.file_name,
    fileName: doc.file_name,
    fileType: doc.file_type,
    filePath: doc.file_path,
    fileSize: doc.file_size,
    isParsed: doc.is_parsed,
    documentType: doc.document_type,
    documentSubType: doc.document_sub_type,
    createdAt: doc.created_at,
    extractedInfo: DEFAULT_EXTRACTED_DATA.extractedInfo,
    confidence: DEFAULT_EXTRACTED_DATA.confidence,
    candidates: DEFAULT_EXTRACTED_DATA.candidates || [],
    aiRecommendation: DEFAULT_EXTRACTED_DATA.aiRecommendation,
    aiReason: DEFAULT_EXTRACTED_DATA.aiReason,
  }))
  const aiMatchResults = await loadAiMatchResults(basicDocs)
  const docs = basicDocs.map((doc, index) => {
    const aiMatch = aiMatchResults[index]
    if (aiMatch?.success && aiMatch.data) {
      const matchData = aiMatch.data
      return {
        ...doc,
        documentMetadata: matchData.document_metadata || {},
        extractedInfo: {
          name: matchData.extracted_info?.name || '--',
          gender: matchData.extracted_info?.gender || '--',
          age: matchData.extracted_info?.age || '--',
          birthDate: matchData.extracted_info?.birth_date,
          phone: matchData.extracted_info?.phone,
          idNumber: matchData.extracted_info?.id_number,
          address: matchData.extracted_info?.address,
        },
        identifiers: matchData.identifiers || [],
        confidence: matchData.confidence || matchData.match_score || 0,
        matchResult: matchData.match_result,
        matchScore: matchData.match_score,
        candidates: (matchData.candidates || []).map(normalizeCandidate),
        aiRecommendation: matchData.ai_recommendation,
        aiReason: matchData.ai_reason,
        extractionId: matchData.extraction_id,
        extractionTime: matchData.extraction_time,
      }
    }
    return {
      ...doc,
      candidates: doc.candidates.map((candidate) => ({
        ...candidate,
        matchFeatures: candidate.matchFeatures || ['待AI分析'],
        keyEvidence: candidate.keyEvidence || [],
        concerns: candidate.concerns || [],
      })),
    }
  })

  return { docs, total: response.pagination?.total || 0 }
}

export const loadAutoArchivedDocuments = async ({ page, pageSize }) => {
  const response = await getDocumentList({
    page,
    page_size: pageSize,
    task_status: 'auto_archived',
  })

  if (!response.success || !response.data) {
    return { docs: [], total: 0 }
  }

  const transformedDocs = response.data.map((doc) => ({
    id: doc.id,
    name: doc.file_name,
    fileName: doc.file_name,
    fileType: doc.file_type,
    filePath: doc.file_path,
    createdAt: doc.created_at,
    documentType: doc.document_type,
    documentSubType: doc.document_sub_type,
    confidence: 'high',
    extractedFields: 0,
    processingTime: '--',
  }))
  const aiMatchResults = await loadAiMatchResults(transformedDocs)
  const docs = transformedDocs.map((doc, index) => {
    const aiMatch = aiMatchResults[index]
    if (aiMatch?.success && aiMatch.data) {
      const matchData = aiMatch.data
      const recommendedPatient = matchData.candidates?.find((candidate) => candidate.id === matchData.ai_recommendation)
      return {
        ...doc,
        patientName: matchData.extracted_info?.name || recommendedPatient?.name || '未知',
        patientId: matchData.ai_recommendation,
        matchScore: matchData.match_score || 0,
        extractedInfo: matchData.extracted_info,
        identifiers: matchData.identifiers || [],
        confidence: matchData.match_score >= 90 ? 'high' : matchData.match_score >= 70 ? 'medium' : 'low',
        candidates: (matchData.candidates || []).map(normalizeCandidate),
        aiRecommendation: matchData.ai_recommendation,
        aiReason: matchData.ai_reason,
        matchResult: matchData.match_result || 'matched',
      }
    }
    return doc
  })

  return { docs, total: response.pagination?.total || 0 }
}

export const loadNewPatientDocuments = async ({ page, pageSize }) => {
  const response = await getDocumentList({
    page,
    page_size: pageSize,
    task_status: 'pending_confirm_new',
  })

  if (!response.success || !response.data) {
    return { docs: [], total: 0 }
  }

  const transformedDocs = response.data.map((doc) => ({
    id: doc.id,
    fileName: doc.file_name,
    fileType: doc.file_type,
    filePath: doc.file_path,
    createdAt: doc.created_at,
    documentType: doc.document_type,
    documentSubType: doc.document_sub_type,
  }))
  const aiMatchResults = await loadAiMatchResults(transformedDocs)
  const docs = transformedDocs.map((doc, index) => {
    const aiMatch = aiMatchResults[index]
    if (aiMatch?.success && aiMatch.data) {
      const matchData = aiMatch.data
      const extractedInfo = matchData.extracted_info || {}
      return {
        ...doc,
        name: extractedInfo.name || '未知姓名',
        gender: extractedInfo.gender || '--',
        age: extractedInfo.age || '--',
        phone: extractedInfo.phone || '--',
        idNumber: extractedInfo.id_number || '--',
        address: extractedInfo.address || '--',
        birthDate: extractedInfo.birth_date || '--',
        extractedInfo,
        identifiers: matchData.identifiers || [],
        confidence: matchData.confidence || matchData.match_score || 0,
        matchScore: matchData.match_score || 0,
        matchResult: matchData.match_result || 'new',
        candidates: (matchData.candidates || []).map(normalizeCandidate),
        aiRecommendation: matchData.ai_recommendation,
        aiReason: matchData.ai_reason || '',
      }
    }
    return {
      ...doc,
      name: '未知姓名',
      gender: '--',
      age: '--',
      extractedInfo: {},
      confidence: 0,
      candidates: [],
      aiRecommendation: null,
      aiReason: '',
    }
  })

  return { docs, total: response.pagination?.total || 0 }
}
