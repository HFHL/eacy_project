import React from 'react'
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  FlagOutlined,
  ManOutlined,
  PauseCircleOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  TeamOutlined,
  UploadOutlined,
  UserOutlined,
  WomanOutlined,
} from '@ant-design/icons'
import { getCrfTemplateDeleteId, isCrfTemplateDeletable } from '../../utils/crfTemplateGuards'
import { PROJECT_STATUS_KEYS, getProjectStatusMeta as getProjectStatusDisplayMeta } from '../../constants/projectStatusMeta'
import { getFieldTypeLabel } from '../FormDesigner/utils/schemaHelpers'
import { normalizeOptions } from '../FormDesigner/utils/fieldContract'

export const CONTEXT_RAIL_WIDTH = 248
export const CONTEXT_RAIL_COLLAPSED_WIDTH = 56
export const RESEARCH_SPLITTER_STORAGE_KEY = 'research:rail:project-pane-height'
export const RESEARCH_SPLITTER_USER_ADJUSTED_STORAGE_KEY = 'research:rail:project-pane-height:user-adjusted'
export const RESEARCH_SPLITTER_HANDLE_HEIGHT = 10
export const RESEARCH_PANE_MIN_HEIGHT = 56
export const RESEARCH_PANE_DEFAULT_HEIGHT = 220
export const RESEARCH_PANE_STORED_MAX_HEIGHT = 2000
export const RESEARCH_RETURN_FROM_TEMPLATE_KEY = 'research:return-from-template-once'
export const RESEARCH_OPEN_TEMPLATE_META_KEY = 'research:open-template-meta'

export const searchIconMap = {
  admin: <SettingOutlined />,
  dashboard: <DashboardOutlined />,
  document: <FileTextOutlined />,
  patient: <TeamOutlined />,
  research: <ExperimentOutlined />,
  settings: <SettingOutlined />,
  upload: <UploadOutlined />,
  user: <UserOutlined />,
}

const projectStatusIconMap = {
  [PROJECT_STATUS_KEYS.planning]: <ClockCircleOutlined />,
  [PROJECT_STATUS_KEYS.active]: <CheckCircleOutlined />,
  [PROJECT_STATUS_KEYS.paused]: <PauseCircleOutlined />,
  [PROJECT_STATUS_KEYS.completed]: <FlagOutlined />,
}

export const clampNumber = (value, min, max) => {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export const getGenderMeta = (gender) => {
  const normalized = String(gender || '').trim()
  if (normalized === '男') return { label: '男', icon: <ManOutlined /> }
  if (normalized === '女') return { label: '女', icon: <WomanOutlined /> }
  return { label: normalized || '未知', icon: <QuestionCircleOutlined /> }
}

export const getProjectStatusMeta = (status) => {
  const displayMeta = getProjectStatusDisplayMeta(status)
  return {
    ...displayMeta,
    icon: projectStatusIconMap[displayMeta.key] || <QuestionCircleOutlined />,
  }
}

export const mapProjectRailItems = (items = [], keyword = '', sortMode = 'updated_desc') => {
  const normalizedKeyword = keyword.trim().toLowerCase()
  return items
    .map((item) => ({
      id: item.id,
      name: item.project_name || '未命名项目',
      status: item.status || '',
      statusLabel: item.status_label || '',
      statusColor: item.status_color || '',
      patientCount: Number(
        item.actual_patient_count
        ?? item.enrolled_patient_count
        ?? item.patient_count
        ?? item.extra_json?.actual_patient_count
        ?? item.extra_json?.patient_count
        ?? 0
      ),
      avgCompleteness: Number(item.avg_completeness || 0),
      updatedAt: item.updated_at || '',
    }))
    .filter((item) => {
      if (!normalizedKeyword) return true
      return item.name.toLowerCase().includes(normalizedKeyword)
    })
    .sort((left, right) => {
      if (sortMode === 'name_asc') {
        return left.name.localeCompare(right.name, 'zh-Hans-CN')
      }
      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    })
}

export const mapTemplateRailItems = (items = [], keyword = '', sortMode = 'updated_desc') => {
  const normalizedKeyword = keyword.trim().toLowerCase()
  return items
    .map((item) => {
      const backendId = getCrfTemplateDeleteId(item)
      const routeId = backendId || (item.template_code != null ? String(item.template_code) : '')
      return ({
        id: routeId,
        backendId: backendId || null,
        name: item.template_name || item.name || '未命名模板',
        category: item.category || '',
        source: item.source || 'database',
        isSystem: Boolean(item.is_system),
        deletable: isCrfTemplateDeletable(item) && Boolean(routeId),
        isPublished: typeof item.is_published === 'boolean' ? item.is_published : null,
        fieldGroupsCount: Array.isArray(item.field_groups)
          ? item.field_groups.length
          : (item.field_count != null ? Number(item.field_count) : null),
        updatedAt: item.updated_at || item.updatedAt || '',
      })
    })
    .filter((item) => item.id)
    .filter((item) => !normalizedKeyword || item.name.toLowerCase().includes(normalizedKeyword))
    .sort((left, right) => {
      if (sortMode === 'name_asc') {
        return left.name.localeCompare(right.name, 'zh-Hans-CN')
      }
      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    })
}

const orderedSchemaEntries = (properties = {}) => {
  const entries = Object.entries(properties || {})
  return entries.sort((left, right) => {
    const leftOrder = Number(left[1]?.['x-property-order'])
    const rightOrder = Number(right[1]?.['x-property-order'])
    if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder)) return leftOrder - rightOrder
    if (Number.isFinite(leftOrder)) return -1
    if (Number.isFinite(rightOrder)) return 1
    return 0
  })
}

