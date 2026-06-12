export const getSelection = (data) => ({
  folderId: data.selectedFolderId,
  groupId: data.selectedGroupId,
  fieldId: data.selectedFieldId,
})

export const setSelection = (data, { folderId, groupId, fieldId }) => {
  if (folderId !== undefined) data.selectedFolderId = folderId
  if (groupId !== undefined) data.selectedGroupId = groupId
  if (fieldId !== undefined) data.selectedFieldId = fieldId
}

export const clearSelection = (data) => {
  data.selectedFolderId = null
  data.selectedGroupId = null
  data.selectedFieldId = null
}

export const toggleInList = (list, id) => {
  const index = list.indexOf(id)
  if (index !== -1) {
    list.splice(index, 1)
  } else {
    list.push(id)
  }
}

export const searchFields = (data, keyword) => {
  const results = []
  if (!keyword || keyword.trim() === '') return results
  const lowerKeyword = keyword.toLowerCase()

  for (const folder of data.folders) {
    for (const group of folder.groups) {
      for (const field of group.fields) {
        const matches =
          field.name.toLowerCase().includes(lowerKeyword) ||
          field.displayName.toLowerCase().includes(lowerKeyword) ||
          (field.description && field.description.toLowerCase().includes(lowerKeyword))
        if (matches) {
          results.push({
            field,
            folderName: folder.name,
            groupName: group.name,
            folderId: folder.id,
            groupId: group.id,
            path: `${folder.name} > ${group.name} > ${field.name}`,
          })
        }
      }
    }
  }
  return results
}

export const getStatistics = (data) => {
  let totalGroups = 0
  let totalFields = 0
  let totalEnums = 0

  for (const folder of data.folders) {
    totalGroups += folder.groups.length
    for (const group of folder.groups) {
      totalFields += group.fields.length
      for (const field of group.fields) {
        if (field.options && field.options.length > 0) {
          totalEnums += 1
        }
      }
    }
  }

  return {
    totalFolders: data.folders.length,
    totalGroups,
    totalFields,
    totalEnums,
  }
}
