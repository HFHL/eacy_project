import React, { useCallback, useEffect, useState } from 'react'

import { GroupCanvas } from './designCanvas/GroupCanvas'
import { NoFolderState, NoGroupSelectedState } from './designCanvas/DesignCanvasEmptyStates'
import { TemplateSelection } from './designCanvas/TemplateSelection'

const DesignCanvas = ({
  folders = [],
  selectedFolderId = null,
  selectedGroupId = null,
  selectedFieldId = null,
  onSelect = null,
  onAddFolder = null,
  onAddGroup = null,
  onAddField = null,
  onEditGroup = null,
  onEditField = null,
  onDeleteField = null,
  onCopyField = null,
  onFieldReorder = null,
  onFieldNameChange = null,
  onOptionsChange = null,
  onGroupNameChange = null,
  onChildSelect = null,
  onAddTableChild = null,
  onAddTableRow = null,
  onEditRowPrefix = null,
  onAddMatrixRow = null,
  onAddMatrixCol = null,
  onCopyMatrixRow = null,
  onDeleteMatrixRow = null,
  onDeleteMatrixCol = null,
  onDeleteTableChild = null,
  onMatrixConfigChange = null,
  onTableChildNameChange = null,
  onReorderTableChildren = null,
  onDrop = null,
  onLoadExample = null,
  onApplyTemplate = null,
  readonly = false,
  version = 0,
}) => {
  const [customModeStarted, setCustomModeStarted] = useState(false)
  const currentFolder = folders.find((folder) => folder.id === selectedFolderId)
  const currentGroup = currentFolder?.groups?.find((group) => group.id === selectedGroupId)

  useEffect(() => {
    setCustomModeStarted(false)
  }, [selectedGroupId])

  const handleDragOver = useCallback((event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback((event) => {
    event.preventDefault()
    if (!onDrop) return

    const fieldType = event.dataTransfer.getData('fieldType')
    const fieldSubType = event.dataTransfer.getData('fieldSubType')
    if (fieldType) {
      onDrop(fieldType, selectedFolderId, selectedGroupId, fieldSubType)
    }
  }, [onDrop, selectedFolderId, selectedGroupId])

  const handleSelect = useCallback((groupId, fieldId) => {
    onSelect?.({
      folderId: selectedFolderId,
      groupId,
      fieldId,
    })
  }, [onSelect, selectedFolderId])

  const handleAddField = useCallback((groupId) => {
    onAddField?.(selectedFolderId, groupId)
  }, [onAddField, selectedFolderId])

  const handleEditField = useCallback((groupId, fieldId) => {
    onEditField?.(selectedFolderId, groupId, fieldId)
  }, [onEditField, selectedFolderId])

  const handleDeleteField = useCallback((groupId, fieldId) => {
    onDeleteField?.(selectedFolderId, groupId, fieldId)
  }, [onDeleteField, selectedFolderId])

  const handleCopyField = useCallback((groupId, fieldId) => {
    onCopyField?.(selectedFolderId, groupId, fieldId)
  }, [onCopyField, selectedFolderId])

  const handleEditGroup = useCallback((groupId) => {
    onEditGroup?.(selectedFolderId, groupId)
  }, [onEditGroup, selectedFolderId])

  const handleFieldReorder = useCallback((groupId, newFields) => {
    onFieldReorder?.(selectedFolderId, groupId, newFields)
  }, [onFieldReorder, selectedFolderId])

  const handleApplyTemplate = useCallback((template) => {
    if (template.id === 'custom') {
      setCustomModeStarted(true)
      return
    }
    if (onApplyTemplate) {
      onApplyTemplate(selectedFolderId, selectedGroupId, template)
      return
    }
    if (onAddField && template.fields) {
      template.fields.forEach((field) => {
        onDrop?.(field.displayType || 'text', selectedFolderId, selectedGroupId)
      })
    }
  }, [onAddField, onApplyTemplate, onDrop, selectedFolderId, selectedGroupId])

  if (!currentFolder) {
    return (
      <NoFolderState
        folders={folders}
        onAddFolder={onAddFolder}
        onLoadExample={onLoadExample}
        readonly={readonly}
      />
    )
  }

  const groups = currentFolder.groups || []
  const groupIsEmpty = currentGroup && (!currentGroup.fields || currentGroup.fields.length === 0)

  if (groupIsEmpty && !customModeStarted) {
    return (
      <TemplateSelection
        currentGroup={currentGroup}
        handleApplyTemplate={handleApplyTemplate}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
      />
    )
  }

  if (currentGroup) {
    return (
      <GroupCanvas
        currentGroup={currentGroup}
        handleAddField={handleAddField}
        handleCopyField={handleCopyField}
        handleDeleteField={handleDeleteField}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        handleEditField={handleEditField}
        handleEditGroup={handleEditGroup}
        handleFieldReorder={handleFieldReorder}
        handleSelect={handleSelect}
        onAddMatrixCol={onAddMatrixCol}
        onAddMatrixRow={onAddMatrixRow}
        onAddTableChild={onAddTableChild}
        onAddTableRow={onAddTableRow}
        onChildSelect={onChildSelect}
        onCopyMatrixRow={onCopyMatrixRow}
        onDeleteMatrixCol={onDeleteMatrixCol}
        onDeleteMatrixRow={onDeleteMatrixRow}
        onDeleteTableChild={onDeleteTableChild}
        onEditRowPrefix={onEditRowPrefix}
        onFieldNameChange={onFieldNameChange}
        onGroupNameChange={onGroupNameChange}
        onMatrixConfigChange={onMatrixConfigChange}
        onOptionsChange={onOptionsChange}
        onReorderTableChildren={onReorderTableChildren}
        onTableChildNameChange={onTableChildNameChange}
        readonly={readonly}
        selectedFieldId={selectedFieldId}
        selectedFolderId={selectedFolderId}
        version={version}
      />
    )
  }

  return (
    <NoGroupSelectedState
      currentFolder={currentFolder}
      groups={groups}
      handleDragOver={handleDragOver}
      handleDrop={handleDrop}
      onAddGroup={onAddGroup}
      readonly={readonly}
      selectedFolderId={selectedFolderId}
    />
  )
}

export default DesignCanvas
