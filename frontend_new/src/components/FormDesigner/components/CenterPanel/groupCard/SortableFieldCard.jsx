import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import FieldCard from '../FieldCard'

export const SortableFieldCard = ({
  field,
  index,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onCopy,
  onFieldNameChange,
  onOptionsChange,
  onChildSelect,
  onAddTableChild,
  onAddTableRow,
  onDeleteTableChild,
  onAddMatrixRow,
  onAddMatrixCol,
  onCopyMatrixRow,
  onDeleteMatrixRow,
  onMatrixConfigChange,
  onTableChildNameChange,
  onReorderTableChildren,
  readonly,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <FieldCard
        field={field}
        index={index}
        selected={selected}
        onSelect={onSelect}
        onEdit={onEdit}
        onDelete={onDelete}
        onCopy={onCopy}
        onFieldNameChange={onFieldNameChange}
        onOptionsChange={onOptionsChange}
        onChildSelect={onChildSelect}
        onAddTableChild={onAddTableChild}
        onAddTableRow={onAddTableRow}
        onDeleteTableChild={onDeleteTableChild}
        onAddMatrixRow={onAddMatrixRow}
        onAddMatrixCol={onAddMatrixCol}
        onCopyMatrixRow={onCopyMatrixRow}
        onDeleteMatrixRow={onDeleteMatrixRow}
        onMatrixConfigChange={onMatrixConfigChange}
        onTableChildNameChange={onTableChildNameChange}
        onReorderTableChildren={onReorderTableChildren}
        readonly={readonly}
        dragHandleProps={{ attributes, listeners }}
      />
    </div>
  )
}
