import React from 'react'
import {
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  FolderOpenOutlined,
  QuestionCircleOutlined,
  UserAddOutlined,
  WarningFilled,
} from '@ant-design/icons'
import { maskName } from '../../../utils/sensitiveUtils'
import {
  PARSE_STAGE_TASK_STATUSES,
  TODO_STAGE_TASK_STATUSES,
  VIRTUAL_PENDING_PARSE_GROUP_KEY,
} from './constants'
import { mapTaskStatusToStage } from './routeState'
import { applyColumnFiltersToItems } from './filterUtils'

const TODO_STATUSES = new Set(TODO_STAGE_TASK_STATUSES)
const PARSE_STATUSES = new Set(PARSE_STAGE_TASK_STATUSES)
const FILTER_PARSE_STATUSES = new Set(['uploaded', 'parsing', 'parse_failed', 'extracted', 'parsed', 'ai_matching'])

export const formatGroupLabel = (label) => {
  const name = label?.name ? String(label.name).trim() : ''
  const gender = label?.gender || '--'
  const ageRaw = label?.age
  const age = ageRaw != null && String(ageRaw).trim() && String(ageRaw).trim() !== '--'
    ? (String(ageRaw).endsWith('岁') ? String(ageRaw) : `${ageRaw}岁`)
    : '--'
  const maskedName = name ? maskName(name) : ''
  return maskedName ? `${maskedName} · ${gender} · ${age}` : '未知患者'
}

export const getGroupBadge = (group, token) => {
  if (group?.is_failed) {
    return { icon: <WarningFilled style={{ fontSize: 14, color: token.colorError }} />, tip: '分组失败' }
  }
  const set = Array.isArray(group?.status_set) ? group.status_set : []
  if (set.includes('auto_archived')) {
    return { icon: <CheckCircleFilled style={{ fontSize: 14, color: token.colorSuccess }} />, tip: '优选' }
  }
  if (set.includes('pending_confirm_review')) {
    return { icon: <ClockCircleFilled style={{ fontSize: 14, color: token.colorWarning }} />, tip: '候选' }
  }
  if (set.includes('pending_confirm_uncertain')) {
    return { icon: <ExclamationCircleFilled style={{ fontSize: 14, color: token.colorWarning }} />, tip: '信息不足' }
  }
  if (set.includes('pending_confirm_new')) {
    return { icon: <UserAddOutlined style={{ fontSize: 14, color: token.colorPrimary }} />, tip: '新建' }
  }
  return { icon: <QuestionCircleOutlined style={{ fontSize: 14, color: token.colorTextSecondary }} />, tip: '待确认' }
}

export const getArchivedBadge = (isPatientDeleted, token) => (
  isPatientDeleted
    ? { icon: <CloseCircleFilled style={{ fontSize: 14, color: token.colorError }} />, tip: '患者已删除' }
    : { icon: <CheckCircleFilled style={{ fontSize: 14, color: token.colorSuccess }} />, tip: '已归档' }
)

export const getPendingParseBadge = (token) => ({
  icon: <FolderOpenOutlined style={{ fontSize: 14, color: token.colorPrimary }} />,
  tip: '解析阶段文件暂存容器',
})

export const buildTodoDocumentStatusMap = (treeData) => {
  const map = new Map()
  const todoGroups = Array.isArray(treeData?.todo_groups) ? treeData.todo_groups : []
  todoGroups.forEach((group) => {
    const groupStatus = Array.isArray(group?.status_set) && group.status_set.length
      ? group.status_set[0]
      : 'pending_confirm_uncertain'
    if (Array.isArray(group?.document_ids)) {
      group.document_ids.forEach((id) => map.set(id, groupStatus))
    }
  })
  return map
}

export const normalizeTreeFileList = (fileList, todoDocumentStatusMap) =>
  fileList.map((item) => {
    const treeStatus = todoDocumentStatusMap.get(item.id)
    return treeStatus ? { ...item, task_status: treeStatus, taskStatus: treeStatus } : item
  })

