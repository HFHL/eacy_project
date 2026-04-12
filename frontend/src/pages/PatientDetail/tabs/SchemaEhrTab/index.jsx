/**
 * Schema驱动的电子病历Tab组件
 * 基于JSON Schema渲染表单，支持两阶段保存
 * 三栏布局：左侧目录 + 中间表单 + 右侧文档溯源
 */
import React, { useState, useEffect, useCallback } from 'react'
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
import { getPatientEhrSchemaData, updatePatientEhrSchemaData } from '../../../../api/patient'

const { Text } = Typography

/**
 * 解析Schema中的$defs为enums格式
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
 * Schema驱动的EhrTab组件
 */
const SchemaEhrTab = ({
  // Schema配置
  schemaPath = '/schema/patient_ehr-V2.schema.json',
  patientId = null,
  
  // 患者数据
  patientData = null,
  
  // 事件回调
  onSave,
  onDataChange,
  
  // 配置选项
  autoSaveInterval = 30000,
  siderWidth = 220, // 减小左侧宽度
  sourcePanelWidth,
  collapsible = true,
  showSourcePanel = true // 显示右侧溯源面板
}) => {
  // 状态管理
  const [schema, setSchema] = useState(null)
  const [enums, setEnums] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localPatientData, setLocalPatientData] = useState(patientData)
  
  // 加载Schema
  useEffect(() => {
    loadSchema()
  }, [schemaPath])
  
  // 当外部patientData变化时更新本地数据
  useEffect(() => {
    if (patientData) {
      setLocalPatientData(patientData)
    }
  }, [patientData])
  
  // 加载Schema文件
  const loadSchema = useCallback(async () => {
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
          loadedData = response.data.data
        } else {
          const schemaModule = await import('../../../../data/patient_ehr-V2.schema.json')
          loadedSchema = schemaModule.default
          message.warning(response?.message || '后端 Schema 获取失败，已使用本地Schema')
        }
      } else {
        const schemaModule = await import('../../../../data/patient_ehr-V2.schema.json')
        loadedSchema = schemaModule.default
      }
      
      // 解析enums
      const parsedEnums = parseDefsToEnums(loadedSchema)
      
      setSchema(loadedSchema)
      setEnums(parsedEnums)
      
      // 如果没有传入patientData，使用后端数据或 空对象
      if (!patientData) {
        if (loadedData) {
          setLocalPatientData(loadedData)
        } else {
          setLocalPatientData({})
        }
      }
      
      console.log('✅ Schema加载成功:', loadedSchema.$id)
      console.log('📋 Enums数量:', Object.keys(parsedEnums).length)
      
    } catch (err) {
      try {
        const schemaModule = await import('../../../../data/patient_ehr-V2.schema.json')
        const fallbackSchema = schemaModule.default
        const parsedEnums = parseDefsToEnums(fallbackSchema)
        setSchema(fallbackSchema)
        setEnums(parsedEnums)
        if (!patientData) {
          setLocalPatientData({})
        }
        message.warning('Schema请求失败，已回退到本地Schema')
      } catch (fallbackError) {
        console.error('❌ Schema加载失败:', err)
        setError(err.message || 'Schema加载失败')
      }
    } finally {
      setLoading(false)
    }
  }, [schemaPath, patientData, patientId])
  
  // 处理保存：有 patientId 时调用后端更新接口，再同步本地与回调
  const handleSave = useCallback(async (data, type) => {
    if (patientId) {
      try {
        await updatePatientEhrSchemaData(patientId, data)
      } catch (err) {
        throw err
      }
    }

    if (onSave) {
      await onSave(data, type)
    }

    setLocalPatientData(data)

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
  
  return (
    <div style={{ minHeight: 400 }}>
      <SchemaForm
        schema={schema}
        enums={enums}
        patientData={localPatientData}
        patientId={patientId}
        onSave={handleSave}
        onReset={handleReset}
        autoSaveInterval={autoSaveInterval}
        siderWidth={siderWidth}
        sourcePanelWidth={sourcePanelWidth}
        collapsible={collapsible}
        showSourcePanel={showSourcePanel}
        contentAdaptive
        style={{ minHeight: 500, height: 'auto' }}
      />
    </div>
  )
}

export default SchemaEhrTab
