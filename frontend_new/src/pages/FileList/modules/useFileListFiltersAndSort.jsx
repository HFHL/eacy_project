import React, { useCallback, useRef, useState } from 'react'
import {
  FilterOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons'

export const useFileListFiltersAndSort = ({
  activeTab,
  columnFilters,
  initialFilters,
  searchParams,
  setActiveGroupKey,
  setColumnFilters,
  setExpandedGroups,
  setPagination,
  setSearchParams,
  setSelectedRowKeys,
  setSorter,
  setViewMode,
  sorter,
  token,
  viewMode,
}) => {
  const [filterDropdownOpen, setFilterDropdownOpen] = useState({})
  const [tempFilters, setTempFilters] = useState(initialFilters)
  const [overlayPosition, setOverlayPosition] = useState(null)
  const filterTriggerRefs = useRef({})

  const openFilterDropdown = useCallback((key) => {
    const el = filterTriggerRefs.current[key]
    if (el) {
      const cell = el.closest('th') || el.closest('.ant-table-cell') || el
      const rect = cell.getBoundingClientRect()
      setOverlayPosition({ left: rect.left, top: rect.bottom + 2 })
    }
    setTempFilters({ ...columnFilters })
    setFilterDropdownOpen((prev) => ({ ...prev, [key]: true }))
  }, [columnFilters])

  const closeFilterOverlay = useCallback((key) => {
    setFilterDropdownOpen((prev) => ({ ...prev, [key]: false }))
    setOverlayPosition(null)
  }, [])

  const syncSearchParams = useCallback((filters, nextTab = activeTab, nextView = viewMode) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', nextTab || 'all')
    nextParams.set('view', nextView || 'patient')

    if (filters.fileName) nextParams.set('q', filters.fileName)
    else nextParams.delete('q')

    if (filters.taskStatus?.length) nextParams.set('taskStatus', filters.taskStatus.join(','))
    else nextParams.delete('taskStatus')

    if (filters.statusInfo?.length) nextParams.set('statusInfo', filters.statusInfo.join(','))
    else nextParams.delete('statusInfo')

    setSearchParams(nextParams, { replace: true })
  }, [activeTab, searchParams, setSearchParams, viewMode])

  const handleViewModeChange = useCallback((nextMode) => {
    setViewMode(nextMode)
    syncSearchParams(columnFilters, activeTab, nextMode)
    setSelectedRowKeys([])
    setExpandedGroups([])
    if (nextMode !== 'patient') setActiveGroupKey(null)
  }, [
    activeTab,
    columnFilters,
    setActiveGroupKey,
    setExpandedGroups,
    setSelectedRowKeys,
    setViewMode,
    syncSearchParams,
  ])

  const applyFilter = useCallback((key) => {
    const nextFilters = { ...tempFilters }
    setColumnFilters(nextFilters)
    syncSearchParams(nextFilters)
    closeFilterOverlay(key)
    setPagination((prev) => ({ ...prev, current: 1 }))
  }, [closeFilterOverlay, setColumnFilters, setPagination, syncSearchParams, tempFilters])

  const resetFilter = useCallback((key) => {
    const reset = { ...tempFilters }
    if (key === 'fileName') reset.fileName = ''
    if (key === 'fileType') reset.fileType = []
    if (key === 'taskStatus') reset.taskStatus = []
    if (key === 'statusInfo') reset.statusInfo = []
    if (key === 'dateRange') reset.dateRange = null
    setTempFilters(reset)
    setColumnFilters(reset)
    syncSearchParams(reset)
    closeFilterOverlay(key)
    setPagination((prev) => ({ ...prev, current: 1 }))
  }, [closeFilterOverlay, setColumnFilters, setPagination, syncSearchParams, tempFilters])

  const toggleSort = useCallback((field) => {
    setSorter((prev) => {
      if (prev.field !== field) return { field, order: 'asc' }
      if (prev.order === 'asc') return { field, order: 'desc' }
      if (prev.order === 'desc') return { field: 'created_at', order: 'desc' }
      return { field, order: 'asc' }
    })
    setPagination((prev) => ({ ...prev, current: 1 }))
  }, [setPagination, setSorter])

  const SortIcon = useCallback(({ field }) => {
    const active = sorter.field === field
    const color = active ? token.colorPrimary : token.colorTextSecondary
    const Icon = active && sorter.order === 'desc' ? SortDescendingOutlined : SortAscendingOutlined

    return (
      <Icon
        style={{ cursor: 'pointer', color, fontSize: 12 }}
        onClick={() => toggleSort(field)}
      />
    )
  }, [sorter.field, sorter.order, token.colorPrimary, token.colorTextSecondary, toggleSort])

  const FilterIcon = useCallback(({ filterKey, hasFilter }) => (
    <span
      ref={(el) => { filterTriggerRefs.current[filterKey] = el }}
      style={{ display: 'inline-flex', cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation()
        openFilterDropdown(filterKey)
      }}
    >
      <FilterOutlined
        style={{ color: hasFilter ? token.colorPrimary : token.colorTextSecondary, fontSize: 12 }}
      />
    </span>
  ), [openFilterDropdown, token.colorPrimary, token.colorTextSecondary])

  return {
    FilterIcon,
    SortIcon,
    applyFilter,
    closeFilterOverlay,
    handleViewModeChange,
    openFilterKey: Object.keys(filterDropdownOpen).find((key) => filterDropdownOpen[key]),
    overlayPosition,
    resetFilter,
    setTempFilters,
    tempFilters,
  }
}
