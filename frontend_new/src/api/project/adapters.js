import { emptySuccess } from '../_empty'
import {
  buildCrfGroupsFromSchema,
  computeOverallCompletenessFromGroups,
  currentValuesToData,
  hasMeaningfulValue,
} from './crfSchemaData'
import { isPlainObject } from './crfValue'

const toProjectCode = (data = {}) => {
  const rawCode = data.project_code || data.projectCode || data.code
  if (rawCode) return String(rawCode).trim()
  const rawName = data.project_name || data.projectName || data.name || 'research_project'
  const slug = String(rawName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'research_project'}_${Date.now()}`.slice(0, 100)
}

export const normalizeProjectPayload = (data = {}, { create = false } = {}) => {
  const {
    projectCode,
    projectName,
    name,
    principal_investigator_id: principalInvestigatorId,
    expected_patient_count: expectedPatientCount,
    crf_template_id: crfTemplateId,
    patient_criteria: patientCriteria,
    template_scope_config: templateScopeConfig,
    extra_json: extraJson,
    ...rest
  } = data
  const payload = {
    ...rest,
    ...(create ? { project_code: toProjectCode(data) } : {}),
    ...(data.project_name || projectName || name ? { project_name: data.project_name || projectName || name } : {}),
  }
  const nextExtraJson = {
    ...(isPlainObject(extraJson) ? extraJson : {}),
    ...(principalInvestigatorId ? { principal_investigator_id: principalInvestigatorId } : {}),
    ...(expectedPatientCount != null ? { expected_patient_count: expectedPatientCount } : {}),
    ...(crfTemplateId ? { crf_template_id: crfTemplateId } : {}),
    ...(patientCriteria ? { patient_criteria: patientCriteria } : {}),
    ...(templateScopeConfig ? { template_scope_config: templateScopeConfig } : {}),
  }
  if (Object.keys(nextExtraJson).length > 0) payload.extra_json = nextExtraJson
  delete payload.project_code
  if (create) payload.project_code = toProjectCode(data)
  return payload
}

export const withProjectAliases = (project = {}) => {
  const extra = isPlainObject(project.extra_json) ? project.extra_json : {}
  const templateConfig = extra.template_scope_config || {}
  // 后端聚合字段已在 /projects 响应中提供，extra_json 仅作为兼容旧数据时的兜底来源。
  const actualPatientCount = Number(
    project.actual_patient_count ?? extra.actual_patient_count ?? extra.patient_count ?? 0,
  ) || 0
  const expectedPatientCount = (
    project.expected_patient_count
    ?? extra.expected_patient_count
    ?? extra.target_patient_count
    ?? null
  )
  const avgCompleteness = Number(project.avg_completeness ?? extra.avg_completeness ?? 0) || 0
  const principalInvestigatorName = (
    project.principal_investigator_name
    || extra.principal_investigator_name
    || ''
  )
  return {
    ...extra,
    ...project,
    projectId: project.id,
    project_code: project.project_code,
    project_name: project.project_name,
    status_key: project.status,
    actual_patient_count: actualPatientCount,
    expected_patient_count: expectedPatientCount,
    avg_completeness: avgCompleteness,
    crf_template_id: extra.crf_template_id || templateConfig.template_id || null,
    template_scope_config: templateConfig,
    principal_investigator_name: principalInvestigatorName,
  }
}

export const wrapPaged = (payload = {}, itemMapper = (item) => item) => {
  const items = Array.isArray(payload.items) ? payload.items.map(itemMapper) : []
  const page = payload.page || 1
  const pageSize = payload.page_size || payload.pageSize || items.length || 20
  const total = payload.total ?? items.length
  return emptySuccess(items, {
    total,
    page,
    page_size: pageSize,
    pagination: { page, page_size: pageSize, total },
  })
}

export const wrapList = (items = [], pagination = {}) => emptySuccess(items, {
  total: pagination.total ?? items.length,
  page: pagination.page ?? 1,
  page_size: pagination.page_size ?? items.length,
  pagination: {
    page: pagination.page ?? 1,
    page_size: pagination.page_size ?? items.length,
    total: pagination.total ?? items.length,
  },
})

const buildCrfGroupsFromSummary = (groupStats = {}) => {
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

export const projectPatientToDetail = (item = {}, crf = null) => {
  let crfGroups = crf ? buildCrfGroupsFromSchema(crf.schema, crf.current_values || {}) : {}
  if (!crf && item.crf_group_stats && typeof item.crf_group_stats === 'object') {
    crfGroups = buildCrfGroupsFromSummary(item.crf_group_stats)
  }
  const crfCompleteness = crf
    ? computeOverallCompletenessFromGroups(crfGroups)
    : (item.crf_completeness ?? 0)
  return {
    ...item,
    project_patient_id: item.id,
    subject_id: item.enroll_no || item.subject_id || item.patient_id,
    enrollment_date: item.enrolled_at || item.enrollment_date,
    patient_name: item.patient_name || item.name || '',
    patient_gender: item.patient_gender ?? item.gender ?? null,
    patient_age: item.patient_age ?? item.age ?? null,
    patient_birth_date: item.patient_birth_date ?? item.birth_date ?? null,
    patient_phone: item.patient_phone ?? item.phone ?? '',
    patient_code: item.patient_code ?? item.patient_id,
    patient_diagnosis: item.patient_diagnosis ?? item.diagnosis ?? [],
    crf_data: crf
      ? {
          groups: crfGroups,
          data: currentValuesToData(crf.current_values || {}, crf.schema),
          current_values: crf.current_values || {},
          _documents: item._documents || {},
          _crf: crf,
        }
      : item.crf_data || { groups: {} },
    documents: item.documents || [],
    document_count: item.document_count ?? 0,
    crf_completeness: crfCompleteness,
  }
}

export const documentListToMap = (documents = []) => Object.fromEntries(
  (Array.isArray(documents) ? documents : [])
    .filter((doc) => doc?.id)
    .map((doc) => [String(doc.id), doc])
)

export { hasMeaningfulValue }
