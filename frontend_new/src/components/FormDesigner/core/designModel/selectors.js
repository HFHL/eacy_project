export const findFolder = (data, folderId) => (
  data.folders.find((folder) => folder.id === folderId)
)

export const findGroup = (data, folderId, groupId) => {
  const folder = findFolder(data, folderId)
  return folder?.groups.find((group) => group.id === groupId)
}

export const findField = (data, folderId, groupId, fieldId) => {
  const group = findGroup(data, folderId, groupId)
  return group?.fields.find((field) => field.id === fieldId)
}
