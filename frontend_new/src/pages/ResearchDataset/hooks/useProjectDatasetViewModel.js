/**
 * @file 项目详情页 V2 ViewModel Hook。
 */

import { useMemo } from 'react'
import { isRepeatableFormSchema } from '../../../components/SchemaForm/schemaRenderKernel'
import {
  inferColumnNodeKindBySchema,
  normalizeSlashPath,
  resolveGroupSchemaBinding,
  resolveSchemaNodeByPath,
  resolveSchemaNodeByFieldPath,
} from '../adapters/schemaKernelAdapter'

/**
 * 生成字段映射候选键。
 *
 * @param {string} groupId 字段组 ID。
 * @param {string} fieldKey 字段 key。
 * @returns {string[]}
 */
const buildFieldLabelKeys = (groupId, fieldKey) => {
  return [
    `${groupId}.${fieldKey}`,
    `${groupId}/${fieldKey}`,
    fieldKey,
  ]
}

/**
 * 选择字段展示名。
 *
 * @param {string} groupId 字段组 ID。
 * @param {string} fieldKey 字段 key。
 * @param {Record<string, string>} fieldMapping 字段映射。
 * @returns {string}
 */
const resolveFieldLabel = (groupId, fieldKey, fieldMapping) => {
  const candidates = buildFieldLabelKeys(groupId, fieldKey)
  for (const key of candidates) {
    if (fieldMapping?.[key]) return String(fieldMapping[key])
  }
  return String(fieldKey || '-')
}

/**
 * 解析字段组路径标题，拆分为文件夹与组名。
 *
 * @param {string} groupName 原始字段组名称。
 * @returns {{folderName:string,groupName:string}}
 */
const parseGroupPath = (groupName) => {
  const text = String(groupName || '').trim()
  if (!text) return { folderName: '未分类', groupName: '未命名字段组' }
  const parts = text.split('/').map((item) => item.trim()).filter(Boolean)
  if (parts.length <= 1) {
    return {
      folderName: parts[0] || text,
      groupName: parts[0] || text,
    }
  }
  return {
    folderName: parts[0],
    groupName: parts.slice(1).join(' / '),
  }
}

/**
 * 生成文件夹键。
 *
 * @param {string} folderName 文件夹名称。
 * @returns {string}
 */
const buildFolderKey = (folderName) => {
  return String(folderName || '未分类').replace(/\s+/g, '_')
}

/**
 * 统一路径分段文本，降低全角/空格差异造成的前缀匹配失败。
 *
 * @param {string} rawSegment 原始分段。
 * @returns {string}
 */
