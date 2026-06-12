import { useCallback } from 'react'

import DesignModel from '../../core/DesignModel'
import { schemaValidator } from '../../core/validators'

const EMPTY_SELECTION = { folderId: null, groupId: null, fieldId: null }

export const useDesignUtilityActions = ({
  modelRef,
  notifyUpdate,
  selectedItem,
  setSelectedItem,
}) => {
  const getData = useCallback(() => modelRef.current.getData(), [modelRef])

  const setSelection = useCallback((selection) => {
    modelRef.current.setSelection(selection)
    setSelectedItem(selection)
  }, [modelRef, setSelectedItem])

  const clearSelection = useCallback(() => {
    modelRef.current.clearSelection()
    setSelectedItem(EMPTY_SELECTION)
  }, [modelRef, setSelectedItem])

  const toggleFolderExpanded = useCallback((folderId) => {
    modelRef.current.toggleFolderExpanded(folderId)
    notifyUpdate()
  }, [modelRef, notifyUpdate])

  const toggleGroupExpanded = useCallback((groupId) => {
    modelRef.current.toggleGroupExpanded(groupId)
    notifyUpdate()
  }, [modelRef, notifyUpdate])

  const searchFields = useCallback((keyword) => (
    modelRef.current.searchFields(keyword)
  ), [modelRef])

  const getStatistics = useCallback(() => (
    modelRef.current.getStatistics()
  ), [modelRef])

  const validateDesign = useCallback(() => {
    const data = modelRef.current.getData()
    return schemaValidator.validateDesignModel(data)
  }, [modelRef])

  const resetData = useCallback((newData) => {
    modelRef.current = new DesignModel(newData)
    setSelectedItem(EMPTY_SELECTION)
    notifyUpdate()
  }, [modelRef, notifyUpdate, setSelectedItem])

  const getSelectedObjects = useCallback(() => {
    const data = modelRef.current.getData()
    const result = { folder: null, group: null, field: null }

    if (selectedItem.folderId) {
      result.folder = data.folders.find((folder) => folder.id === selectedItem.folderId)
    }
    if (selectedItem.groupId && result.folder) {
      result.group = result.folder.groups.find((group) => group.id === selectedItem.groupId)
    }
    if (selectedItem.fieldId && result.group) {
      result.field = result.group.fields.find((field) => field.id === selectedItem.fieldId)
    }

    return result
  }, [modelRef, selectedItem])

  return {
    clearSelection,
    getData,
    getSelectedObjects,
    getStatistics,
    resetData,
    searchFields,
    setSelection,
    toggleFolderExpanded,
    toggleGroupExpanded,
    validateDesign,
  }
}