export const buildFilteredTreeTableRows = ({
  activeTab,
  expandedGroups,
  fileList,
  groupDocsMap,
  normalizedTreeFileList,
  token,
  treeData,
}) => {
  const rows = []
  const addedIds = new Set()

  if (activeTab === 'all' || activeTab === 'archived') {
    const patientMap = new Map()
    fileList.forEach((item) => {
      const pid = item.patient_info?.patient_id
      if (!pid || (activeTab === 'all' && item.task_status !== 'archived')) return
      if (!patientMap.has(pid)) patientMap.set(pid, { pid, info: item.patient_info, items: [] })
      patientMap.get(pid).items.push(item)
      addedIds.add(item.id)
    })
    patientMap.forEach((group, pid) => {
      const key = `patient:${pid}`
      rows.push({
        key,
        _isGroup: true,
        _groupType: 'archived',
        _patientId: pid,
        _patientDeleted: false,
        _label: formatGroupLabel(group.info),
        _count: group.items.length,
        _badge: getArchivedBadge(false, token),
        _loading: false,
      })
      if (expandedGroups.includes(key)) {
        group.items.forEach((item) => rows.push({ ...item, _isFile: true, _patientId: pid, key: item.id, _indent: 1 }))
      }
    })
  }

  if (activeTab === 'all' || activeTab === 'todo') {
    const seen = new Set()
    for (const group of treeData?.todo_groups || []) {
      if (!group?.group_id || seen.has(group.group_id)) continue
      seen.add(group.group_id)
      const groupDocumentIds = new Set(Array.isArray(group.document_ids) ? group.document_ids : [])
      const groupStatus = Array.isArray(group.status_set) && group.status_set.length
        ? group.status_set[0]
        : 'pending_confirm_uncertain'
      const matchedItems = normalizedTreeFileList
        .filter((item) => !addedIds.has(item.id) && groupDocumentIds.has(item.id))
        .map((item) => ({ ...item, task_status: TODO_STATUSES.has(item.task_status) ? item.task_status : groupStatus }))
      if (!matchedItems.length) continue

      const key = `group:${group.group_id}`
      rows.push({
        key,
        _isGroup: true,
        _groupType: 'todo',
        _groupId: group.group_id,
        _label: formatGroupLabel(group.label),
        _count: matchedItems.length,
        _badge: getGroupBadge(group, token),
        _loading: false,
        _matchInfo: groupDocsMap[group.group_id]?.matchInfo,
        _statusSet: Array.from(new Set(matchedItems.map((item) => item.task_status).filter(Boolean))),
      })
      matchedItems.forEach((item) => addedIds.add(item.id))
      if (expandedGroups.includes(key)) {
        matchedItems.forEach((item) => rows.push({ ...item, _isFile: true, _groupId: group.group_id, key: item.id, _indent: 1 }))
      }
    }
    normalizedTreeFileList.forEach((item) => {
      if (!addedIds.has(item.id) && TODO_STATUSES.has(item.task_status)) {
        rows.push({ ...item, _isFile: true, key: item.id })
      }
    })
  }

  if (activeTab === 'parse') {
    fileList.forEach((item) => rows.push({ ...item, _isFile: true, key: item.id }))
  }
  if (activeTab === 'all') {
    fileList.forEach((item) => {
      if (!addedIds.has(item.id) && FILTER_PARSE_STATUSES.has(item.task_status)) {
        rows.push({ ...item, _isFile: true, key: item.id })
      }
    })
  }
  return rows
}

export const buildTreeTableRows = ({
  activeTab,
  columnFilters,
  expandedGroups,
  fileList,
  groupDocsMap,
  isFilterActive,
  normalizedTreeFileList,
  token,
  treeData,
}) => {
  if (isFilterActive) {
    return buildFilteredTreeTableRows({
      activeTab,
      expandedGroups,
      fileList,
      groupDocsMap,
      normalizedTreeFileList,
      token,
      treeData,
    })
  }

  const todoGroups = treeData?.todo_groups || []
  const archivedPatients = treeData?.archived_patients || []
  const rows = []
  const selectedStatuses = columnFilters.taskStatus || []
  const hasStatusFilter = selectedStatuses.length > 0

  if (activeTab === 'all' || activeTab === 'todo') {
    const seen = new Set()
    for (const group of todoGroups) {
      if (!group?.group_id || seen.has(group.group_id)) continue
      seen.add(group.group_id)
      const statusSet = Array.isArray(group?.status_set) ? group.status_set : []
      if (hasStatusFilter && !statusSet.some((status) => selectedStatuses.includes(mapTaskStatusToStage(status)))) continue
      const key = `group:${group.group_id}`
      const cached = groupDocsMap[group.group_id]
      rows.push({
        key,
        _isGroup: true,
        _groupType: 'todo',
        _groupId: group.group_id,
        _label: formatGroupLabel(group.label),
        _count: group.count || 0,
        _badge: getGroupBadge(group, token),
        _loading: cached?.loading,
        _matchInfo: cached?.matchInfo,
        _statusSet: statusSet,
      })
      if (expandedGroups.includes(key) && cached?.items) {
        applyColumnFiltersToItems(cached.items, columnFilters)
          .forEach((item) => rows.push({ ...item, _isFile: true, _groupId: group.group_id, key: item.id, _indent: 1 }))
      }
    }
  }

  if (activeTab === 'all' || activeTab === 'archived') {
    const seen = new Set()
    for (const patient of archivedPatients) {
      if (!patient?.patient_id || seen.has(patient.patient_id)) continue
      if (hasStatusFilter && !selectedStatuses.includes('archived')) continue
      seen.add(patient.patient_id)
      const key = `patient:${patient.patient_id}`
      const cached = groupDocsMap[key]
      const isPatientDeleted = patient.patient_status === 'inactive'
      rows.push({
        key,
        _isGroup: true,
        _groupType: 'archived',
        _patientId: patient.patient_id,
        _patientDeleted: isPatientDeleted,
        _label: formatGroupLabel(patient.label),
        _count: patient.count || 0,
        _badge: getArchivedBadge(isPatientDeleted, token),
        _loading: cached?.loading,
      })
      if (expandedGroups.includes(key) && cached?.items) {
        applyColumnFiltersToItems(cached.items, columnFilters)
          .forEach((item) => rows.push({ ...item, _isFile: true, _patientId: patient.patient_id, key: item.id, _indent: 1 }))
      }
    }
  }

  if (activeTab === 'parse') {
    fileList.forEach((item) => rows.push({ ...item, _isFile: true, key: item.id }))
  }
  if (activeTab === 'all') {
    const groupedFileIds = new Set(rows.filter((row) => row._isFile).map((row) => row.key))
    todoGroups.forEach((group) => {
      if (Array.isArray(group?.document_ids)) group.document_ids.forEach((id) => groupedFileIds.add(id))
    })
    normalizedTreeFileList.forEach((item) => {
      if (!groupedFileIds.has(item.id) && PARSE_STATUSES.has(item.task_status)) {
        rows.push({ ...item, _isFile: true, key: item.id })
      }
    })
  }
  return rows
}
