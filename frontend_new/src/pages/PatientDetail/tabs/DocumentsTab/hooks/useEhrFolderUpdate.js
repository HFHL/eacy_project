import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { message } from 'antd'
import {
  getPatientEhrSchemaOnly,
  getTaskBatchProgress,
  updatePatientEhrFolder,
} from '../../../../../api/patient'
import { buildTargetFormGroupsFromSchema } from '../../SchemaEhrTab/schemaFormShared'
import {
  TASK_TYPE_LABEL,
  claimBatchNotifyOnce,
  pushTaskNotification,
} from '../../../../../utils/taskNotifications'

const TERMINAL_BATCH_STATUSES = ['succeeded', 'completed', 'completed_with_errors', 'failed', 'timeout', 'cancelled']
const FIELD_WRITE_STAGES = ['persist_batch_values', 'persist_values']

export const isTerminalBatchStatus = (status) => TERMINAL_BATCH_STATUSES.includes(status)

const getBatchStorageKey = (patientId) => `eacy_ehr_folder_batch_${patientId}`

const buildFieldWriteSignature = (batch) => {
  const items = Array.isArray(batch?.items) ? batch.items : []
  return items
    .filter((item) => FIELD_WRITE_STAGES.includes(item?.stage))
    .map((item) => [
      item.extraction_job_id,
      item.extraction_run_id,
      item.stage,
      item.progress,
      item.updated_at,
    ].filter(Boolean).join(':'))
    .filter(Boolean)
    .join('|')
}

const notifyTerminalBatch = (batch, batchId) => {
  const effectiveBatchId = batch?.batch_id || batchId
  const folderTitle = TASK_TYPE_LABEL.ehr_folder_batch
  if (!claimBatchNotifyOnce(effectiveBatchId)) return

  if (batch?.status === 'succeeded' || batch?.status === 'completed') {
    const description = '电子病历夹更新完成'
    message.success(description)
    pushTaskNotification({ type: 'success', taskType: 'ehr_folder_batch', title: folderTitle, description })
    return
  }

  if (batch?.status === 'completed_with_errors') {
    const description = `电子病历夹更新完成，失败 ${batch.failed_items || 0} 个任务`
    message.warning(description)
    pushTaskNotification({ type: 'warning', taskType: 'ehr_folder_batch', title: folderTitle, description })
    return
  }

  if (batch?.status === 'failed' || batch?.status === 'timeout') {
    const description = batch?.status === 'timeout' ? '电子病历夹更新超时' : '电子病历夹更新失败'
    message.error(description)
    pushTaskNotification({ type: 'error', taskType: 'ehr_folder_batch', title: folderTitle, description })
    return
  }

  const description = '电子病历夹更新已结束'
  message.warning(description)
  pushTaskNotification({ type: 'warning', taskType: 'ehr_folder_batch', title: folderTitle, description })
}

