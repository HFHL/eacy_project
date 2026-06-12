import { useCallback, useState } from 'react'
import { Modal, message } from 'antd'
import useProjectExtractionProgress from './useProjectExtractionProgress'

export const useProjectExtractionController = ({
  fetchProjectPatients,
  pagination,
  patientDataset,
  projectId,
  selectedPatients,
  setSelectedPatients,
  token,
}) => {
  const [extractionModalVisible, setExtractionModalVisible] = useState(false)
  const [extractionModalGroups, setExtractionModalGroups] = useState([])
  const [extractionModalMode, setExtractionModalMode] = useState('incremental')
  const [extractionErrorModalVisible, setExtractionErrorModalVisible] = useState(false)
  const [patientExtractChoice, setPatientExtractChoice] = useState(null)

  const refreshPatientsAfterExtraction = useCallback(() => {
    fetchProjectPatients(pagination.current, pagination.pageSize)
  }, [fetchProjectPatients, pagination.current, pagination.pageSize])

  const {
    startExtraction: startCrfExtraction,
    isExtracting,
    extractionProgress,
    extractionTasks,
    patientExtractionById,
    showProgressCard,
    dismissProgressCard,
  } = useProjectExtractionProgress({
    projectId,
    patientDataset,
    onTasksFinished: refreshPatientsAfterExtraction,
    onValuesPersisted: refreshPatientsAfterExtraction,
  })

  const handleStartExtraction = useCallback(async (patientIds = null, mode = 'incremental', targetGroups = null) => {
    const taskId = await startCrfExtraction({ patientIds, mode, targetGroups })
    if (taskId) setSelectedPatients([])
    return taskId
  }, [setSelectedPatients, startCrfExtraction])

  const confirmAndStartExtraction = useCallback((patientIds = null, mode = 'incremental', targetGroups = null) => {
    const normalizedIds = Array.isArray(patientIds) && patientIds.length > 0 ? patientIds.filter(Boolean) : null
    const targetPatients = normalizedIds
      ? patientDataset.filter((patient) => normalizedIds.includes(patient.patient_id))
      : patientDataset
    const patientsWithHistory = targetPatients.filter((patient) => patient.hasExtractionHistory)

    if (patientsWithHistory.length === 0 && normalizedIds) {
      handleStartExtraction(normalizedIds, mode, targetGroups)
      return
    }

    const previewNames = patientsWithHistory
      .slice(0, 5)
      .map((patient) => patient.name || patient.patientId || patient.patient_id)
      .join('、')
    const extraCount = Math.max(0, patientsWithHistory.length - 5)

    Modal.confirm({
      title: '确认重新抽取？',
      content: (
        <div>
          <div>
            {normalizedIds
              ? `该科研项目中有 ${patientsWithHistory.length} 位患者已有抽取记录。`
              : '本次将对项目内患者发起抽取，可能包含已有抽取记录的患者。'}
          </div>
          <div style={{ marginTop: 8 }}>重新抽取会清空历史记录并重新抽取，请确认是否继续。</div>
          {previewNames ? (
            <div style={{ marginTop: 8, color: token.colorTextSecondary }}>
              涉及患者：{previewNames}{extraCount > 0 ? ` 等 ${patientsWithHistory.length} 位` : ''}
            </div>
          ) : null}
        </div>
      ),
      okText: '确认重新抽取',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => handleStartExtraction(normalizedIds, mode, targetGroups),
    })
  }, [handleStartExtraction, patientDataset, token.colorTextSecondary])

  const resolvePatientRecord = useCallback((patientOrId) => {
    if (!patientOrId) return null
    if (typeof patientOrId === 'object') {
      const inlineId = patientOrId.patient_id || patientOrId.patientId || patientOrId.id
      if (!inlineId) return patientOrId
      return (
        patientDataset.find(
          (patient) =>
            patient.patient_id === inlineId ||
            patient.patientId === inlineId ||
            patient.id === inlineId,
        ) || patientOrId
      )
    }
    const patientId = String(patientOrId)
    return patientDataset.find(
      (patient) =>
        patient.patient_id === patientId ||
        patient.patientId === patientId ||
        patient.id === patientId,
    ) || null
  }, [patientDataset])

  const crfPayloadHasValues = useCallback((payload) => {
    if (payload == null) return false
    if (Array.isArray(payload)) return payload.some((item) => crfPayloadHasValues(item))
    if (typeof payload === 'object') {
      return Object.values(payload).some((item) => crfPayloadHasValues(item))
    }
    return String(payload).trim() !== '' && String(payload).trim() !== '--'
  }, [])

  const patientHasCompletedExtraction = useCallback((patient) => {
    if (!patient) return false
    if (patient.hasExtractionHistory) return true
    if (['done', 'partial', 'empty'].includes(patient.extractionStatus)) return true
    if ((patient.overallCompleteness ?? 0) > 0) return true

    const groups = patient.crfGroups || patient.crf_data?.groups || {}
    if (Object.values(groups).some((group) => (group?.filled_count ?? 0) > 0)) return true
    if (Object.values(groups).some((group) => {
      const fields = group?.fields
      if (!fields || typeof fields !== 'object') return false
      return Object.values(fields).some((field) => crfPayloadHasValues(field?.value))
    })) {
      return true
    }

    const currentValues = patient.crf_data?.current_values
    if (currentValues && typeof currentValues === 'object' && Object.keys(currentValues).length > 0) {
      return true
    }

    return crfPayloadHasValues(patient.crf_data?.data)
  }, [crfPayloadHasValues])

  const handlePatientListExtract = useCallback((patientOrId) => {
    const patient = resolvePatientRecord(patientOrId)
    if (!patient) {
      message.warning('未找到患者数据')
      return
    }
    const patientId = patient.patient_id || patient.patientId || patient.id
    if (!patientId) {
      message.warning('缺少患者标识，无法发起抽取')
      return
    }
    if (!patientHasCompletedExtraction(patient)) {
      handleStartExtraction([patientId], 'incremental')
      return
    }
    const displayName = patient.name || patient.subject_id || patient.patientId || patientId
    setPatientExtractChoice({ patientId, displayName })
  }, [handleStartExtraction, patientHasCompletedExtraction, resolvePatientRecord])

  const closePatientExtractChoice = useCallback(() => {
    setPatientExtractChoice(null)
  }, [])

  const startPatientExtractFromChoice = useCallback((mode) => {
    const patientId = patientExtractChoice?.patientId
    if (!patientId) return
    closePatientExtractChoice()
    handleStartExtraction([patientId], mode)
  }, [closePatientExtractChoice, handleStartExtraction, patientExtractChoice?.patientId])

  const confirmPatientFullExtract = useCallback(() => {
    const displayName = patientExtractChoice?.displayName || '该患者'
    Modal.confirm({
      title: '确认全量重抽？',
      content: `将对 ${displayName} 的所有合格文档重新规划并入队抽取，不跳过已有抽取记录。`,
      okText: '确认重抽',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => startPatientExtractFromChoice('full'),
    })
  }, [patientExtractChoice?.displayName, startPatientExtractFromChoice])

  const handleBatchExtraction = useCallback(() => {
    setExtractionModalGroups([])
    setExtractionModalMode('incremental')
    setExtractionModalVisible(true)
  }, [])

  const handleSubmitTargetedExtraction = useCallback(async () => {
    if (extractionModalGroups.length === 0) {
      message.warning('请至少选择一个字段组')
      return
    }
    setExtractionModalVisible(false)
    const patientIds = selectedPatients.length > 0 ? selectedPatients : null
    await confirmAndStartExtraction(patientIds, extractionModalMode, extractionModalGroups)
  }, [confirmAndStartExtraction, extractionModalGroups, extractionModalMode, selectedPatients])

  return {
    closePatientExtractChoice,
    confirmAndStartExtraction,
    confirmPatientFullExtract,
    dismissProgressCard,
    extractionErrorModalVisible,
    extractionModalGroups,
    extractionModalMode,
    extractionModalVisible,
    extractionProgress,
    extractionTasks,
    handleBatchExtraction,
    handlePatientListExtract,
    handleStartExtraction,
    handleSubmitTargetedExtraction,
    isExtracting,
    patientExtractChoice,
    patientExtractionById,
    setExtractionErrorModalVisible,
    setExtractionModalGroups,
    setExtractionModalMode,
    setExtractionModalVisible,
    showProgressCard,
    startPatientExtractFromChoice,
  }
}
