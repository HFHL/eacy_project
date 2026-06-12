import React, { useCallback, useState } from 'react'
import {
  FILE_LIST_COLUMN_DEFAULT_WIDTHS,
  FILE_LIST_COLUMN_WIDTH_BOUNDS,
  FILE_LIST_GROUP_PANEL_SPLITTER_WIDTH,
} from './constants'

export const useFileListResizableColumns = ({ token }) => {
  const [columnWidths, setColumnWidths] = useState(FILE_LIST_COLUMN_DEFAULT_WIDTHS)
  const [resizingColumnKey, setResizingColumnKey] = useState('')

  const renderResizableColumnTitle = useCallback((titleNode, columnKey) => (
    <div style={{ position: 'relative', paddingRight: FILE_LIST_GROUP_PANEL_SPLITTER_WIDTH }}>
      {titleNode}
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`调整列宽-${columnKey}`}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const startX = event.clientX
          const startWidth = Number(columnWidths[columnKey] || FILE_LIST_COLUMN_DEFAULT_WIDTHS[columnKey] || 140)
          setResizingColumnKey(columnKey)

          const handleMouseMove = (moveEvent) => {
            const bounds = FILE_LIST_COLUMN_WIDTH_BOUNDS[columnKey] || { min: 100, max: 600 }
            const delta = moveEvent.clientX - startX
            const nextWidth = Math.max(bounds.min, Math.min(bounds.max, startWidth + delta))
            setColumnWidths((prev) => ({ ...prev, [columnKey]: nextWidth }))
          }

          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            setResizingColumnKey('')
          }

          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
        }}
        style={{
          position: 'absolute',
          right: -6,
          top: -8,
          height: 'calc(100% + 16px)',
          width: FILE_LIST_GROUP_PANEL_SPLITTER_WIDTH,
          cursor: 'col-resize',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
        }}
      >
        <span
          style={{
            width: 2,
            height: '60%',
            borderRadius: 999,
            background: resizingColumnKey === columnKey ? token.colorPrimary : token.colorBorder,
            opacity: resizingColumnKey === columnKey ? 1 : 0.6,
            transition: 'all 0.2s ease',
          }}
        />
      </span>
    </div>
  ), [columnWidths, resizingColumnKey, token.colorBorder, token.colorPrimary])

  return {
    columnWidths,
    renderResizableColumnTitle,
  }
}
