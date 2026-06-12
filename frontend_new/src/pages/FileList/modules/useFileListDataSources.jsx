import { useEffect, useMemo } from 'react'
import {
  FILE_TYPE_CATEGORIES,
  PARSE_STAGE_TASK_STATUSES,
  STATUS_INFO_OPTIONS,
  STATUS_OPTIONS,
  TODO_STAGE_TASK_STATUSES,
  VIRTUAL_PENDING_PARSE_GROUP_KEY,
} from './constants'
import { mapTaskStatusToStage } from './routeState'
import {
  applyColumnFiltersToItems,
  buildAvailableFileTypeCategories,
  getDocumentTypeValue,
  getFiltersWithoutKey,
  getStatusInfoValues,
} from './filterUtils'
import {
  buildTodoDocumentStatusMap,
  buildTreeTableRows,
  getPendingParseBadge,
  normalizeTreeFileList,
} from './fileListDataBuilders'

const buildPatientRightPaneDataSource = ({
  activeGroupKey,
  columnFilters,
  fileList,
  groupDocsMap,
  isFilterActive,
  normalizedTreeFileList,
  pendingParseFiles,
  treeData,
}) => {
  if (!activeGroupKey) return []
  if (activeGroupKey === VIRTUAL_PENDING_PARSE_GROUP_KEY) return pendingParseFiles

  if (activeGroupKey.startsWith('group:')) {
    const groupId = activeGroupKey.slice('group:'.length)
    if (!groupId) return []
    if (isFilterActive) {
      const todoGroups = Array.isArray(treeData?.todo_groups) ? treeData.todo_groups : []
      const targetGroup = todoGroups.find((item) => item?.group_id === groupId)
      const groupDocumentIds = new Set(Array.isArray(targetGroup?.document_ids) ? targetGroup.document_ids : [])
      return normalizedTreeFileList
        .filter((item) => TODO_STAGE_TASK_STATUSES.includes(item.task_status) && groupDocumentIds.has(item.id))
        .map((item) => ({ ...item, _isFile: true, _groupId: groupId, key: item.id }))
    }
    const cachedItems = groupDocsMap[groupId]?.items
    if (!Array.isArray(cachedItems)) return []
    return applyColumnFiltersToItems(cachedItems, columnFilters)
      .map((item) => ({ ...item, _isFile: true, _groupId: groupId, key: item.id }))
  }

  if (activeGroupKey.startsWith('patient:')) {
    const patientId = activeGroupKey.slice('patient:'.length)
    if (!patientId) return []
    if (isFilterActive) {
      return fileList
        .filter((item) => item?.patient_info?.patient_id === patientId && item.task_status === 'archived')
        .map((item) => ({ ...item, _isFile: true, _patientId: patientId, key: item.id }))
    }
    const cachedItems = groupDocsMap[`patient:${patientId}`]?.items
    if (!Array.isArray(cachedItems)) return []
    return applyColumnFiltersToItems(cachedItems, columnFilters)
      .map((item) => ({ ...item, _isFile: true, _patientId: patientId, key: item.id }))
  }

  return []
}

const buildFileRecordMap = ({ displayDataSource, fileList, treeTableData }) => {
  const map = new Map()
  const mergeRecord = (item) => {
    if (item?.id == null) return
    const existing = map.get(item.id)
    if (!existing) {
      map.set(item.id, item)
      return
    }
    map.set(item.id, {
      ...existing,
      ...item,
      _groupId: item._groupId || existing._groupId,
      _patientId: item._patientId || existing._patientId,
    })
  }
  displayDataSource.forEach(mergeRecord)
  treeTableData.forEach((item) => {
    if (item?._isFile) mergeRecord(item)
  })
  fileList.forEach(mergeRecord)
  return map
}

