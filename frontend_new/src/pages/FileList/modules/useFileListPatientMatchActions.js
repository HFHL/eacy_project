import { useCallback, useEffect, useRef } from 'react'
import {
  archiveDocument,
  changeArchivePatient,
  getDocumentAiMatchInfo,
} from '../../../api/document'
import { getPatientList } from '../../../api/patient'
import { modalWidthPreset } from '../../../styles/themeTokens'
import { getRecommendedArchiveLabel } from './formatters'

export const useFileListPatientMatchActions = ({
  detailModalRef,
  fileRecordMap,
  matchModalMode,
  message,
  modal,
  refreshAll,
  selectedMatchDocument,
  selectedMatchPatient,
  setArchivingLoading,
  setMatchInfoLoading,
  setMatchModalMode,
  setPatientMatchVisible,
  setPatientSearchLoading,
  setPatientSearchResults,
  setPatientSearchValue,
  setSelectedMatchDocument,
  setSelectedMatchPatient,
  setShowSearchResults,
}) => {
  const searchTimerRef = useRef(null)
  const searchVersionRef = useRef(0)

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  }, [])

  const openPatientMatchModal = useCallback(async (documentId, options = {}, fileOverride) => {
    const { archivedPatientId, isFromAutoArchived } = options
    const file = fileOverride || fileRecordMap.get(documentId)
    if (!file) return message.warning('文档不存在')
    const currentArchivedPatientId = archivedPatientId ?? (file.patient_info?.patient_id || null)
    const baseDocument = {
      archivedPatientId: currentArchivedPatientId,
      archivedPatientInfo: file.patient_info || null,
      candidates: [],
      createdAt: file.created_at,
      documentSubType: file.document_sub_type,
      documentType: file.document_type,
      extractedInfo: {},
      fileName: file.file_name,
      id: documentId,
      isFromAutoArchived: !!isFromAutoArchived,
      name: file.file_name || '未知文档',
      taskStatus: file.task_status,
    }

    setSelectedMatchDocument(baseDocument)
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
        setSelectedMatchDocument({
          ...baseDocument,
          aiReason: matchData.ai_reason,
          aiRecommendation: matchData.ai_recommendation,
          candidates: (matchData.candidates || []).map((candidate) => ({
            age: candidate.age || '',
            concerns: candidate.concerns || [],
            gender: candidate.gender || '',
            id: candidate.id,
            keyEvidence: candidate.key_evidence || [],
            matchFeatures: candidate.key_evidence?.length
              ? candidate.key_evidence
              : candidate.concerns?.length
                ? candidate.concerns
                : ['待AI分析'],
            matchReasoning: candidate.match_reasoning,
            name: candidate.name,
            patientCode: candidate.patient_code,
            similarity: candidate.similarity || 0,
          })),
          confidence: matchData.confidence || 0,
          extractedInfo: matchData.extracted_info || {},
          matchResult: matchData.match_result || 'matched',
          matchScore: matchData.match_score || 0,
        })
      } else {
        message.info('未获取到 AI 推荐，可手动搜索患者归档')
      }
    } catch {
      message.info('未获取到 AI 推荐，可手动搜索患者归档')
    } finally {
      setMatchInfoLoading(false)
    }
  }, [
    fileRecordMap,
    message,
    setMatchInfoLoading,
    setPatientMatchVisible,
    setPatientSearchResults,
    setPatientSearchValue,
    setSelectedMatchDocument,
    setSelectedMatchPatient,
    setShowSearchResults,
  ])

  const handleChangePatient = useCallback(async (documentId) => {
    const file = fileRecordMap.get(documentId)
    if (!file) return message.warning('文档不存在')
    if (file.task_status !== 'archived') return message.warning('只有已归档文档才能更换患者')
    setMatchModalMode('change')
    await openPatientMatchModal(documentId, {
      archivedPatientId: file.patient_info?.patient_id || null,
      isFromAutoArchived: true,
    }, file)
  }, [fileRecordMap, message, openPatientMatchModal, setMatchModalMode])

  const handleArchivePatient = useCallback(async (documentId) => {
    setMatchModalMode('archive')
    const file = fileRecordMap.get(documentId)
    await openPatientMatchModal(documentId, { archivedPatientId: null, isFromAutoArchived: false }, file)
  }, [fileRecordMap, openPatientMatchModal, setMatchModalMode])

  const handlePatientSearch = useCallback((value) => {
    setPatientSearchValue(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchVersionRef.current += 1
    const version = searchVersionRef.current
    if (!value || value.trim().length < 1) {
      setShowSearchResults(false)
      setPatientSearchResults([])
      return
    }

    setPatientSearchLoading(true)
    setShowSearchResults(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const response = await getPatientList({ page: 1, page_size: 10, search: value.trim() })
        if (version === searchVersionRef.current) {
          setPatientSearchResults(response.success && response.data ? response.data : [])
          setPatientSearchLoading(false)
        }
      } catch {
        if (version === searchVersionRef.current) {
          setPatientSearchResults([])
          setPatientSearchLoading(false)
        }
      }
    }, 500)
  }, [
    setPatientSearchLoading,
    setPatientSearchResults,
    setPatientSearchValue,
    setShowSearchResults,
  ])

  const handleConfirmPatientMatch = useCallback(async () => {
    if (!selectedMatchDocument || !selectedMatchPatient) return message.warning('请先选择一个患者')
    const isArchive = matchModalMode === 'archive'
    const matchedCandidate = selectedMatchDocument?.candidates?.find((candidate) => candidate.id === selectedMatchPatient.id)
    const confirmLabel = isArchive
      ? getRecommendedArchiveLabel(selectedMatchPatient.name, matchedCandidate?.similarity)
      : '确认更换归档患者'

    modal.confirm({
      title: confirmLabel,
      content: isArchive ? '确定选择该患者并归档文档吗？' : '确定更换归档到该患者吗？',
      okText: isArchive ? confirmLabel : '确认',
      cancelText: '取消',
      centered: true,
      width: modalWidthPreset.standard,
      onOk: async () => {
        setArchivingLoading(true)
        try {
          const response = isArchive
            ? await archiveDocument(selectedMatchDocument.id, selectedMatchPatient.id, true)
            : await changeArchivePatient(selectedMatchDocument.id, selectedMatchPatient.id, {
                revokeLastMerge: true,
                autoMergeEhr: true,
              })
          if (response.success) {
            message.success(isArchive
              ? `已归档到患者: ${selectedMatchPatient.name}`
              : `已更换归档到: ${selectedMatchPatient.name}`)
            setPatientMatchVisible(false)
            setSelectedMatchPatient(null)
            setSelectedMatchDocument(null)
            refreshAll({ forceTree: true })
            detailModalRef.current?.refetch?.()
          } else {
            message.error(response.message || '操作失败')
          }
        } catch (error) {
          message.error(error.response?.data?.message || '操作失败')
        } finally {
          setArchivingLoading(false)
        }
      },
    })
  }, [
    detailModalRef,
    matchModalMode,
    message,
    modal,
    refreshAll,
    selectedMatchDocument,
    selectedMatchPatient,
    setArchivingLoading,
    setPatientMatchVisible,
    setSelectedMatchDocument,
    setSelectedMatchPatient,
  ])

  const handleConfirmMatch = useCallback(async (docId, targetPatientId) => {
    if (!docId || !targetPatientId) return
    const candidate = selectedMatchDocument?.candidates?.find((item) => item.id === targetPatientId)
    const isArchive = matchModalMode === 'archive'
    const confirmLabel = isArchive
      ? getRecommendedArchiveLabel(candidate?.name, candidate?.similarity)
      : '确认更换归档患者'

    modal.confirm({
      title: confirmLabel,
      okText: isArchive ? confirmLabel : '确认',
      cancelText: '取消',
      centered: true,
      width: modalWidthPreset.standard,
      onOk: async () => {
        setArchivingLoading(true)
        try {
          const response = isArchive
            ? await archiveDocument(docId, targetPatientId, true)
            : await changeArchivePatient(docId, targetPatientId, { revokeLastMerge: true, autoMergeEhr: true })
          if (response.success) {
            message.success(`已${isArchive ? '归档' : '更换归档'}到患者: ${candidate?.name || targetPatientId}`)
            setPatientMatchVisible(false)
            setSelectedMatchPatient(null)
            setSelectedMatchDocument(null)
            refreshAll({ forceTree: true })
            detailModalRef.current?.refetch?.()
          } else {
            message.error(response.message || '操作失败')
          }
        } catch {
          message.error('操作失败')
        } finally {
          setArchivingLoading(false)
        }
      },
    })
  }, [
    detailModalRef,
    matchModalMode,
    message,
    modal,
    refreshAll,
    selectedMatchDocument,
    setArchivingLoading,
    setPatientMatchVisible,
    setSelectedMatchDocument,
    setSelectedMatchPatient,
  ])

  return {
    handleArchivePatient,
    handleChangePatient,
    handleConfirmMatch,
    handleConfirmPatientMatch,
    handlePatientSearch,
  }
}
