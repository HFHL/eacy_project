/**
 * 表单面板组件
 * 根据选中的表单路径渲染所有字段（一行一字段模式）
 * 支持嵌套 Table/对象的递归展开
 * 点击字段卡片选中+定位溯源
 */
import React, { useMemo, useCallback, useState } from 'react'
import {
  Card,
  Typography,
  Empty,
  Space,
  Tag,
  Alert,
  Button,
  Tooltip
} from 'antd'
import {
  FormOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  SaveOutlined,
  UndoOutlined,
  CloudSyncOutlined,
  UploadOutlined,
  FileSearchOutlined
} from '@ant-design/icons'
import FieldRenderer from './FieldRenderer'
import RepeatableForm, { createEmptyRecord } from './RepeatableForm'
import { useSchemaForm, getNestedValue, orderedPropertyEntries } from './SchemaFormContext'
import { getSchemaAtPath, normalizeRepeatableTableSchema } from './schemaRenderKernel'
import { appThemeToken } from '../../styles/themeTokens'

const { Title, Text } = Typography
const HEADER_ICON_BUTTON_STYLE = {
  height: 24,
  minWidth: 24,
  padding: '0 8px',
  borderRadius: 6,
  border: `1px solid ${appThemeToken.colorBorder}`
}

function hasAnyData(data) {
  if (data == null) return false
  if (Array.isArray(data)) return data.length > 0
  if (typeof data === 'object') {
    return Object.values(data).some((value) => hasAnyData(value))
  }
  return data !== ''
}

/**
 * 表单头部信息
 */
