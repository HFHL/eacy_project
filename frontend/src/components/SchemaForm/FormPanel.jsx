/**
 * 表单面板组件
 * 根据选中的表单路径渲染所有字段（一行一字段模式）
 * 支持嵌套Table表单至少展开2层
 * 点击字段卡片选中+定位溯源
 */
import React, { useMemo, useCallback, useState } from 'react'
import {
  Card,
  Typography,
  Empty,
  Breadcrumb,
  Divider,
  Space,
  Tag,
  Alert,
  Button
} from 'antd'
import {
  FormOutlined,
  HomeOutlined,
  RightOutlined,
  InfoCircleOutlined,
  PlusOutlined
} from '@ant-design/icons'
import FieldRenderer from './FieldRenderer'
import RepeatableForm, { createEmptyRecord } from './RepeatableForm'
import { useSchemaForm, getNestedValue } from './SchemaFormContext'

const { Title, Text } = Typography

function hasAnyData(data) {
  if (data == null) return false
  if (Array.isArray(data)) return data.length > 0
  if (typeof data === 'object') {
    return Object.values(data).some((value) => hasAnyData(value))
  }
  return data !== ''
}

/**
 * 从路径获取Schema节点
 * 支持数组索引路径（如 '检验检查.血常规.0'）
 * 返回 { schema, isArrayInstance, instanceIndex, parentArrayPath }
 */
function getSchemaAtPath(schema, path) {
  if (!path || !schema) return null
  
  const keys = path.split('.')
  let current = schema
  let isArrayInstance = false
  let instanceIndex = null
  let parentArrayPath = null
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (!current) return null
    
    // 检查是否为数组索引
    if (/^\d+$/.test(key)) {
      // 数字索引：当前 schema 应该是数组类型，返回 items 的 schema
      if (current.type === 'array' && current.items) {
        isArrayInstance = true
        instanceIndex = parseInt(key, 10)
        parentArrayPath = keys.slice(0, i).join('.')
        current = current.items
      } else {
        return null
      }
    } else if (current.properties && current.properties[key]) {
      // 处理 properties
      current = current.properties[key]
    } else if (current.items?.properties && current.items.properties[key]) {
      // 处理 array 内的 properties
      current = current.items.properties[key]
    } else {
      return null
    }
  }
  
  return { 
    schema: current, 
    isArrayInstance, 
    instanceIndex, 
    parentArrayPath 
  }
}

/**
 * 面包屑导航
 */
const FormBreadcrumb = ({ path }) => {
  const parts = path ? path.split('.') : []
  
  return (
    <Breadcrumb
      separator={<RightOutlined style={{ fontSize: 10 }} />}
      items={[
        {
          title: (
            <Space size={4}>
              <HomeOutlined />
              <span>电子病历</span>
            </Space>
          )
        },
        ...parts.map((part, index) => ({
          title: part
        }))
      ]}
      style={{ marginBottom: 12 }}
    />
  )
}

/**
 * 表单头部信息
 */
const FormHeader = ({ title, schemaNode }) => {
  const mergeBinding = schemaNode?.['x-merge-binding']
  const sources = schemaNode?.['x-sources']
  
  return (
    <div style={{ marginBottom: 16 }}>
      <Title level={4} style={{ marginBottom: 8, fontSize: 18 }}>
        <FormOutlined style={{ marginRight: 8, color: '#1890ff' }} />
        {title}
      </Title>
      
      {false && (mergeBinding || sources) && (
        <Space wrap style={{ marginTop: 8 }}>
          {mergeBinding && (
            <Tag color="blue" icon={<InfoCircleOutlined />}>
              合并规则: {mergeBinding}
            </Tag>
          )}
          {sources?.primary && sources.primary.length > 0 && (
            <Tag color="green">
              主要来源: {sources.primary.join(', ')}
            </Tag>
          )}
          {sources?.secondary && sources.secondary.length > 0 && (
            <Tag color="orange">
              次要来源: {sources.secondary.join(', ')}
            </Tag>
          )}
        </Space>
      )}
    </div>
  )
}

/**
 * 嵌套对象区块渲染（用于Object类型的嵌套）
 */
