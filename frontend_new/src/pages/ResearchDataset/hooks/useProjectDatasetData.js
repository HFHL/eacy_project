import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import {
  fetchProjectPatientsCrfGroupFields,
  getProject,
  getProjectPatients,
  getProjectTemplateDesigner,
} from '../../../api/project'
import { getProjectTemplate } from '../../../api/crfTemplate'
import { resolveTemplateAssets } from '../../../utils/templateAssetResolver'
import { adaptProjectPatients, adaptTemplateMeta } from '../adapters/datasetAdapter'

const measureTemplateFieldGroups = (groups = []) => {
  const safeGroups = Array.isArray(groups) ? groups : []
  const folderKeys = new Set()
  let fieldCount = 0
  safeGroups.forEach((group) => {
    const folderName = String(group?.group_name || group?.group_id || '').split('/')[0]?.trim()
    if (folderName) folderKeys.add(folderName)
    fieldCount += Array.isArray(group?.db_fields) ? group.db_fields.length : 0
  })
  return {
    groupCount: safeGroups.length,
    folderCount: folderKeys.size,
    fieldCount,
  }
}

const shouldReplaceTemplateFieldGroups = (previousGroups = [], nextGroups = []) => {
  if (!Array.isArray(nextGroups) || nextGroups.length === 0) return false
  if (!Array.isArray(previousGroups) || previousGroups.length === 0) return true
  const previous = measureTemplateFieldGroups(previousGroups)
  const next = measureTemplateFieldGroups(nextGroups)
  if (next.groupCount !== previous.groupCount) return next.groupCount > previous.groupCount
  if (next.folderCount !== previous.folderCount) return next.folderCount > previous.folderCount
  return next.fieldCount >= previous.fieldCount
}

