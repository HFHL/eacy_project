import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const buildFolderList = (folders, fieldGroups) => (
  Array.isArray(folders) && folders.length > 0
    ? folders
    : [{
      folderKey: 'all',
      folderName: '全部字段组',
      groups: fieldGroups,
    }]
)

export const useFieldGroupFolderState = ({
  loading,
  fieldGroups,
  folders,
  groupsByFolder,
  hasPatients,
  hasFieldGroups,
  activeGroupKey,
  onGroupChange,
}) => {
  const folderList = useMemo(
    () => buildFolderList(folders, fieldGroups),
    [fieldGroups, folders]
  )
  const activeGroup = useMemo(
    () => fieldGroups.find((group) => group.group_id === activeGroupKey),
    [activeGroupKey, fieldGroups]
  )
  const [activeFolderKey, setActiveFolderKey] = useState(
    activeGroup?.folderKey || folderList[0]?.folderKey || 'all'
  )
  const folderGroupMemoryRef = useRef(
    activeGroup?.group_id ? { [activeGroup.folderKey]: activeGroup.group_id } : {}
  )
  const [isFolderInitialized, setIsFolderInitialized] = useState(false)

  const activeFolderGroups = useMemo(() => {
    if (!activeFolderKey) return fieldGroups
    return groupsByFolder?.[activeFolderKey]
      || fieldGroups.filter((group) => group.folderKey === activeFolderKey)
  }, [activeFolderKey, fieldGroups, groupsByFolder])

  const isActiveGroupInCurrentFolder = activeFolderGroups.some((group) => (
    group.group_id === activeGroupKey
  ))
  const rememberedGroupId = folderGroupMemoryRef.current[activeFolderKey]
  const fallbackGroupId = rememberedGroupId || activeFolderGroups[0]?.group_id
  const previewGroupId = isActiveGroupInCurrentFolder ? activeGroupKey : fallbackGroupId
  const currentGroup = fieldGroups.find((group) => group.group_id === previewGroupId) || fieldGroups[0]

  const folderItems = useMemo(
    () => folderList.map((folder) => ({
      key: folder.folderKey,
      label: folder.folderName,
    })),
    [folderList]
  )

  useEffect(() => {
    if (!folderList.length) return
    const folderExists = folderList.some((folder) => folder.folderKey === activeFolderKey)
    if (folderExists) return
    setActiveFolderKey(folderList[0].folderKey)
  }, [activeFolderKey, folderList])

  useEffect(() => {
    if (!folderList.length || !fieldGroups.length) return
    if (isFolderInitialized) return

    const firstFolderKey = folderList[0]?.folderKey
    const firstFolderGroups = groupsByFolder?.[firstFolderKey]
      || fieldGroups.filter((group) => group.folderKey === firstFolderKey)
    const firstGroupId = firstFolderGroups[0]?.group_id

    if (!firstFolderKey || !firstGroupId) return

    folderGroupMemoryRef.current[firstFolderKey] = firstGroupId
    setActiveFolderKey(firstFolderKey)
    if (activeGroupKey !== firstGroupId) {
      onGroupChange(firstGroupId)
    }
    setIsFolderInitialized(true)
  }, [activeGroupKey, fieldGroups, folderList, groupsByFolder, isFolderInitialized, onGroupChange])

  useEffect(() => {
    if (!activeFolderKey || !activeFolderGroups.length) return

    const currentFolderHasActive = activeFolderGroups.some((group) => group.group_id === activeGroupKey)
    if (currentFolderHasActive) {
      folderGroupMemoryRef.current[activeFolderKey] = activeGroupKey
      return
    }

    const nextGroupId = folderGroupMemoryRef.current[activeFolderKey] || activeFolderGroups[0]?.group_id
    if (!nextGroupId) return
    folderGroupMemoryRef.current[activeFolderKey] = nextGroupId
    if (activeGroupKey !== nextGroupId) {
      onGroupChange(nextGroupId)
    }
  }, [activeFolderGroups, activeFolderKey, activeGroupKey, onGroupChange])

  const handleFolderChange = useCallback((nextFolderKey) => {
    setActiveFolderKey(nextFolderKey)
    const nextFolderGroups = groupsByFolder?.[nextFolderKey]
      || fieldGroups.filter((group) => group.folderKey === nextFolderKey)
    const nextGroupId = folderGroupMemoryRef.current[nextFolderKey] || nextFolderGroups[0]?.group_id
    if (!nextGroupId) return
    folderGroupMemoryRef.current[nextFolderKey] = nextGroupId
    onGroupChange(nextGroupId)
  }, [fieldGroups, groupsByFolder, onGroupChange])

  const handleGroupChange = useCallback((nextGroupKey) => {
    const nextGroupId = String(nextGroupKey)
    folderGroupMemoryRef.current[activeFolderKey] = nextGroupId
    onGroupChange(nextGroupId)
  }, [activeFolderKey, onGroupChange])

  return {
    activeFolderKey,
    activeFolderGroups,
    currentGroup,
    folderItems,
    initialFolderLoading: !loading && hasPatients && hasFieldGroups && !isFolderInitialized,
    previewGroupId,
    handleFolderChange,
    handleGroupChange,
  }
}
