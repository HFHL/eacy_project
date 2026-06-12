import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { message } from 'antd'
import {
  extractDocumentMetadata,
  extractEhrDataAsync,
  getExtractionJob,
  getFileStatusesByIds,
} from '../../../../../api/document'
import {
  computeExtractStage,
  computeMetadataStage,
  isExtractInProgress,
  isMetadataInProgress,
  resolveExtractStatus,
  resolveMetaStatus,
} from '../components/documentDetailStatus'

const METADATA_POLL_INTERVAL_MS = 2000
const METADATA_POLL_MAX_WAIT_MS = 15 * 60 * 1000
const EXTRACT_POLL_MAX_WAIT_MS = 15 * 60 * 1000

export const useDocumentTaskPolling = ({
  boundPatientId,
  detailLoading,
  document,
  documentDetail,
  fetchDocumentDetail,
  onExtractSuccess,
  onRefresh,
  setDocumentDetail,
  visible,
}) => {
  const [extracting, setExtracting] = useState(false)
  const [extractingMetadata, setExtractingMetadata] = useState(false)
  const [metadataPollingActive, setMetadataPollingActive] = useState(false)
  const [extractionPollingActive, setExtractionPollingActive] = useState(false)
  const [activeExtractionJobId, setActiveExtractionJobId] = useState(null)
  const [extractionPollSnapshot, setExtractionPollSnapshot] = useState({ status: '', progress: null })
  const metadataCompletionNotifiedRef = useRef(false)
  const extractionCompletionNotifiedRef = useRef(false)
  const callbacksRef = useRef({ fetchDocumentDetail, onExtractSuccess, onRefresh, setDocumentDetail })

  useEffect(() => {
    callbacksRef.current = { fetchDocumentDetail, onExtractSuccess, onRefresh, setDocumentDetail }
  }, [fetchDocumentDetail, onExtractSuccess, onRefresh, setDocumentDetail])

  const currentMetaStatus = resolveMetaStatus(documentDetail, document)
  const metadataInProgress = metadataPollingActive || isMetadataInProgress(currentMetaStatus)
  const metadataStage = computeMetadataStage(
    metadataInProgress && !currentMetaStatus ? 'queued' : currentMetaStatus
  )
  const currentExtractStatus = extractionPollSnapshot.status || resolveExtractStatus(documentDetail, document)
  const recordsExtractInProgress = (documentDetail?.extraction_records || []).some(
    record => isExtractInProgress(record.status)
  )
  const extractInProgress = extractionPollingActive
    || isExtractInProgress(currentExtractStatus)
    || recordsExtractInProgress
  const extractStage = extractInProgress
    ? computeExtractStage(currentExtractStatus || 'pending', extractionPollSnapshot.progress)
    : computeExtractStage(currentExtractStatus)

  const extractDisabledReason = useMemo(() => {
    if (!document?.isParsed) return '文档尚未完成 OCR 解析，请先进行解析'
    if (!boundPatientId) return '文档尚未绑定患者，请先归档或选择患者'
    if (extractInProgress) return '病历抽取进行中'
    return ''
  }, [boundPatientId, document?.isParsed, extractInProgress])
  const canStartExtract = !extractDisabledReason && !extracting && !detailLoading

  useEffect(() => {
    if (!visible || !document?.id) {
      setMetadataPollingActive(false)
      metadataCompletionNotifiedRef.current = false
      return
    }
    if (isMetadataInProgress(resolveMetaStatus(documentDetail, document))) {
      setMetadataPollingActive(true)
    }
  }, [document, document?.id, documentDetail?.meta_status, documentDetail?.metaStatus, visible])

  useEffect(() => {
    if (!visible || !document?.id) return undefined
    if (!metadataPollingActive && !extractionPollingActive) return undefined

    let cancelled = false
    const startAt = Date.now()

    const tick = async () => {
      if (cancelled) return
      const elapsed = Date.now() - startAt
      if (metadataPollingActive && elapsed >= METADATA_POLL_MAX_WAIT_MS) {
        setMetadataPollingActive(false)
        message.warning('元数据抽取超时，请稍后刷新查看结果')
        return
      }
      if (extractionPollingActive && elapsed >= EXTRACT_POLL_MAX_WAIT_MS) {
        setExtractionPollingActive(false)
        setActiveExtractionJobId(null)
        setExtractionPollSnapshot({ status: '', progress: null })
        message.warning('病历抽取超时，请稍后刷新查看结果')
        return
      }

      try {
        let statusItem = null
        if (metadataPollingActive || extractionPollingActive) {
          const res = await getFileStatusesByIds([document.id])
          if (cancelled) return
          statusItem = res?.data?.items?.[0] || null
          if (statusItem) {
            callbacksRef.current.setDocumentDetail(prev => (prev ? { ...prev, ...statusItem } : prev))
          }
        }

        if (metadataPollingActive && statusItem) {
          const nextMetaStatus = statusItem.meta_status ?? statusItem.metaStatus
          const stage = computeMetadataStage(nextMetaStatus)
          if (stage && stage.kind !== 'progress') {
            setMetadataPollingActive(false)
            await callbacksRef.current.fetchDocumentDetail(document.id, { silent: true })
            callbacksRef.current.onRefresh?.()
            if (!metadataCompletionNotifiedRef.current) {
              metadataCompletionNotifiedRef.current = true
              if (stage.kind === 'success') message.success('元数据抽取完成')
              else if (stage.kind === 'error') message.error(stage.message)
              else if (stage.kind === 'warning') message.warning(stage.message)
            }
          }
        }

        if (extractionPollingActive) {
          let nextStatus = ''
          let nextProgress = null

          if (activeExtractionJobId) {
            const jobRes = await getExtractionJob(activeExtractionJobId)
            const job = jobRes?.data
            if (job) {
              nextStatus = job.status || ''
              nextProgress = job.progress ?? null
            }
          } else if (statusItem) {
            nextStatus = statusItem.extract_status ?? statusItem.extractStatus ?? ''
          }

          if (!nextStatus) return

          setExtractionPollSnapshot({ status: nextStatus, progress: nextProgress })
          const stage = computeExtractStage(nextStatus, nextProgress)
          if (!stage || stage.kind === 'progress') return

          setExtractionPollingActive(false)
          setActiveExtractionJobId(null)
          setExtractionPollSnapshot({ status: '', progress: null })
          await callbacksRef.current.fetchDocumentDetail(document.id, { silent: true })
          callbacksRef.current.onExtractSuccess?.()
          callbacksRef.current.onRefresh?.()

          if (!extractionCompletionNotifiedRef.current) {
            extractionCompletionNotifiedRef.current = true
            if (stage.kind === 'success') message.success('病历抽取完成')
            else if (stage.kind === 'error') message.error(stage.message)
            else if (stage.kind === 'warning') message.warning(stage.message)
          }
        }
      } catch (error) {
        console.warn('轮询文档任务状态失败:', error)
      }
    }

    tick()
    const timer = setInterval(tick, METADATA_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [activeExtractionJobId, document?.id, extractionPollingActive, metadataPollingActive, visible])

  useEffect(() => {
    if (!visible || !document?.id) {
      setExtractionPollingActive(false)
      setActiveExtractionJobId(null)
      setExtractionPollSnapshot({ status: '', progress: null })
      extractionCompletionNotifiedRef.current = false
      return
    }
    const status = resolveExtractStatus(documentDetail, document)
    if (isExtractInProgress(status)) {
      setExtractionPollingActive(true)
    }
    const activeRecord = (documentDetail?.extraction_records || []).find(
      record => isExtractInProgress(record.status)
    )
    if (activeRecord?.extraction_id) {
      setActiveExtractionJobId(activeRecord.extraction_id)
      setExtractionPollingActive(true)
    }
  }, [
    document,
    document?.id,
    documentDetail?.extract_status,
    documentDetail?.extractStatus,
    documentDetail?.extraction_records,
    visible,
  ])

  const handleExtractMetadata = useCallback(async () => {
    if (!document) {
      message.error('文档信息不存在')
      return
    }
    if (!document.isParsed) {
      message.warning('文档尚未完成 OCR 解析，请先进行解析')
      return
    }
    setExtractingMetadata(true)
    try {
      const response = await extractDocumentMetadata(document.id)
      if (response.success) {
        metadataCompletionNotifiedRef.current = false
        if (response.data) {
          callbacksRef.current.setDocumentDetail(prev => (prev ? { ...prev, ...response.data } : response.data))
        }
        setMetadataPollingActive(true)
        message.success('元数据抽取任务已启动')
      } else {
        message.error(response.message || '元数据抽取任务启动失败')
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message || '元数据抽取任务启动失败'
      message.error(errorMsg)
    } finally {
      setExtractingMetadata(false)
    }
  }, [document])

  const handleExtract = useCallback(async () => {
    if (!document) {
      message.error('文档信息不存在')
      return
    }
    if (extractDisabledReason) {
      message.warning(extractDisabledReason)
      return
    }

    setExtracting(true)
    try {
      const response = await extractEhrDataAsync(document.id, {
        patientId: boundPatientId,
        source: (documentDetail?.extraction_records?.length || 0) > 0
          ? 'document_reextract'
          : 'document_detail_manual',
      })

      if (response.success) {
        extractionCompletionNotifiedRef.current = false
        const jobId = response.data?.id || response.data?.task_id
        if (jobId) {
          setActiveExtractionJobId(jobId)
        }
        setExtractionPollSnapshot({ status: 'pending', progress: 10 })
        setExtractionPollingActive(true)
        message.success('病历抽取任务已启动')
        callbacksRef.current.fetchDocumentDetail(document.id, { silent: true })
      } else {
        message.error(response.message || '抽取任务启动失败，请稍后重试')
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.data?.detail || error.message || 'AI 抽取失败'
      message.error(`抽取失败: ${errorMsg}`)
    } finally {
      setExtracting(false)
    }
  }, [boundPatientId, document, documentDetail?.extraction_records?.length, extractDisabledReason])

  return {
    canStartExtract,
    extractDisabledReason,
    extractInProgress,
    extractStage,
    extracting,
    extractingMetadata,
    handleExtract,
    handleExtractMetadata,
    metadataInProgress,
    metadataStage,
  }
}
