import { useMemo } from 'react'

import { toAuditPath } from '../../../../utils/auditResolver'
import {
  cloneJsonValue,
  normalizeFieldPathToDot,
} from './crfPathUtils'
import { mergeGroupValuesIntoDataByTemplate } from './schemaMergeUtils'
import {
  buildProjectFieldCanonicalPath,
  mergeAuditFieldEntry,
} from './auditMetadataUtils'

const normalizeHookTemplateGroups = (projectTemplateGroups) => {
  return (Array.isArray(projectTemplateGroups) ? projectTemplateGroups : []).map((group) => ({
    key: String(group?.key || ''),
    name: String(group?.name || ''),
    dbFields: Array.isArray(group?.dbFields) ? group.dbFields : [],
  }))
}

const collectTaskAuditFields = (taskResults, allFields) => {
  for (const task of taskResults) {
    const auditFields = task?.audit?.fields
    if (!auditFields || typeof auditFields !== 'object') continue
    for (const [rawKey, auditValue] of Object.entries(auditFields)) {
      const canonicalPath = normalizeFieldPathToDot(rawKey)
      if (!canonicalPath || !auditValue || typeof auditValue !== 'object') continue
      mergeAuditFieldEntry(allFields, canonicalPath, auditValue)
      mergeAuditFieldEntry(allFields, toAuditPath(canonicalPath), auditValue)
    }
  }
}

const collectGroupAuditFields = (groups, allFields) => {
  for (const [groupId, groupData] of Object.entries(groups)) {
    const fields = groupData?.fields
    if (!fields || typeof fields !== 'object') continue
    for (const [fieldKey, fieldData] of Object.entries(fields)) {
      if (!fieldData?.document_id && !fieldData?.bbox && !fieldData?.raw && !fieldData?.source_id && !fieldData?.document_type) {
        continue
      }
      const canonicalPath = buildProjectFieldCanonicalPath(groupId, fieldKey, fieldData)
      if (!canonicalPath) continue
      const nextAudit = {
        document_id: fieldData.document_id,
        document_type: fieldData.document_type,
        raw: fieldData.raw,
        source_id: fieldData.source_id,
        bbox: fieldData.bbox,
        page_idx: fieldData.page_idx,
        value: fieldData.value,
      }
      mergeAuditFieldEntry(allFields, canonicalPath, nextAudit)
      mergeAuditFieldEntry(allFields, toAuditPath(canonicalPath), nextAudit)
    }
  }
}

export function useProjectSchemaData({
  crfData,
  documents,
  effectiveProjectSchema,
  projectTemplateFieldGroups,
  projectTemplateGroups,
}) {
  return useMemo(() => {
    const baseData = cloneJsonValue(crfData?.data || {}) || {}
    const taskResults = crfData?._task_results || []
    const hookDocuments = Object.fromEntries(
      (Array.isArray(documents) ? documents : [])
        .filter((doc) => doc?.id)
        .map((doc) => [String(doc.id), doc])
    )
    const crfDocuments = crfData?._documents && typeof crfData._documents === 'object' && !Array.isArray(crfData._documents)
      ? crfData._documents
      : {}
    const groups = crfData?.groups || {}
    const normalizedHookTemplateGroups = normalizeHookTemplateGroups(projectTemplateGroups)
    const effectiveTemplateGroups = projectTemplateFieldGroups.length > 0
      ? projectTemplateFieldGroups
      : normalizedHookTemplateGroups
    const data = mergeGroupValuesIntoDataByTemplate(baseData, effectiveProjectSchema, groups, effectiveTemplateGroups)
    const allFields = {}

    collectTaskAuditFields(taskResults, allFields)
    collectGroupAuditFields(groups, allFields)

    return {
      ...data,
      _extraction_metadata: {
        audit: { fields: allFields },
        documents: { ...hookDocuments, ...crfDocuments },
        extracted_at: crfData?._extracted_at,
        edited_at: crfData?._edited_at,
        edited_by: crfData?._edited_by,
        stats: crfData?._stats,
      },
    }
  }, [crfData, documents, effectiveProjectSchema, projectTemplateFieldGroups, projectTemplateGroups])
}
