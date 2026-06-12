import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  buildChildSelectionItems,
  buildSelectionPathFromIds,
  getDeepestSelection,
  getSelectedObjectByPath,
} from '../utils/selectionPath'

export const useDesignerSelection = ({
  data,
  setRightPanelTab,
}) => {
  const [selectionPath, setSelectionPath] = useState([])

  const selectedFolderId = selectionPath.find((item) => item.type === 'folder')?.id || null
  const selectedGroupId = selectionPath.find((item) => item.type === 'group')?.id || null
  const selectedFieldId = selectionPath.find((item) => item.type === 'field')?.id || null

  const deepestSelection = useMemo(
    () => getDeepestSelection(selectionPath),
    [selectionPath],
  )

  useEffect(() => {
    if (deepestSelection?.type === 'field' || deepestSelection?.type === 'child') {
      setRightPanelTab('field')
    } else if (deepestSelection?.type === 'group' || deepestSelection?.type === 'folder') {
      setRightPanelTab('form')
    }
  }, [deepestSelection, setRightPanelTab])

  const selectedObjects = useMemo(() => {
    const result = getSelectedObjectByPath(data, selectionPath)
    return {
      folder: result.folder,
      group: result.group,
      field: result.current,
      childField: result.childField,
    }
  }, [data, selectionPath])

  const syncSelectionPathName = useCallback((type, id, newName) => {
    setSelectionPath((prev) => prev.map((item) => (
      item.type === type && item.id === id
        ? { ...item, name: newName }
        : item
    )))
  }, [])

  const handleTreeSelect = useCallback((ids) => {
    setSelectionPath(buildSelectionPathFromIds(data, ids))
  }, [data])

  const handleCanvasSelect = useCallback((ids) => {
    setSelectionPath(buildSelectionPathFromIds(data, ids))
  }, [data])

  const handleChildSelect = useCallback((fieldId, childFieldId, childPath = []) => {
    const folder = selectionPath.find((item) => item.type === 'folder')
    const group = selectionPath.find((item) => item.type === 'group')
    if (!folder || !group) return

    const groupObj = data.folders
      .find((item) => item.id === folder.id)
      ?.groups.find((item) => item.id === group.id)
    const field = groupObj?.fields.find((item) => item.id === fieldId)
    if (!field) return

    const childItems = buildChildSelectionItems(field, childFieldId, childPath)
    if (childItems.length === 0) return

    setSelectionPath((prev) => {
      const base = prev.filter((item) => item.type !== 'child' && item.type !== 'field')
      return [
        ...base,
        { type: 'field', id: fieldId, name: field.name },
        ...childItems,
      ]
    })
  }, [data, selectionPath])

  return {
    deepestSelection,
    handleCanvasSelect,
    handleChildSelect,
    handleTreeSelect,
    selectedFieldId,
    selectedFolderId,
    selectedGroupId,
    selectedObjects,
    selectionPath,
    setSelectionPath,
    syncSelectionPathName,
  }
}