export const useEhrFolderUpdate = ({ onRefresh, patientId }) => {
  const [updatingEhrFolder, setUpdatingEhrFolder] = useState(false)
  const [ehrFolderBatch, setEhrFolderBatch] = useState(null)
  const [targetedModalVisible, setTargetedModalVisible] = useState(false)
  const [targetedModalGroups, setTargetedModalGroups] = useState([])
  const [targetedModalMode, setTargetedModalMode] = useState('incremental')
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [patientSchema, setPatientSchema] = useState(null)
  const ehrFolderPollTimerRef = useRef(null)
  const ehrFolderPollOwnerRef = useRef(null)
  const ehrFolderPollSeqRef = useRef(0)
  const fieldWriteRefreshSigRef = useRef('')

  const stopEhrFolderPolling = useCallback(({ invalidate = true } = {}) => {
    if (invalidate) {
      ehrFolderPollSeqRef.current += 1
      ehrFolderPollOwnerRef.current = null
    }
    if (ehrFolderPollTimerRef.current) {
      clearTimeout(ehrFolderPollTimerRef.current)
      ehrFolderPollTimerRef.current = null
    }
  }, [])

  const pollEhrFolderBatch = useCallback(async (batchId, ownerPatientId) => {
    const ownerId = ownerPatientId || patientId
    if (!batchId || !ownerId) return

    if (ehrFolderPollTimerRef.current) {
      clearTimeout(ehrFolderPollTimerRef.current)
      ehrFolderPollTimerRef.current = null
    }

    const pollSeq = ehrFolderPollSeqRef.current
    ehrFolderPollOwnerRef.current = ownerId

    try {
      const response = await getTaskBatchProgress(batchId)
      if (pollSeq !== ehrFolderPollSeqRef.current || ehrFolderPollOwnerRef.current !== ownerId) return

      const batch = response?.data || response
      setEhrFolderBatch({ ...batch, patientId: ownerId, batchId })
      setUpdatingEhrFolder(!isTerminalBatchStatus(batch?.status))
      localStorage.setItem(getBatchStorageKey(ownerId), batchId)
      const fieldWriteSignature = buildFieldWriteSignature(batch)
      if (
        fieldWriteSignature &&
        fieldWriteSignature !== fieldWriteRefreshSigRef.current &&
        String(ownerId) === String(patientId)
      ) {
        fieldWriteRefreshSigRef.current = fieldWriteSignature
        onRefresh?.()
      }

      if (isTerminalBatchStatus(batch?.status)) {
        setUpdatingEhrFolder(false)
        notifyTerminalBatch(batch, batchId)
        try {
          localStorage.removeItem(getBatchStorageKey(ownerId))
        } catch {
          // ignore storage cleanup failures
        }
        if (String(ownerId) === String(patientId)) {
          onRefresh?.()
        }
        return
      }

      ehrFolderPollTimerRef.current = setTimeout(() => {
        pollEhrFolderBatch(batchId, ownerId)
      }, 2500)
    } catch (error) {
      if (pollSeq !== ehrFolderPollSeqRef.current || ehrFolderPollOwnerRef.current !== ownerId) return
      setUpdatingEhrFolder(false)
      console.error('查询电子病历夹更新进度失败:', error)
    }
  }, [onRefresh, patientId])

  const targetFormGroups = useMemo(
    () => buildTargetFormGroupsFromSchema(patientSchema),
    [patientSchema],
  )

  const startEhrFolderUpdate = useCallback(async (options = {}) => {
    const ownerId = patientId
    if (!ownerId || updatingEhrFolder) return

    setUpdatingEhrFolder(true)
    try {
      const response = await updatePatientEhrFolder(ownerId, options)
      message.success(response?.message || '已提交电子病历夹更新任务')
      const batchId = response?.data?.batch_id || response?.data?.task_id
      if (batchId) {
        try {
          localStorage.setItem(getBatchStorageKey(ownerId), batchId)
        } catch {
          // ignore storage failures
        }
        setEhrFolderBatch({ batch_id: batchId, batchId, patientId: ownerId, status: 'queued', progress: 5, message: response?.data?.message })
        pollEhrFolderBatch(batchId, ownerId)
      } else if (String(ownerId) === String(patientId)) {
        setUpdatingEhrFolder(false)
        onRefresh?.()
      }
    } catch (error) {
      if (String(ownerId) === String(patientId)) {
        setUpdatingEhrFolder(false)
      }
      const detail = error?.message || error?.data?.detail || ''
      const hint = typeof detail === 'string' && detail.includes('电子病历 Schema')
        ? detail
        : (detail || '更新电子病历夹失败')
      message.error(hint)
    }
  }, [onRefresh, patientId, pollEhrFolderBatch, updatingEhrFolder])

  const handleUpdateEhrFolder = useCallback(() => {
    startEhrFolderUpdate({ mode: 'incremental' })
  }, [startEhrFolderUpdate])

  const handleOpenTargetedEhrFolderModal = useCallback(async () => {
    let schema = patientSchema
    if (!buildTargetFormGroupsFromSchema(schema).length) {
      setSchemaLoading(true)
      try {
        const response = await getPatientEhrSchemaOnly(patientId)
        const schemaCandidate = response?.data?.schema
        const hasSchema =
          schemaCandidate &&
          typeof schemaCandidate === 'object' &&
          Object.keys(schemaCandidate.properties || {}).length > 0
        schema = hasSchema ? schemaCandidate : null
        setPatientSchema(schema)
      } catch (error) {
        console.error('加载患者 Schema 失败:', error)
        schema = null
      } finally {
        setSchemaLoading(false)
      }
    }
    if (!buildTargetFormGroupsFromSchema(schema).length) {
      message.warning('未加载到病历表单结构，请稍后在病历 Tab 确认 Schema 已就绪')
      return
    }
    setTargetedModalGroups([])
    setTargetedModalMode('incremental')
    setTargetedModalVisible(true)
  }, [patientId, patientSchema])

  const handleSubmitTargetedEhrFolder = useCallback(async () => {
    if (targetedModalGroups.length === 0) {
      message.warning('请至少选择一个字段组')
      return
    }
    setTargetedModalVisible(false)
    await startEhrFolderUpdate({
      targetFormKeys: targetedModalGroups,
      mode: targetedModalMode,
    })
  }, [startEhrFolderUpdate, targetedModalGroups, targetedModalMode])

  const activeEhrFolderBatch = useMemo(() => (
    ehrFolderBatch && String(ehrFolderBatch.patientId) === String(patientId)
      ? ehrFolderBatch
      : null
  ), [ehrFolderBatch, patientId])

  useEffect(() => {
    stopEhrFolderPolling({ invalidate: true })
    setEhrFolderBatch(null)
    setUpdatingEhrFolder(false)
    fieldWriteRefreshSigRef.current = ''

    if (!patientId) return undefined

    const savedBatchId = localStorage.getItem(getBatchStorageKey(patientId))
    if (savedBatchId) {
      setUpdatingEhrFolder(true)
      pollEhrFolderBatch(savedBatchId, patientId)
    }

    return () => {
      stopEhrFolderPolling({ invalidate: true })
    }
  }, [patientId, pollEhrFolderBatch, stopEhrFolderPolling])

  useEffect(() => (
    () => stopEhrFolderPolling({ invalidate: true })
  ), [stopEhrFolderPolling])

  return {
    activeEhrFolderBatch,
    handleOpenTargetedEhrFolderModal,
    handleSubmitTargetedEhrFolder,
    handleUpdateEhrFolder,
    isTerminalBatchStatus,
    schemaLoading,
    setTargetedModalGroups,
    setTargetedModalMode,
    setTargetedModalVisible,
    targetedModalGroups,
    targetedModalMode,
    targetedModalVisible,
    targetFormGroups,
    updatingEhrFolder,
  }
}
