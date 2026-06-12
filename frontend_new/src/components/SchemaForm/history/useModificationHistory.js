import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import {
  getEhrFieldCandidatesV3,
  getEhrFieldHistoryV3,
  selectEhrFieldCandidateV3,
} from '../../../api/patient'
import {
  getProjectCrfFieldCandidates,
  getProjectCrfFieldHistory,
  selectProjectCrfFieldCandidate,
} from '../../../api/project'
import { getNestedValue } from '../../../utils/auditResolver'
import { maskSensitiveField } from '../../../utils/sensitiveUtils'

const createEmptyFieldMeta = () => ({
  candidates: [],
  selectedCandidateId: null,
  selectedValue: null,
  hasValueConflict: false,
  distinctValueCount: 0,
})

const toFieldMeta = (candidatePayload = {}) => ({
  candidates: Array.isArray(candidatePayload?.candidates) ? candidatePayload.candidates : [],
  selectedCandidateId: candidatePayload?.selected_candidate_id || null,
  selectedValue: candidatePayload?.selected_value ?? null,
  hasValueConflict: !!candidatePayload?.has_value_conflict,
  distinctValueCount: Number(candidatePayload?.distinct_value_count || 0),
})

export function useModificationHistory({
  fieldPath,
  rowUid = null,
  recordInstanceId = null,
  patientId,
  projectId,
  refreshKey = 0,
  onHistoryLoaded,
  onCandidateApplied,
  isSensitive = false,
  candidateDocuments = [],
}) {
  const candidateDocumentNameById = useMemo(() => {
    const map = new Map()
    for (const doc of candidateDocuments || []) {
      const id = doc?.id ?? doc?.document_id ?? doc?.documentId
      if (id == null) continue
      const name =
        doc?.file_name ||
        doc?.fileName ||
        doc?.name ||
        doc?.document_name ||
        doc?.documentName ||
        ''
      map.set(String(id), name)
    }
    return map
  }, [candidateDocuments])

  const resolveCandidateSourceDocName = useCallback((candidate) => {
    if (!candidate) return ''
    const direct =
      candidate.source_document_name ||
      candidate.sourceDocumentName ||
      candidate.document_name ||
      candidate.documentName
    if (direct) return String(direct)
    const id = candidate.source_document_id ?? candidate.sourceDocumentId
    if (id == null) return ''
    return candidateDocumentNameById.get(String(id)) || ''
  }, [candidateDocumentNameById])

  const [history, setHistory] = useState([])
  const [fieldMeta, setFieldMeta] = useState(createEmptyFieldMeta)
  const [loading, setLoading] = useState(false)
  const [selectingCandidateId, setSelectingCandidateId] = useState(null)
  const [selectRefreshTick, setSelectRefreshTick] = useState(0)

  const normalizedFieldPath = String(fieldPath || '')
  const subFieldMatch = /\.(\d+)\.(.+)$/.exec(normalizedFieldPath)
  const rowMatch = !subFieldMatch ? /\.(\d+)$/.exec(normalizedFieldPath) : null
  const arrayIdx = subFieldMatch ? parseInt(subFieldMatch[1], 10) : rowMatch ? parseInt(rowMatch[1], 10) : null
  const subFieldPath = subFieldMatch ? subFieldMatch[2] : null
  const toHistoryQueryPath = useCallback((path) => String(path || '').trim(), [])
  const historyOptions = useMemo(() => (
    recordInstanceId ? { recordInstanceId } : undefined
  ), [recordInstanceId])

  useEffect(() => {
    let cancelled = false

    async function fetchHistory() {
      if (!fieldPath) {
        setHistory([])
        if (typeof onHistoryLoaded === 'function') onHistoryLoaded([])
        return
      }

      if (projectId && patientId) {
        const queryPath = toHistoryQueryPath(fieldPath)
        setLoading(true)
        try {
          const [res, candidateRes] = await Promise.all([
            getProjectCrfFieldHistory(projectId, patientId, queryPath, historyOptions),
            getProjectCrfFieldCandidates(projectId, patientId, queryPath, historyOptions),
          ])
          const payload = res?.data || {}
          const candidatePayload = candidateRes?.data || {}
          const list = !cancelled && payload?.history ? payload.history : []
          if (!cancelled) {
            setHistory(list)
            setFieldMeta(toFieldMeta(candidatePayload))
            if (typeof onHistoryLoaded === 'function') onHistoryLoaded(list, payload)
          }
        } catch (e) {
          console.error('Failed to fetch project field history:', e)
          if (!cancelled) {
            setHistory([])
            setFieldMeta(createEmptyFieldMeta())
            if (typeof onHistoryLoaded === 'function') onHistoryLoaded([])
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      } else if (patientId) {
        const queryPath = toHistoryQueryPath(fieldPath)
        setLoading(true)
        try {
          const [res, candidateRes] = await Promise.all([
            getEhrFieldHistoryV3(patientId, queryPath, historyOptions),
            getEhrFieldCandidatesV3(patientId, queryPath, historyOptions),
          ])
          const payload = res?.data || {}
          const candidatePayload = candidateRes?.data || {}
          const list = !cancelled && payload?.history ? payload.history : []
          if (!cancelled) {
            setHistory(list)
            setFieldMeta(toFieldMeta(candidatePayload))
            if (typeof onHistoryLoaded === 'function') onHistoryLoaded(list, payload)
          }
        } catch (e) {
          console.error('Failed to fetch field history:', e)
          if (!cancelled) {
            setHistory([])
            setFieldMeta(createEmptyFieldMeta())
            if (typeof onHistoryLoaded === 'function') onHistoryLoaded([])
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      } else {
        setHistory([])
        setFieldMeta(createEmptyFieldMeta())
        if (typeof onHistoryLoaded === 'function') onHistoryLoaded([])
      }
    }

    fetchHistory()
    return () => { cancelled = true }
  }, [patientId, projectId, fieldPath, historyOptions, refreshKey, onHistoryLoaded, selectRefreshTick, toHistoryQueryPath])

  const extractSubFieldValues = useCallback((item) => {
    if (arrayIdx === null) return null
    const oldArr = Array.isArray(item.old_value) ? item.old_value : null
    const newArr = Array.isArray(item.new_value) ? item.new_value : null
    if (!oldArr && !newArr) return null
    if (subFieldPath) {
      const oldSub = oldArr?.[arrayIdx] != null ? getNestedValue(oldArr[arrayIdx], subFieldPath) : undefined
      const newSub = newArr?.[arrayIdx] != null ? getNestedValue(newArr[arrayIdx], subFieldPath) : undefined
      return { oldSub, newSub }
    }
    return { oldSub: oldArr?.[arrayIdx], newSub: newArr?.[arrayIdx] }
  }, [arrayIdx, subFieldPath])

  const formatValue = useCallback((val) => {
    if (val === null || val === undefined) return '—'
    let str
    if (typeof val === 'object') {
      try {
        str = JSON.stringify(val)
        if (str.length > 50) str = str.substring(0, 50) + '...'
      } catch {
        str = String(val)
      }
    } else {
      str = String(val)
      if (str.length > 50) str = str.substring(0, 50) + '...'
    }
    if (isSensitive && str && str !== '—') {
      return maskSensitiveField(str, fieldPath)
    }
    return str
  }, [fieldPath, isSensitive])

  const visibleHistory = useMemo(() => history.filter((item) => {
    if (arrayIdx === null) return true
    const sub = extractSubFieldValues(item)
    if (!sub) return true
    const canCompareSubField = sub.oldSub !== undefined || sub.newSub !== undefined
    if (!canCompareSubField) return true
    return formatValue(sub.oldSub) !== formatValue(sub.newSub)
  }), [arrayIdx, extractSubFieldValues, formatValue, history])

  const getCandidateDisplayValue = useCallback((candidate) => {
    const raw = candidate?.value
    if (raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'value')) {
      return raw.value
    }
    return raw
  }, [])

  const handleSelectCandidate = useCallback(async (candidateId) => {
    if (!candidateId || !fieldPath) return
    const queryPath = toHistoryQueryPath(fieldPath)
    setSelectingCandidateId(candidateId)
    const prevSelectedId = fieldMeta.selectedCandidateId
    setFieldMeta((meta) => ({ ...meta, selectedCandidateId: candidateId }))
    try {
      const selectedCandidate = (fieldMeta.candidates || []).find((item) => item?.id === candidateId)
      const selectedValue = getCandidateDisplayValue(selectedCandidate)
      if (projectId && patientId) {
        await selectProjectCrfFieldCandidate(projectId, patientId, queryPath, candidateId, selectedValue, historyOptions)
      } else if (patientId) {
        await selectEhrFieldCandidateV3(patientId, queryPath, candidateId, selectedValue, historyOptions)
      }
      if (typeof onCandidateApplied === 'function' && selectedCandidate) {
        onCandidateApplied(queryPath, selectedValue, rowUid, selectedCandidate)
      }
      message.success('已采用此值')
      setSelectRefreshTick((tick) => tick + 1)
    } catch (error) {
      setFieldMeta((meta) => ({ ...meta, selectedCandidateId: prevSelectedId }))
      const backendMsg = error?.response?.data?.message || error?.message
      message.error(`采用失败: ${backendMsg || '未知错误'}`)
    } finally {
      setSelectingCandidateId(null)
    }
  }, [
    fieldMeta.candidates,
    fieldMeta.selectedCandidateId,
    fieldPath,
    getCandidateDisplayValue,
    historyOptions,
    onCandidateApplied,
    patientId,
    projectId,
    rowUid,
    toHistoryQueryPath,
  ])

  return {
    extractSubFieldValues,
    fieldMeta,
    formatValue,
    getCandidateDisplayValue,
    handleSelectCandidate,
    loading,
    resolveCandidateSourceDocName,
    selectingCandidateId,
    visibleHistory,
  }
}
