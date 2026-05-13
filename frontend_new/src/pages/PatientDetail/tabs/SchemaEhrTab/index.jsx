/**
 * Schema驱动的电子病历Tab组件
 * 基于JSON Schema渲染表单，支持两阶段保存
 * 三栏布局：左侧目录 + 中间表单 + 右侧文档溯源
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Alert, 
  Spin, 
  message,
  Space,
  Typography
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import SchemaForm from '../../../../components/SchemaForm'
import { getPatientEhrSchemaData, updatePatientEhrSchemaData } from '../../../../api/patient'
import {
  parseSchemaDefsToEnums,
  createSchemaFormLayoutProps,
  PATIENT_SCHEMA_FORM_LAYOUT_DEFAULTS
} from './schemaFormShared'

const { Text } = Typography
/**
 * 三栏固定高度：最小 500，常规随视口自适应，最大 760。
 * @type {string}
 */
const FIXED_SCHEMA_PANEL_HEIGHT = 'clamp(500px, calc(100vh - 260px), 760px)'

/**
 * Schema驱动的EhrTab组件
 */
const SchemaEhrTab = ({
  // Schema配置
  schemaPath = '/schema/patient_ehr-V2.schema.json',
  patientId = null,

  // 患者数据
  patientData = null,

  // 患者关联文档（用于文档抽取弹窗）
  patientDocuments = [],

  // 事件回调
  onSave,
  onDataChange,
  onUploadDocument,

  // 配置选项
  autoSaveInterval = 30000,
  siderWidth = PATIENT_SCHEMA_FORM_LAYOUT_DEFAULTS.siderWidth,
  sourcePanelWidth,
  collapsible = PATIENT_SCHEMA_FORM_LAYOUT_DEFAULTS.collapsible,
  showSourcePanel = PATIENT_SCHEMA_FORM_LAYOUT_DEFAULTS.showSourcePanel,
  collapsedTitle = PATIENT_SCHEMA_FORM_LAYOUT_DEFAULTS.collapsedTitle
}) => {
  // 状态管理
  const [schema, setSchema] = useState(null)
  const [enums, setEnums] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localPatientData, setLocalPatientData] = useState(patientData)
  const latestRequestIdRef = useRef(0)
  const savedPatientDataRef = useRef(patientData || {})
  
  /**
   * 判断当前异步请求是否仍为最新请求。
   *
   * @param {number} requestId 请求ID
   * @returns {boolean} 是否仍为最新请求
   */
  const isLatestRequest = useCallback((requestId) => latestRequestIdRef.current === requestId, [])
  
  /**
   * 加载 Schema 与患者数据。
   *
   * 说明：
   * - patientId 变化时必须重新拉取，避免沿用上一个患者的数据
   * - 使用请求序号防止竞态：仅最后一次请求可以落盘状态
   *
   * @returns {Promise<void>}
   */
  const loadSchema = useCallback(async () => {
    const requestId = latestRequestIdRef.current + 1
    latestRequestIdRef.current = requestId
    setLoading(true)
    setError(null)
    
    try {
      let loadedSchema = null
      let loadedData = null
      
      if (patientId) {
        const response = await getPatientEhrSchemaData(patientId)
        const schemaCandidate = response?.data?.schema
        const hasSchema =
          schemaCandidate &&
          typeof schemaCandidate === 'object' &&
          Object.keys(schemaCandidate.properties || {}).length > 0
        
        if (response?.success && hasSchema) {
          loadedSchema = schemaCandidate
          loadedData = response.data.data || {}
        } else {
          const schemaModule = await import('../../../../data/patient_ehr-V2.schema.json')
          loadedSchema = schemaModule.default
          message.warning(response?.message || '后端 Schema 获取失败，已使用本地Schema')
          loadedData = {}
        }
      } else {
        const schemaModule = await import('../../../../data/patient_ehr-V2.schema.json')
        loadedSchema = schemaModule.default
      }
      
      if (!isLatestRequest(requestId)) return
      
      // 解析enums
      const parsedEnums = parseSchemaDefsToEnums(loadedSchema)
      
      setSchema(loadedSchema)
      setEnums(parsedEnums)
      
      // 如果没有传入 patientData，按页面模式设置初始数据：
      if (!patientData) {
        if (loadedData && typeof loadedData === 'object') {
          setLocalPatientData(loadedData)
          savedPatientDataRef.current = loadedData
        } else {
          setLocalPatientData({})
          savedPatientDataRef.current = {}
        }
      } else {
        savedPatientDataRef.current = patientData
      }
      
      console.log('✅ Schema加载成功:', loadedSchema.$id)
      console.log('📋 Enums数量:', Object.keys(parsedEnums).length)
      
    } catch (err) {
      try {
        const schemaModule = await import('../../../../data/patient_ehr-V2.schema.json')
        const fallbackSchema = schemaModule.default
        const parsedEnums = parseSchemaDefsToEnums(fallbackSchema)
        
        if (!isLatestRequest(requestId)) return
        
        setSchema(fallbackSchema)
        setEnums(parsedEnums)
        if (!patientData) {
          setLocalPatientData({})
          savedPatientDataRef.current = {}
        } else {
          savedPatientDataRef.current = patientData
        }
        message.warning('Schema请求失败，已回退到本地Schema')
      } catch (fallbackError) {
        if (!isLatestRequest(requestId)) return
        console.error('❌ Schema加载失败:', err)
        setError(err.message || 'Schema加载失败')
      }
    } finally {
      if (!isLatestRequest(requestId)) return
      setLoading(false)
    }
  }, [schemaPath, patientData, patientId, isLatestRequest])
  
  // 加载Schema与患者数据（patientId 变化时必须重新拉取，避免沿用上一个患者的数据）
  useEffect(() => {
    loadSchema()
  }, [schemaPath, patientId])

  /**
   * 监听全局 `patient-detail-refresh` 事件（来源：
   *  - globalBackgroundTaskPoller 在 ehr_targeted_extract / patient_extract / ehr_folder_batch 终态时派发）
   * 仅当事件 patientId 与当前 Tab 一致时重新拉取 Schema 数据，
   * 让靶向抽取 / 病历夹更新完成后 EHR 表单内容自动刷新。
   */
  useEffect(() => {
    if (!patientId) return undefined
    const handleRefresh = (event) => {
      const targetPatientId = String(event?.detail?.patientId || '')
      if (!targetPatientId || String(patientId) !== targetPatientId) return
      loadSchema()
    }
    window.addEventListener('patient-detail-refresh', handleRefresh)
    return () => window.removeEventListener('patient-detail-refresh', handleRefresh)
  }, [patientId, loadSchema])

  // 当外部patientData变化时更新本地数据
  useEffect(() => {
    if (patientData) {
      setLocalPatientData(patientData)
      savedPatientDataRef.current = patientData
    }
  }, [patientData])
  
  // 处理保存：有 patientId 时调用后端更新接口，再同步本地与回调
  const handleSave = useCallback(async (data, type) => {
    if (patientId && type !== 'candidate') {
      try {
        await updatePatientEhrSchemaData(patientId, data, {
          previousData: savedPatientDataRef.current || {},
        })
      } catch (err) {
        throw err
      }
    }

    if (onSave) {
      await onSave(data, type)
    }

    setLocalPatientData(data)
    savedPatientDataRef.current = data

    if (onDataChange) {
      onDataChange(data)
    }
  }, [patientId, onSave, onDataChange])
  
  // 处理重置
  const handleReset = useCallback(() => {
    if (patientData) {
      setLocalPatientData(patientData)
    }
  }, [patientData])

  // 渲染加载状态
  if (loading) {
    return (
      <div style={{ 
        height: 500, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16
      }}>
        <Spin size="large" />
        <Text type="secondary">正在加载Schema配置...</Text>
      </div>
    )
  }
  
  // 渲染错误状态
  if (error) {
    return (
      <Alert
        message="Schema加载失败"
        description={
          <Space direction="vertical">
            <Text>{error}</Text>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={loadSchema}
              size="small"
            >
              重新加载
            </Button>
          </Space>
        }
        type="error"
        showIcon
        style={{ margin: 16 }}
      />
    )
  }
  
  const schemaFormLayoutProps = createSchemaFormLayoutProps(
    PATIENT_SCHEMA_FORM_LAYOUT_DEFAULTS,
    {
      siderWidth,
      sourcePanelWidth,
      collapsible,
      showSourcePanel,
      collapsedTitle
    }
  )

  return (
    <div
      style={{
        height: FIXED_SCHEMA_PANEL_HEIGHT,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <SchemaForm
          schema={schema}
          enums={enums}
          patientData={localPatientData}
          patientId={patientId}
          projectConfig={{ documents: patientDocuments }}
          onUploadDocument={onUploadDocument}
          onSave={handleSave}
          onReset={handleReset}
          autoSaveInterval={autoSaveInterval}
          {...schemaFormLayoutProps}
          style={{ height: '100%', minHeight: 0 }}
        />
      </div>
    </div>
  )
}

export default SchemaEhrTab
