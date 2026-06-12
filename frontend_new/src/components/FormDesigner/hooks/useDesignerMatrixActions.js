import { useCallback } from 'react'
import { message } from 'antd'

const getSelectedFolderGroup = (selectionPath) => ({
  folder: selectionPath.find((item) => item.type === 'folder'),
  group: selectionPath.find((item) => item.type === 'group'),
})

const findField = (data, folderId, groupId, fieldId) => {
  const groupObj = data.folders
    .find((item) => item.id === folderId)
    ?.groups.find((item) => item.id === groupId)
  return groupObj?.fields.find((item) => item.id === fieldId)
}

const getMatrixConfig = (field) => {
  const existingConfig = field.config || {}
  return {
    rows: existingConfig.rows || ['题目1', '题目2'],
    cols: existingConfig.cols || ['选项1', '选项2', '选项3'],
  }
}

export const useDesignerMatrixActions = ({
  data,
  designData,
  selectionPath,
}) => {
  const handleAddMatrixRow = useCallback((fieldId) => {
    const { folder, group } = getSelectedFolderGroup(selectionPath)
    if (!folder || !group) return

    const field = findField(data, folder.id, group.id, fieldId)
    if (!field) return

    const config = getMatrixConfig(field)
    const newRowIndex = config.rows.length + 1
    config.rows = [...config.rows, `题目${newRowIndex}`]

    designData.updateField(folder.id, group.id, fieldId, { config: { ...config } })
    message.success('题目已添加')
  }, [data, designData, selectionPath])

  const handleDeleteMatrixRow = useCallback((fieldId, rowIdx) => {
    const { folder, group } = getSelectedFolderGroup(selectionPath)
    if (!folder || !group) return

    const field = findField(data, folder.id, group.id, fieldId)
    if (!field) return

    const existingConfig = field.config || {}
    const rows = existingConfig.rows || ['题目1', '题目2']
    if (rows.length <= 1) {
      message.warning('至少保留一个题目')
      return
    }

    designData.updateField(folder.id, group.id, fieldId, {
      config: {
        ...existingConfig,
        rows: rows.filter((_, idx) => idx !== rowIdx),
        cols: existingConfig.cols || ['选项1', '选项2', '选项3'],
      },
    })
    message.success('题目已删除')
  }, [data, designData, selectionPath])

  const handleCopyMatrixRow = useCallback((fieldId, rowIdx) => {
    const { folder, group } = getSelectedFolderGroup(selectionPath)
    if (!folder || !group) return

    const field = findField(data, folder.id, group.id, fieldId)
    if (!field) return

    const existingConfig = field.config || {}
    const rows = existingConfig.rows || ['题目1', '题目2']
    const newRows = [
      ...rows.slice(0, rowIdx + 1),
      `${rows[rowIdx]} (副本)`,
      ...rows.slice(rowIdx + 1),
    ]

    designData.updateField(folder.id, group.id, fieldId, {
      config: {
        ...existingConfig,
        rows: newRows,
        cols: existingConfig.cols || ['选项1', '选项2', '选项3'],
      },
    })
    message.success('题目已复制')
  }, [data, designData, selectionPath])

  const handleDeleteMatrixCol = useCallback((fieldId, colIdx) => {
    const { folder, group } = getSelectedFolderGroup(selectionPath)
    if (!folder || !group) return

    const field = findField(data, folder.id, group.id, fieldId)
    if (!field) return

    const existingConfig = field.config || {}
    const cols = existingConfig.cols || ['选项1', '选项2', '选项3']
    if (cols.length <= 1) {
      message.warning('至少保留一个选项')
      return
    }

    designData.updateField(folder.id, group.id, fieldId, {
      config: {
        ...existingConfig,
        rows: existingConfig.rows || ['题目1', '题目2'],
        cols: cols.filter((_, idx) => idx !== colIdx),
      },
    })
    message.success('选项已删除')
  }, [data, designData, selectionPath])

  const handleAddMatrixCol = useCallback((fieldId) => {
    const { folder, group } = getSelectedFolderGroup(selectionPath)
    if (!folder || !group) return

    const field = findField(data, folder.id, group.id, fieldId)
    if (!field) return

    const config = getMatrixConfig(field)
    const newColIndex = config.cols.length + 1
    config.cols = [...config.cols, `选项${newColIndex}`]

    designData.updateField(folder.id, group.id, fieldId, { config: { ...config } })
    message.success('选项已添加')
  }, [data, designData, selectionPath])

  const handleMatrixConfigChange = useCallback((folderId, groupId, fieldId, newConfig) => {
    if (!folderId || !groupId || !fieldId) return
    designData.updateField(folderId, groupId, fieldId, { config: newConfig })
  }, [designData])

  return {
    handleAddMatrixCol,
    handleAddMatrixRow,
    handleCopyMatrixRow,
    handleDeleteMatrixCol,
    handleDeleteMatrixRow,
    handleMatrixConfigChange,
  }
}