const NestedObjectSection = ({ 
  title, 
  schemaNode, 
  path, 
  data, 
  onFieldChange,
  onFieldSelect,
  selectedFieldPath,
  level = 1 
}) => {
  const { enums } = useSchemaForm()
  
  if (!schemaNode?.properties) return null
  
  const requiredFields = schemaNode.required || []
  
  // 分离简单字段和嵌套结构
  const { simpleFields, nestedArrays, nestedObjects } = useMemo(() => {
    const simple = []
    const arrays = []
    const objects = []
    
    for (const [fieldName, fieldSchema] of Object.entries(schemaNode.properties)) {
      if (fieldSchema.type === 'array' && fieldSchema.items?.properties) {
        arrays.push({ fieldName, fieldSchema })
      } else if (fieldSchema.type === 'object' && fieldSchema.properties) {
        objects.push({ fieldName, fieldSchema })
      } else {
        simple.push({ fieldName, fieldSchema })
      }
    }
    
    return { simpleFields: simple, nestedArrays: arrays, nestedObjects: objects }
  }, [schemaNode.properties])
  
  return (
    <Card
      size="small"
      title={
        <Space>
          <FormOutlined style={{ color: '#52c41a' }} />
          <Text strong>{title}</Text>
        </Space>
      }
      style={{ 
        marginBottom: 16,
        borderRadius: 8,
        border: `1px solid ${level === 1 ? '#e8e8e8' : '#f0f0f0'}`,
        background: level === 1 ? '#fff' : '#fafafa'
      }}
      bodyStyle={{ padding: 16 }}
    >
      {/* 简单字段 - 一行一字段 */}
      {simpleFields.map(({ fieldName, fieldSchema }) => {
        const fieldPath = `${path}.${fieldName}`
        return (
          <FieldRenderer
            key={fieldName}
            fieldName={fieldName}
            fieldSchema={fieldSchema}
            path={fieldPath}
            value={data?.[fieldName]}
            onChange={(value) => onFieldChange(fieldName, value)}
            required={requiredFields.includes(fieldName)}
            onSourceClick={onFieldSelect}
            isSelected={selectedFieldPath === fieldPath}
          />
        )
      })}
      
      {/* 嵌套对象 - 递归渲染（最多2层） */}
      {level < 2 && nestedObjects.map(({ fieldName, fieldSchema }) => (
        <NestedObjectSection
          key={fieldName}
          title={fieldName}
          schemaNode={fieldSchema}
          path={`${path}.${fieldName}`}
          data={data?.[fieldName] || {}}
          onFieldChange={(subField, value) => {
            const newData = { ...(data?.[fieldName] || {}), [subField]: value }
            onFieldChange(fieldName, newData)
          }}
          onFieldSelect={onFieldSelect}
          selectedFieldPath={selectedFieldPath}
          level={level + 1}
        />
      ))}
      
      {/* 嵌套数组 - 使用RepeatableForm */}
      {nestedArrays.map(({ fieldName, fieldSchema }) => (
        <RepeatableForm
          key={fieldName}
          title={fieldName}
          arraySchema={fieldSchema}
          path={`${path}.${fieldName}`}
          data={data?.[fieldName] || []}
          onDataChange={(newData) => onFieldChange(fieldName, newData)}
          onSourceClick={onFieldSelect}
          selectedFieldPath={selectedFieldPath}
          defaultExpanded={level < 2}
        />
      ))}
    </Card>
  )
}

/**
 * 完整表单渲染器（选中表单后展开所有字段）
 */
const FullFormRenderer = ({ schemaNode, path, data, onFieldChange, onFieldSelect, selectedFieldPath }) => {
  const { enums } = useSchemaForm()
  
  if (!schemaNode?.properties) return null
  
  const requiredFields = schemaNode.required || []
  
  // 分离简单字段和嵌套结构
  const { simpleFields, nestedArrays, nestedObjects } = useMemo(() => {
    const simple = []
    const arrays = []
    const objects = []
    
    for (const [fieldName, fieldSchema] of Object.entries(schemaNode.properties)) {
      if (fieldSchema.type === 'array' && fieldSchema.items?.properties) {
        arrays.push({ fieldName, fieldSchema })
      } else if (fieldSchema.type === 'object' && fieldSchema.properties) {
        objects.push({ fieldName, fieldSchema })
      } else {
        simple.push({ fieldName, fieldSchema })
      }
    }
    
    return { simpleFields: simple, nestedArrays: arrays, nestedObjects: objects }
  }, [schemaNode.properties])
  
  return (
    <div>
      {/* 简单字段区域 - 一行一字段 */}
      {simpleFields.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          {simpleFields.map(({ fieldName, fieldSchema }) => {
            const fieldPath = `${path}.${fieldName}`
            return (
              <FieldRenderer
                key={fieldName}
                fieldName={fieldName}
                fieldSchema={fieldSchema}
                path={fieldPath}
                value={data?.[fieldName]}
                onChange={(value) => onFieldChange(fieldName, value)}
                required={requiredFields.includes(fieldName)}
                onSourceClick={onFieldSelect}
                isSelected={selectedFieldPath === fieldPath}
              />
            )
          })}
        </div>
      )}
      
      {/* 嵌套对象区域 */}
      {nestedObjects.map(({ fieldName, fieldSchema }) => (
        <NestedObjectSection
          key={fieldName}
          title={fieldName}
          schemaNode={fieldSchema}
          path={`${path}.${fieldName}`}
          data={data?.[fieldName] || {}}
          onFieldChange={(subField, value) => {
            const newData = { ...(data?.[fieldName] || {}), [subField]: value }
            onFieldChange(fieldName, newData)
          }}
          onFieldSelect={onFieldSelect}
          selectedFieldPath={selectedFieldPath}
          level={1}
        />
      ))}
      
      {/* 嵌套数组区域 - 可重复表单（展开至少2层） */}
      {nestedArrays.map(({ fieldName, fieldSchema }) => (
        <RepeatableForm
          key={fieldName}
          title={fieldName}
          arraySchema={fieldSchema}
          path={`${path}.${fieldName}`}
          data={data?.[fieldName] || []}
          onDataChange={(newData) => onFieldChange(fieldName, newData)}
          onSourceClick={onFieldSelect}
          selectedFieldPath={selectedFieldPath}
          defaultExpanded={true}
        />
      ))}
    </div>
  )
}

