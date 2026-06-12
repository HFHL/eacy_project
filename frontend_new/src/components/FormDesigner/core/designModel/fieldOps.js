import { createChildField, createField } from './factories'
import { findField, findGroup } from './selectors'
import {
  generateId,
  inferDataType,
  normalizeTableFieldUpdates,
  syncOrder,
} from './helpers'

export const addField = (data, folderId, groupId, fieldData) => {
  const group = findGroup(data, folderId, groupId)
  if (!group) return null
  const newField = createField(fieldData, group.fields.length)
  group.fields.push(newField)
  return newField
}

export const updateField = (data, folderId, groupId, fieldId, updates) => {
  const group = findGroup(data, folderId, groupId)
  if (!group) return null

  const fieldIndex = group.fields.findIndex((field) => field.id === fieldId)
  if (fieldIndex === -1) return null
  const field = group.fields[fieldIndex]

  let nextUpdates = updates
  if (nextUpdates.displayType && nextUpdates.displayType !== field.displayType) {
    nextUpdates = { ...nextUpdates, dataType: inferDataType(nextUpdates.displayType) }
  }
  nextUpdates = normalizeTableFieldUpdates(field, nextUpdates)

  const updatedField = { ...field, ...nextUpdates }
  group.fields[fieldIndex] = updatedField
  return updatedField
}

export const deleteField = (data, folderId, groupId, fieldId) => {
  const group = findGroup(data, folderId, groupId)
  if (!group) return
  const index = group.fields.findIndex((field) => field.id === fieldId)
  if (index !== -1) {
    group.fields.splice(index, 1)
    syncOrder(group.fields)
  }
}

export const moveField = (data, folderId, groupId, fieldId, direction) => {
  const group = findGroup(data, folderId, groupId)
  if (!group) return

  const index = group.fields.findIndex((field) => field.id === fieldId)
  if (index === -1) return
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= group.fields.length) return

  const [field] = group.fields.splice(index, 1)
  group.fields.splice(newIndex, 0, field)
  syncOrder(group.fields)
}

export const duplicateField = (data, folderId, groupId, fieldId) => {
  const field = findField(data, folderId, groupId, fieldId)
  if (!field) return null

  const duplicatedField = {
    ...field,
    id: generateId('field'),
    uid: null,
    name: `${field.name}_副本`,
    displayName: `${field.displayName}_副本`,
  }

  const group = findGroup(data, folderId, groupId)
  const index = group.fields.findIndex((item) => item.id === fieldId)
  group.fields.splice(index + 1, 0, duplicatedField)
  return duplicatedField
}

export const addChildField = (data, folderId, groupId, fieldId, childFieldData) => {
  const field = findField(data, folderId, groupId, fieldId)
  if (!field) return null
  if (!field.children) field.children = []
  const newChildField = createChildField(childFieldData)
  field.children.push(newChildField)
  return newChildField
}

export const updateChildField = (data, folderId, groupId, fieldId, childFieldId, updates) => {
  const field = findField(data, folderId, groupId, fieldId)
  if (!field || !field.children) return null

  const childIndex = field.children.findIndex((item) => item.id === childFieldId)
  if (childIndex === -1) return null
  const childField = field.children[childIndex]

  let nextUpdates = updates
  if (nextUpdates.displayType && nextUpdates.displayType !== childField.displayType) {
    nextUpdates = { ...nextUpdates, dataType: inferDataType(nextUpdates.displayType) }
  }
  nextUpdates = normalizeTableFieldUpdates(childField, nextUpdates)

  const updatedChildField = { ...childField, ...nextUpdates }
  const nextChildren = [...field.children]
  nextChildren[childIndex] = updatedChildField
  field.children = nextChildren
  return updatedChildField
}

export const deleteChildField = (data, folderId, groupId, fieldId, childFieldId) => {
  const field = findField(data, folderId, groupId, fieldId)
  if (!field || !field.children) return

  const index = field.children.findIndex((item) => item.id === childFieldId)
  if (index !== -1) {
    field.children.splice(index, 1)
  }
}

export const getChildField = (data, folderId, groupId, fieldId, childFieldId) => {
  const field = findField(data, folderId, groupId, fieldId)
  if (!field || !field.children) return null
  return field.children.find((item) => item.id === childFieldId)
}
