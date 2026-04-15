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
  Typography,
  Modal
} from 'antd'
import { ReloadOutlined, DatabaseOutlined, PlusOutlined } from '@ant-design/icons'
import SchemaForm from '../../../../components/SchemaForm'
import { getProjectTemplate } from '../../../../api/crfTemplate'

const { Text } = Typography

/**
 * 解析Schema中的$defs为enums格式
 * @param {Object} schema - JSON Schema
 * @returns {Object} 解析后的枚举对象
 */
function parseDefsToEnums(schema) {
  const enums = {}
  if (schema?.$defs) {
    for (const [enumId, enumDef] of Object.entries(schema.$defs)) {
      if (enumDef.enum) {
        enums[enumId] = {
          id: enumId,
          type: enumDef.type || 'string',
          values: [...enumDef.enum]
        }
      }
    }
  }
  return enums
}

/**
 * 获取嵌套值
 * @param {Object} obj - 对象
 * @param {string} path - 路径
 * @returns {*} 值
 */
function getNestedValue(obj, path) {
  if (!path || !obj) return undefined
  const keys = path.split('.')
  let result = obj
  for (const key of keys) {
    if (result == null) return undefined
    result = result[key]
  }
  return result
}

/**
 * 设置嵌套值
 * @param {Object} obj - 对象
 * @param {string} path - 路径
 * @param {*} value - 值
 * @returns {Object} 新对象
 */
function setNestedValue(obj, path, value) {
  if (!path) return obj
  
  const keys = path.split('.')
  const result = JSON.parse(JSON.stringify(obj || {}))
  
  let current = result
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (current[key] === undefined) {
      current[key] = {}
    }
    current = current[key]
  }
  
  current[keys[keys.length - 1]] = value
  return result
}

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
  
  // 患者数据
  patientData = null,
  patientId = null,
  
  // 项目文档
  projectDocuments = [],
  
  // 事件回调
  onSave,
  onDataChange,
  onDocumentSelect,
  onUploadDocument,
  
  // 配置选项
  autoSaveInterval = 30000,
  siderWidth = 220,
  sourcePanelWidth,
  collapsible = true,
  showSourcePanel = true
}) => {
  // 状态管理
  const [schema, setSchema] = useState(schemaData)
  const [enums, setEnums] = useState({})
  const [loading, setLoading] = useState(!schemaData)
  const [error, setError] = useState(null)
  const [localPatientData, setLocalPatientData] = useState(patientData)
  const [selectedDocument, setSelectedDocument] = useState(null)
  
  // 加载Schema
  useEffect(() => {
    if (schemaData) {
      // 直接使用传入的schema
      const parsedEnums = parseDefsToEnums(schemaData)
      setSchema(schemaData)
      setEnums(parsedEnums)
      setLoading(false)
    } else {
      loadSchema()
    }
  }, [schemaPath, schemaData])
  
  // 当外部patientData变化时更新本地数据
  useEffect(() => {
    if (patientData) {
      setLocalPatientData(patientData)
    }
  }, [patientData])
  
  /**
   * 加载Schema文件
   */
  const loadSchema = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      let loadedSchema = null
      let mockData = null
      
      if (projectId) {
        const response = await getProjectTemplate(projectId)
        if (!response?.success || !response.data) {
          throw new Error(response?.message || '项目模板获取失败')
        }
        const template = response.data
        loadedSchema = template.schema_json || template.schema
        if (!loadedSchema) {
          const layoutConfig = template.layout_config || {}
          loadedSchema = layoutConfig.schema_json || layoutConfig.schema
        }
        if (!loadedSchema) {
          throw new Error('项目模板未包含 schema_json')
        }
      } else {
        const schemaModule = await import('../../../../data/patient_ehr-V2.schema.json')
        loadedSchema = schemaModule.default
      }
      
      if (!patientData) {
        const mockDataModule = await import('../../../../data/mockPatientData.json')
        mockData = mockDataModule.default
      }
      
      // 解析enums
      const parsedEnums = parseDefsToEnums(loadedSchema)
      
      setSchema(loadedSchema)
      setEnums(parsedEnums)
      
      // 如果没有传入patientData，使用mock数据
      if (!patientData && mockData) {
        setLocalPatientData(mockData)
      }
      
      console.log('✅ 项目Schema加载成功:', loadedSchema.$id)
      console.log('📋 Enums数量:', Object.keys(parsedEnums).length)
      
    } catch (err) {
      console.error('❌ 项目Schema加载失败:', err)
      setError(err.message || 'Schema加载失败')
    } finally {
      setLoading(false)
    }
  }, [schemaPath, patientData, projectId])
  
  /**
   * 处理保存
   */
  const handleSave = useCallback(async (data, type) => {
    console.log(`💾 保存项目数据 (${type}):`, data)
    
    if (onSave) {
      await onSave(data, type)
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
    repeatableNamingPattern: '{formName}_{index}'
  }), [projectDocuments, selectedDocument, handleDocumentSelect, onUploadDocument, handleAddRepeatableInstance])
  
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
        <Text type="secondary">正在加载项目Schema配置...</Text>
      </div>
    )
  }
  
  // 渲染错误状态
  if (error) {
    return (
      <Alert
        message="项目Schema加载失败"
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
  
  return (
    <div style={{ minHeight: 400 }}>
      <SchemaForm
        schema={schema}
        enums={enums}
        patientData={localPatientData}
        patientId={patientId}
        projectId={projectId}
        onSave={handleSave}
        onReset={handleReset}
        autoSaveInterval={autoSaveInterval}
        siderWidth={siderWidth}
        sourcePanelWidth={sourcePanelWidth}
        collapsible={collapsible}
        showSourcePanel={showSourcePanel}
        projectMode={true}
        projectConfig={projectConfig}
        contentAdaptive
        style={{ minHeight: 500, height: 'auto' }}
      />
    </div>
  )
}

export default ProjectSchemaEhrTab

