import React, { useCallback, useMemo } from 'react'
import { Checkbox } from 'antd'
import { appThemeToken } from '../../../styles/themeTokens'
import {
  FILE_LIST_GROUP_PANEL_MAX_WIDTH,
  FILE_LIST_GROUP_PANEL_MIN_WIDTH,
  FILE_LIST_TABLE_SCROLL_Y,
} from './constants'

const FILE_LIST_MIN_ROWS_FOR_VERTICAL_SCROLL = 6

export const useFileListTableViewState = ({
  columns,
  displayDataSource,
  expandedGroups,
  handleFileClick,
  patientGroupPanelWidth,
  setIsGroupSplitterDragging,
  setPatientGroupPanelWidth,
  selectedRowKeys,
  setSelectedRowKeys,
  token,
  toggleGroup,
  treeTableData,
  viewMode,
}) => {
  const groupFileKeysMap = useMemo(() => {
    const map = new Map()
    treeTableData.forEach((record) => {
      if (record._isGroup) {
        map.set(record.key, [])
      } else if (record._isFile) {
        const parentKey = record._groupId
          ? `group:${record._groupId}`
          : (record._patientId ? `patient:${record._patientId}` : null)
        if (!parentKey) return
        if (!map.has(parentKey)) map.set(parentKey, [])
        map.get(parentKey).push(record.key)
      }
    })
    return map
  }, [treeTableData])

  const fileListTableScrollY = displayDataSource.length > FILE_LIST_MIN_ROWS_FOR_VERTICAL_SCROLL
    ? FILE_LIST_TABLE_SCROLL_Y
    : undefined
  const fileListTableVirtual = Boolean(fileListTableScrollY)

  const tableScrollX = useMemo(() => {
    const widthSum = columns.reduce((acc, item) => acc + (Number(item?.width) || 0), 0)
    const selectionColumnBuffer = 72
    const minWidth = viewMode === 'table' ? 1320 : 920
    return Math.max(minWidth, widthSum + selectionColumnBuffer)
  }, [columns, viewMode])

  const tableRowSelection = useMemo(() => ({
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    renderCell: (checked, record, index, originNode) => {
      if (!record._isGroup) return originNode

      const groupFileKeys = groupFileKeysMap.get(record.key) || []
      const groupSelectedCount = groupFileKeys.filter((key) => selectedRowKeys.includes(key)).length
      const groupAllSelected = groupFileKeys.length > 0 && groupSelectedCount === groupFileKeys.length
      const groupIndeterminate = groupSelectedCount > 0 && !groupAllSelected
      const isExpanded = expandedGroups.includes(record.key)

      return (
        <Checkbox
          checked={groupAllSelected}
          indeterminate={groupIndeterminate}
          disabled={!isExpanded || groupFileKeys.length === 0}
          onChange={(event) => {
            const shouldSelect = event.target.checked
            setSelectedRowKeys((previous) => {
              const next = new Set(previous)
              if (shouldSelect) {
                groupFileKeys.forEach((key) => next.add(key))
              } else {
                groupFileKeys.forEach((key) => next.delete(key))
              }
              return Array.from(next)
            })
          }}
          onClick={(event) => event.stopPropagation()}
        />
      )
    },
    getCheckboxProps: (record) => ({
      disabled: !!record._isGroup,
    }),
  }), [expandedGroups, groupFileKeysMap, selectedRowKeys, setSelectedRowKeys])

  const getTableRowProps = useCallback((record) => ({
    style: record._isGroup
      ? { cursor: 'pointer', background: token.colorFillTertiary }
      : { cursor: 'pointer', background: record._indent ? token.colorPrimaryBg : appThemeToken.colorBgContainer },
    onClick: (event) => {
      if (record._isGroup) {
        toggleGroup(record)
      } else if (record._isFile) {
        if (event.target.closest('.ant-dropdown-trigger, .ant-btn, .ant-checkbox')) return
        handleFileClick(record)
      }
    },
  }), [handleFileClick, toggleGroup, token.colorFillTertiary, token.colorPrimaryBg])

  const handleGroupPanelResizeMouseDown = useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = patientGroupPanelWidth
    setIsGroupSplitterDragging(true)

    const handleMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX
      const nextWidth = Math.max(
        FILE_LIST_GROUP_PANEL_MIN_WIDTH,
        Math.min(FILE_LIST_GROUP_PANEL_MAX_WIDTH, startWidth + delta)
      )
      setPatientGroupPanelWidth(nextWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setIsGroupSplitterDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [patientGroupPanelWidth, setIsGroupSplitterDragging, setPatientGroupPanelWidth])

  return {
    fileListTableScrollY,
    fileListTableVirtual,
    getTableRowProps,
    handleGroupPanelResizeMouseDown,
    tableRowSelection,
    tableScrollX,
  }
}
