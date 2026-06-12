import { useCallback } from 'react'
import { message } from 'antd'

const getSelectedFolderGroup = (selectionPath) => ({
  folder: selectionPath.find((item) => item.type === 'folder'),
  group: selectionPath.find((item) => item.type === 'group'),
})

const findField = (data, folderId, groupId, fieldId) => {
  const folder = data.folders.find((item) => item.id === folderId)
  const group = folder?.groups.find((item) => item.id === groupId)
  const field = group?.fields.find((item) => item.id === fieldId)
  return { folder, group, field }
}

const updateNestedTableChildren = (targetField, tablePath, updater) => {
  if (!targetField) return targetField
  const normalizedPath = Array.isArray(tablePath) ? tablePath : []

  const applyAtPath = (fieldNode, pathIds) => {
    if (!fieldNode) return fieldNode
    const currentChildren = Array.isArray(fieldNode.children) ? fieldNode.children : []
    if (pathIds.length === 0) {
      return { ...fieldNode, children: updater([...currentChildren]) }
    }

    const [nextId, ...rest] = pathIds
    let matched = false
    const nextChildren = currentChildren.map((child) => {
      if (child.id !== nextId) return child
      matched = true
      return applyAtPath(child, rest)
    })
    return matched ? { ...fieldNode, children: nextChildren } : fieldNode
  }

  return applyAtPath(targetField, normalizedPath)
}

const locateChildByPath = (childrenList, idPath) => {
  let cursorList = Array.isArray(childrenList) ? childrenList : []
  let cursorNode = null
  for (const childId of idPath) {
    cursorNode = cursorList.find((child) => child.id === childId) || null
    if (!cursorNode) return null
    cursorList = Array.isArray(cursorNode.children) ? cursorNode.children : []
  }
  return cursorNode
}

const buildChildSelection = (children, pathIds) => {
  const childSelection = []
  let cursorChildren = children || []
  for (const childId of pathIds) {
    const childNode = Array.isArray(cursorChildren)
      ? cursorChildren.find((child) => child.id === childId)
      : null
    if (!childNode) break
    childSelection.push({
      type: 'child',
      id: childNode.id,
      name: childNode.name || childNode.displayName || '新子字段',
    })
    cursorChildren = childNode.children || []
  }
  return childSelection
}

export const useDesignerTableActions = ({
  data,
  designData,
  selectionPath,
  setSelectionPath,
  syncSelectionPathName,
}) => {
  const handleAddTableChild = useCallback((fieldId, tablePath = []) => {
    const { folder, group } = getSelectedFolderGroup(selectionPath)
    if (!folder || !group) {
      message.warning('请先选择表单')
      return
    }

    const { field } = findField(data, folder.id, group.id, fieldId)
    if (!field) return

    const newChild = {
      name: `列_${Math.random().toString(36).substr(2, 4)}`,
      displayName: `列_${Math.random().toString(36).substr(2, 4)}`,
      displayType: 'text',
      dataType: 'string',
      description: '',
    }
    const createdChild = {
      id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...newChild,
    }
    const normalizedPath = Array.isArray(tablePath) ? tablePath : []
    const updatedField = updateNestedTableChildren(
      field,
      normalizedPath,
      (children) => [...children, createdChild],
    )
    const pathIds = [...normalizedPath, createdChild.id]
    if (!locateChildByPath(updatedField.children || [], pathIds)) {
      message.warning('添加列失败，请重试')
      return
    }

    designData.updateField(folder.id, group.id, fieldId, {
      children: updatedField.children || [],
    })
    setSelectionPath([
      { type: 'folder', id: folder.id, name: folder.name },
      { type: 'group', id: group.id, name: group.name },
      { type: 'field', id: fieldId, name: field?.name || '表格字段' },
      ...buildChildSelection(updatedField.children || [], pathIds),
    ])
    message.success('表格列已添加')
  }, [data, designData, selectionPath, setSelectionPath])

  const handleDeleteTableChild = useCallback((fieldId, childIndex, childPath = []) => {
    const { folder, group } = getSelectedFolderGroup(selectionPath)
    if (!folder || !group) return

    const { field } = findField(data, folder.id, group.id, fieldId)
    if (!field) return

    const pathIds = Array.isArray(childPath) && childPath.length > 0 ? childPath : []
    const targetChildId = pathIds[pathIds.length - 1]
    const parentPath = pathIds.slice(0, -1)
    const sourceChildren = parentPath.length === 0
      ? (field.children || [])
      : (() => {
          let cursor = field
          for (const id of parentPath) {
            cursor = (cursor.children || []).find((child) => child.id === id)
            if (!cursor) return []
          }
          return cursor.children || []
        })()

    if (sourceChildren.length <= 1) {
      message.warning('至少保留一个表格列')
      return
    }

    const deletedChild = targetChildId
      ? sourceChildren.find((child) => child.id === targetChildId)
      : sourceChildren[childIndex]
    const newChildren = sourceChildren.filter((child, idx) => (
      targetChildId ? child.id !== targetChildId : idx !== childIndex
    ))
    const updatedField = updateNestedTableChildren(field, parentPath, () => newChildren)
    designData.updateField(folder.id, group.id, fieldId, {
      children: updatedField.children || [],
    })
    if (deletedChild?.id) {
      setSelectionPath((prev) => {
        const selectedChild = prev.find((item) => item.type === 'child')
        if (selectedChild?.id !== deletedChild.id) return prev
        return prev.filter((item) => item.type !== 'child')
      })
    }
    message.success('表格列已删除')
  }, [data, designData, selectionPath, setSelectionPath])

  const handleReorderTableChildren = useCallback((folderId, groupId, fieldId, newChildren, tablePath = []) => {
    if (!folderId || !groupId || !fieldId) return

    const { field } = findField(data, folderId, groupId, fieldId)
    if (!field) return
    const updatedField = updateNestedTableChildren(field, tablePath, () => newChildren)
    designData.updateField(folderId, groupId, fieldId, {
      children: updatedField.children || [],
    })
  }, [data, designData])

  const handleAddTableRow = useCallback(() => {
    message.info('添加表格行功能待实现')
  }, [])

  const handleEditRowPrefix = useCallback(() => {
    message.info('编辑行标题功能待实现')
  }, [])

  const handleTableChildNameChange = useCallback((folderId, groupId, fieldId, childIndex, newName, childPath = []) => {
    if (!folderId || !groupId || !fieldId) return

    const { field } = findField(data, folderId, groupId, fieldId)
    if (!field) return

    const pathIds = Array.isArray(childPath) && childPath.length > 0 ? childPath : []
    const targetChildId = pathIds[pathIds.length - 1]
    const parentPath = pathIds.slice(0, -1)
    const updatedField = updateNestedTableChildren(field, parentPath, (children) => {
      const nextChildren = [...children]
      const targetIdx = targetChildId
        ? nextChildren.findIndex((item) => item.id === targetChildId)
        : childIndex
      if (targetIdx >= 0 && nextChildren[targetIdx]) {
        nextChildren[targetIdx] = {
          ...nextChildren[targetIdx],
          name: newName,
          displayName: newName,
        }
      }
      return nextChildren
    })
    designData.updateField(folderId, groupId, fieldId, {
      children: updatedField.children || [],
    })
    const childId = targetChildId || (field.children || [])[childIndex]?.id
    if (childId) syncSelectionPathName('child', childId, newName)
  }, [data, designData, syncSelectionPathName])

  return {
    handleAddTableChild,
    handleAddTableRow,
    handleDeleteTableChild,
    handleEditRowPrefix,
    handleReorderTableChildren,
    handleTableChildNameChange,
  }
}
