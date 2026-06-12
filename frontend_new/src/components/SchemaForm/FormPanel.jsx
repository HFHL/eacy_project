/**
 * 表单面板组件
 * 根据选中的表单路径渲染所有字段（一行一字段模式）
 * 支持嵌套 Table/对象的递归展开
 * 点击字段卡片选中+定位溯源
 */
import React, { useMemo, useCallback, useState } from 'react'
import { Empty, Alert } from 'antd'
import RepeatableForm, { createEmptyRecord } from './RepeatableForm'
import { useSchemaForm, getNestedValue } from './SchemaFormContext'
import { getSchemaAtPath } from './schemaRenderKernel'
import { appThemeToken } from '../../styles/themeTokens'
import { EmptyFormMask, EmptyStateHint } from './formPanel/FormPanelEmptyStates'
import { getFormPanelTitle, hasAnyData } from './formPanel/formPanelData'
import FormPanelHeader from './formPanel/FormPanelHeader'
import { FullFormRenderer } from './formPanel/FormRenderers'
import FormToolbar from './formPanel/FormToolbar'

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
    return getFormPanelTitle(selectedPath, isArrayInstance, instanceIndex)
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
      <FormPanelHeader
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
