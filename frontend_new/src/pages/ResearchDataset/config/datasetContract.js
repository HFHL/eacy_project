/**
 * @file 项目详情页 V2 数据契约常量。
 */

/**
 * 项目详情页 V2 的后端不变契约。
 * @type {{
 *  fieldGroupsSource: string;
 *  mappingSource: string;
 *  valuePath: string;
 *  groupKey: string;
 *  fieldKey: string;
 *  patientActionId: string;
 *  patientDisplayId: string;
 * }}
 */
export const PROJECT_DATASET_V2_CONTRACT = {
  fieldGroupsSource: 'template_info.field_groups',
  mappingSource: 'template_info.db_field_mapping',
  valuePath: 'crf_data.groups[group_id].fields[field_key]',
  groupKey: 'group_id',
  fieldKey: 'field_key',
  patientActionId: 'patient_id',
  patientDisplayId: 'subject_id',
}

/**
 * 字段组匹配模式（前端灰度开关）。
 * - strict: 仅允许 sec/groupPath 等严格候选命中，不再启用 legacy fallback
 * - compatible: 保留字段覆盖度/文件夹兜底等兼容逻辑
 * @type {{STRICT: string, COMPATIBLE: string}}
 */
export const PROJECT_DATASET_GROUP_MATCH_MODE = {
  STRICT: 'strict',
  COMPATIBLE: 'compatible',
}

/**
 * 兼容模式可观测字段契约。
 * 消费侧应至少记录 source / matchedPath / fallbackUsed / rowIndex / groupRowCount。
 * @type {{diagnosticsKeys: string[]}}
 */
export const PROJECT_DATASET_FALLBACK_OBSERVABILITY = {
  diagnosticsKeys: ['source', 'matchedPath', 'fallbackUsed', 'rowIndex', 'groupRowCount'],
}

/**
 * 解析当前生效的字段组匹配模式。
 * 优先级：URL 参数 > localStorage > 环境变量 > 默认 strict。
 *
 * URL 参数：`groupMatchMode=strict|compatible`
 * localStorage：`projectDatasetV2GroupMatchMode`
 * 环境变量：`VITE_CRF_V2_GROUP_MATCH_MODE`
 *
 * @returns {'strict' | 'compatible'}
 */
export const resolveProjectDatasetGroupMatchMode = () => {
  const normalizeMode = (rawMode) => {
    const mode = String(rawMode || '').trim().toLowerCase()
    if (mode === PROJECT_DATASET_GROUP_MATCH_MODE.COMPATIBLE) return PROJECT_DATASET_GROUP_MATCH_MODE.COMPATIBLE
    if (mode === PROJECT_DATASET_GROUP_MATCH_MODE.STRICT) return PROJECT_DATASET_GROUP_MATCH_MODE.STRICT
    return null
  }

  if (typeof window !== 'undefined') {
    const queryMode = normalizeMode(new URLSearchParams(window.location.search).get('groupMatchMode'))
    if (queryMode) return queryMode
    const storageMode = normalizeMode(window.localStorage?.getItem('projectDatasetV2GroupMatchMode'))
    if (storageMode) return storageMode
  }

  const envMode = normalizeMode(import.meta?.env?.VITE_CRF_V2_GROUP_MATCH_MODE)
  if (envMode) return envMode

  // 默认兼容模式，待 strict 命中率门禁稳定后再切换默认值。
  return PROJECT_DATASET_GROUP_MATCH_MODE.COMPATIBLE
}

/**
 * 规范化模板字段映射。
 *
 * @param {Record<string, any>} mappingRaw 模板字段映射原始结构。
 * @returns {Record<string, string>}
 */
export const normalizeTemplateFieldMapping = (mappingRaw) => {
  if (!mappingRaw || typeof mappingRaw !== 'object') return {}
  return mappingRaw.field_map || mappingRaw.fieldMap || mappingRaw
}

const normalizeGroupPath = (value) => {
  return String(value || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/')
}

const normalizeGroupDbFields = (group = {}) => {
  if (Array.isArray(group.db_fields)) return group.db_fields.filter(Boolean).map(String)
  if (!Array.isArray(group.fields)) return []
  return group.fields
    .map((field) => field?.fieldId || field?.field_id || field?.path || field?.db_field || field?.key)
    .filter(Boolean)
    .map(String)
}

/**
 * 规范化模板字段组列表。
 *
 * @param {any} groupsRaw 模板字段组原始结构。
 * @returns {Array<{group_id:string,group_name:string,db_fields:string[],is_repeatable:boolean,order:number,sources?:any}>}
 */
export const normalizeTemplateFieldGroups = (groupsRaw) => {
  if (!Array.isArray(groupsRaw)) return []
  return groupsRaw
    .filter((group) => group && typeof group === 'object')
    .map((group, index) => {
      const groupName = String(group.group_name || group.name || group.title || group.group_id || group.key || '')
      const groupId = normalizeGroupPath(group.group_id || group.group_key || group.key || groupName)
      if (!groupId) return null
      const order = Number(group.order)
      return {
        group_id: groupId,
        group_name: groupName || groupId,
        db_fields: normalizeGroupDbFields(group),
        is_repeatable: Boolean(group.is_repeatable ?? group.repeatable),
        order: Number.isFinite(order) ? order : index,
        sources: group.sources || group._sourcesByDocType || null,
      }
    })
    .filter(Boolean)
}
