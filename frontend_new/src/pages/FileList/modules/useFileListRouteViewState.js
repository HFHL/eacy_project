import { useRef, useState } from 'react'

import { FILE_LIST_GROUP_PANEL_DEFAULT_WIDTH } from './constants'
import {
  getRouteStateFromSearchParams,
  getRouteStateSignature,
} from './routeState'

export const useFileListRouteViewState = (searchParams) => {
  const initialRouteStateRef = useRef(null)
  if (!initialRouteStateRef.current) {
    initialRouteStateRef.current = getRouteStateFromSearchParams(searchParams)
  }

  const routeStateSignatureRef = useRef(getRouteStateSignature(initialRouteStateRef.current))
  const treeLoadTimerRef = useRef(null)
  const treeRefreshPromiseRef = useRef(null)
  const [activeTab, setActiveTab] = useState(initialRouteStateRef.current.tab)
  const [viewMode, setViewMode] = useState(initialRouteStateRef.current.view)
  const [columnFilters, setColumnFilters] = useState(initialRouteStateRef.current.filters)
  const [sorter, setSorter] = useState({ field: 'created_at', order: 'desc' })
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [expandedGroups, setExpandedGroups] = useState([])
  const [activeGroupKey, setActiveGroupKey] = useState(null)
  const [patientGroupPanelWidth, setPatientGroupPanelWidth] = useState(FILE_LIST_GROUP_PANEL_DEFAULT_WIDTH)
  const [isGroupSplitterDragging, setIsGroupSplitterDragging] = useState(false)
  const [isGroupSplitterHover, setIsGroupSplitterHover] = useState(false)
  const [hoveredGroupKey, setHoveredGroupKey] = useState(null)

  return {
    activeGroupKey,
    activeTab,
    columnFilters,
    expandedGroups,
    hoveredGroupKey,
    initialRouteStateRef,
    isGroupSplitterDragging,
    isGroupSplitterHover,
    patientGroupPanelWidth,
    routeStateSignatureRef,
    selectedRowKeys,
    setActiveGroupKey,
    setActiveTab,
    setColumnFilters,
    setExpandedGroups,
    setHoveredGroupKey,
    setIsGroupSplitterDragging,
    setIsGroupSplitterHover,
    setPatientGroupPanelWidth,
    setSelectedRowKeys,
    setSorter,
    setViewMode,
    sorter,
    treeLoadTimerRef,
    treeRefreshPromiseRef,
    viewMode,
  }
}
