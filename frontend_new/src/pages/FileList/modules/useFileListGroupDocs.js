import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getFileListV2GroupDocuments,
  searchUserFiles,
} from '../../../api/document'

export const useFileListGroupDocs = ({
  expandedGroups,
  setExpandedGroups,
  treeData,
  treeLoading,
  treeRefreshPromiseRef,
}) => {
  const [groupDocsMap, setGroupDocsMap] = useState({})
  const treeDataRef = useRef(treeData)

  useEffect(() => {
    treeDataRef.current = treeData
  }, [treeData])

  const loadGroupDocs = useCallback(async (groupId) => {
    if (!groupId) return

    if (treeRefreshPromiseRef.current) {
      try {
        await treeRefreshPromiseRef.current
      } catch {
        // noop
      }
    }
    if (treeLoading && !treeDataRef.current) return

    const currentTree = treeDataRef.current
    const validGroupIds = new Set(
      (Array.isArray(currentTree?.todo_groups) ? currentTree.todo_groups : [])
        .map((group) => group?.group_id)
        .filter(Boolean)
    )
    if (!validGroupIds.has(groupId)) {
      setExpandedGroups((prev) => prev.filter((key) => key !== `group:${groupId}`))
      setGroupDocsMap((prev) => ({
        ...prev,
        [groupId]: { loading: false, items: [], error: '分组不存在或已过期' },
      }))
      return
    }

    setGroupDocsMap((prev) => ({ ...prev, [groupId]: { ...(prev[groupId] || {}), loading: true } }))
    try {
      const res = await getFileListV2GroupDocuments(groupId, { page: 1, page_size: 100 })
      if (res?.success) {
        setGroupDocsMap((prev) => ({
          ...prev,
          [groupId]: { loading: false, items: res?.data?.items || [], matchInfo: res?.data?.match_info || null },
        }))
      } else {
        setGroupDocsMap((prev) => ({ ...prev, [groupId]: { loading: false, items: [], error: res?.message } }))
      }
    } catch (error) {
      setGroupDocsMap((prev) => ({ ...prev, [groupId]: { loading: false, items: [], error: error?.message } }))
    }
  }, [setExpandedGroups, treeLoading, treeRefreshPromiseRef])

  const loadArchivedPatientDocs = useCallback(async (patientId) => {
    if (!patientId) return
    setGroupDocsMap((prev) => ({ ...prev, [`patient:${patientId}`]: { loading: true } }))
    try {
      const res = await searchUserFiles({
        task_status: 'archived',
        patient_id: patientId,
        page: 1,
        page_size: 100,
      })
      if (res?.success) {
        setGroupDocsMap((prev) => ({
          ...prev,
          [`patient:${patientId}`]: { loading: false, items: res?.data?.items || [] },
        }))
      } else {
        setGroupDocsMap((prev) => ({ ...prev, [`patient:${patientId}`]: { loading: false, items: [] } }))
      }
    } catch {
      setGroupDocsMap((prev) => ({ ...prev, [`patient:${patientId}`]: { loading: false, items: [] } }))
    }
  }, [])

  useEffect(() => {
    if (!Array.isArray(expandedGroups) || expandedGroups.length === 0) return
    if (treeLoading || !treeData) return

    const todoGroupIds = new Set(
      (Array.isArray(treeData?.todo_groups) ? treeData.todo_groups : [])
        .map((group) => group?.group_id)
        .filter(Boolean)
    )
    const archivedPatientIds = new Set(
      (Array.isArray(treeData?.archived_patients) ? treeData.archived_patients : [])
        .map((patient) => patient?.patient_id)
        .filter(Boolean)
    )

    const invalidKeys = expandedGroups.filter((key) => {
      if (key.startsWith('group:')) return !todoGroupIds.has(key.slice('group:'.length))
      if (key.startsWith('patient:')) return !archivedPatientIds.has(key.slice('patient:'.length))
      return false
    })
    if (invalidKeys.length > 0) {
      setExpandedGroups((prev) => prev.filter((key) => !invalidKeys.includes(key)))
    }
  }, [expandedGroups, setExpandedGroups, treeData, treeLoading])

  return {
    groupDocsMap,
    loadArchivedPatientDocs,
    loadGroupDocs,
    setGroupDocsMap,
  }
}