const normalizeSegmentForCompare = (rawSegment) => {
  return String(rawSegment || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .trim()
}

/**
 * 计算字段路径与组路径的最长前缀匹配长度。
 *
 * @param {string[]} fieldSegments 字段路径分段。
 * @param {string[]} groupSegments 组路径分段。
 * @returns {number}
 */
const getMatchedPrefixLength = (fieldSegments, groupSegments) => {
  if (!Array.isArray(fieldSegments) || !Array.isArray(groupSegments)) return 0
  const maxLen = Math.min(fieldSegments.length, groupSegments.length)
  let matchedLength = 0
  for (let index = 0; index < maxLen; index += 1) {
    const fieldSegment = normalizeSegmentForCompare(fieldSegments[index])
    const groupSegment = normalizeSegmentForCompare(groupSegments[index])
    if (!fieldSegment || !groupSegment || fieldSegment !== groupSegment) break
    matchedLength += 1
  }
  return matchedLength
}

/**
 * 将组内字段路径归并为“第2层展示列”。
 *
 * @param {string} groupName 字段组名称（可能包含路径）。
 * @param {string[]} dbFields 原始字段路径列表。
 * @returns {Array<{key:string,title:string,sourceFieldKeys:string[],nodeKind:'scalar'|'complex'}>}
 */
const buildSecondLevelColumns = (groupName, dbFields) => {
  const parsedGroupPath = parseGroupPath(groupName)
  const normalizedGroupPath = normalizeSlashPath(groupName)
  const groupPathSegments = String(groupName || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
  const bucketMap = new Map()

  dbFields.forEach((fieldPath) => {
    const fullPath = String(fieldPath || '').trim()
    if (!fullPath) return
    const normalizedFullPath = normalizeSlashPath(fullPath)
    const fieldSegments = fullPath.split('/').map((segment) => segment.trim()).filter(Boolean)

    let relativeSegments = fieldSegments
    let usedWholePathPrefix = false

    // 优先：按完整 group_name 前缀剥离（可处理组名内部包含 '/' 的场景）。
    if (normalizedGroupPath && normalizedFullPath.startsWith(`${normalizedGroupPath}/`)) {
      const normalizedRelative = normalizedFullPath.slice(normalizedGroupPath.length + 1)
      const normalizedRelativeSegments = normalizedRelative.split('/').map((segment) => segment.trim()).filter(Boolean)
      if (normalizedRelativeSegments.length > 0) {
        relativeSegments = normalizedRelativeSegments
        usedWholePathPrefix = true
      }
    }

    if (!usedWholePathPrefix) {
      const matchedPrefixLength = getMatchedPrefixLength(fieldSegments, groupPathSegments)
      if (matchedPrefixLength > 0 && fieldSegments.length > matchedPrefixLength) {
        relativeSegments = fieldSegments.slice(matchedPrefixLength)
      } else if (matchedPrefixLength === 0) {
        const folderPrefixSegments = [parsedGroupPath.folderName].filter(Boolean)
        const folderPrefixLength = getMatchedPrefixLength(fieldSegments, folderPrefixSegments)
        if (folderPrefixLength > 0 && fieldSegments.length > folderPrefixLength) {
          relativeSegments = fieldSegments.slice(folderPrefixLength)
        }
      }
    }

    const normalizedGroupSegments = groupPathSegments.map((segment) => normalizeSegmentForCompare(segment))
    const firstRelativeSegment = relativeSegments[0] || ''
    const normalizedFirstRelative = normalizeSegmentForCompare(firstRelativeSegment)
    const shouldSkipFirstRelative = relativeSegments.length > 1
      && normalizedGroupSegments.includes(normalizedFirstRelative)
    const secondLevelKey = shouldSkipFirstRelative
      ? relativeSegments[1]
      : (firstRelativeSegment || fieldSegments[fieldSegments.length - 1])
    if (!secondLevelKey) return

    const existingBucket = bucketMap.get(secondLevelKey) || {
      key: secondLevelKey,
      title: secondLevelKey,
      sourceFieldKeys: [],
      maxDepth: 1,
    }
    existingBucket.sourceFieldKeys.push(fullPath)
    existingBucket.maxDepth = Math.max(existingBucket.maxDepth, relativeSegments.length)
    bucketMap.set(secondLevelKey, existingBucket)
  })

  return [...bucketMap.values()].map((bucket) => ({
    key: bucket.key,
    title: bucket.title,
    sourceFieldKeys: bucket.sourceFieldKeys,
    nodeKind: bucket.sourceFieldKeys.length === 1 && bucket.maxDepth <= 1 ? 'scalar' : 'complex',
  }))
}

/**
 * 从患者 CRF 抽取结果中反推字段组定义。
 * 当项目模板绑定缺失或 template_info 未带 field_groups/schema 时，仍可用已有
 * crf_data.groups 渲染结果，避免右侧误显示“暂无字段组定义”。
 *
 * @param {Array<Record<string, any>>} patientDataset 患者列表。
 * @returns {Array<Record<string, any>>}
 */
const deriveFieldGroupsFromPatientCrfData = (patientDataset) => {
  const groupMap = new Map()
  ;(Array.isArray(patientDataset) ? patientDataset : []).forEach((patient) => {
    const groups = patient?.crf_data?.groups && typeof patient.crf_data.groups === 'object'
      ? patient.crf_data.groups
      : (patient?.crfGroups && typeof patient.crfGroups === 'object' ? patient.crfGroups : {})

    Object.entries(groups).forEach(([groupId, groupNode]) => {
      if (!groupId || !groupNode || typeof groupNode !== 'object') return
      const existing = groupMap.get(groupId) || {
        group_id: String(groupId),
        group_name: String(groupNode.group_name || groupNode.name || groupId),
        dbFieldSet: new Set(),
        is_repeatable: Boolean(groupNode.is_repeatable),
        order: groupMap.size,
      }

      const collectFieldKeys = (fields) => {
        if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return
        Object.keys(fields).forEach((fieldKey) => {
          if (fieldKey && !String(fieldKey).startsWith('__')) existing.dbFieldSet.add(String(fieldKey))
        })
      }

      collectFieldKeys(groupNode.fields)
      ;(Array.isArray(groupNode.records) ? groupNode.records : []).forEach((record) => {
        collectFieldKeys(record?.fields && typeof record.fields === 'object' ? record.fields : record)
      })
      existing.is_repeatable = existing.is_repeatable || Boolean(groupNode.is_repeatable) || (Array.isArray(groupNode.records) && groupNode.records.length > 0)
      groupMap.set(groupId, existing)
    })
  })

  return [...groupMap.values()]
    .map((group) => ({
      group_id: group.group_id,
      group_name: group.group_name,
      db_fields: [...group.dbFieldSet],
      is_repeatable: group.is_repeatable,
      order: group.order,
      sources: null,
    }))
    .filter((group) => group.db_fields.length > 0)
}

/**
 * 生成项目详情页 V2 只读 ViewModel。
 *
 * @param {{
 *  projectData?: Record<string, any>;
 *  patientDataset?: Array<Record<string, any>>;
 *  templateFieldGroups?: Array<Record<string, any>>;
 *  templateFieldMapping?: Record<string, string>;
 *  templateSchemaJson?: Record<string, any> | null;
 *  selectedPatients?: string[];
 *  activeGroupKey?: string | null;
 * }} params 输入参数。
 * @returns {{
 *  projectMeta: Record<string, any>;
 *  patients: Array<Record<string, any>>;
 *  selectedPatientIds: string[];
 *  fieldGroups: Array<Record<string, any>>;
 *  folders: Array<{folderKey:string,folderName:string,groups:Array<Record<string, any>>}>;
 *  groupsByFolder: Record<string, Array<Record<string, any>>>;
 *  activeGroupKey: string | null;
 *  visiblePatients: Array<Record<string, any>>;
 *  selectionSummary: {selected:number,total:number};
 *  extractionContext: {selectedPatientIds:string[]};
 * }}
 */
export const useProjectDatasetViewModel = (params) => {
  const {
    projectData = null,
    patientDataset = [],
    templateFieldGroups = [],
    templateFieldMapping = {},
    templateSchemaJson = null,
    selectedPatients = [],
    activeGroupKey = null,
  } = params || {}

  return useMemo(() => {
    const effectiveFieldGroups = Array.isArray(templateFieldGroups) && templateFieldGroups.length > 0
      ? templateFieldGroups
      : deriveFieldGroupsFromPatientCrfData(patientDataset)
    const sortedGroups = [...effectiveFieldGroups]
      .filter((group) => group && group.group_id)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .map((group) => {
        const parsedPath = parseGroupPath(group.group_name)
        const folderKey = buildFolderKey(parsedPath.folderName)
        const schemaBinding = resolveGroupSchemaBinding(
          templateSchemaJson,
          group.group_name,
          group.db_fields || [],
        )
        const groupSchemaNode = schemaBinding.groupSchemaNode || resolveSchemaNodeByPath(templateSchemaJson, group.group_name)
        const groupIsRepeatable = isRepeatableFormSchema(groupSchemaNode) || Boolean(group?.is_repeatable)
        const secondLevelColumns = buildSecondLevelColumns(group.group_name, group.db_fields || [])
        let schemaResolvedColumnCount = 0
        let nodeKindMismatchCount = 0
        const columns = secondLevelColumns.map((columnMeta) => {
          const sourceFieldKeys = Array.isArray(columnMeta.sourceFieldKeys)
            ? columnMeta.sourceFieldKeys
            : []
          const schemaNodes = sourceFieldKeys.map((fieldPath) => {
            return resolveSchemaNodeByFieldPath(templateSchemaJson, group.group_name, fieldPath)
          })
          const schemaNode = schemaNodes.find(Boolean) || null
          const schemaNodeKind = inferColumnNodeKindBySchema(schemaNodes, sourceFieldKeys.length)
          const legacyNodeKind = columnMeta.nodeKind
          const hasSchemaHit = Boolean(schemaNode)
          if (hasSchemaHit) schemaResolvedColumnCount += 1
          if (legacyNodeKind !== schemaNodeKind) nodeKindMismatchCount += 1
          return {
            schemaNode,
            schemaHints: {
              display: schemaNode?.['x-display'] || null,
              rowConstraint: schemaNode?.['x-row-constraint'] || null,
            },
            key: columnMeta.key,
            title: resolveFieldLabel(group.group_id, columnMeta.key, templateFieldMapping),
            sourceFieldKeys: columnMeta.sourceFieldKeys,
            nodeKind: schemaNodeKind,
            schemaNodeKind,
            legacyNodeKind,
            schemaResolved: hasSchemaHit,
          }
        })
        const schemaShadowMetrics = {
          totalColumns: columns.length,
          schemaResolvedColumns: schemaResolvedColumnCount,
          schemaResolvedRate: columns.length > 0 ? Number((schemaResolvedColumnCount / columns.length).toFixed(4)) : 0,
          nodeKindMismatchCount,
          nodeKindMismatchRate: columns.length > 0 ? Number((nodeKindMismatchCount / columns.length).toFixed(4)) : 0,
        }
        return {
          ...group,
          folderKey,
          folderName: parsedPath.folderName,
          groupShortName: parsedPath.groupName,
          groupSchemaNode,
          groupPathTokens: schemaBinding.groupPathTokens,
          groupPath: schemaBinding.groupPath,
          repeatableDataPath: schemaBinding.repeatableDataPath,
          groupRenderMeta: {
            isRepeatable: groupIsRepeatable,
          },
          columns,
          schemaShadowMetrics,
        }
      })

    const groupsByFolder = {}
    sortedGroups.forEach((group) => {
      if (!groupsByFolder[group.folderKey]) {
        groupsByFolder[group.folderKey] = []
      }
      groupsByFolder[group.folderKey].push(group)
    })
    const folders = Object.entries(groupsByFolder).map(([folderKey, groups]) => ({
      folderKey,
      folderName: groups[0]?.folderName || folderKey,
      groups,
    }))

    const firstGroupKey = sortedGroups[0]?.group_id || null
    const currentActiveGroupKey = activeGroupKey && sortedGroups.some((group) => group.group_id === activeGroupKey)
      ? activeGroupKey
      : firstGroupKey

    return {
      projectMeta: projectData || {},
      patients: Array.isArray(patientDataset) ? patientDataset : [],
      selectedPatientIds: Array.isArray(selectedPatients) ? selectedPatients : [],
      fieldGroups: sortedGroups,
      folders,
      groupsByFolder,
      activeGroupKey: currentActiveGroupKey,
      visiblePatients: Array.isArray(patientDataset) ? patientDataset : [],
      selectionSummary: {
        selected: Array.isArray(selectedPatients) ? selectedPatients.length : 0,
        total: Array.isArray(patientDataset) ? patientDataset.length : 0,
      },
      extractionContext: {
        selectedPatientIds: Array.isArray(selectedPatients) ? selectedPatients : [],
      },
    }
  }, [
    activeGroupKey,
    patientDataset,
    projectData,
    selectedPatients,
    templateFieldGroups,
    templateFieldMapping,
    templateSchemaJson,
  ])
}
