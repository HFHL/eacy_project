import { useCallback } from 'react'

export const useDesignCrudActions = ({
  modelRef,
  notifyUpdate,
  selectedItem,
  setSelectedItem,
}) => {
  const updateMeta = useCallback((updates) => {
    modelRef.current.updateMeta(updates)
    notifyUpdate()
  }, [modelRef, notifyUpdate])

  const addFolder = useCallback((folderData) => {
    const folder = modelRef.current.addFolder(folderData)
    notifyUpdate()
    return folder
  }, [modelRef, notifyUpdate])

  const updateFolder = useCallback((folderId, updates) => {
    modelRef.current.updateFolder(folderId, updates)
    notifyUpdate()
  }, [modelRef, notifyUpdate])

  const deleteFolder = useCallback((folderId) => {
    modelRef.current.deleteFolder(folderId)
    if (selectedItem.folderId === folderId) {
      setSelectedItem({ folderId: null, groupId: null, fieldId: null })
    }
    notifyUpdate()
  }, [modelRef, notifyUpdate, selectedItem, setSelectedItem])

  const addGroup = useCallback((folderId, groupData) => {
    const group = modelRef.current.addGroup(folderId, groupData)
    notifyUpdate()
    return group
  }, [modelRef, notifyUpdate])

  const updateGroup = useCallback((folderId, groupId, updates) => {
    modelRef.current.updateGroup(folderId, groupId, updates)
    notifyUpdate()
  }, [modelRef, notifyUpdate])

  const deleteGroup = useCallback((folderId, groupId) => {
    modelRef.current.deleteGroup(folderId, groupId)
    if (selectedItem.groupId === groupId) {
      setSelectedItem({
        folderId: selectedItem.folderId,
        groupId: null,
        fieldId: null,
      })
    }
    notifyUpdate()
  }, [modelRef, notifyUpdate, selectedItem, setSelectedItem])

  const reorderFolders = useCallback((newOrderIds) => {
    modelRef.current.reorderFolders(newOrderIds)
    notifyUpdate()
  }, [modelRef, notifyUpdate])

  const reorderGroups = useCallback((folderId, newOrderIds) => {
    modelRef.current.reorderGroups(folderId, newOrderIds)
    notifyUpdate()
  }, [modelRef, notifyUpdate])

  const moveGroup = useCallback((sourceFolderId, groupId, targetFolderId, targetIndex = -1) => {
    modelRef.current.moveGroup(sourceFolderId, groupId, targetFolderId, targetIndex)
    notifyUpdate()
  }, [modelRef, notifyUpdate])

  const addField = useCallback((folderId, groupId, fieldData) => {
    const field = modelRef.current.addField(folderId, groupId, fieldData)
    notifyUpdate()
    return field
  }, [modelRef, notifyUpdate])

  const updateField = useCallback((folderId, groupId, fieldId, updates) => {
    modelRef.current.updateField(folderId, groupId, fieldId, updates)
    notifyUpdate()
  }, [modelRef, notifyUpdate])

  const deleteField = useCallback((folderId, groupId, fieldId) => {
    modelRef.current.deleteField(folderId, groupId, fieldId)
    if (selectedItem.fieldId === fieldId) {
      setSelectedItem({
        folderId: selectedItem.folderId,
        groupId: selectedItem.groupId,
        fieldId: null,
      })
    }
    notifyUpdate()
  }, [modelRef, notifyUpdate, selectedItem, setSelectedItem])

  const moveField = useCallback((folderId, groupId, fieldId, direction) => {
    modelRef.current.moveField(folderId, groupId, fieldId, direction)
    notifyUpdate()
  }, [modelRef, notifyUpdate])

  const duplicateField = useCallback((folderId, groupId, fieldId) => {
    const field = modelRef.current.duplicateField(folderId, groupId, fieldId)
    notifyUpdate()
    return field
  }, [modelRef, notifyUpdate])

  const batchAddFields = useCallback((folderId, groupId, fieldsData) => {
    const addedFields = []
    for (const fieldData of fieldsData) {
      const field = modelRef.current.addField(folderId, groupId, fieldData)
      if (field) addedFields.push(field)
    }
    notifyUpdate()
    return addedFields
  }, [modelRef, notifyUpdate])

  const addChildField = useCallback((folderId, groupId, fieldId, childFieldData) => {
    const childField = modelRef.current.addChildField(folderId, groupId, fieldId, childFieldData)
    notifyUpdate()
    return childField
  }, [modelRef, notifyUpdate])

  const updateChildField = useCallback((folderId, groupId, fieldId, childFieldId, updates) => {
    modelRef.current.updateChildField(folderId, groupId, fieldId, childFieldId, updates)
    notifyUpdate()
  }, [modelRef, notifyUpdate])

  const deleteChildField = useCallback((folderId, groupId, fieldId, childFieldId) => {
    modelRef.current.deleteChildField(folderId, groupId, fieldId, childFieldId)
    notifyUpdate()
  }, [modelRef, notifyUpdate])

  return {
    addChildField,
    addField,
    addFolder,
    addGroup,
    batchAddFields,
    deleteChildField,
    deleteField,
    deleteFolder,
    deleteGroup,
    duplicateField,
    moveField,
    moveGroup,
    reorderFolders,
    reorderGroups,
    updateChildField,
    updateField,
    updateFolder,
    updateGroup,
    updateMeta,
  }
}
