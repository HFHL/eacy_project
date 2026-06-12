import React from 'react'

import GroupCard from '../GroupCard'

export const GroupCanvas = ({
  currentGroup,
  handleAddField,
  handleCopyField,
  handleDeleteField,
  handleDragOver,
  handleDrop,
  handleEditField,
  handleEditGroup,
  handleFieldReorder,
  handleSelect,
  onAddMatrixCol,
  onAddMatrixRow,
  onAddTableChild,
  onAddTableRow,
  onChildSelect,
  onCopyMatrixRow,
  onDeleteMatrixCol,
  onDeleteMatrixRow,
  onDeleteTableChild,
  onEditRowPrefix,
  onFieldNameChange,
  onGroupNameChange,
  onMatrixConfigChange,
  onOptionsChange,
  onReorderTableChildren,
  onTableChildNameChange,
  readonly,
  selectedFieldId,
  selectedFolderId,
  version,
}) => (
  <div
    className="design-canvas design-canvas-group-mode"
    onDragOver={handleDragOver}
    onDrop={handleDrop}
  >
    <GroupCard
      key={currentGroup.id}
      folderId={selectedFolderId}
      group={currentGroup}
      selected
      selectedFieldId={selectedFieldId}
      onSelect={(fieldId) => handleSelect(currentGroup.id, fieldId)}
      onAddField={() => handleAddField(currentGroup.id)}
      onEditGroup={() => handleEditGroup(currentGroup.id)}
      onEditField={(fieldId) => handleEditField(currentGroup.id, fieldId)}
      onDeleteField={(fieldId) => handleDeleteField(currentGroup.id, fieldId)}
      onCopyField={(fieldId) => handleCopyField(currentGroup.id, fieldId)}
      onFieldReorder={(newFields) => handleFieldReorder(currentGroup.id, newFields)}
      onFieldNameChange={(fieldId, newName) => onFieldNameChange?.(selectedFolderId, currentGroup.id, fieldId, newName)}
      onOptionsChange={(fieldId, newOptions) => onOptionsChange?.(selectedFolderId, currentGroup.id, fieldId, newOptions)}
      onGroupNameChange={(groupId, newName) => onGroupNameChange?.(selectedFolderId, groupId, newName)}
      onChildSelect={onChildSelect}
      onAddTableChild={onAddTableChild}
      onAddTableRow={onAddTableRow}
      onEditRowPrefix={onEditRowPrefix}
      onAddMatrixRow={onAddMatrixRow}
      onAddMatrixCol={onAddMatrixCol}
      onCopyMatrixRow={(fieldId, rowIdx) => onCopyMatrixRow?.(fieldId, rowIdx)}
      onDeleteMatrixRow={(fieldId, rowIdx) => onDeleteMatrixRow?.(fieldId, rowIdx)}
      onDeleteMatrixCol={(fieldId, colIdx) => onDeleteMatrixCol?.(fieldId, colIdx)}
      onDeleteTableChild={(fieldId, childIndex, childPath) => onDeleteTableChild?.(fieldId, childIndex, childPath)}
      onMatrixConfigChange={(fieldId, newConfig) => onMatrixConfigChange?.(selectedFolderId, currentGroup.id, fieldId, newConfig)}
      onTableChildNameChange={(fieldId, childIndex, newName, childPath) => onTableChildNameChange?.(selectedFolderId, currentGroup.id, fieldId, childIndex, newName, childPath)}
      onReorderTableChildren={(fieldId, newChildren, tablePath) => onReorderTableChildren?.(selectedFolderId, currentGroup.id, fieldId, newChildren, tablePath)}
      readonly={readonly}
      version={version}
    />
  </div>
)
