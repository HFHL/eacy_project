import { useCallback, useEffect, useRef } from 'react'
import {
  confirmGroupArchive,
  getFileListV2GroupDocuments,
  matchGroup,
} from '../../../api/document'
import { getPatientList } from '../../../api/patient'
import { mergePatientPrefills } from '../../../components/Patient/patientPrefill'
import { getGroupRecommendedPatient } from './formatters'

export const useFileListGroupActions = ({
  autoArchivingGroupIds,
  groupDocsMap,
  groupManualArchiveGroupId,
  groupManualArchiveVisible,
  message,
  refreshAll,
  selectedGroupPatient,
  setAutoArchivingGroupIds,
  setCreatePatientDocIds,
  setCreatePatientDrawerOpen,
  setCreatePatientGroupId,
  setCreatePatientMode,
  setCreatePatientPrefillValues,
  setGroupDocsMap,
  setGroupManualArchiveGroupId,
  setGroupManualArchiveVisible,
  setGroupPatientSearchLoading,
  setGroupPatientSearchResults,
  setGroupPatientSearchValue,
  setSelectedGroupPatient,
}) => {
  const groupSearchTimerRef = useRef(null)
  const groupSearchVersionRef = useRef(0)

  useEffect(() => () => {
    if (groupSearchTimerRef.current) clearTimeout(groupSearchTimerRef.current)
  }, [])

  const handleAutoArchiveGroup = useCallback(async (groupId) => {
    if (!groupId || autoArchivingGroupIds.has(groupId)) return
    setAutoArchivingGroupIds((prev) => new Set([...prev, groupId]))
    try {
      const cached = groupDocsMap[groupId]?.matchInfo
      let matchedPatientId = getGroupRecommendedPatient(cached).patientId
      if (!matchedPatientId) {
        const matchResponse = await matchGroup(groupId)
        matchedPatientId = getGroupRecommendedPatient(matchResponse?.data?.match_info || matchResponse?.data).patientId
      }
      if (!matchedPatientId) {
        message.warning('未找到推荐患者，请手动选择')
        return
      }

      const response = await confirmGroupArchive(groupId, matchedPatientId, true)
      if (response?.success) {
        message.success(`自动归档完成：成功 ${response.data?.archived_count || 0} 个文档`)
        setGroupDocsMap((prev) => {
          const next = { ...prev }
          delete next[groupId]
          return next
        })
        refreshAll({ forceTree: true })
      } else {
        message.error(response?.message || '自动归档失败')
      }
    } catch {
      message.error('自动归档失败')
    } finally {
      setAutoArchivingGroupIds((prev) => {
        const next = new Set(prev)
        next.delete(groupId)
        return next
      })
    }
  }, [autoArchivingGroupIds, groupDocsMap, message, refreshAll, setAutoArchivingGroupIds, setGroupDocsMap])

  const handleCreatePatientForGroup = useCallback(async (groupId) => {
    if (!groupId) return
    let items = groupDocsMap[groupId]?.items
    let groupPayload = groupDocsMap[groupId]
    if (!Array.isArray(items)) {
      try {
        const response = await getFileListV2GroupDocuments(groupId, { page: 1, page_size: 100 })
        items = response?.success ? response?.data?.items || [] : []
        groupPayload = response?.success ? response?.data : groupPayload
      } catch {
        items = []
      }
    }

    const groupDocuments = groupPayload?.group?.documents || []
    const prefillSources = items?.length ? items : groupDocuments
    setCreatePatientMode('group')
    setCreatePatientGroupId(groupId)
    setCreatePatientDocIds((items || []).map((item) => item.id).filter(Boolean))
    setCreatePatientPrefillValues(mergePatientPrefills(prefillSources))
    setCreatePatientDrawerOpen(true)
  }, [
    groupDocsMap,
    setCreatePatientDocIds,
    setCreatePatientDrawerOpen,
    setCreatePatientGroupId,
    setCreatePatientMode,
    setCreatePatientPrefillValues,
  ])

  const openManualArchiveForGroup = useCallback((groupId) => {
    if (!groupId) return
    setGroupManualArchiveGroupId(groupId)
    setSelectedGroupPatient(null)
    setGroupPatientSearchValue('')
    setGroupPatientSearchResults([])
    setGroupPatientSearchLoading(true)
    setGroupManualArchiveVisible(true)
  }, [
    setGroupManualArchiveGroupId,
    setGroupManualArchiveVisible,
    setGroupPatientSearchLoading,
    setGroupPatientSearchResults,
    setGroupPatientSearchValue,
    setSelectedGroupPatient,
  ])

  const handleGroupPatientSearch = useCallback((value) => {
    setGroupPatientSearchValue(value)
    setSelectedGroupPatient(null)
    if (groupSearchTimerRef.current) clearTimeout(groupSearchTimerRef.current)
    groupSearchVersionRef.current += 1
    const version = groupSearchVersionRef.current
    const trimmed = (value || '').trim()
    const debounceMs = trimmed.length < 1 ? 0 : 400
    groupSearchTimerRef.current = setTimeout(async () => {
      if (version !== groupSearchVersionRef.current) return
      setGroupPatientSearchLoading(true)
      try {
        const response = await getPatientList({ page: 1, page_size: 50, ...(trimmed ? { search: trimmed } : {}) })
        if (version !== groupSearchVersionRef.current) return
        setGroupPatientSearchResults(response?.success && response?.data ? response.data : [])
      } catch {
        if (version === groupSearchVersionRef.current) setGroupPatientSearchResults([])
      } finally {
        if (version === groupSearchVersionRef.current) setGroupPatientSearchLoading(false)
      }
    }, debounceMs)
  }, [
    setGroupPatientSearchLoading,
    setGroupPatientSearchResults,
    setGroupPatientSearchValue,
    setSelectedGroupPatient,
  ])

  useEffect(() => {
    if (!groupManualArchiveVisible) return
    if (groupSearchTimerRef.current) clearTimeout(groupSearchTimerRef.current)
    groupSearchVersionRef.current += 1
    const version = groupSearchVersionRef.current
    setGroupPatientSearchLoading(true)
    getPatientList({ page: 1, page_size: 50 })
      .then((response) => {
        if (version !== groupSearchVersionRef.current) return
        setGroupPatientSearchResults(response?.success && response?.data ? response.data : [])
      })
      .catch(() => {
        if (version === groupSearchVersionRef.current) setGroupPatientSearchResults([])
      })
      .finally(() => {
        if (version === groupSearchVersionRef.current) setGroupPatientSearchLoading(false)
      })
  }, [groupManualArchiveVisible, setGroupPatientSearchLoading, setGroupPatientSearchResults])

  const handleConfirmGroupManualArchive = useCallback(async () => {
    if (!groupManualArchiveGroupId || !selectedGroupPatient?.id) {
      message.warning('请先选择一个患者')
      return
    }
    try {
      const response = await confirmGroupArchive(groupManualArchiveGroupId, selectedGroupPatient.id)
      if (response?.success) {
        message.success(`归档完成: 成功 ${response.data?.archived_count || 0} 个文档`)
        setGroupManualArchiveVisible(false)
        refreshAll({ forceTree: true })
      } else {
        message.error(response?.message || '归档失败')
      }
    } catch {
      message.error('按组归档失败')
    }
  }, [groupManualArchiveGroupId, message, refreshAll, selectedGroupPatient, setGroupManualArchiveVisible])

  return {
    handleAutoArchiveGroup,
    handleConfirmGroupManualArchive,
    handleCreatePatientForGroup,
    handleGroupPatientSearch,
    openManualArchiveForGroup,
  }
}