const FormHeader = ({ title, schemaNode, actions = null }) => {
  const mergeBinding = schemaNode?.['x-merge-binding']
  const sources = schemaNode?.['x-sources']
  
  return (
    <div style={{
      height: 41,
      padding: '0 12px',
      borderBottom: `1px solid ${appThemeToken.colorBorder}`,
      background: appThemeToken.colorBgContainer,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <FormOutlined style={{ marginRight: 8, color: appThemeToken.colorPrimary, flexShrink: 0 }} />
        <Text strong style={{ fontSize: 14, color: appThemeToken.colorText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </Text>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{actions}</div>
      
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

  // ========== 关键修复：支持array类型的table字段 ==========
  // 对于array类型的table字段,使用items.properties
  const propertiesToIterate = schemaNode.type === 'array' && schemaNode.items?.properties
    ? schemaNode.items.properties
    : schemaNode.properties

  if (!propertiesToIterate) {
    console.log('[NestedObjectSection] 没有找到properties或items.properties，返回null')
    return null
  }

  const requiredFields = schemaNode.type === 'array' && schemaNode.items?.required
    ? schemaNode.items.required
    : (schemaNode.required || [])

  // path 含 .数字. 说明此对象是数组记录的子字段，日志表最低 path 即为当前 path
  // 此时 icon 放在标题，子字段不显示 icon
  const isInsideArray = /\.\d+\./.test(path)
  
  // 分离简单字段和嵌套结构
  const { simpleFields, nestedArrays, nestedObjects } = useMemo(() => {
    const simple = []
    const arrays = []
    const objects = []

    console.log('[FullFormRenderer] 开始分析字段，path:', path)

    for (const [fieldName, rawFieldSchema] of orderedPropertyEntries(propertiesToIterate, schemaNode.type === 'array' ? schemaNode.items : schemaNode)) {
      const fieldSchema = normalizeRepeatableTableSchema(rawFieldSchema)

      // ========== 调试日志：表格字段分析 ==========
      const isTableType = rawFieldSchema['x-display'] === 'table' || fieldSchema['x-display'] === 'table'
      const fieldNameLower = fieldName.toLowerCase()
      const isLikelyTable = fieldNameLower.includes('表') || fieldNameLower.includes('table') || isTableType

      if (isLikelyTable || isTableType) {
        console.group(`[FullFormRenderer] 表格字段分析: ${fieldName}`)
        console.log('原始Schema类型:', rawFieldSchema.type)
        console.log('标准化后类型:', fieldSchema.type)
        console.log('x-display:', rawFieldSchema['x-display'])
        console.log('x-row-constraint:', rawFieldSchema['x-row-constraint'])
        console.log('x-table-config:', rawFieldSchema['x-table-config'])
        console.log('x-extended-config:', rawFieldSchema['x-extended-config'])
        console.log('是否有 items:', !!fieldSchema.items)
        console.log('items.properties 是否存在:', !!fieldSchema.items?.properties)
        console.log('properties 是否存在:', !!fieldSchema.properties)
        console.log('判定结果:', {
          isArray: fieldSchema.type === 'array',
          hasItemsProperties: !!(fieldSchema.items?.properties),
          isObject: fieldSchema.type === 'object',
          hasProperties: !!fieldSchema.properties,
          最终归类: fieldSchema.type === 'array' && fieldSchema.items?.properties ? 'arrays' :
                    (fieldSchema.type === 'object' && fieldSchema.properties ? 'objects' : 'simple')
        })
        console.groupEnd()
      }

      if (fieldSchema.type === 'array' && fieldSchema.items?.properties) {
        arrays.push({ fieldName, fieldSchema })
      } else if (fieldSchema.type === 'object' && fieldSchema.properties) {
        objects.push({ fieldName, fieldSchema })
      } else {
        simple.push({ fieldName, fieldSchema })
      }
    }

    console.log('[FullFormRenderer] 字段分类统计:', {
      简单字段: simple.length,
      数组字段: arrays.length,
      对象字段: objects.length,
      数组字段列表: arrays.map(a => a.fieldName),
      对象字段列表: objects.map(o => o.fieldName)
    })

    return { simpleFields: simple, nestedArrays: arrays, nestedObjects: objects }
  }, [propertiesToIterate, path, schemaNode.type])
  
  return (
    <Card
      size="small"
      title={
        <Space>
          <FormOutlined style={{ color: appThemeToken.colorSuccess }} />
          <Text strong>{title}</Text>
          {isInsideArray && (
            <Tooltip title="查看溯源">
              <FileSearchOutlined
                style={{ fontSize: 14, color: appThemeToken.colorPrimary, cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (onFieldSelect) onFieldSelect(path, schemaNode, title, { forceOpen: true, trigger: 'source-icon' })
                }}
              />
            </Tooltip>
          )}
        </Space>
      }
      style={{ 
        marginBottom: 16,
        borderRadius: 8,
        border: `1px solid ${level === 1 ? appThemeToken.colorBorder : appThemeToken.colorBorderSecondary}`,
        background: level === 1 ? appThemeToken.colorBgContainer : appThemeToken.colorFillTertiary
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
            showSourceIcon={!isInsideArray}
          />
        )
      })}
      
      {/* 嵌套对象 - 递归渲染 */}
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
          minItems={typeof fieldSchema.minItems === 'number' ? fieldSchema.minItems : 0}
          maxItems={typeof fieldSchema.maxItems === 'number' ? fieldSchema.maxItems : 100}
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

  // ========== 修复：判断array类型的table字段 ==========
  let propertiesToIterate = null
  let requiredFields = []

  if (schemaNode.type === 'array' && schemaNode.items?.properties) {
    // array类型的table字段，遍历items.properties
    propertiesToIterate = schemaNode.items.properties
    requiredFields = schemaNode.items.required || []
  } else if (schemaNode.properties) {
    // 普通object类型，遍历properties
    propertiesToIterate = schemaNode.properties
    requiredFields = schemaNode.required || []
  } else {
    // 既没有properties也没有items.properties
    return null
  }
  // ========== 修复结束 ==========

  // 分离简单字段和嵌套结构
  const { simpleFields, nestedArrays, nestedObjects } = useMemo(() => {
    const simple = []
    const arrays = []
    const objects = []

    console.log('[FullFormRenderer] 开始分析字段，path:', path)

    for (const [fieldName, rawFieldSchema] of orderedPropertyEntries(propertiesToIterate, schemaNode.type === 'array' ? schemaNode.items : schemaNode)) {
      const fieldSchema = normalizeRepeatableTableSchema(rawFieldSchema)

      // ========== 调试日志：表格字段分析 ==========
      const isTableType = rawFieldSchema['x-display'] === 'table' || fieldSchema['x-display'] === 'table'
      const fieldNameLower = fieldName.toLowerCase()
      const isLikelyTable = fieldNameLower.includes('表') || fieldNameLower.includes('table') || isTableType

      if (isLikelyTable || isTableType) {
        console.group(`[FullFormRenderer] 表格字段分析: ${fieldName}`)
        console.log('原始Schema类型:', rawFieldSchema.type)
        console.log('标准化后类型:', fieldSchema.type)
        console.log('x-display:', rawFieldSchema['x-display'])
        console.log('x-row-constraint:', rawFieldSchema['x-row-constraint'])
        console.log('x-table-config:', rawFieldSchema['x-table-config'])
        console.log('x-extended-config:', rawFieldSchema['x-extended-config'])
        console.log('是否有 items:', !!fieldSchema.items)
        console.log('items.properties 是否存在:', !!fieldSchema.items?.properties)
        console.log('properties 是否存在:', !!fieldSchema.properties)
        console.log('判定结果:', {
          isArray: fieldSchema.type === 'array',
          hasItemsProperties: !!(fieldSchema.items?.properties),
          isObject: fieldSchema.type === 'object',
          hasProperties: !!fieldSchema.properties,
          最终归类: fieldSchema.type === 'array' && fieldSchema.items?.properties ? 'arrays' :
                    (fieldSchema.type === 'object' && fieldSchema.properties ? 'objects' : 'simple')
        })
        console.groupEnd()
      }

      if (fieldSchema.type === 'array' && fieldSchema.items?.properties) {
        arrays.push({ fieldName, fieldSchema })
      } else if (fieldSchema.type === 'object' && fieldSchema.properties) {
        objects.push({ fieldName, fieldSchema })
      } else {
        simple.push({ fieldName, fieldSchema })
      }
    }

    console.log('[FullFormRenderer] 字段分类统计:', {
      简单字段: simple.length,
      数组字段: arrays.length,
      对象字段: objects.length,
      数组字段列表: arrays.map(a => a.fieldName),
      对象字段列表: objects.map(o => o.fieldName)
    })

    return { simpleFields: simple, nestedArrays: arrays, nestedObjects: objects }
  }, [propertiesToIterate, path, schemaNode.type])
  
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
          minItems={typeof fieldSchema.minItems === 'number' ? fieldSchema.minItems : 0}
          maxItems={typeof fieldSchema.maxItems === 'number' ? fieldSchema.maxItems : 100}
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
    color: appThemeToken.colorTextTertiary,
    padding: 40
  }}>
  <FormOutlined style={{ fontSize: 16, marginBottom: 24, color: appThemeToken.colorTextTertiary }} />
  <Title level={4} style={{ color: appThemeToken.colorTextSecondary, marginBottom: 8 }}>
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
      alignItems: 'flex-start',
      justifyContent: 'center',
      background: 'rgba(255, 255, 255, 0.82)',
      backdropFilter: 'blur(4px)',
      borderRadius: 8,
      zIndex: 2,
      padding: '32px 24px 24px',
    }}
  >
    <div
      style={{
        width: 'min(420px, 100%)',
        textAlign: 'center',
        padding: '32px 24px',
        borderRadius: 16,
        border: `1px solid ${appThemeToken.colorPrimaryBorder}`,
        background: 'rgba(255, 255, 255, 0.95)',
        boxShadow: '0 16px 40px rgba(24, 144, 255, 0.08)',
      }}
    >
      <FormOutlined style={{ fontSize: 16, color: appThemeToken.colorPrimary, marginBottom: 16 }} />
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
const FormToolbar = ({ toolbarProps, onUploadDocument, beforeUploadActions = null }) => {
  if (!toolbarProps && !onUploadDocument && !beforeUploadActions) return null
  const { onSave, onReset, saving, autoSaveEnabled, onToggleAutoSave, isDirty } = toolbarProps || {}
  return (
    <Space size={6} style={{ flexShrink: 0 }}>
      {beforeUploadActions}
      {onUploadDocument && (
        <Button size="small" icon={<UploadOutlined />} onClick={onUploadDocument} style={HEADER_ICON_BUTTON_STYLE}>上传文档</Button>
      )}
      {toolbarProps && (
        <>
          <Tooltip title={autoSaveEnabled ? '关闭自动保存' : '开启自动保存'}>
            <Button
              type={autoSaveEnabled ? 'primary' : 'default'}
              ghost={autoSaveEnabled}
              size="small"
              icon={<CloudSyncOutlined />}
              onClick={onToggleAutoSave}
              style={HEADER_ICON_BUTTON_STYLE}
            >
              {autoSaveEnabled ? '自动' : '手动'}
            </Button>
          </Tooltip>
          <Button size="small" icon={<UndoOutlined />} onClick={onReset} disabled={!isDirty} style={HEADER_ICON_BUTTON_STYLE}>重置</Button>
          <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => onSave('manual')} loading={saving} disabled={!isDirty} style={HEADER_ICON_BUTTON_STYLE}>保存</Button>
        </>
      )}
    </Space>
  )
}

