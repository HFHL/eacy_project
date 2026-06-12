import { useCallback, useRef, useState } from 'react'
import {
  getFileListV2Tree,
  searchUserFiles,
} from '../../../api/document'

const filterStatusInfoItems = (items, statusInfoFilters) => (
  items.filter((item) => {
    const taskStatus = item.task_status
    if (statusInfoFilters.includes('parse_failed') && taskStatus === 'parse_failed') return true
    if (statusInfoFilters.includes('bound') && !!item.patient_info?.patient_id) return true
    if (statusInfoFilters.includes('archived') && taskStatus === 'archived' && !item.patient_info?.patient_id) return true
    if (
      statusInfoFilters.includes('has_recommendation')
      && ['pending_confirm_review', 'pending_confirm_uncertain', 'auto_archived'].includes(taskStatus)
    ) return true
    if (statusInfoFilters.includes('pending_new') && taskStatus === 'pending_confirm_new') return true
    if (statusInfoFilters.includes('parsing') && taskStatus === 'parsing') return true
    if (statusInfoFilters.includes('matching') && taskStatus === 'ai_matching') return true
    if (statusInfoFilters.includes('waiting_match') && (taskStatus === 'extracted' || taskStatus === 'parsed')) {
      return true
    }
    if (statusInfoFilters.includes('uploading') && taskStatus === 'uploading') return true
    return false
  })
)

export const useFileListRemoteData = ({
  activeTab,
  columnFilters,
  message,
  setExpandedGroups,
  sorter,
}) => {
  const [treeData, setTreeData] = useState(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const hasLoadedTreeRef = useRef(false)

  const [fileList, setFileList] = useState([])
  const [fileListLoading, setFileListLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 })

  const [startingParseIds, setStartingParseIds] = useState(new Set())
  const [pollingParseIds, setPollingParseIds] = useState(new Set())
  const [matchingDocIds, setMatchingDocIds] = useState(new Set())
  const [matchTaskMap, setMatchTaskMap] = useState(new Map())
  const [pollingAiMatchIds, setPollingAiMatchIds] = useState(new Set())
  const fileListVersionRef = useRef(0)
  const fetchRequestIdRef = useRef(0)

  const fetchFileList = useCallback(async () => {
    const requestId = ++fetchRequestIdRef.current
    setFileListLoading(true)
    try {
      const params = {
        page: pagination.current,
        page_size: pagination.pageSize,
        order_by: sorter.field || 'created_at',
        order_direction: sorter.order === 'ascend' ? 'asc' : 'desc',
      }
      if (columnFilters.fileName) params.keyword = columnFilters.fileName
      if (activeTab && activeTab !== 'all') params.tab = activeTab
      if (columnFilters.taskStatus.length > 0) params.task_stage = columnFilters.taskStatus.join(',')
      if (columnFilters.fileType.length > 0) params.document_types = columnFilters.fileType.join(',')
      if (columnFilters.dateRange && columnFilters.dateRange.length === 2) {
        params.date_from = columnFilters.dateRange[0].format('YYYY-MM-DD')
        params.date_to = columnFilters.dateRange[1].format('YYYY-MM-DD')
      }

      const response = await searchUserFiles(params)
      if (requestId !== fetchRequestIdRef.current) return
      if (response.success && response.data) {
        const statusInfoFilters = columnFilters.statusInfo
        const items = statusInfoFilters.length
          ? filterStatusInfoItems(response.data.items || [], statusInfoFilters)
          : response.data.items || []

        fileListVersionRef.current += 1
        setFileList(items)

        const parsingIds = items
          .filter((item) => ['uploaded', 'parsing'].includes(item.task_status))
          .map((item) => item.id)
        if (parsingIds.length) {
          setPollingParseIds((prev) => {
            const next = new Set(prev)
            parsingIds.forEach((id) => next.add(id))
            return next
          })
        }

        const aiMatchingIds = items.filter((item) => item.task_status === 'ai_matching').map((item) => item.id)
        if (aiMatchingIds.length) {
          setMatchingDocIds((prev) => {
            const next = new Set(prev)
            aiMatchingIds.forEach((id) => next.add(id))
            return next
          })
          setPollingAiMatchIds((prev) => {
            const next = new Set(prev)
            aiMatchingIds.forEach((id) => next.add(id))
            return next
          })
        }

        setPagination((prev) => ({
          ...prev,
          total: statusInfoFilters.length ? items.length : (response.data.total || 0),
        }))
      }
    } catch (error) {
      if (requestId !== fetchRequestIdRef.current) return
      console.error('获取文件列表失败:', error)
      message.error('获取文件列表失败')
    } finally {
      if (requestId === fetchRequestIdRef.current) setFileListLoading(false)
    }
  }, [activeTab, columnFilters, message, pagination.current, pagination.pageSize, sorter])

  const fetchTree = useCallback(async (options = {}) => {
    const { force = false } = options
    setTreeLoading(true)
    try {
      const res = await getFileListV2Tree(force ? { refresh: true } : {})
      if (res?.success) {
        const data = res.data
        hasLoadedTreeRef.current = true
        setTreeData(data)

        if (force && data) {
          const validKeys = new Set()
          const todoGroups = Array.isArray(data.todo_groups) ? data.todo_groups : []
          const archivedPatients = Array.isArray(data.archived_patients) ? data.archived_patients : []
          todoGroups.forEach((group) => {
            if (group?.group_id) validKeys.add(`group:${group.group_id}`)
          })
          archivedPatients.forEach((patient) => {
            if (patient?.patient_id) validKeys.add(`patient:${patient.patient_id}`)
          })
          setExpandedGroups((prev) => prev.filter((key) => validKeys.has(key)))
        }
        return data
      }
      setTreeData(null)
      return null
    } catch {
      setTreeData(null)
      return null
    } finally {
      setTreeLoading(false)
    }
  }, [setExpandedGroups])

  return {
    fetchFileList,
    fetchRequestIdRef,
    fetchTree,
    fileList,
    fileListLoading,
    fileListVersionRef,
    hasLoadedTreeRef,
    matchTaskMap,
    matchingDocIds,
    pagination,
    pollingAiMatchIds,
    pollingParseIds,
    setFileList,
    setMatchTaskMap,
    setMatchingDocIds,
    setPagination,
    setPollingAiMatchIds,
    setPollingParseIds,
    setStartingParseIds,
    startingParseIds,
    treeData,
    treeLoading,
  }
}
