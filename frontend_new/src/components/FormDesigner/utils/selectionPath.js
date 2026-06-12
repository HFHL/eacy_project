export const buildInitialSelectionPath = (data) => {
  const folders = Array.isArray(data?.folders) ? data.folders : []
  if (folders.length === 0) return []

  const firstFolder = folders[0]
  const nextPath = [{ type: 'folder', id: firstFolder.id, name: firstFolder.name }]
  if (Array.isArray(firstFolder.groups) && firstFolder.groups.length > 0) {
    const firstGroup = firstFolder.groups[0]
    nextPath.push({ type: 'group', id: firstGroup.id, name: firstGroup.name })
  }
  return nextPath
}

export const getDeepestSelection = (selectionPath) => {
  if (!selectionPath?.length) return null
  return selectionPath[selectionPath.length - 1]
}

export const buildSelectionPathFromIds = (
  data,
  { folderId, groupId, fieldId, childFieldId },
) => {
  const newPath = []

  if (!folderId) return newPath

  const folder = data.folders.find((item) => item.id === folderId)
  if (!folder) return newPath
  newPath.push({ type: 'folder', id: folderId, name: folder.name })

  if (!groupId) return newPath

  const group = folder.groups.find((item) => item.id === groupId)
  if (!group) return newPath
  newPath.push({ type: 'group', id: groupId, name: group.name })

  if (!fieldId) return newPath

  const field = group.fields.find((item) => item.id === fieldId)
  if (!field) return newPath
  newPath.push({ type: 'field', id: fieldId, name: field.name })

  if (childFieldId && field.children) {
    const child = field.children.find((item) => item.id === childFieldId)
    if (child) newPath.push({ type: 'child', id: childFieldId, name: child.name })
  }

  return newPath
}

export const getSelectedObjectByPath = (data, path) => {
  let current = null
  let folder = null
  let group = null
  let field = null
  let childField = null
  let currentChild = null

  for (const item of path) {
    if (item.type === 'folder') {
      folder = data.folders.find((folderItem) => folderItem.id === item.id)
      current = folder
    } else if (item.type === 'group' && folder) {
      group = folder.groups.find((groupItem) => groupItem.id === item.id)
      current = group
    } else if (item.type === 'field' && group) {
      field = group.fields.find((fieldItem) => fieldItem.id === item.id)
      current = field
      currentChild = null
    } else if (item.type === 'child' && field) {
      const source = Array.isArray(currentChild?.children)
        ? currentChild.children
        : field.children
      if (Array.isArray(source)) {
        currentChild = source.find((fieldItem) => fieldItem.id === item.id) || null
        if (currentChild) {
          childField = currentChild
          current = currentChild
        }
      }
    }
  }

  return { folder, group, field, childField, current }
}

export const buildChildSelectionItems = (field, childFieldId, childPath = []) => {
  const pathIds = Array.isArray(childPath) && childPath.length > 0
    ? childPath
    : (childFieldId ? [childFieldId] : [])
  if (pathIds.length === 0) return []

  const childItems = []
  let cursorChildren = field.children || []
  for (const childId of pathIds) {
    const childNode = Array.isArray(cursorChildren)
      ? cursorChildren.find((child) => child.id === childId)
      : null
    if (!childNode) break
    childItems.push({ type: 'child', id: childNode.id, name: childNode.name })
    cursorChildren = childNode.children || []
  }
  return childItems
}