/**
 * 空状态提示
 */
const EmptyStateHint = () => (
  <div style={{
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#999',
    padding: 40
  }}>
    <FormOutlined style={{ fontSize: 64, marginBottom: 24, color: '#d9d9d9' }} />
    <Title level={4} style={{ color: '#666', marginBottom: 8 }}>
      请从左侧目录选择表单
    </Title>
    <Text type="secondary">
      点击任意表单名称，将展示该表单下的所有字段
    </Text>
  </div>
)

const EmptyFormMask = ({ isRepeatable, onActivate }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(255, 255, 255, 0.82)',
      backdropFilter: 'blur(4px)',
      borderRadius: 8,
      zIndex: 2,
      padding: 24,
    }}
  >
    <div
      style={{
        width: 'min(420px, 100%)',
        textAlign: 'center',
        padding: '32px 24px',
        borderRadius: 16,
        border: '1px solid #e6f4ff',
        background: 'rgba(255, 255, 255, 0.95)',
        boxShadow: '0 16px 40px rgba(24, 144, 255, 0.08)',
      }}
    >
      <FormOutlined style={{ fontSize: 40, color: '#1677ff', marginBottom: 16 }} />
      <Title level={4} style={{ marginBottom: 8 }}>
        {isRepeatable ? '当前表单暂无记录' : '当前表单尚未填写'}
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        点击下方按钮后，再进入对应空表单进行填写。
      </Text>
      <Button type="primary" icon={<PlusOutlined />} size="large" onClick={onActivate}>
        添加记录
      </Button>
    </div>
  </div>
)

/**
 * 表单面板主组件
 */
