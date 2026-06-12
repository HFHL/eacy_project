import { useCallback, useEffect, useState } from 'react'

import { getProjectTemplate } from '../../../../api/crfTemplate'
import { getProjectPatientCrf } from '@/api/project'
import { resolveTemplateAssets } from '../../../../utils/templateAssetResolver'
import { normalizeTemplateFieldGroups } from '../../config/datasetContract'
import { deriveTemplateFieldGroupsFromSchema } from '../../adapters/datasetAdapter'

const normalizeLoadedTemplateGroups = (fieldGroupsRaw, schema) => {
  const normalizedGroups = normalizeTemplateFieldGroups(fieldGroupsRaw)
  return (normalizedGroups.length > 0
    ? normalizedGroups
    : deriveTemplateFieldGroupsFromSchema(schema)
  ).map((group) => ({
    key: group.group_id,
    name: group.group_name,
    dbFields: Array.isArray(group.db_fields) ? group.db_fields : [],
  }))
}

export function useProjectPatientSchema(projectId, resolvedProjectPatientId, crfData) {
  const [projectSchema, setProjectSchema] = useState(null)
  const [projectTemplateFieldGroups, setProjectTemplateFieldGroups] = useState([])
  const [projectSchemaLoading, setProjectSchemaLoading] = useState(Boolean(projectId))
  const [projectSchemaError, setProjectSchemaError] = useState(null)
  const [projectSchemaReloadTick, setProjectSchemaReloadTick] = useState(0)
  const crfSchema = crfData?._crf?.schema && typeof crfData._crf.schema === 'object'
    ? crfData._crf.schema
    : null
  const effectiveProjectSchema = projectSchema || crfSchema

  const reloadProjectSchema = useCallback(() => {
    setProjectSchemaReloadTick((tick) => tick + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadProjectSchema = async () => {
      if (!projectId) {
        setProjectSchema(null)
        setProjectTemplateFieldGroups([])
        setProjectSchemaLoading(false)
        setProjectSchemaError(null)
        return
      }
      setProjectSchemaLoading(true)
      setProjectSchemaError(null)
      try {
        let schema = null
        let fieldGroupsRaw = []

        if (resolvedProjectPatientId) {
          const crfResponse = await getProjectPatientCrf(projectId, resolvedProjectPatientId)
          const crf = crfResponse?.data
          schema = crf?.schema || crf?.schema_ || null
          fieldGroupsRaw = crf?.field_groups || []
        }

        if (!schema) {
          const response = await getProjectTemplate(projectId)
          if (!response?.success) throw new Error(response?.message || '项目模板获取失败')
          const template = response?.data
          if (!template) throw new Error('项目尚未关联 CRF 模板')
          const assets = resolveTemplateAssets(template)
          schema = assets.schema
          fieldGroupsRaw = template?.field_groups
            || template?.template_info?.field_groups
            || template?.layout_config?.field_groups
            || []
        }

        if (!schema || typeof schema !== 'object') throw new Error('项目模板未包含 schema_json')
        if (!cancelled) {
          setProjectSchema(schema)
          setProjectTemplateFieldGroups(normalizeLoadedTemplateGroups(fieldGroupsRaw, schema))
        }
      } catch (error) {
        console.error('获取项目模板 schema 失败:', error)
        if (!cancelled) {
          setProjectSchema(null)
          setProjectTemplateFieldGroups([])
          setProjectSchemaError(error?.message || 'Schema加载失败')
        }
      } finally {
        if (!cancelled) setProjectSchemaLoading(false)
      }
    }

    loadProjectSchema()
    return () => {
      cancelled = true
    }
  }, [projectId, projectSchemaReloadTick, resolvedProjectPatientId])

  return {
    effectiveProjectSchema,
    projectTemplateFieldGroups,
    projectSchemaLoading,
    projectSchemaError,
    reloadProjectSchema,
  }
}