const FormPanel = ({
  style,
  onPathChange,
  onFieldSelect,
  toolbarProps,
  onUploadDocument,
  beforeUploadActions = null
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
  
  /**
   * 当前选中节点的 schema（表单级保持原始语义）。
   * 说明：table 兼容归一化仅在字段遍历阶段处理，避免把表单节点误判为表格数组。
   */
  const currentSchema = useMemo(() => {
    const schemaNode = schemaInfo?.schema
    if (!schemaNode) return null
    return schemaNode
  }, [schemaInfo])
  
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

  /**
   * 顶层可重复表单在有数据时优先进入第一个实例，避免停留在根节点表格容器视图。
   */
  React.useEffect(() => {
    if (!selectedPath || !currentSchema || isArrayInstance) return
    const isTopLevelFormPath = selectedPath.split('.').length === 2
    const isRepeatableFormSchema = currentSchema.type === 'array' && currentSchema.items?.properties
    if (!isTopLevelFormPath || !isRepeatableFormSchema) return
    if (!Array.isArray(currentData) || currentData.length === 0) return
    actions.setSelectedPath(`${selectedPath}.0`)
  }, [actions, currentData, currentSchema, isArrayInstance, selectedPath])

  
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
      return `${formName}_${instanceIndex + 1}`
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
  /**
   * 处理中间表单字段/图标点击，支持区分是否强制展开溯源面板。
   *
   * @param {string} path 字段路径。
   * @param {Record<string, any>} schema 字段 schema。
   * @param {string} [name] 字段名称。
   * @param {{ forceOpen?: boolean, trigger?: string }} [options] 触发选项。
   * @returns {void}
   */
  const handleFieldSelectInternal = useCallback((path, schema, name, options = {}) => {
    // 更新选中状态
    setSelectedFieldPath(path)
    // 通知外部（打开溯源面板等）
    if (onFieldSelect) {
      onFieldSelect(path, schema, name, options)
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
        background: appThemeToken.colorBgContainer,
        borderRadius: 0,
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
        minItems={typeof currentSchema.minItems === 'number' ? currentSchema.minItems : 0}
        maxItems={typeof currentSchema.maxItems === 'number' ? currentSchema.maxItems : 100}
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
      style={{ 
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: 0,
        background: appThemeToken.colorBgContainer,
        borderRadius: 0,
        ...style
      }}
    >
      {/* 标题与操作区同一行 */}
      <FormHeader
        title={currentTitle}
        schemaNode={currentSchema}
        actions={<FormToolbar toolbarProps={toolbarProps} onUploadDocument={onUploadDocument} beforeUploadActions={beforeUploadActions} />}
      />

      <div
        className="schema-form-scrollable hover-scrollbar scroll-edge-hint"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: 12
        }}
      >
        {/* 未保存提示 */}
        {isDirty && (
          <Alert
            message="有未保存的修改"
            type="warning"
            showIcon
            closable
            style={{ marginBottom: 12 }}
          />
        )}

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
    </div>
  )
}

export default React.memo(FormPanel)
export { getSchemaAtPath }
