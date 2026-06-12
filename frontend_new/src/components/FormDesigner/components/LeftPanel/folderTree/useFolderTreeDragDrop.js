import { useCallback } from 'react'

export const useFolderTreeDragDrop = ({
  folders,
  onMoveGroup,
  onReorderFolders,
  onReorderGroups,
}) => {
  const handleDrop = useCallback((info) => {
    const dragData = info.dragNode.data
    const dropData = info.dropNode.data
    const { dropPosition, dropToGap } = info

    if (dragData.type === 'folder') {
      if (dropData.type === 'folder') {
        const dragIndex = folders.findIndex((folder) => folder.id === dragData.id)
        let dropIndex = folders.findIndex((folder) => folder.id === dropData.id)
        if (dragIndex === -1 || dropIndex === -1) return
        if (!dropToGap) {
          dropIndex = 0
        } else if (dropPosition > dropIndex) {
          dropIndex += 1
        }
        const newOrder = [...folders]
        const [removed] = newOrder.splice(dragIndex, 1)
        newOrder.splice(dropIndex > dragIndex ? dropIndex - 1 : dropIndex, 0, removed)
        onReorderFolders?.(newOrder.map((folder) => folder.id))
      }
      return
    }

    if (dragData.type !== 'group') return

    const sourceFolderId = dragData.folderId
    const groupId = dragData.id
    if (dropData.type === 'folder') {
      const targetFolderId = dropData.id
      if (sourceFolderId === targetFolderId) {
        const folder = folders.find((item) => item.id === sourceFolderId)
        if (!folder) return
        const newOrder = folder.groups.filter((group) => group.id !== groupId)
        const group = folder.groups.find((item) => item.id === groupId)
        if (group) {
          newOrder.unshift(group)
          onReorderGroups?.(sourceFolderId, newOrder.map((item) => item.id))
        }
      } else {
        onMoveGroup?.(sourceFolderId, groupId, targetFolderId, 0)
      }
      return
    }

    if (dropData.type !== 'group') return

    const targetFolderId = dropData.folderId
    const targetGroupId = dropData.id
    if (sourceFolderId === targetFolderId) {
      const folder = folders.find((item) => item.id === sourceFolderId)
      if (!folder) return
      const dragIndex = folder.groups.findIndex((group) => group.id === groupId)
      let dropIndex = folder.groups.findIndex((group) => group.id === targetGroupId)
      if (dragIndex === -1 || dropIndex === -1) return
      if (dropPosition > dropIndex && dropToGap) {
        dropIndex += 1
      }
      const newOrder = [...folder.groups]
      const [removed] = newOrder.splice(dragIndex, 1)
      newOrder.splice(dropIndex > dragIndex ? dropIndex - 1 : dropIndex, 0, removed)
      onReorderGroups?.(sourceFolderId, newOrder.map((group) => group.id))
      return
    }

    const targetFolder = folders.find((folder) => folder.id === targetFolderId)
    if (!targetFolder) return
    const dropIndex = targetFolder.groups.findIndex((group) => group.id === targetGroupId)
    const targetIndex = dropToGap && dropPosition > dropIndex ? dropIndex + 1 : dropIndex
    onMoveGroup?.(sourceFolderId, groupId, targetFolderId, targetIndex)
  }, [folders, onMoveGroup, onReorderFolders, onReorderGroups])

  const allowDrop = useCallback(({ dragNode, dropNode }) => {
    const dragData = dragNode.data
    const dropData = dropNode.data
    if (dragData.type === 'folder') {
      return dropData.type === 'folder'
    }
    if (dragData.type === 'group') {
      return true
    }
    return false
  }, [])

  return { allowDrop, handleDrop }
}
