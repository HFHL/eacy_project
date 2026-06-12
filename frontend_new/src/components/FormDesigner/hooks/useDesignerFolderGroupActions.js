import { useCallback } from 'react'
import { message, Modal } from 'antd'

export const useDesignerFolderGroupActions = ({
  data,
  designData,
  selectionPath,
  setSelectionPath,
}) => {
  const handleAddFolder = useCallback(() => {
    const folder = designData.addFolder({
      name: '未命名分类',
      description: '',
      order: data.folders.length,
      groups: [],
      isNew: true,
    })
    setSelectionPath([{ type: 'folder', id: folder.id, name: folder.name }])
  }, [data.folders.length, designData, setSelectionPath])

  const handleDeleteFolder = useCallback((folderId) => {
    const folder = data.folders.find((item) => item.id === folderId)
    if (!folder) return

    Modal.confirm({
      title: '确认删除',
      content: `确定要删除访视"${folder.name}"吗？该操作将删除访视下的所有表单和字段。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        designData.deleteFolder(folderId)
        setSelectionPath((prev) => {
          const wasSelected = prev.some((item) => item.id === folderId)
          return wasSelected ? [] : prev.filter((item) => item.id !== folderId)
        })
        message.success('访视已删除')
      },
    })
  }, [data.folders, designData, setSelectionPath])

  const handleEditFolder = useCallback((folderId, newName) => {
    const folder = data.folders.find((item) => item.id === folderId)
    if (!folder) return

    if (newName && newName !== folder.name) {
      designData.updateFolder(folderId, { name: newName, isNew: false })
    } else if (folder.isNew) {
      designData.updateFolder(folderId, { isNew: false })
    }
  }, [data.folders, designData])

  const handleCopyFolder = useCallback((folderId) => {
    const folder = data.folders.find((item) => item.id === folderId)
    if (!folder) return

    const copiedFolder = {
      name: `${folder.name}_复制`,
      description: folder.description || '',
      order: data.folders.length,
      groups: (folder.groups || []).map((group) => ({
        ...group,
        id: undefined,
        fields: (group.fields || []).map((field) => ({
          ...field,
          id: undefined,
          uid: undefined,
        })),
      })),
    }

    const newFolder = designData.addFolder(copiedFolder)
    if (folder.groups && folder.groups.length > 0) {
      folder.groups.forEach((group, groupIndex) => {
        const newGroup = designData.addGroup(newFolder.id, {
          name: group.name,
          description: group.description,
          order: groupIndex,
          fields: [],
        })

        ;(group.fields || []).forEach((field) => {
          designData.addField(newFolder.id, newGroup.id, {
            ...field,
            id: undefined,
            uid: undefined,
          })
        })
      })
    }

    setSelectionPath([{ type: 'folder', id: newFolder.id, name: newFolder.name }])
    message.success('访视已复制')
  }, [data.folders, designData, setSelectionPath])

  const handleAddGroup = useCallback((folderId) => {
    if (!folderId) {
      message.warning('请先选择访视')
      return
    }

    const folder = data.folders.find((item) => item.id === folderId)
    const group = designData.addGroup(folderId, {
      name: '未命名表单',
      description: '',
      order: folder?.groups?.length || 0,
      fields: [],
      isNew: true,
    })
    setSelectionPath([
      { type: 'folder', id: folderId, name: folder?.name },
      { type: 'group', id: group.id, name: group.name },
    ])
  }, [data.folders, designData, setSelectionPath])

  const handleEditGroupName = useCallback((folderId, groupId, newName) => {
    if (!newName || !newName.trim()) {
      message.warning('表单名称不能为空')
      return
    }
    designData.updateGroup(folderId, groupId, {
      name: newName.trim(),
      isNew: false,
    })
  }, [designData])

  const handleDeleteGroup = useCallback((folderId, groupId) => {
    const folder = data.folders.find((item) => item.id === folderId)
    const group = folder?.groups?.find((item) => item.id === groupId)
    if (!group) return

    Modal.confirm({
      title: '确认删除',
      content: `确定要删除表单"${group.name}"吗？该操作将删除表单下的所有字段。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        designData.deleteGroup(folderId, groupId)
        setSelectionPath((prev) => {
          const wasSelected = prev.some((item) => item.id === groupId)
          return wasSelected ? prev.slice(0, 1) : prev.filter((item) => item.id !== groupId)
        })
        message.success('表单已删除')
      },
    })
  }, [data.folders, designData, setSelectionPath])

  const handleUpdateGroup = useCallback((updates) => {
    const folder = selectionPath.find((item) => item.type === 'folder')
    const group = selectionPath.find((item) => item.type === 'group')

    if (group && folder) {
      designData.updateGroup(folder.id, group.id, updates)
    } else if (folder) {
      designData.updateFolder(folder.id, updates)
    }
  }, [designData, selectionPath])

  return {
    handleAddFolder,
    handleAddGroup,
    handleCopyFolder,
    handleDeleteFolder,
    handleDeleteGroup,
    handleEditFolder,
    handleEditGroupName,
    handleUpdateGroup,
  }
}
