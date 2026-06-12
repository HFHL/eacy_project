export const getFolderKey = (folderId) => `folder-${folderId}`

export const getGroupKey = (folderId, groupId) => `group-${folderId}-${groupId}`

export const getAllFolderKeys = (folders = []) => (
  folders.map((folder) => getFolderKey(folder.id))
)

export const findTreeNodeById = (nodes, nodeId) => {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    if (node.children?.length) {
      const found = findTreeNodeById(node.children, nodeId)
      if (found) return found
    }
  }
  return null
}