const FormPanel = ({ 
  style,
  onPathChange,
  onFieldSelect
}) => {
  const { 
    schema, 
    draftData, 
    selectedPath, 
    actions,
    isDirty 
  } = useSchemaForm()
  
  // 当前选中的字段路径（用于高亮显示）
  const [selectedFieldPath, setSelectedFieldPath] = useState(null)
  const [emptyMaskDismissed, setEmptyMaskDismissed] = useState(false)

  React.useEffect(() => {
    setSelectedFieldPath(null)
    setEmptyMaskDismissed(false)
  }, [selectedPath])
  
  // 获取当前路径的Schema节点和元信息
  const schemaInfo = useMemo(() => {
    if (!selectedPath) return null
    return getSchemaAtPath(schema, selectedPath)
  }, [schema, selectedPath])
  
  // 提取 schema 对象（兼容旧代码）
  const currentSchema = schemaInfo?.schema || null
  
  // 是否为数组实例（可重复表单的单条记录）
  const isArrayInstance = schemaInfo?.isArrayInstance || false
  const instanceIndex = schemaInfo?.instanceIndex
  
  // 获取当前路径的数据
  const currentData = useMemo(() => {
    if (!selectedPath) return null
    return getNestedValue(draftData, selectedPath)
  }, [draftData, selectedPath])

  const isCurrentEmpty = useMemo(() => {
    if (!currentSchema || !selectedPath) return false
    if (currentSchema.type === 'array' && currentSchema.items?.properties) {
      return !Array.isArray(currentData) || currentData.length === 0
    }
    if (currentSchema.type === 'object' && currentSchema.properties) {
      return !hasAnyData(currentData)
    }
    return false
  }, [currentSchema, currentData, selectedPath])

  const shouldShowEmptyMask = !isArrayInstance && isCurrentEmpty && !emptyMaskDismissed
  
  // 获取当前标题
  const currentTitle = useMemo(() => {
    if (!selectedPath) return ''
    const parts = selectedPath.split('.')
    
    // 如果是数组实例，标题格式：{表单名}_{序号}
    if (isArrayInstance && instanceIndex !== null) {
      // 找到表单名（倒数第二个非数字部分）
      const formNameParts = []
      for (let i = parts.length - 1; i >= 0; i--) {
        if (!/^\d+$/.test(parts[i])) {
          formNameParts.unshift(parts[i])
          break
        }
      }
      const formName = formNameParts[0] || parts[parts.length - 2]
      const simpleName = formName.replace(/检查报告单|报告单|记录单|记录/g, '')
      return `${simpleName}_${instanceIndex + 1}`
    }
    
    return parts[parts.length - 1]
  }, [selectedPath, isArrayInstance, instanceIndex])
  
  // 处理字段值变化
  const handleFieldChange = useCallback((fieldName, value) => {
    const fullPath = selectedPath ? `${selectedPath}.${fieldName}` : fieldName
    actions.updateFieldValue(fullPath, value)
  }, [selectedPath, actions])
  
  // 处理数组数据变化
  const handleArrayChange = useCallback((newData) => {
    actions.updateFieldValue(selectedPath, newData)
  }, [selectedPath, actions])

  const handleActivateEmptyForm = useCallback(() => {
    if (!selectedPath || !currentSchema) return

    if (currentSchema.type === 'array' && currentSchema.items?.properties) {
      actions.addRepeatableItem(selectedPath, createEmptyRecord(currentSchema.items))
      setTimeout(() => {
        actions.setSelectedPath(`${selectedPath}.0`)
      }, 0)
      return
    }

    setEmptyMaskDismissed(true)
  }, [actions, currentSchema, selectedPath])

  // 处理字段选中（溯源定位）
  const handleFieldSelectInternal = useCallback((path, schema) => {
    // 更新选中状态
    setSelectedFieldPath(path)
    // 通知外部（打开溯源面板等）
    if (onFieldSelect) {
      onFieldSelect(path, schema)
    }
    // 8秒后清除选中状态
    setTimeout(() => setSelectedFieldPath(null), 8000)
  }, [onFieldSelect])
  
  if (!schema) {
    return (
      <div style={{ 
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}>
        <Empty description="请加载Schema" />
      </div>
    )
  }
  
  // 未选择表单时显示提示
  if (!selectedPath) {
    return (
      <div style={{ 
        height: '100%',
        background: '#fff',
        borderRadius: 8,
        ...style
      }}>
        <EmptyStateHint />
      </div>
    )
  }
  
  let content = <Empty description="不支持的Schema类型" />

  if (!currentSchema) {
    content = <Empty description="未找到对应的Schema定义" />
  } else if (isArrayInstance && currentSchema.type === 'object' && currentSchema.properties) {
    content = (
      <FullFormRenderer
        schemaNode={currentSchema}
        path={selectedPath}
        data={currentData || {}}
        onFieldChange={handleFieldChange}
        onFieldSelect={handleFieldSelectInternal}
        selectedFieldPath={selectedFieldPath}
      />
    )
  } else if (currentSchema.type === 'array' && currentSchema.items?.properties) {
    content = (
      <RepeatableForm
        title={currentTitle}
        arraySchema={currentSchema}
        path={selectedPath}
        data={Array.isArray(currentData) ? currentData : []}
        onDataChange={handleArrayChange}
        onSourceClick={handleFieldSelectInternal}
        selectedFieldPath={selectedFieldPath}
        defaultExpanded={true}
      />
    )
  } else if (currentSchema.type === 'object' && currentSchema.properties) {
    content = (
      <FullFormRenderer
        schemaNode={currentSchema}
        path={selectedPath}
        data={currentData || {}}
        onFieldChange={handleFieldChange}
        onFieldSelect={handleFieldSelectInternal}
        selectedFieldPath={selectedFieldPath}
      />
    )
  }

  return (
    <div 
      className="schema-form-scrollable"
      style={{ 
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 16,
        background: '#fff',
        borderRadius: 8,
        ...style
      }}
    >
      {/* 面包屑导航 */}
      <FormBreadcrumb path={selectedPath} />
      
      {/* 未修改提示 */}
      {isDirty && (
        <Alert
          message="有未保存的修改"
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 12 }}
        />
      )}
      
      {/* 表单头部 */}
      <FormHeader title={currentTitle} schemaNode={currentSchema} />
      
      <Divider style={{ margin: '12px 0 16px' }} />

      <div style={{ position: 'relative', minHeight: 320 }}>
        <div
          style={shouldShowEmptyMask ? {
            opacity: 0.25,
            filter: 'blur(2px)',
            pointerEvents: 'none',
            userSelect: 'none',
          } : undefined}
        >
          {content}
        </div>
        {shouldShowEmptyMask && (
          <EmptyFormMask
            isRepeatable={currentSchema?.type === 'array'}
            onActivate={handleActivateEmptyForm}
          />
        )}
      </div>
    </div>
  )
}

export default FormPanel
export { getSchemaAtPath }
