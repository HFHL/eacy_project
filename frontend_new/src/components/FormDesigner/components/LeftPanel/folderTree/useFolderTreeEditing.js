import { useEffect, useRef, useState } from 'react'

import { getGroupKey } from './folderTreeKeys'

export const useFolderTreeEditing = ({
  folders,
  onEditFolder,
  onEditGroupName,
  selectedFolderId,
  selectedGroupId,
}) => {
  const [hoveredFolderId, setHoveredFolderId] = useState(null)
  const [hoveredGroupKey, setHoveredGroupKey] = useState(null)
  const [editingGroupKey, setEditingGroupKey] = useState(null)
  const [editingFolderId, setEditingFolderId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [activeDropdownFolderId, setActiveDropdownFolderId] = useState(null)
  const [activeDropdownGroupKey, setActiveDropdownGroupKey] = useState(null)
  const inputRef = useRef(null)
  const folderInputRef = useRef(null)
  const isComposingRef = useRef(false)

  useEffect(() => {
    if (editingGroupKey && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingGroupKey])

  useEffect(() => {
    if (editingFolderId && folderInputRef.current) {
      folderInputRef.current.focus()
      folderInputRef.current.select()
    }
  }, [editingFolderId])

  useEffect(() => {
    folders.forEach((folder) => {
      if (folder.isNew && selectedFolderId === folder.id) {
        setEditingFolderId(folder.id)
        setEditingName(folder.name)
      }
    })
  }, [folders, selectedFolderId])

  useEffect(() => {
    folders.forEach((folder) => {
      ;(folder.groups || []).forEach((group) => {
        if (group.isNew && selectedGroupId === group.id) {
          setEditingGroupKey(getGroupKey(folder.id, group.id))
          setEditingName(group.name)
        }
      })
    })
  }, [folders, selectedGroupId])

  const startEditingFolder = (folderId, currentName) => {
    setEditingFolderId(folderId)
    setEditingName(currentName)
  }

  const finishEditingFolder = (folderId) => {
    if (editingName?.trim()) {
      onEditFolder?.(folderId, editingName.trim())
    }
    setEditingFolderId(null)
    setEditingName('')
  }

  const startEditingGroup = (folderId, groupId, currentName) => {
    setEditingGroupKey(getGroupKey(folderId, groupId))
    setEditingName(currentName)
  }

  const finishEditingGroup = (folderId, groupId) => {
    if (editingName?.trim()) {
      onEditGroupName?.(folderId, groupId, editingName.trim())
    }
    setEditingGroupKey(null)
    setEditingName('')
  }

  const cancelEditing = () => {
    setEditingGroupKey(null)
    setEditingFolderId(null)
    setEditingName('')
  }

  return {
    activeDropdownFolderId,
    activeDropdownGroupKey,
    cancelEditing,
    editingFolderId,
    editingGroupKey,
    editingName,
    finishEditingFolder,
    finishEditingGroup,
    folderInputRef,
    hoveredFolderId,
    hoveredGroupKey,
    inputRef,
    isComposingRef,
    setActiveDropdownFolderId,
    setActiveDropdownGroupKey,
    setEditingName,
    setHoveredFolderId,
    setHoveredGroupKey,
    startEditingFolder,
    startEditingGroup,
  }
}
