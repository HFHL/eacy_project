/**
 * 项目患者数据管理 Hook
 * 用于获取项目中单个患者的 CRF 数据和关联信息
 */
import { useState, useEffect, useCallback } from 'react'
import { message } from 'antd'
import { getProjectPatientDetail } from '@/api/project'
import { getProject } from '@/api/project'

// 默认空患者信息
const emptyPatientInfo = {
  id: '',
  patientId: '',
  projectId: '',
  name: '',
  gender: '',
  age: null,
  birthDate: '',
  phone: '',
  patientCode: '',
  diagnosis: [],
  subjectId: '',
  groupName: '',
  status: '',
  enrollmentDate: '',
  crfCompleteness: 0,
  documentCount: 0,
}

// 默认空 CRF 数据
const emptyCrfData = {
  groups: {},
  _task_results: [],
  _documents: {},
}

export const useProjectPatientData = (projectId, patientId) => {
  // 加载状态
  const [loading, setLoading] = useState(false)
  const [projectLoading, setProjectLoading] = useState(false)
  const [projectError, setProjectError] = useState(null)
  const [patientError, setPatientError] = useState(null)
  
  // 患者信息
  const [patientInfo, setPatientInfo] = useState(emptyPatientInfo)
  
  // 项目信息
  const [projectInfo, setProjectInfo] = useState(null)
  
  // CRF 数据
  const [crfData, setCrfData] = useState(emptyCrfData)
  
  // 关联文档
  const [documents, setDocuments] = useState([])
  
  // 字段组配置（从项目模板中获取）
  const [fieldGroups, setFieldGroups] = useState([])
  const [fieldMapping, setFieldMapping] = useState({})

  // 从 API 获取项目详情
  const fetchProjectDetail = useCallback(async () => {
    if (!projectId) {
      console.log('[useProjectPatientData] projectId 为空，跳过获取项目详情')
      return
    }
    
    console.log('[useProjectPatientData] 开始获取项目详情:', projectId)
    setProjectError(null)
    setProjectLoading(true)
    try {
      const res = await getProject(projectId)
      console.log('[useProjectPatientData] 项目详情 API 响应:', res)
      
      if (res.success && res.data) {
        console.log('[useProjectPatientData] 设置 projectInfo:', res.data)
        setProjectInfo(res.data)
        
        // 解析模板字段组配置
        if (res.data.template_info) {
          const groups = res.data.template_info.field_groups || []
          const mapping = res.data.template_info.db_field_mapping || {}
          
          // 转换为前端需要的格式
          const formattedGroups = groups.map((g, idx) => ({
            key: g.group_id,
            name: g.group_name,
            status: 'pending',
            completeness: 0,
            order: g.order ?? idx,
            isRepeatable: g.is_repeatable || false,
            dbFields: g.db_fields || [],
          }))
          
          setFieldGroups(formattedGroups)
          setFieldMapping(mapping.field_map || mapping || {})
        }
      } else {
        const errMsg = res?.message || '获取项目详情失败'
        setProjectError(errMsg)
        console.warn('[useProjectPatientData] 获取项目详情失败:', errMsg)
      }
    } catch (error) {
      const errMsg = error?.message || '获取项目详情失败'
      setProjectError(errMsg)
      console.error('[useProjectPatientData] 获取项目详情异常:', error)
    } finally {
      setProjectLoading(false)
    }
  }, [projectId])

  // 从 API 获取项目患者详情
  const fetchPatientDetail = useCallback(async () => {
    if (!projectId || !patientId) {
      console.log('[useProjectPatientData] projectId 或 patientId 为空，跳过获取患者详情')
      return
    }

    console.log('[useProjectPatientData] 开始获取患者详情:', { projectId, patientId })
    setPatientError(null)
    setLoading(true)
    try {
      const res = await getProjectPatientDetail(projectId, patientId)
      console.log('[useProjectPatientData] 患者详情 API 响应:', res)

      if (res.success && res.data) {
        const data = res.data
        console.log('[useProjectPatientData] 设置患者信息:', data)

        // 🔍 关键调试：打印 crf_data 的完整结构
        console.log('[useProjectPatientData] CRF 数据详情:', {
          hasCrfData: !!data.crf_data,
          crfDataKeys: data.crf_data ? Object.keys(data.crf_data) : [],
          groupsKeys: data.crf_data?.groups ? Object.keys(data.crf_data.groups) : [],
          hasData: !!data.crf_data?.data,
          dataKeys: data.crf_data?.data ? Object.keys(data.crf_data.data) : [],
          groupsSample: data.crf_data?.groups ? Object.entries(data.crf_data.groups).slice(0, 2) : [],
          dataSample: data.crf_data?.data ? JSON.stringify(data.crf_data.data).substring(0, 200) : 'null',
          crfDataString: JSON.stringify(data.crf_data || {}).substring(0, 500)
        })

        // 设置患者信息
        setPatientInfo({
          id: data.id,
          patientId: data.patient_id,
          projectId: data.project_id,
          name: data.patient_name,
          gender: data.patient_gender,
          age: data.patient_age,
          birthDate: data.patient_birth_date,
          phone: data.patient_phone,
          patientCode: data.patient_code,
          diagnosis: data.patient_diagnosis || [],
          subjectId: data.subject_id,
          groupName: data.group_name,
          status: data.status,
          enrollmentDate: data.enrollment_date,
          crfCompleteness: data.crf_completeness || 0,
          documentCount: data.document_count || 0,
        })

        // 设置 CRF 数据
        setCrfData(data.crf_data || emptyCrfData)

        // 设置关联文档
        setDocuments(data.documents || [])
        // eslint-disable-next-line no-console
        console.log('[useProjectPatientData] documents 详情:', {
          count: Array.isArray(data.documents) ? data.documents.length : 'not-array',
          patientGlobalId: data.patient_id,
          sample: Array.isArray(data.documents) && data.documents.length > 0
            ? {
                id: data.documents[0].id,
                name: data.documents[0].name,
                status: data.documents[0].status,
                patient_id: data.documents[0].patient_id,
                document_type: data.documents[0].document_type,
              }
            : null,
        })

        console.log('获取项目患者详情成功:', data)
      } else {
        const errMsg = res?.message || '获取患者详情失败'
        setPatientError(errMsg)
        message.error(errMsg)
      }
    } catch (error) {
      console.error('获取项目患者详情失败:', error)
      const errMsg = error?.message || '获取患者详情失败'
      setPatientError(errMsg)
      message.error(errMsg)
    } finally {
      setLoading(false)
    }
  }, [projectId, patientId])

  // 将 CRF 数据转换为 EhrTab 组件需要的格式
  const getEhrFieldsData = useCallback(() => {
    const result = {}
    const groups = crfData.groups || {}
    
    Object.keys(groups).forEach(groupKey => {
      const group = groups[groupKey]
      const fields = group.fields || {}
      const isRepeatable = group.is_repeatable || false
      
      // 检查是否有字段的 value 是数组（可重复组的标志）
      const firstArrayField = Object.values(fields).find(f => Array.isArray(f.value) && f.value.length > 0)
      
      if (isRepeatable && firstArrayField && Array.isArray(firstArrayField.value)) {
        // 可重复组：将 value 数组转换为 records 格式
        // 数据格式：value = [{报告日期: "2025-08-14", 心电图诊断: "正常心电图"}, ...]
        const records = firstArrayField.value.map((recordObj, index) => {
          // 将记录对象转换为 fields 数组格式
          const recordFields = Object.entries(recordObj).map(([fieldName, value]) => {
            // 尝试从 fields 中找到对应的元数据
            const matchingFieldEntry = Object.entries(fields).find(([key]) => key.endsWith(`/${fieldName}`))
            const matchingField = matchingFieldEntry ? matchingFieldEntry[1] : null
            
            return {
              id: `${groupKey}_${index}_${fieldName}`,
              apiFieldId: matchingFieldEntry ? matchingFieldEntry[0] : fieldName,
              name: fieldName,
              value: value,
              source: matchingField?.source || 'document',
              confidence: matchingField?.confidence,
              type: matchingField?.type || 'text',
              fieldType: 'fields',
              // 溯源信息
              document_id: matchingField?.document_id,
              document_type: matchingField?.document_type,
              raw: matchingField?.raw,
              bbox: matchingField?.bbox,
              page_idx: matchingField?.page_idx,
            }
          })
          
          return {
            id: `${groupKey}_record_${index}`,
            fields: recordFields,
          }
        })
        
        result[groupKey] = {
          name: group.group_name || groupKey,
          repeatable: true,
          records: records,
          fields: [], // 空数组，数据都在 records 中
        }
      } else {
        // 非可重复组：转换字段为数组格式
        const fieldArray = Object.keys(fields).map(fieldKey => {
          const field = fields[fieldKey]
          return {
            id: fieldKey,
            apiFieldId: fieldKey,
            name: fieldMapping[fieldKey] || field.field_name || fieldKey.split('/').slice(-1)[0],
            value: field.value,
            source: field.source,
            confidence: field.confidence,
            type: field.type || 'text',
            // 溯源信息（项目 CRF 抽取会带上这些字段；用于右侧文档溯源预览）
            document_id: field.document_id,
            document_type: field.document_type,
            raw: field.raw,
            bbox: field.bbox,
            page_idx: field.page_idx,
          }
        })
        
        result[groupKey] = {
          name: group.group_name || groupKey,
          repeatable: isRepeatable,
          fields: fieldArray,
          records: [], // 空数组
        }
      }
    })
    
    return result
  }, [crfData, fieldMapping])

  // 生成 EhrTab 需要的字段组树形结构
  const getEhrFieldGroups = useCallback(() => {
    const groups = crfData.groups || {}
    
    // 如果有模板配置的字段组，优先使用
    if (fieldGroups.length > 0) {
      return fieldGroups.map(fg => {
        const groupData = groups[fg.key] || {}
        const fields = groupData.fields || {}
        const totalFields = fg.dbFields.length || Object.keys(fields).length
        const filledFields = Object.values(fields).filter(f => 
          f.value !== null && f.value !== undefined && f.value !== ''
        ).length
        const completeness = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0
        
        return {
          key: fg.key,
          name: fg.name,
          status: completeness >= 90 ? 'completed' : completeness > 0 ? 'partial' : 'pending',
          completeness,
          isRepeatable: fg.isRepeatable,
          fieldCount: totalFields,
          extractedCount: filledFields,
        }
      })
    }
    
    // 否则从 CRF 数据动态生成
    return Object.keys(groups).map(groupKey => {
      const group = groups[groupKey]
      const fields = group.fields || {}
      const totalFields = Object.keys(fields).length
      const filledFields = Object.values(fields).filter(f => 
        f.value !== null && f.value !== undefined && f.value !== ''
      ).length
      const completeness = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0
      
      return {
        key: groupKey,
        name: group.group_name || groupKey,
        status: completeness >= 90 ? 'completed' : completeness > 0 ? 'partial' : 'pending',
        completeness,
        isRepeatable: group.is_repeatable || false,
        fieldCount: totalFields,
        extractedCount: filledFields,
      }
    })
  }, [crfData, fieldGroups])

  // 当参数变化时获取数据
  useEffect(() => {
    if (projectId) {
      fetchProjectDetail()
    }
  }, [projectId, fetchProjectDetail])

  useEffect(() => {
    if (projectId && patientId) {
      fetchPatientDetail()
    }
  }, [projectId, patientId, fetchPatientDetail])

  // 刷新数据
  const refresh = useCallback(() => {
    fetchPatientDetail()
  }, [fetchPatientDetail])

  return {
    // 加载状态
    loading,
    projectLoading,
    projectError,
    patientError,
    
    // 数据
    patientInfo,
    projectInfo,
    crfData,
    documents,
    fieldGroups,
    fieldMapping,
    
    // 计算属性
    ehrFieldsData: getEhrFieldsData(),
    ehrFieldGroups: getEhrFieldGroups(),
    
    // 操作
    refresh,
    fetchPatientDetail,
    fetchProjectDetail,
  }
}

export default useProjectPatientData
