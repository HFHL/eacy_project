import React, { useCallback } from 'react'
import { message, Modal } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { orderedPropertyEntries, setNestedValue } from '../SchemaFormContext'
import NodeTitle from './NodeTitle'
import {
  createEmptyTemplate,
  generateInstanceName,
  getNestedValue,
  getRepeatableNaming,
  getSchemaAtPath,
  hasAnyData,
} from './categoryTreeUtils'

export function useCategoryTreeMutations({
  actions,
  draftData,
  expandedKeys,
  onAddRepeatableInstance,
  onBeforeClearForm,
  onPersistAfterChange,
  onSelect,
  schema,
  selectedPath,
  setExpandedKeys,
  trySetSelectedPath,
}) {
  const createRepeatableInstance = useCallback((path, title, schemaNode) => {
    const itemSchema = schemaNode?.items || schemaNode
    const template = createEmptyTemplate(itemSchema)
    actions.addRepeatableItem(path, template)

    const currentCount = (getNestedValue(draftData, path) || []).length
    const namingPattern = getRepeatableNaming(title, schemaNode)
    const startIndex = schemaNode?.['x-repeatable-naming']?.startIndex || 1
    const newName = generateInstanceName(namingPattern, currentCount, startIndex)

    onAddRepeatableInstance?.(path, newName, currentCount + 1)
    message.success(`已添加 ${newName}`)

    const newInstancePath = `${path}.${currentCount}`
    setTimeout(() => {
      actions.setSelectedPath(newInstancePath)
      onSelect?.(newInstancePath, { key: newInstancePath, path: newInstancePath, isFormInstance: true })
    }, 100)
  }, [actions, draftData, onAddRepeatableInstance, onSelect])

  const handleAddRepeatableItem = useCallback((path, title, schemaNode) => {
    const currentArray = getNestedValue(draftData, path) || []
    const isEmptyRepeatableForm = !Array.isArray(currentArray) || currentArray.length === 0

    if (isEmptyRepeatableForm) {
      if (selectedPath !== path) {
        trySetSelectedPath(path, {
          key: path,
          title,
          path,
          schemaNode,
          isForm: true,
          isFormInstance: false,
          isArray: true,
          isRepeatableForm: true,
          isEmptyPlaceholder: true,
        })
        return
      }
      createRepeatableInstance(path, title, schemaNode)
      return
    }

    createRepeatableInstance(path, title, schemaNode)
  }, [createRepeatableInstance, draftData, selectedPath, trySetSelectedPath])

  const handleSelect = useCallback(async (selectedKeys, { node }) => {
    if (node.isFolder) {
      const key = node.key
      setExpandedKeys(expandedKeys.includes(key)
        ? expandedKeys.filter((item) => item !== key)
        : [...expandedKeys, key])
      return
    }

    if (node.isAddButton) {
      handleAddRepeatableItem(node.path, node.originalFormName, node.schemaNode)
      return
    }

    const path = selectedKeys?.[0] || node?.path || node?.key
    if (!path) return
    await trySetSelectedPath(path, node)
  }, [expandedKeys, handleAddRepeatableItem, setExpandedKeys, trySetSelectedPath])

  const handleDeleteInstance = useCallback((arrayPath, instanceIndex) => {
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: '确定要删除该条记录吗？删除后不可恢复。',
      okText: '确定删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const currentArray = getNestedValue(draftData, arrayPath) || []
        const newArray = currentArray.filter((_, idx) => idx !== instanceIndex)
        const newDraftData = JSON.parse(JSON.stringify(draftData || {}))
        setNestedValue(newDraftData, arrayPath, newArray)
        actions.updateFieldValue(arrayPath, newArray)

        const deletedWasSelected = selectedPath === `${arrayPath}.${instanceIndex}` || selectedPath?.startsWith(`${arrayPath}.${instanceIndex}.`)
        if (deletedWasSelected) {
          if (newArray.length > 0) {
            trySetSelectedPath(`${arrayPath}.0`)
          } else {
            actions.setSelectedPath(arrayPath)
          }
        }

        if (onPersistAfterChange) {
          try {
            await onPersistAfterChange(newDraftData)
            message.success('已删除并保存')
          } catch (e) {
            message.error('删除失败: ' + (e?.message || '未知错误'))
          }
        } else {
          message.success('已删除记录')
        }
      },
    })
  }, [actions, draftData, onPersistAfterChange, selectedPath, trySetSelectedPath])

  const handleClearForm = useCallback((formPath) => {
    const schemaAtPath = getSchemaAtPath(schema, formPath)
    if (schemaAtPath?.type === 'array' && schemaAtPath?.items?.properties) {
      actions.updateFieldValue(formPath, [])
    } else if (schemaAtPath?.properties) {
      const emptyData = {}
      for (const [key, fieldSchema] of orderedPropertyEntries(schemaAtPath.properties, schemaAtPath)) {
        emptyData[key] = fieldSchema.type === 'array'
          ? []
          : fieldSchema.type === 'string'
            ? ''
            : null
      }
      actions.updateFieldValue(formPath, emptyData)
    } else {
      actions.updateFieldValue(formPath, {})
    }
    message.success('已清空表单数据，请点击保存提交')
  }, [actions, schema])

  const handleClearFormWithConfirm = useCallback(async (formPath) => {
    const currentValue = getNestedValue(draftData, formPath)
    const schemaAtPath = getSchemaAtPath(schema, formPath)
    const isRepeatable = schemaAtPath?.type === 'array' && schemaAtPath?.items?.properties
    const isAlreadyEmpty = isRepeatable
      ? !Array.isArray(currentValue) || currentValue.length === 0
      : !hasAnyData(currentValue)

    if (isAlreadyEmpty) {
      actions.setSelectedPath(formPath)
      return
    }

    const allow = onBeforeClearForm ? await onBeforeClearForm() : true
    if (!allow) return
    Modal.confirm({
      title: isRepeatable ? '确定清空全部记录' : '确定清空',
      icon: <ExclamationCircleOutlined />,
      content: isRepeatable
        ? '确定清空该表单下的全部记录吗？清空后将恢复为空表单状态，且需点击保存才会提交。'
        : '确定清空该表单数据吗？清空后需点击保存才会提交。',
      okText: isRepeatable ? '确定清空全部' : '确定清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        handleClearForm(formPath)
        actions.setSelectedPath(formPath)
      },
    })
  }, [actions, draftData, handleClearForm, onBeforeClearForm, schema])

  const titleRender = useCallback((nodeData) => (
    <NodeTitle
      node={nodeData}
      expanded={expandedKeys.includes(nodeData.key)}
      onAddInstance={handleAddRepeatableItem}
      onDeleteInstance={handleDeleteInstance}
      onClearForm={handleClearForm}
      onClearFormRequest={handleClearFormWithConfirm}
    />
  ), [expandedKeys, handleAddRepeatableItem, handleClearForm, handleClearFormWithConfirm, handleDeleteInstance])

  return {
    handleSelect,
    titleRender,
  }
}
