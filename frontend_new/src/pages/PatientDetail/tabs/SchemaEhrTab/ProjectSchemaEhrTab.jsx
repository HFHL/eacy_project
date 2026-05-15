/**
 * 项目模式的Schema驱动电子病历Tab组件
 * 基于SchemaEhrTab扩展，增加项目特定功能：
 * - 文档列表管理
 * - 可重复表单实例添加
 * - 项目配置支持
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { 
  Alert, 
  Spin, 
  message,
  Space,
  Button,
  Typography
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import SchemaForm from '../../../../components/SchemaForm'
import {
  parseSchemaDefsToEnums,
  createSchemaFormLayoutProps,
  PROJECT_SCHEMA_FORM_LAYOUT_DEFAULTS
} from './schemaFormShared'

const { Text } = Typography
/**
 * 三栏固定高度：最小 500，常规随视口自适应，最大 760。
 * @type {string}
 */
const FIXED_SCHEMA_PANEL_HEIGHT = 'clamp(760px, calc(100vh - 260px), 1000px)'

/**
 * 项目模式Schema驱动EhrTab组件
 * @param {Object} props - 组件属性
 */
const ProjectSchemaEhrTab = ({
  // 项目信息
  projectId,
  projectName = '研究项目',

  // Schema配置
  schemaPath = '/schema/siyuan_project.schema.json',
  schemaData = null,  // 直接传入schema对象
  // 外部托管的 schema 加载状态（父组件已经在拉模板时使用，避免子组件再发一次请求）
  schemaLoading,
  schemaError,
  onReloadSchema,

  // 患者数据
  patientData = null,
  patientId = null,
  sourcePatientId = null,

  // 项目文档
  projectDocuments = [],

  // 事件回调
  onSave,
  onDataChange,
  onDocumentSelect,
  onUploadDocument,
  onFieldCandidateSolidified,
  externalHistoryRefreshKey = 0,

  // 配置选项
  autoSaveInterval = 30000,
  siderWidth = PROJECT_SCHEMA_FORM_LAYOUT_DEFAULTS.siderWidth,
  sourcePanelWidth,
  collapsible = PROJECT_SCHEMA_FORM_LAYOUT_DEFAULTS.collapsible,
  showSourcePanel = PROJECT_SCHEMA_FORM_LAYOUT_DEFAULTS.showSourcePanel,
  collapsedTitle = PROJECT_SCHEMA_FORM_LAYOUT_DEFAULTS.collapsedTitle
}) => {
  // 当传入 projectId 时,父组件负责拉取项目模板 schema,这里不再重复发请求
  const isSchemaManagedByParent = Boolean(projectId)

  // 状态管理
  const [schema, setSchema] = useState(schemaData)
  const [enums, setEnums] = useState({})
  const [loading, setLoading] = useState(
    isSchemaManagedByParent ? Boolean(schemaLoading) : !schemaData,
  )
  const [error, setError] = useState(null)
  const [localPatientData, setLocalPatientData] = useState(patientData)
  const [selectedDocument, setSelectedDocument] = useState(null)

  // 加载Schema
  useEffect(() => {
    if (schemaData) {
      // 直接使用传入的schema
      const parsedEnums = parseSchemaDefsToEnums(schemaData)
      setSchema(schemaData)
      setEnums(parsedEnums)
      setError(null)
      return
    }
    if (isSchemaManagedByParent) {
      // 父组件托管:schema 还在拉/拉失败时,只清空本地 schema 即可,
      // loading/error 通过 schemaLoading/schemaError 透出
      setSchema(null)
      setEnums({})
      return
    }
    loadSchema()
  }, [schemaPath, schemaData, isSchemaManagedByParent])
  
  // 当外部patientData变化时更新本地数据
  useEffect(() => {
    if (patientData) {
      setLocalPatientData(patientData)
    }
  }, [patientData])
  
  /**
   * 加载默认 Schema 文件(仅在没有 projectId 时用,projectId 模式由父组件托管)
   */
  const loadSchema = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const schemaModule = await import('../../../../data/patient_ehr-V2.schema.json')
      const loadedSchema = schemaModule.default

      const parsedEnums = parseSchemaDefsToEnums(loadedSchema)
      setSchema(loadedSchema)
      setEnums(parsedEnums)

      if (!patientData) {
        setLocalPatientData({})
      }
    } catch (err) {
      console.error('❌ 默认 Schema 加载失败:', err)
      setError(err.message || 'Schema加载失败')
    } finally {
      setLoading(false)
    }
  }, [schemaPath, patientData])
  
  /**
   * 处理保存
   */
  const handleSave = useCallback(async (data, type) => {
    if (onSave) {
      try {
        await onSave(data, type)
      } catch (error) {
        console.error('[ProjectSchemaEhrTab] Save failed:', error)
        throw error
      }
    }

    // 更新本地数据
    setLocalPatientData(data)

    if (onDataChange) {
      onDataChange(data)
    }
  }, [onSave, onDataChange])
  
  /**
   * 处理重置
   */
  const handleReset = useCallback(() => {
    if (patientData) {
      setLocalPatientData(patientData)
    }
  }, [patientData])
  
  /**
   * 处理文档选择
   */
  const handleDocumentSelect = useCallback((doc) => {
    setSelectedDocument(doc)
    if (onDocumentSelect) {
      onDocumentSelect(doc)
    }
  }, [onDocumentSelect])
  
  /**
   * 处理添加可重复表单实例
   * 注意：实际数据添加已由 CategoryTree 通过 SchemaFormContext.actions.addRepeatableItem 完成
   * 此回调仅用于日志记录和外部通知
   */
  const handleAddRepeatableInstance = useCallback((path, newName, index) => {
    console.log('➕ 表单实例已添加:', { path, newName, index })
    // 数据已通过 SchemaFormContext 更新，无需在此处理
  }, [])
  
  // 项目配置
  const projectConfig = useMemo(() => ({
    documents: projectDocuments,
    selectedDocument,
    onDocumentSelect: handleDocumentSelect,
    onUploadDocument,
    onAddRepeatableInstance: handleAddRepeatableInstance,
    repeatableNamingPattern: '{formName}_{index}',
    sourcePatientId
  }), [projectDocuments, selectedDocument, handleDocumentSelect, onUploadDocument, handleAddRepeatableInstance, sourcePatientId])
  
  // 加载/错误状态:projectId 模式下完全跟随父组件,默认 schema 模式下沿用本地状态
  const effectiveLoading = isSchemaManagedByParent ? Boolean(schemaLoading) : loading
  const effectiveError = isSchemaManagedByParent ? (schemaError || null) : error
  const handleReload = isSchemaManagedByParent
    ? (onReloadSchema || (() => {}))
    : loadSchema

  // 渲染加载状态
  if (effectiveLoading) {
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
        <Text type="secondary">正在加载项目Schema配置...</Text>
      </div>
    )
  }

  // 渲染错误状态
  if (effectiveError) {
    return (
      <Alert
        message="项目Schema加载失败"
        description={
          <Space direction="vertical">
            <Text>{effectiveError}</Text>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleReload}
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
    PROJECT_SCHEMA_FORM_LAYOUT_DEFAULTS,
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
          projectId={projectId}
          externalHistoryRefreshKey={externalHistoryRefreshKey}
          onSave={handleSave}
          onReset={handleReset}
          onDataChange={onDataChange}
          onFieldCandidateSolidified={onFieldCandidateSolidified}
          autoSaveInterval={autoSaveInterval}
          {...schemaFormLayoutProps}
          projectMode={true}
          projectConfig={projectConfig}
          style={{ height: '100%', minHeight: 0 }}
        />
      </div>
    </div>
  )
}

export default ProjectSchemaEhrTab
