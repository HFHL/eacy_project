/**
 * 设计器数据模型门面。
 * 具体操作拆分在 ./designModel/ 下，类本身保留原实例 API。
 */
import {
  createEmptyModel,
  generateFieldUid,
  generateId,
  inferDataType,
  normalizeTableFieldUpdates,
} from './designModel/helpers'
import {
  findField,
  findFolder,
  findGroup,
} from './designModel/selectors'
import {
  addFolder,
  addGroup,
  deleteFolder,
  deleteGroup,
  moveGroup,
  reorderFolders,
  reorderGroups,
  updateFolder,
  updateGroup,
} from './designModel/folderGroupOps'
import {
  addChildField,
  addField,
  deleteChildField,
  deleteField,
  duplicateField,
  getChildField,
  moveField,
  updateChildField,
  updateField,
} from './designModel/fieldOps'
import {
  clearSelection,
  getSelection,
  getStatistics,
  searchFields,
  setSelection,
  toggleInList,
} from './designModel/uiState'

export class DesignModel {
  constructor(initialData = null) {
    this.data = this._createEmptyModel()
    if (initialData) {
      this._loadFromData(initialData)
    }
  }

  _createEmptyModel() {
    return createEmptyModel()
  }

  _generateFieldUid() {
    return generateFieldUid()
  }

  _loadFromData(data) {
    this.data = {
      ...this.data,
      ...data,
      meta: { ...this.data.meta, ...data.meta },
    }
  }

  getData() {
    return this.data
  }

  getMeta() {
    return this.data.meta
  }

  updateMeta(updates) {
    this.data.meta = {
      ...this.data.meta,
      ...updates,
      modified: new Date().toISOString(),
    }
  }

  getFolders() {
    return this.data.folders
  }

  addFolder(folderData) {
    return addFolder(this.data, folderData)
  }

  updateFolder(folderId, updates) {
    return updateFolder(this.data, folderId, updates)
  }

  deleteFolder(folderId) {
    return deleteFolder(this.data, folderId)
  }

  getFolder(folderId) {
    return this._findFolder(folderId)
  }

  addGroup(folderId, groupData) {
    return addGroup(this.data, folderId, groupData)
  }

  updateGroup(folderId, groupId, updates) {
    return updateGroup(this.data, folderId, groupId, updates)
  }

  deleteGroup(folderId, groupId) {
    return deleteGroup(this.data, folderId, groupId)
  }

  getGroup(folderId, groupId) {
    return this._findGroup(folderId, groupId)
  }

  addField(folderId, groupId, fieldData) {
    return addField(this.data, folderId, groupId, fieldData)
  }

  updateField(folderId, groupId, fieldId, updates) {
    return updateField(this.data, folderId, groupId, fieldId, updates)
  }

  deleteField(folderId, groupId, fieldId) {
    return deleteField(this.data, folderId, groupId, fieldId)
  }

  moveField(folderId, groupId, fieldId, direction) {
    return moveField(this.data, folderId, groupId, fieldId, direction)
  }

  duplicateField(folderId, groupId, fieldId) {
    return duplicateField(this.data, folderId, groupId, fieldId)
  }

  addChildField(folderId, groupId, fieldId, childFieldData) {
    return addChildField(this.data, folderId, groupId, fieldId, childFieldData)
  }

  updateChildField(folderId, groupId, fieldId, childFieldId, updates) {
    return updateChildField(this.data, folderId, groupId, fieldId, childFieldId, updates)
  }

  deleteChildField(folderId, groupId, fieldId, childFieldId) {
    return deleteChildField(this.data, folderId, groupId, fieldId, childFieldId)
  }

  getChildField(folderId, groupId, fieldId, childFieldId) {
    return getChildField(this.data, folderId, groupId, fieldId, childFieldId)
  }

  getField(folderId, groupId, fieldId) {
    return this._findField(folderId, groupId, fieldId)
  }

  getSelection() {
    return getSelection(this.data)
  }

  setSelection(selection) {
    return setSelection(this.data, selection)
  }

  clearSelection() {
    return clearSelection(this.data)
  }

  toggleFolderExpanded(folderId) {
    return toggleInList(this.data.expandedFolderIds, folderId)
  }

  toggleGroupExpanded(groupId) {
    return toggleInList(this.data.expandedGroupIds, groupId)
  }

  setExpandedFolders(folderIds) {
    this.data.expandedFolderIds = [...folderIds]
  }

  setExpandedGroups(groupIds) {
    this.data.expandedGroupIds = [...groupIds]
  }

  searchFields(keyword) {
    return searchFields(this.data, keyword)
  }

  reorderFolders(newOrderIds) {
    return reorderFolders(this.data, newOrderIds)
  }

  reorderGroups(folderId, newOrderIds) {
    return reorderGroups(this.data, folderId, newOrderIds)
  }

  moveGroup(sourceFolderId, groupId, targetFolderId, targetIndex = -1) {
    return moveGroup(this.data, sourceFolderId, groupId, targetFolderId, targetIndex)
  }

  getStatistics() {
    return getStatistics(this.data)
  }

  _findFolder(folderId) {
    return findFolder(this.data, folderId)
  }

  _findGroup(folderId, groupId) {
    return findGroup(this.data, folderId, groupId)
  }

  _findField(folderId, groupId, fieldId) {
    return findField(this.data, folderId, groupId, fieldId)
  }

  _generateId(prefix) {
    return generateId(prefix)
  }

  _inferDataType(displayType) {
    return inferDataType(displayType)
  }

  _normalizeTableFieldUpdates(currentField, updates = {}) {
    return normalizeTableFieldUpdates(currentField, updates)
  }
}

export default DesignModel
