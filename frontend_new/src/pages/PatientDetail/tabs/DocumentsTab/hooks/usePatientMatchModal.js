import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, message } from 'antd'
import { archiveDocument, changeArchivePatient, getDocumentAiMatchInfo } from '../../../../../api/document'
import { getPatientList } from '../../../../../api/patient'

const getDocumentStatus = (doc, archivedPatientId) => (
  doc.task_status || doc.status || doc.taskStatus || (archivedPatientId ? 'archived' : 'pending_confirm_review')
)

const buildMatchDocument = ({ doc, documentId, docStatus, archivedPatientId, isFromAutoArchived, matchData }) => ({
  id: documentId,
  name: doc.fileName || doc.file_name || doc.name || '未知文档',
  fileName: doc.fileName || doc.file_name || doc.name,
  taskStatus: docStatus,
  isFromAutoArchived: !!isFromAutoArchived,
  archivedPatientId: archivedPatientId ?? null,
  createdAt: doc.createdAt || doc.created_at,
  documentType: doc.documentType || doc.document_type,
  documentSubType: doc.documentSubType || doc.document_sub_type,
  extractedInfo: matchData?.extracted_info || {},
  matchScore: matchData?.match_score || 0,
  confidence: matchData?.confidence || 0,
  candidates: (matchData?.candidates || []).map(candidate => ({
    id: candidate.id,
    name: candidate.name,
    patientCode: candidate.patient_code,
    similarity: candidate.similarity || 0,
    matchReasoning: candidate.match_reasoning,
    keyEvidence: candidate.key_evidence || [],
    concerns: candidate.concerns || [],
    matchFeatures: candidate.key_evidence?.length
      ? candidate.key_evidence
      : (candidate.concerns?.length ? candidate.concerns : ['待AI分析']),
    gender: candidate.gender || '',
    age: candidate.age || '',
  })),
  aiRecommendation: matchData?.ai_recommendation,
  aiReason: matchData?.ai_reason,
  matchResult: matchData?.match_result || 'matched',
})

export const getConfidenceStyle = (confidence) => {
  if (typeof confidence === 'number') {
    if (confidence >= 90) return { color: 'green', label: '高置信度' }
    if (confidence >= 70) return { color: 'orange', label: '中置信度' }
    return { color: 'red', label: '低置信度' }
  }

  const configs = {
    high: { color: 'green', label: '高置信度' },
    medium: { color: 'orange', label: '中置信度' },
    low: { color: 'red', label: '低置信度' },
  }
  return configs[confidence] || { color: 'default', label: '未知' }
}

