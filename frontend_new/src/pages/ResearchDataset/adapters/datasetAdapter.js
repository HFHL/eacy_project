/**
 * @file 项目详情页 V2 数据适配器。
 */

import { normalizeTemplateFieldGroups, normalizeTemplateFieldMapping } from '../config/datasetContract'

const normalizeSourceList = (value) => {
  if (value == null) return []
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? '').trim()).filter(Boolean)
}

const collectLeafFieldPaths = (schemaNode, path = []) => {
  if (!schemaNode || typeof schemaNode !== 'object') return []
  const target = schemaNode.type === 'array' && schemaNode.items && typeof schemaNode.items === 'object'
    ? schemaNode.items
    : schemaNode
  const props = target.properties
  if (!props || typeof props !== 'object' || Array.isArray(props)) {
    return path.length > 0 ? [path.join('/')] : []
  }
  return Object.entries(props).flatMap(([key, child]) => collectLeafFieldPaths(child, [...path, key]))
}

export const deriveTemplateFieldGroupsFromSchema = (schema) => {
  const rootProps = schema?.properties
  if (!rootProps || typeof rootProps !== 'object' || Array.isArray(rootProps)) return []
  const groups = []
  Object.entries(rootProps).forEach(([folderKey, folderSchema], folderIndex) => {
    if (!folderSchema || typeof folderSchema !== 'object' || Array.isArray(folderSchema)) return
    const childProps = folderSchema.properties
    if (childProps && typeof childProps === 'object' && !Array.isArray(childProps)) {
      Object.entries(childProps).forEach(([groupKey, groupSchema], groupIndex) => {
        if (!groupSchema || typeof groupSchema !== 'object' || Array.isArray(groupSchema)) return
        const groupTitle = groupSchema.title || groupKey
        groups.push({
          group_id: `${folderKey}/${groupKey}`,
          group_name: `${folderSchema.title || folderKey} / ${groupTitle}`,
          db_fields: collectLeafFieldPaths(groupSchema, [folderKey, groupKey]),
          is_repeatable: groupSchema.type === 'array',
          order: folderIndex * 1000 + groupIndex,
          sources: groupSchema['x-sources'] || folderSchema['x-sources'] || { primary: [], secondary: [] },
        })
      })
      return
    }
    groups.push({
      group_id: folderKey,
      group_name: folderSchema.title || folderKey,
      db_fields: collectLeafFieldPaths(folderSchema, [folderKey]),
      is_repeatable: folderSchema.type === 'array',
      order: folderIndex,
      sources: folderSchema['x-sources'] || { primary: [], secondary: [] },
    })
  })
  return groups.map((group) => ({
    ...group,
    sources: {
      primary: normalizeSourceList(group.sources?.primary),
      secondary: normalizeSourceList(group.sources?.secondary),
    },
  }))
}

/**
 * 判断字段值是否已填写。
 *
 * @param {any} value 字段值。
 * @returns {boolean}
 */
const hasFieldValue = (value) => {
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined && value !== ''
}

/**
 * 计算字段组完整度。
 *
 * @param {Record<string, any>} groups 分组字典。
 * @param {string} groupId 分组 ID。
 * @returns {{percent:number,filled:number,total:number}}
 */
const calcGroupStats = (groups, groupId) => {
  const group = groups?.[groupId]
  if (!group || !group.fields || typeof group.fields !== 'object') {
    if (group && typeof group.filled_count === 'number' && typeof group.total_count === 'number') {
      const totalCount = group.total_count
      const filledCount = group.filled_count
      const percent = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : (group.completeness ?? 0)
      return { percent, filled: filledCount, total: totalCount }
    }
    return { percent: 0, filled: 0, total: 0 }
  }
  const fields = Object.values(group.fields)
  const filledCount = fields.filter((item) => hasFieldValue(item?.value)).length
  const totalCount = fields.length
  const percent = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0
  return { percent, filled: filledCount, total: totalCount }
}