export const useFileListDataSources = ({
  activeGroupKey,
  activeTab,
  columnFilters,
  expandedGroups,
  fileList,
  groupDocsMap,
  loadArchivedPatientDocs,
  loadGroupDocs,
  pagination,
  setActiveGroupKey,
  setPagination,
  setSelectedRowKeys,
  token,
  treeData,
  viewMode,
}) => {
  const statusOptionsForTab = useMemo(() => {
    if (activeTab === 'archived') return STATUS_OPTIONS.filter((opt) => opt.value === 'archived')
    if (activeTab === 'todo') return STATUS_OPTIONS.filter((opt) => opt.value === 'pending_archive')
    if (activeTab === 'parse') {
      const allowed = new Set(['processing', 'error'])
      return STATUS_OPTIONS.filter((opt) => allowed.has(opt.value))
    }
    return STATUS_OPTIONS
  }, [activeTab])

  const isFilterActive = useMemo(
    () =>
      columnFilters.fileType.length > 0 ||
      columnFilters.taskStatus.length > 0 ||
      columnFilters.statusInfo.length > 0 ||
      !!columnFilters.dateRange ||
      !!columnFilters.fileName,
    [columnFilters]
  )

  const availableFileTypeCategories = useMemo(() => {
    const items = applyColumnFiltersToItems(fileList, getFiltersWithoutKey(columnFilters, 'fileType'))
    const availableValues = new Set([
      ...columnFilters.fileType,
      ...items.map((item) => getDocumentTypeValue(item)),
    ])
    return buildAvailableFileTypeCategories(FILE_TYPE_CATEGORIES, Array.from(availableValues))
  }, [columnFilters, fileList])

  const availableTaskStatusOptions = useMemo(() => {
    const items = applyColumnFiltersToItems(fileList, getFiltersWithoutKey(columnFilters, 'taskStatus'))
    const availableStages = new Set([
      ...columnFilters.taskStatus,
      ...items.map((item) => mapTaskStatusToStage(item.task_status)).filter(Boolean),
    ])
    return statusOptionsForTab.filter((opt) => availableStages.has(opt.value))
  }, [columnFilters, fileList, statusOptionsForTab])

  const availableStatusInfoOptions = useMemo(() => {
    const items = applyColumnFiltersToItems(fileList, getFiltersWithoutKey(columnFilters, 'statusInfo'))
    const availableValues = new Set(columnFilters.statusInfo)
    items.forEach((item) => {
      getStatusInfoValues(item).forEach((value) => availableValues.add(value))
    })
    return STATUS_INFO_OPTIONS.filter((opt) => availableValues.has(opt.value))
  }, [columnFilters, fileList])

  const todoDocumentStatusMap = useMemo(() => buildTodoDocumentStatusMap(treeData), [treeData])
  const groupedTodoDocumentIds = useMemo(
    () => new Set(
      Array.from(todoDocumentStatusMap.entries())
        .filter(([, status]) => TODO_STAGE_TASK_STATUSES.includes(status))
        .map(([id]) => id)
    ),
    [todoDocumentStatusMap]
  )
  const normalizedTreeFileList = useMemo(
    () => normalizeTreeFileList(fileList, todoDocumentStatusMap),
    [fileList, todoDocumentStatusMap]
  )

  const treeTableData = useMemo(() => buildTreeTableRows({
    activeTab,
    columnFilters,
    expandedGroups,
    fileList,
    groupDocsMap,
    isFilterActive,
    normalizedTreeFileList,
    token,
    treeData,
  }), [activeTab, columnFilters, expandedGroups, fileList, groupDocsMap, isFilterActive, normalizedTreeFileList, token, treeData])

  const pendingParseFiles = useMemo(
    () => normalizedTreeFileList
      .filter((item) => PARSE_STAGE_TASK_STATUSES.includes(item.task_status) && !groupedTodoDocumentIds.has(item.id))
      .map((item) => ({ ...item, _isFile: true, key: item.id, _groupType: 'pending_parse' })),
    [groupedTodoDocumentIds, normalizedTreeFileList]
  )

  const patientGroupList = useMemo(() => {
    const groups = treeTableData.filter((item) => item?._isGroup)
    if (!pendingParseFiles.length) return groups
    const pendingParseGroup = {
      key: VIRTUAL_PENDING_PARSE_GROUP_KEY,
      _isGroup: true,
      _groupType: 'pending_parse',
      _label: '待分组文件',
      _count: pendingParseFiles.length,
      _badge: getPendingParseBadge(token),
      _loading: false,
      _statusSet: PARSE_STAGE_TASK_STATUSES,
    }
    if (activeTab === 'parse') return [pendingParseGroup]
    return [pendingParseGroup, ...groups]
  }, [activeTab, pendingParseFiles, token, treeTableData])

  useEffect(() => {
    if (viewMode !== 'patient') {
      setActiveGroupKey(null)
      return
    }
    if (!patientGroupList.length) {
      if (activeGroupKey) setActiveGroupKey(null)
      return
    }
    if (!patientGroupList.some((item) => item.key === activeGroupKey)) {
      setActiveGroupKey(patientGroupList[0].key)
    }
  }, [activeGroupKey, patientGroupList, setActiveGroupKey, viewMode])

  useEffect(() => {
    if (viewMode !== 'patient' || !activeGroupKey) return
    if (activeGroupKey.startsWith('group:')) {
      const groupId = activeGroupKey.slice('group:'.length)
      if (!groupId) return
      const cached = groupDocsMap[groupId]
      if (!cached || (!cached.loading && !Array.isArray(cached.items))) loadGroupDocs(groupId)
      return
    }
    if (activeGroupKey.startsWith('patient:')) {
      const patientId = activeGroupKey.slice('patient:'.length)
      if (!patientId) return
      const cached = groupDocsMap[`patient:${patientId}`]
      if (!cached || (!cached.loading && !Array.isArray(cached.items))) loadArchivedPatientDocs(patientId)
    }
  }, [activeGroupKey, groupDocsMap, loadArchivedPatientDocs, loadGroupDocs, viewMode])

  const patientRightPaneDataSource = useMemo(() => buildPatientRightPaneDataSource({
    activeGroupKey,
    columnFilters,
    fileList,
    groupDocsMap,
    isFilterActive,
    normalizedTreeFileList,
    pendingParseFiles,
    treeData,
  }), [activeGroupKey, columnFilters, fileList, groupDocsMap, isFilterActive, normalizedTreeFileList, pendingParseFiles, treeData])

  const displayDataSource = useMemo(() => {
    if (viewMode === 'patient') return patientRightPaneDataSource
    return fileList.map((item) => ({ ...item, _isFile: true, key: item.id }))
  }, [fileList, patientRightPaneDataSource, viewMode])

  const fileRecordMap = useMemo(
    () => buildFileRecordMap({ displayDataSource, fileList, treeTableData }),
    [displayDataSource, fileList, treeTableData]
  )

  const tablePagination = useMemo(() => {
    if (viewMode !== 'table' && activeTab !== 'parse' && !isFilterActive) return false
    return {
      current: pagination.current,
      pageSize: pagination.pageSize,
      total: pagination.total,
      showSizeChanger: true,
      showQuickJumper: viewMode === 'table' && pagination.total > pagination.pageSize,
      showTotal: (total) => `共 ${total} 项`,
      onChange: (page, pageSize) => {
        setPagination((prev) => ({ ...prev, current: page, pageSize }))
        setSelectedRowKeys([])
      },
    }
  }, [activeTab, isFilterActive, pagination.current, pagination.pageSize, pagination.total, setPagination, setSelectedRowKeys, viewMode])

  const tabCounts = useMemo(() => {
    const counts = treeData?.counts || {}
    return {
      all: treeData?.total || 0,
      parse: counts.parse_total || 0,
      todo: counts.todo_total || 0,
      archived: counts.archived_total || 0,
    }
  }, [treeData])

  return {
    availableFileTypeCategories,
    availableStatusInfoOptions,
    availableTaskStatusOptions,
    displayDataSource,
    fileRecordMap,
    isFilterActive,
    patientGroupList,
    tablePagination,
    tabCounts,
    treeTableData,
  }
}