export const usePatientMatchModal = ({
  currentDocument,
  detailModalRef,
  documents,
  onRefresh,
  patientId,
  setDetailRefreshTrigger,
}) => {
  const [patientMatchVisible, setPatientMatchVisible] = useState(false)
  const [selectedMatchDocument, setSelectedMatchDocument] = useState(null)
  const [patientSearchValue, setPatientSearchValue] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState([])
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [selectedMatchPatient, setSelectedMatchPatient] = useState(null)
  const [archivingLoading, setArchivingLoading] = useState(false)
  const [matchInfoLoading, setMatchInfoLoading] = useState(false)
  const [matchModalMode, setMatchModalMode] = useState('change')
  const searchTimerRef = useRef(null)
  const searchVersionRef = useRef(0)

  const resetSearch = useCallback(() => {
    setPatientSearchValue('')
    setPatientSearchResults([])
    setShowSearchResults(false)
    setSelectedMatchPatient(null)
  }, [])

  const closePatientMatchModal = useCallback(() => {
    setPatientMatchVisible(false)
    resetSearch()
    setSelectedMatchDocument(null)
    setMatchModalMode('change')
  }, [resetSearch])

  const openPatientMatchModal = useCallback(async (documentId, options = {}, docOverride) => {
    const { archivedPatientId, isFromAutoArchived, mode = 'change' } = options
    const doc = docOverride || documents.find(item => item.id === documentId)
    if (!doc) {
      message.warning('文档不存在')
      return
    }

    const docStatus = getDocumentStatus(doc, archivedPatientId)
    setMatchModalMode(mode)
    setSelectedMatchDocument(buildMatchDocument({ doc, documentId, docStatus, archivedPatientId, isFromAutoArchived }))
    setPatientMatchVisible(true)
    setMatchInfoLoading(true)
    resetSearch()

    try {
      const matchResponse = await getDocumentAiMatchInfo(documentId)
      if (matchResponse.success && matchResponse.data) {
        setSelectedMatchDocument(buildMatchDocument({
          doc,
          documentId,
          docStatus,
          archivedPatientId,
          isFromAutoArchived,
          matchData: matchResponse.data,
        }))
      } else {
        message.error('获取文档匹配信息失败')
        closePatientMatchModal()
      }
    } catch (error) {
      console.error('获取文档匹配信息失败:', error)
      message.error('获取文档匹配信息失败')
      closePatientMatchModal()
    } finally {
      setMatchInfoLoading(false)
    }
  }, [closePatientMatchModal, documents, resetSearch])

  const handleChangePatient = useCallback(async (documentId) => {
    await openPatientMatchModal(documentId, {
      archivedPatientId: patientId,
      isFromAutoArchived: true,
      mode: 'change',
    })
  }, [openPatientMatchModal, patientId])

  const handleArchivePatient = useCallback(async (documentId) => {
    const doc = (currentDocument && currentDocument.id === documentId)
      ? currentDocument
      : documents.find(item => item.id === documentId)
    await openPatientMatchModal(documentId, {
      archivedPatientId: null,
      isFromAutoArchived: false,
      mode: 'archive',
    }, doc)
  }, [currentDocument, documents, openPatientMatchModal])

  const handlePatientSearch = useCallback((value) => {
    setPatientSearchValue(value)
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }

    searchVersionRef.current += 1
    const currentVersion = searchVersionRef.current
    if (!value || value.trim().length < 1) {
      setShowSearchResults(false)
      setPatientSearchResults([])
      setPatientSearchLoading(false)
      return
    }

    setPatientSearchLoading(true)
    setShowSearchResults(true)
    setPatientSearchResults([])
    searchTimerRef.current = setTimeout(async () => {
      try {
        const response = await getPatientList({ page: 1, page_size: 10, search: value.trim() })
        if (currentVersion === searchVersionRef.current) {
          setPatientSearchResults(response.success && response.data ? response.data : [])
          setPatientSearchLoading(false)
        }
      } catch (error) {
        console.error('搜索患者失败:', error)
        if (currentVersion === searchVersionRef.current) {
          setPatientSearchResults([])
          setPatientSearchLoading(false)
        }
      }
    }, 500)
  }, [])

  const handleSelectSearchPatient = useCallback((patient) => {
    setSelectedMatchPatient(patient)
    setPatientSearchValue(patient.name)
    setShowSearchResults(false)
  }, [])

  const handleArchiveSuccess = useCallback((successMessage) => {
    message.success(successMessage)
    closePatientMatchModal()
    onRefresh?.()
    setDetailRefreshTrigger(trigger => trigger + 1)
    detailModalRef.current?.refetch?.()
  }, [closePatientMatchModal, detailModalRef, onRefresh, setDetailRefreshTrigger])

  const confirmArchiveChange = useCallback(({ docId, isArchive, patientName, targetPatientId }) => {
    Modal.confirm({
      title: isArchive ? '确认选择该患者归档' : '确认更换归档患者',
      content: isArchive ? '确定选择该患者并归档文档吗？' : '确定要将文档更换归档到该患者吗？',
      okText: isArchive ? '确认选择' : '确认更换',
      cancelText: '取消',
      centered: true,
      wrapClassName: 'confirm-modal-up',
      onOk: async () => {
        setArchivingLoading(true)
        try {
          const response = isArchive
            ? await archiveDocument(docId, targetPatientId, true)
            : await changeArchivePatient(docId, targetPatientId, {
                revokeLastMerge: true,
                autoMergeEhr: true,
              })
          if (response.success) {
            handleArchiveSuccess(isArchive
              ? `文档已归档到患者: ${patientName || response.data?.patient_name || targetPatientId}`
              : `文档已更换归档到患者: ${patientName || response.data?.patient_name || targetPatientId}`)
          } else {
            message.error(response.message || (isArchive ? '归档失败' : '更换归档失败'))
          }
        } catch (error) {
          console.error(isArchive ? '归档失败:' : '更换归档文档失败:', error)
          message.error(error.response?.data?.message || (isArchive ? '归档失败' : '更换归档文档失败'))
        } finally {
          setArchivingLoading(false)
        }
      },
    })
  }, [handleArchiveSuccess])

  const handleConfirmPatientMatch = useCallback(() => {
    if (!selectedMatchDocument) {
      message.warning('缺少文档信息')
      return
    }
    if (!selectedMatchPatient) {
      message.warning('请先选择一个患者')
      return
    }
    confirmArchiveChange({
      docId: selectedMatchDocument.id,
      isArchive: matchModalMode === 'archive',
      patientName: selectedMatchPatient.name,
      targetPatientId: selectedMatchPatient.id,
    })
  }, [confirmArchiveChange, matchModalMode, selectedMatchDocument, selectedMatchPatient])

  const handleConfirmMatch = useCallback((docId, targetPatientId) => {
    if (!docId || !targetPatientId) {
      message.warning('缺少文档或患者信息')
      return
    }
    const candidate = selectedMatchDocument?.candidates?.find(item => item.id === targetPatientId)
    confirmArchiveChange({
      docId,
      isArchive: matchModalMode === 'archive',
      patientName: candidate?.name,
      targetPatientId,
    })
  }, [confirmArchiveChange, matchModalMode, selectedMatchDocument])

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
    searchVersionRef.current += 1
    closePatientMatchModal()
  }, [closePatientMatchModal, patientId])

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  }, [])

  return {
    archivingLoading,
    closePatientMatchModal,
    getConfidenceStyle,
    handleArchivePatient,
    handleChangePatient,
    handleConfirmMatch,
    handleConfirmPatientMatch,
    handlePatientSearch,
    handleSelectSearchPatient,
    matchInfoLoading,
    matchModalMode,
    patientMatchVisible,
    patientSearchLoading,
    patientSearchResults,
    patientSearchValue,
    selectedMatchDocument,
    selectedMatchPatient,
    showSearchResults,
  }
}