const fieldDisplayName = (field = {}, fallback = '') => (
  field.displayName
  || field.title
  || field.label
  || field.name
  || field.key
  || field.fieldId
  || field.id
  || fallback
)

const fieldIdentifier = (field = {}, fallback = '') => (
  field.fieldId
  || field.key
  || field.name
  || field.id
  || fallback
)

const fieldTypeLabel = (field = {}) => {
  const displayType = field.displayType || field.type || field['x-display-type'] || ''
  if (displayType === 'table_single_row') return '单行表格'
  if (displayType === 'table_multi_row') return '多行表格'
  if (displayType === 'table' && (field.config?.tableRows === 'multiRow' || field.multiRow)) return '多行表格'
  if (displayType === 'table') return '单行表格'
  return getFieldTypeLabel(displayType) || displayType || '-'
}

const flattenDesignerFields = (fields = [], parentPath = '', depth = 0) => {
  if (!Array.isArray(fields)) return []
  return fields.flatMap((field, index) => {
    const key = fieldIdentifier(field, `field_${index + 1}`)
    const path = parentPath ? `${parentPath}.${key}` : key
    const row = {
      id: field.id || path,
      key,
      path,
      name: fieldDisplayName(field, key),
      typeLabel: fieldTypeLabel(field),
      dataType: field.dataType || field.type || '-',
      required: Boolean(field.required),
      sensitive: Boolean(field.sensitive),
      editable: field.editable !== false,
      options: normalizeOptions(field.options),
      description: field.description || field.helpText || field.prompt || '',
      depth,
    }
    const children = flattenDesignerFields(field.children || field.fields || [], path, depth + 1)
    return [row, ...children]
  })
}

const flattenSchemaFields = (properties = {}, parentPath = '', depth = 0) => {
  return orderedSchemaEntries(properties).flatMap(([key, schema]) => {
    const path = parentPath ? `${parentPath}.${key}` : key
    const nestedProperties = schema?.properties || schema?.items?.properties || null
    const row = {
      id: path,
      key,
      path,
      name: schema?.title || key,
      typeLabel: schema?.['x-display-type'] ? getFieldTypeLabel(schema['x-display-type']) : (schema?.type || '-'),
      dataType: schema?.type || '-',
      required: false,
      sensitive: Boolean(schema?.['x-sensitive']),
      editable: schema?.readOnly !== true,
      options: normalizeOptions(schema?.enum),
      description: schema?.description || '',
      depth,
    }
    const children = nestedProperties ? flattenSchemaFields(nestedProperties, path, depth + 1) : []
    return [row, ...children]
  })
}

export const buildTemplatePreviewModel = (template = {}) => {
  const designer = template.designer && typeof template.designer === 'object' ? template.designer : null
  const schema = template.schema_json || template.schema || {}
  const folders = Array.isArray(designer?.folders) ? designer.folders : []
  if (folders.length > 0) {
    const sections = folders.map((folder, folderIndex) => ({
      id: folder.id || `folder_${folderIndex + 1}`,
      title: folder.name || folder.title || `访视 ${folderIndex + 1}`,
      groups: (Array.isArray(folder.groups) ? folder.groups : []).map((group, groupIndex) => ({
        id: group.id || `group_${folderIndex + 1}_${groupIndex + 1}`,
        title: group.name || group.title || `字段组 ${groupIndex + 1}`,
        fields: flattenDesignerFields(group.fields || [], `${fieldIdentifier(folder, `folder_${folderIndex + 1}`)}.${fieldIdentifier(group, `group_${groupIndex + 1}`)}`),
      })),
    }))
    return {
      source: 'designer',
      sections,
      fieldCount: sections.reduce((sum, section) => sum + section.groups.reduce((groupSum, group) => groupSum + group.fields.length, 0), 0),
    }
  }

  const schemaProperties = schema?.properties || {}
  const fields = flattenSchemaFields(schemaProperties)
  return {
    source: 'schema',
    sections: [{
      id: 'schema',
      title: schema?.title || template.template_name || template.name || 'Schema 字段',
      groups: [{ id: 'schema_fields', title: '字段信息', fields }],
    }],
    fieldCount: fields.length,
  }
}
