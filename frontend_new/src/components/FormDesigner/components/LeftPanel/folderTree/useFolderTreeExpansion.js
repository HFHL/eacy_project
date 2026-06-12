import { useEffect, useState } from 'react'

import { getAllFolderKeys, getFolderKey } from './folderTreeKeys'

export const useFolderTreeExpansion = ({
  collapseAllSignal,
  expandAllSignal,
  folders,
  onExpandStateChange,
  selectedFolderId,
}) => {
  const [expandedKeys, setExpandedKeys] = useState(() => getAllFolderKeys(folders))

  useEffect(() => {
    if (selectedFolderId) {
      const folderKey = getFolderKey(selectedFolderId)
      setExpandedKeys((prev) => (
        prev.includes(folderKey) ? prev : [...prev, folderKey]
      ))
    }
  }, [selectedFolderId])

  useEffect(() => {
    const allFolderKeys = getAllFolderKeys(folders)
    setExpandedKeys((prev) => {
      const newKeys = allFolderKeys.filter((key) => !prev.includes(key))
      return newKeys.length > 0 ? [...prev, ...newKeys] : prev
    })
  }, [folders.length])

  useEffect(() => {
    if (expandAllSignal <= 0) return
    setExpandedKeys(getAllFolderKeys(folders))
  }, [expandAllSignal, folders])

  useEffect(() => {
    if (collapseAllSignal <= 0) return
    setExpandedKeys([])
  }, [collapseAllSignal])

  useEffect(() => {
    if (!onExpandStateChange) return
    const allFolderKeys = getAllFolderKeys(folders)
    const isAllExpanded = allFolderKeys.length > 0
      && allFolderKeys.every((key) => expandedKeys.includes(key))
    onExpandStateChange(isAllExpanded, allFolderKeys.length)
  }, [expandedKeys, folders, onExpandStateChange])

  return { expandedKeys, setExpandedKeys }
}