export const useProjectDatasetData = ({ activeGroupKey, projectId, reloadKey }) => {
  const [loading, setLoading] = useState(false)
  const [groupFieldsLoading, setGroupFieldsLoading] = useState(false)
  const [projectData, setProjectData] = useState(null)
  const [patientDataset, setPatientDataset] = useState([])
  const [templateFieldGroups, setTemplateFieldGroups] = useState([])
  const [templateFieldMapping, setTemplateFieldMapping] = useState({})
  const [templateSchemaJson, setTemplateSchemaJson] = useState(null)
  const [enrolledPatientCount, setEnrolledPatientCount] = useState(0)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  })
  const loadedGroupFieldsRef = useRef(new Set())

  const applyTemplateFieldGroups = useCallback((fieldGroups = []) => {
    if (!Array.isArray(fieldGroups) || fieldGroups.length === 0) return
    setTemplateFieldGroups((previousGroups) => (
      shouldReplaceTemplateFieldGroups(previousGroups, fieldGroups)
        ? fieldGroups
        : previousGroups
    ))
  }, [])

  const fetchProjectPatients = useCallback(async (page = 1, pageSize = 20) => {
    if (!projectId) return

    setLoading(true)
    try {
      const response = await getProjectPatients(projectId, { page, page_size: pageSize })
      if (response.success) {
        const patients = adaptProjectPatients(response.data)
        setPatientDataset(patients)
        setPagination({
          current: response.pagination.page,
          pageSize: response.pagination.page_size,
          total: response.pagination.total,
        })
        if (typeof response.pagination.total === 'number') {
          setEnrolledPatientCount(response.pagination.total)
        }
      } else {
        message.error(response.message || '获取受试者列表失败')
      }
    } catch (error) {
      console.error('获取受试者列表失败:', error)
      message.error('获取受试者列表失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const mergeGroupFieldsIntoPatients = useCallback((patients, groupId, items) => {
    const fieldMap = new Map(
      (Array.isArray(items) ? items : []).map((item) => [String(item.project_patient_id), item.fields || {}]),
    )
    return (Array.isArray(patients) ? patients : []).map((patient) => {
      const fields = fieldMap.get(String(patient.id))
      if (!fields) return patient
      const nextCrfGroups = { ...(patient.crfGroups || {}) }
      const existing = nextCrfGroups[groupId] || {
        group_id: groupId,
        group_name: groupId,
        completeness: 0,
        filled_count: 0,
        total_count: 0,
        records: [],
        is_repeatable: false,
        fields: {},
      }
      nextCrfGroups[groupId] = {
        ...existing,
        fields: { ...(existing.fields || {}), ...fields },
      }
      const nextCrfDataGroups = { ...(patient.crf_data?.groups || {}) }
      nextCrfDataGroups[groupId] = {
        ...(nextCrfDataGroups[groupId] || {}),
        group_id: groupId,
        group_name: existing.group_name || groupId,
        fields: nextCrfGroups[groupId].fields,
      }
      return {
        ...patient,
        crfGroups: nextCrfGroups,
        crf_data: {
          ...(patient.crf_data || {}),
          groups: nextCrfDataGroups,
        },
      }
    })
  }, [])

  useEffect(() => {
    loadedGroupFieldsRef.current.clear()
  }, [projectId, pagination.current, pagination.pageSize])

  useEffect(() => {
    if (!projectId || !activeGroupKey || !patientDataset.length) return undefined

    const pendingPatients = patientDataset.filter((patient) => {
      const cacheKey = `${activeGroupKey}:${patient.id}`
      if (loadedGroupFieldsRef.current.has(cacheKey)) return false
      const fields = patient.crfGroups?.[activeGroupKey]?.fields
      return !fields || Object.keys(fields).length === 0
    })
    if (!pendingPatients.length) return undefined

    let cancelled = false
    setGroupFieldsLoading(true)
    fetchProjectPatientsCrfGroupFields(projectId, {
      groupId: activeGroupKey,
      projectPatientIds: pendingPatients.map((patient) => patient.id),
    })
      .then((response) => {
        if (cancelled || !response?.success) return
        pendingPatients.forEach((patient) => {
          loadedGroupFieldsRef.current.add(`${activeGroupKey}:${patient.id}`)
        })
        setPatientDataset((prev) => mergeGroupFieldsIntoPatients(prev, activeGroupKey, response.data?.items))
      })
      .catch((error) => {
        console.error('懒加载字段组 CRF 失败:', error)
      })
      .finally(() => {
        if (!cancelled) setGroupFieldsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [projectId, activeGroupKey, patientDataset, mergeGroupFieldsIntoPatients])

  const fetchProjectDetail = useCallback(async () => {
    if (!projectId) return

    try {
      const response = await getProject(projectId)
      if (response.success) {
        setProjectData(response.data)

        if (response.data.template_info) {
          const { fieldGroups, fieldMapping } = adaptTemplateMeta(
            response.data.template_info.field_groups || [],
            response.data.template_info.db_field_mapping || {},
            response.data.template_info.schema || response.data.template_info.schema_json || null,
          )
          applyTemplateFieldGroups(fieldGroups)
          setTemplateFieldMapping(fieldMapping)
        }
      }
    } catch (error) {
      console.error('获取项目详情失败:', error)
    }
  }, [applyTemplateFieldGroups, projectId])

  const fetchProjectTemplateSchema = useCallback(async () => {
    if (!projectId) return
    try {
      const response = await getProjectTemplate(projectId)
      if (response?.success && response?.data && typeof response.data === 'object') {
        const template = response.data
        const { schema } = resolveTemplateAssets(template)
        if (schema && typeof schema === 'object') {
          setTemplateSchemaJson(schema)
          const { fieldGroups, fieldMapping } = adaptTemplateMeta(
            Array.isArray(template.field_groups) ? template.field_groups : [],
            template.db_field_mapping || {},
            schema,
          )
          applyTemplateFieldGroups(fieldGroups)
          setTemplateFieldMapping(fieldMapping)
          return
        }
      }

      const fallbackResponse = await getProjectTemplateDesigner(projectId)
      if (fallbackResponse?.success && fallbackResponse?.data?.schema_json && typeof fallbackResponse.data.schema_json === 'object') {
        const fallbackTemplate = fallbackResponse.data
        const fallbackSchema = fallbackTemplate.schema_json
        setTemplateSchemaJson(fallbackSchema)
        const { fieldGroups, fieldMapping } = adaptTemplateMeta(
          Array.isArray(fallbackTemplate.field_groups) ? fallbackTemplate.field_groups : [],
          fallbackTemplate.db_field_mapping || {},
          fallbackSchema,
        )
        applyTemplateFieldGroups(fieldGroups)
        setTemplateFieldMapping(fieldMapping)
        return
      }
      setTemplateSchemaJson(null)
    } catch (error) {
      console.error('获取项目模板 schema 失败:', error)
      setTemplateSchemaJson(null)
    }
  }, [applyTemplateFieldGroups, projectId])

  useEffect(() => {
    fetchProjectDetail()
    fetchProjectTemplateSchema()
    fetchProjectPatients()
  }, [fetchProjectDetail, fetchProjectTemplateSchema, fetchProjectPatients, reloadKey])

  const handleManualRefresh = useCallback(async () => {
    await Promise.all([
      fetchProjectDetail(),
      fetchProjectTemplateSchema(),
      fetchProjectPatients(pagination.current, pagination.pageSize),
    ])
  }, [fetchProjectDetail, fetchProjectPatients, fetchProjectTemplateSchema, pagination.current, pagination.pageSize])

  return {
    enrolledPatientCount,
    fetchProjectDetail,
    fetchProjectPatients,
    fetchProjectTemplateSchema,
    groupFieldsLoading,
    handleManualRefresh,
    loading,
    pagination,
    patientDataset,
    projectData,
    templateFieldGroups,
    templateFieldMapping,
    templateSchemaJson,
  }
}
