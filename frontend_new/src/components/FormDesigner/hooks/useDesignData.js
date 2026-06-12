import { useCallback, useRef, useState } from 'react'

import DesignModel from '../core/DesignModel'
import { createDefaultDesignData } from './designData/defaultDesignData'
import { useDesignCrudActions } from './designData/useDesignCrudActions'
import { useDesignUtilityActions } from './designData/useDesignUtilityActions'

const EMPTY_SELECTION = { folderId: null, groupId: null, fieldId: null }

export const useDesignData = (initialData = null) => {
  const modelRef = useRef(new DesignModel(initialData || createDefaultDesignData()))
  const [version, setVersion] = useState(0)
  const [selectedItem, setSelectedItem] = useState(EMPTY_SELECTION)

  const notifyUpdate = useCallback(() => {
    setVersion((value) => value + 1)
  }, [])

  const crudActions = useDesignCrudActions({
    modelRef,
    notifyUpdate,
    selectedItem,
    setSelectedItem,
  })

  const utilityActions = useDesignUtilityActions({
    modelRef,
    notifyUpdate,
    selectedItem,
    setSelectedItem,
  })

  return {
    getData: utilityActions.getData,
    getSelectedObjects: utilityActions.getSelectedObjects,
    getStatistics: utilityActions.getStatistics,
    version,

    updateMeta: crudActions.updateMeta,

    addFolder: crudActions.addFolder,
    updateFolder: crudActions.updateFolder,
    deleteFolder: crudActions.deleteFolder,

    addGroup: crudActions.addGroup,
    updateGroup: crudActions.updateGroup,
    deleteGroup: crudActions.deleteGroup,
    reorderGroups: crudActions.reorderGroups,
    moveGroup: crudActions.moveGroup,

    reorderFolders: crudActions.reorderFolders,

    addField: crudActions.addField,
    updateField: crudActions.updateField,
    deleteField: crudActions.deleteField,
    moveField: crudActions.moveField,
    duplicateField: crudActions.duplicateField,
    batchAddFields: crudActions.batchAddFields,
    addChildField: crudActions.addChildField,
    updateChildField: crudActions.updateChildField,
    deleteChildField: crudActions.deleteChildField,

    setSelection: utilityActions.setSelection,
    clearSelection: utilityActions.clearSelection,
    selectedItem,

    toggleFolderExpanded: utilityActions.toggleFolderExpanded,
    toggleGroupExpanded: utilityActions.toggleGroupExpanded,

    searchFields: utilityActions.searchFields,
    validateDesign: utilityActions.validateDesign,
    resetData: utilityActions.resetData,
  }
}

export default useDesignData
