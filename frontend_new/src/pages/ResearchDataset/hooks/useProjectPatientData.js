/**
 * 项目患者数据管理 Hook
 * 用于获取项目中单个患者的 CRF 数据和关联信息
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { message } from 'antd'
import { getProject, getProjectPatientDetail } from '@/api/project'
import { emptyCrfData, emptyPatientInfo } from './projectPatientData/projectPatientDefaults'
import {
  buildCrfDebugInfo,
  buildDocumentsDebugInfo,
  mapPatientDetailPayload,
  mapTemplateInfo,
} from './projectPatientData/projectPatientMappers'
import {
  buildEhrFieldGroups,
  buildEhrFieldsData,
} from './projectPatientData/ehrTransforms'

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

        if (res.data.template_info) {
          const template = mapTemplateInfo(res.data)
          setFieldGroups(template.fieldGroups)
          setFieldMapping(template.fieldMapping)
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
        const payload = mapPatientDetailPayload(data)
        console.log('[useProjectPatientData] 设置患者信息:', data)

        console.log('[useProjectPatientData] CRF 数据详情:', buildCrfDebugInfo(data))
        setPatientInfo(payload.patientInfo)
        setCrfData(payload.crfData)
        setDocuments(payload.documents)
        console.log(
          '[useProjectPatientData] documents 详情:',
          buildDocumentsDebugInfo(payload.documents, data.patient_id)
        )

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

  const ehrFieldsData = useMemo(
    () => buildEhrFieldsData(crfData, fieldMapping),
    [crfData, fieldMapping]
  )

  const ehrFieldGroups = useMemo(
    () => buildEhrFieldGroups(crfData, fieldGroups),
    [crfData, fieldGroups]
  )

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
    ehrFieldsData,
    ehrFieldGroups,

    // 操作
    refresh,
    fetchPatientDetail,
    fetchProjectDetail,
  }
}

export default useProjectPatientData