const buildCrfGroupsFromSummaryForAdapter = (groupStats = {}) => {
  const groups = {}
  Object.entries(groupStats || {}).forEach(([groupId, stats]) => {
    if (!stats || typeof stats !== 'object') return
    groups[groupId] = {
      group_id: groupId,
      group_name: stats.group_name || groupId,
      completeness: Number(stats.percent) || 0,
      filled_count: Number(stats.filled) || 0,
      total_count: Number(stats.total) || 0,
      fields: {},
      records: [],
      is_repeatable: false,
    }
  })
  return groups
}

/**
 * 规范化单个患者数据。
 *
 * @param {Record<string, any>} patient API 原始患者数据。
 * @returns {Record<string, any>}
 */
export const adaptProjectPatient = (patient) => {
  const crfData = patient?.crf_data || {}
  let groups = crfData?.groups || {}

  if ((!groups || Object.keys(groups).length === 0) && patient?.crf_group_stats) {
    groups = buildCrfGroupsFromSummaryForAdapter(patient.crf_group_stats)
  }

  const crfGroups = {}
  Object.keys(groups).forEach((groupId) => {
    const group = groups[groupId] || {}
    const stats = calcGroupStats(groups, groupId)
    crfGroups[groupId] = {
      group_id: groupId,
      group_name: group.group_name || groupId,
      completeness: stats.percent,
      filled_count: stats.filled,
      total_count: stats.total,
      fields: group.fields || {},
      records: Array.isArray(group.records) ? group.records : [],
      is_repeatable: Boolean(group.is_repeatable),
    }
  })

  const extractedAt = crfData?._extracted_at || null
  const extractionErrors = crfData?._errors
  const extractionMode = crfData?._extraction_mode || null
  const completeness = parseFloat(patient?.crf_completeness) || 0
  let extractionStatus = 'pending'
  if (extractedAt && completeness > 0) {
    extractionStatus = extractionErrors ? 'partial' : 'done'
  } else if (extractedAt) {
    extractionStatus = 'empty'
  }

  return {
    key: patient?.id,
    id: patient?.id,
    patientId: patient?.subject_id || patient?.id,
    patient_id: patient?.patient_id,
    name: patient?.patient_name,
    subject_id: patient?.subject_id,
    group_name: patient?.group_name,
    status: patient?.status,
    enrollment_date: patient?.enrollment_date,
    overallCompleteness: completeness,
    extractionStatus,
    extractedAt,
    extractionMode,
    crf_data: crfData,
    crfGroups,
    hasExtractionHistory: Boolean(patient?.has_extraction_history),
    extractionHistory: patient?.extraction_history || null,
    document_count: patient?.document_count,
    patient_gender: patient?.patient_gender ?? null,
    patient_age: patient?.patient_age ?? null,
    patient_birth_date: patient?.patient_birth_date ?? null,
  }
}

/**
 * 规范化患者列表。
 *
 * @param {Array<Record<string, any>>} patients API 患者列表。
 * @returns {Array<Record<string, any>>}
 */
export const adaptProjectPatients = (patients) => {
  if (!Array.isArray(patients)) return []
  return patients.map(adaptProjectPatient)
}

/**
 * 规范化模板字段定义。
 *
 * @param {Array<Record<string, any>>} fieldGroups 模板字段组。
 * @param {Record<string, any>} fieldMapping 字段映射。
 * @returns {{fieldGroups:Array<Record<string, any>>, fieldMapping:Record<string,string>}}
 */
export const adaptTemplateMeta = (fieldGroups, fieldMapping, schema = null) => {
  const normalizedGroups = normalizeTemplateFieldGroups(fieldGroups)
  return {
    fieldGroups: normalizedGroups.length > 0 ? normalizedGroups : deriveTemplateFieldGroupsFromSchema(schema),
    fieldMapping: normalizeTemplateFieldMapping(fieldMapping),
  }
}
