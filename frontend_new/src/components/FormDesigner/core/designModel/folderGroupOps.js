import { createFolder, createGroup } from './factories'
import { findFolder, findGroup } from './selectors'
import { syncOrder } from './helpers'

export const addFolder = (data, folderData) => {
  const newFolder = createFolder(folderData)
  data.folders.push(newFolder)
  return newFolder
}

export const updateFolder = (data, folderId, updates) => {
  const folder = findFolder(data, folderId)
  if (folder) Object.assign(folder, updates)
  return folder
}

export const deleteFolder = (data, folderId) => {
  const index = data.folders.findIndex((folder) => folder.id === folderId)
  if (index !== -1) {
    data.folders.splice(index, 1)
    syncOrder(data.folders)
  }
}

export const addGroup = (data, folderId, groupData) => {
  const folder = findFolder(data, folderId)
  if (!folder) return null
  const newGroup = createGroup(groupData)
  folder.groups.push(newGroup)
  return newGroup
}

export const updateGroup = (data, folderId, groupId, updates) => {
  const group = findGroup(data, folderId, groupId)
  if (group) {
    Object.assign(group, updates)
    if (updates.fields && Array.isArray(updates.fields)) {
      syncOrder(group.fields)
    }
  }
  return group
}

export const deleteGroup = (data, folderId, groupId) => {
  const folder = findFolder(data, folderId)
  if (!folder) return
  const index = folder.groups.findIndex((group) => group.id === groupId)
  if (index !== -1) {
    folder.groups.splice(index, 1)
    syncOrder(folder.groups)
  }
}

export const reorderFolders = (data, newOrderIds) => {
  const newFolders = []
  for (const id of newOrderIds) {
    const folder = findFolder(data, id)
    if (folder) newFolders.push(folder)
  }
  for (const folder of data.folders) {
    if (!newOrderIds.includes(folder.id)) {
      newFolders.push(folder)
    }
  }
  data.folders = newFolders
  syncOrder(data.folders)
}

export const reorderGroups = (data, folderId, newOrderIds) => {
  const folder = findFolder(data, folderId)
  if (!folder) return
  const newGroups = []
  for (const id of newOrderIds) {
    const group = folder.groups.find((item) => item.id === id)
    if (group) newGroups.push(group)
  }
  for (const group of folder.groups) {
    if (!newOrderIds.includes(group.id)) {
      newGroups.push(group)
    }
  }
  folder.groups = newGroups
  syncOrder(folder.groups)
}

export const moveGroup = (data, sourceFolderId, groupId, targetFolderId, targetIndex = -1) => {
  const sourceFolder = findFolder(data, sourceFolderId)
  const targetFolder = findFolder(data, targetFolderId)
  if (!sourceFolder || !targetFolder) return

  const groupIndex = sourceFolder.groups.findIndex((group) => group.id === groupId)
  if (groupIndex === -1) return

  const [group] = sourceFolder.groups.splice(groupIndex, 1)
  if (targetIndex >= 0 && targetIndex <= targetFolder.groups.length) {
    targetFolder.groups.splice(targetIndex, 0, group)
  } else {
    targetFolder.groups.push(group)
  }
  syncOrder(sourceFolder.groups)
  syncOrder(targetFolder.groups)
}
