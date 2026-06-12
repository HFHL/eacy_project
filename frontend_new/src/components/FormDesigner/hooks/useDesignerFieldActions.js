import { useCallback } from 'react'
import { message } from 'antd'

import { DISPLAY_TYPE_CONFIG } from '../core/constants'
import { createExampleDesignData, exampleSelectionPath } from '../data/designerSeedData'

const buildDroppedField = (fieldType, fieldSubType) => {
  const typeConfig = DISPLAY_TYPE_CONFIG[fieldType]
  let newField = {
    displayType: fieldType,
    name: typeConfig?.label || fieldType,
    dataType: typeConfig?.dataType || 'string',
    editable: true,
    nullable: true,
    required: false,
  }

  switch (fieldType) {
    case 'randomization':
      newField = { ...newField, name: '分组', options: ['试验组', '对照组'] }
      break
    case 'file': {
      const fileSubtype = fieldSubType || 'any'
      const fileNameMap = {
        image: '图片上传',
        pdf: 'PDF文件',
        dicom: 'DICOM影像',
        pathology: '病理切片',
        any: '文件题',
      }
      newField = {
        ...newField,
        name: fileNameMap[fileSubtype] || fileNameMap.any,
        fileSubtype,
      }
      break
    }
    case 'radio':
    case 'checkbox':
      newField = { ...newField, dataType: 'array', options: ['选项1', '选项2', '选项3'] }
      break
    case 'select':
    case 'multiselect':
      newField = {
        ...newField,
        dataType: fieldType === 'multiselect' ? 'array' : 'string',
        options: ['选项1', '选项2', '选项3'],
      }
      break
    case 'matrix_radio':
    case 'matrix_checkbox':
      newField = {
        ...newField,
        config: { rows: ['题目1', '题目2'], cols: ['选项1', '选项2', '选项3'] },
      }
      break
    case 'table': {
      const isMultiRow = fieldSubType === 'dynamic'
      newField = {
        ...newField,
        name: isMultiRow ? '自增表格' : '固定表格',
        multiRow: isMultiRow,
        config: { tableRows: isMultiRow ? 'multiRow' : 'singleRow' },
        children: [],
      }
      break
    }
    default:
      break
  }

  return newField
}

export const useDesignerFieldActions = ({
  data,
  designData,
  selectedObjects,
  selectionPath,
  setEditingField,
  setFieldModalVisible,
  setSelectionPath,
  syncSelectionPathName,
}) => {
  const handleDropField = useCallback((fieldType, folderId, groupId, fieldSubType) => {
    if (!folderId || !groupId) {
      message.warning('请先选择表单组')
      return
    }

    designData.addField(folderId, groupId, buildDroppedField(fieldType, fieldSubType))
    message.success('字段已添加')
  }, [designData])

  const handleAddField = useCallback((folderId, groupId) => {
    setEditingField({ _context: { folderId, groupId } })
    setFieldModalVisible(true)
  }, [setEditingField, setFieldModalVisible])

  const handleEditField = useCallback((folderId, groupId, fieldId) => {
    const { field } = selectedObjects
    if (!field) {
      message.warning('请先选择要编辑的字段')
      return
    }

    setEditingField({ ...field, _context: { folderId, groupId, fieldId } })
    setFieldModalVisible(true)
  }, [selectedObjects, setEditingField, setFieldModalVisible])

  const handleSaveField = useCallback((fieldData) => {
    const { _context, ...field } = fieldData
    if (field.id) {
      designData.updateField(_context.folderId, _context.groupId, _context.fieldId, field)
    } else {
      designData.addField(_context.folderId, _context.groupId, field)
    }

    setFieldModalVisible(false)
    setEditingField(null)
  }, [designData, setEditingField, setFieldModalVisible])

  const handleDeleteField = useCallback((folderId, groupId, fieldId) => {
    designData.deleteField(folderId, groupId, fieldId)
    message.success('字段已删除')
    setSelectionPath((prev) => (
      prev.some((item) => item.type === 'field' && item.id === fieldId)
        ? prev.filter((item) => item.type !== 'field' && item.type !== 'child')
        : prev
    ))
  }, [designData, setSelectionPath])

  const handleCopyField = useCallback((folderId, groupId, fieldId) => {
    designData.duplicateField(folderId, groupId, fieldId)
    message.success('字段已复制')
  }, [designData])

  const handleFieldReorder = useCallback((folderId, groupId, newFields) => {
    designData.updateGroup(folderId, groupId, { fields: newFields })
  }, [designData])

  const handleFieldNameChange = useCallback((folderId, groupId, fieldId, newName) => {
    designData.updateField(folderId, groupId, fieldId, { name: newName, displayName: newName })
    syncSelectionPathName('field', fieldId, newName)
  }, [designData, syncSelectionPathName])

  const handleOptionsChange = useCallback((folderId, groupId, fieldId, newOptions) => {
    designData.updateField(folderId, groupId, fieldId, { options: newOptions })
  }, [designData])

  const handleGroupNameChange = useCallback((folderId, groupId, newName) => {
    designData.updateGroup(folderId, groupId, { name: newName })
  }, [designData])

  const handleUpdateField = useCallback((updates) => {
    const folder = selectionPath.find((item) => item.type === 'folder')
    const group = selectionPath.find((item) => item.type === 'group')
    const field = selectionPath.find((item) => item.type === 'field')
    const child = selectionPath.find((item) => item.type === 'child')
    if (!folder || !group) return

    const nextUpdates = updates.name !== undefined
      ? { ...updates, displayName: updates.name }
      : updates

    if (child && field) {
      designData.updateChildField(folder.id, group.id, field.id, child.id, nextUpdates)
      if (nextUpdates.name !== undefined) syncSelectionPathName('child', child.id, nextUpdates.name)
    } else if (field) {
      designData.updateField(folder.id, group.id, field.id, nextUpdates)
      if (nextUpdates.name !== undefined) syncSelectionPathName('field', field.id, nextUpdates.name)
    }
  }, [designData, selectionPath, syncSelectionPathName])

  const handleApplyTemplate = useCallback((folderId, groupId, template) => {
    if (!template || !template.fields || template.fields.length === 0) {
      message.info('该模板暂无预设字段')
      return
    }

    template.fields.forEach((fieldConfig) => {
      designData.addField(folderId, groupId, {
        name: fieldConfig.name,
        displayName: fieldConfig.name,
        displayType: fieldConfig.displayType || 'text',
        unit: fieldConfig.unit || null,
        description: fieldConfig.description || '',
        nullable: true,
        editable: true,
      })
    })

    message.success(`已应用模板"${template.name}"，添加了 ${template.fields.length} 个字段`)
  }, [designData])

  const handleLoadExample = useCallback(() => {
    designData.resetData(createExampleDesignData())
    setSelectionPath(exampleSelectionPath)
    message.success('示例数据已加载')
  }, [designData, setSelectionPath])

  return {
    handleAddField,
    handleApplyTemplate,
    handleCopyField,
    handleDeleteField,
    handleDropField,
    handleEditField,
    handleFieldNameChange,
    handleFieldReorder,
    handleGroupNameChange,
    handleLoadExample,
    handleOptionsChange,
    handleSaveField,
    handleUpdateField,
  }
}
