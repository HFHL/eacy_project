import React from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { App as AntdApp, theme } from 'antd'
import { FileListPageShell } from './modules/FileListPageShell'
import { useFileListBatchActions } from './modules/useFileListBatchActions'
import { useFileListColumns } from './modules/useFileListColumns'
import { useFileListDataSources } from './modules/useFileListDataSources'
import { useFileListDocumentActions } from './modules/useFileListDocumentActions'
import { useFileListFiltersAndSort } from './modules/useFileListFiltersAndSort'
import { useFileListGroupActions } from './modules/useFileListGroupActions'
import { useFileListGroupDocs } from './modules/useFileListGroupDocs'
import { useFileListGroupRenderers } from './modules/useFileListGroupRenderers'
import { useFileListLifecycleEffects } from './modules/useFileListLifecycleEffects'
import { useFileListModalState } from './modules/useFileListModalState'
import { useFileListPatientMatchActions } from './modules/useFileListPatientMatchActions'
import { useFileListPolling } from './modules/useFileListPolling'
import { useFileListRemoteData } from './modules/useFileListRemoteData'
import { useFileListResizableColumns } from './modules/useFileListResizableColumns'
import { useFileListRefresh } from './modules/useFileListRefresh'
import { useFileListRouteViewState } from './modules/useFileListRouteViewState'
import { useFileListShellProps } from './modules/useFileListShellProps'
import { useFileListTableViewState } from './modules/useFileListTableViewState'
import { useFileListUploadState } from './modules/useFileListUploadState'

const FileList = () => {
  const { token } = theme.useToken()
  const { message, modal } = AntdApp.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    activeGroupKey, activeTab, columnFilters, expandedGroups, hoveredGroupKey,
    initialRouteStateRef, isGroupSplitterDragging, isGroupSplitterHover,
    patientGroupPanelWidth, routeStateSignatureRef, selectedRowKeys,
    setActiveGroupKey, setActiveTab, setColumnFilters, setExpandedGroups,
    setHoveredGroupKey, setIsGroupSplitterDragging, setIsGroupSplitterHover,
    setPatientGroupPanelWidth, setSelectedRowKeys, setSorter, setViewMode,
    sorter, treeLoadTimerRef, treeRefreshPromiseRef, viewMode,
  } = useFileListRouteViewState(searchParams)

  const modalState = useFileListModalState()
  const { columnWidths, renderResizableColumnTitle } = useFileListResizableColumns({ token })
  const remoteData = useFileListRemoteData({
    activeTab,
    columnFilters,
    message,
    setExpandedGroups,
    sorter,
  })
  const groupDocs = useFileListGroupDocs({
    expandedGroups,
    setExpandedGroups,
    treeData: remoteData.treeData,
    treeLoading: remoteData.treeLoading,
    treeRefreshPromiseRef,
  })
  const filters = useFileListFiltersAndSort({
    activeTab,
    columnFilters,
    initialFilters: initialRouteStateRef.current.filters,
    searchParams,
    setActiveGroupKey,
    setColumnFilters,
    setExpandedGroups,
    setPagination: remoteData.setPagination,
    setSearchParams,
    setSelectedRowKeys,
    setSorter,
    setViewMode,
    sorter,
    token,
    viewMode,
  })
  const refreshAll = useFileListRefresh({
    groupDocs,
    remoteData,
    treeRefreshPromiseRef,
    viewMode,
  })

  const uploadState = useFileListUploadState({ message, refreshAll })

  useFileListLifecycleEffects({
    fetchFileList: remoteData.fetchFileList,
    fetchRequestIdRef: remoteData.fetchRequestIdRef,
    fetchTree: remoteData.fetchTree,
    location,
    refreshAll,
    routeStateSignatureRef,
    searchParams,
    setActiveTab,
    setColumnFilters,
    setExpandedGroups,
    setFileList: remoteData.setFileList,
    setPagination: remoteData.setPagination,
    setSearchParams,
    setSelectedRowKeys,
    setTempFilters: filters.setTempFilters,
    setUploadModalVisible: uploadState.setUploadModalVisible,
    setViewMode,
    treeLoadTimerRef,
  })
  useFileListPolling({
    fileListVersionRef: remoteData.fileListVersionRef,
    matchTaskMap: remoteData.matchTaskMap,
    message,
    pollingAiMatchIds: remoteData.pollingAiMatchIds,
    pollingParseIds: remoteData.pollingParseIds,
    refreshAll,
    setFileList: remoteData.setFileList,
    setMatchingDocIds: remoteData.setMatchingDocIds,
    setMatchTaskMap: remoteData.setMatchTaskMap,
    setPollingAiMatchIds: remoteData.setPollingAiMatchIds,
    setPollingParseIds: remoteData.setPollingParseIds,
  })

  const dataSources = useFileListDataSources({
    activeGroupKey,
    activeTab,
    columnFilters,
    expandedGroups,
    fileList: remoteData.fileList,
    groupDocsMap: groupDocs.groupDocsMap,
    loadArchivedPatientDocs: groupDocs.loadArchivedPatientDocs,
    loadGroupDocs: groupDocs.loadGroupDocs,
    pagination: remoteData.pagination,
    setActiveGroupKey,
    setPagination: remoteData.setPagination,
    setSelectedRowKeys,
    token,
    treeData: remoteData.treeData,
    viewMode,
  })
  const patientMatchActions = useFileListPatientMatchActions({
    detailModalRef: modalState.detailModalRef,
    fileRecordMap: dataSources.fileRecordMap,
    matchModalMode: modalState.matchModalMode,
    message,
    modal,
    refreshAll,
    selectedMatchDocument: modalState.selectedMatchDocument,
    selectedMatchPatient: modalState.selectedMatchPatient,
    setArchivingLoading: modalState.setArchivingLoading,
    setMatchInfoLoading: modalState.setMatchInfoLoading,
    setMatchModalMode: modalState.setMatchModalMode,
    setPatientMatchVisible: modalState.setPatientMatchVisible,
    setPatientSearchLoading: modalState.setPatientSearchLoading,
    setPatientSearchResults: modalState.setPatientSearchResults,
    setPatientSearchValue: modalState.setPatientSearchValue,
    setSelectedMatchDocument: modalState.setSelectedMatchDocument,
    setSelectedMatchPatient: modalState.setSelectedMatchPatient,
    setShowSearchResults: modalState.setShowSearchResults,
  })
  const documentActions = useFileListDocumentActions({
    groupDocsMap: groupDocs.groupDocsMap,
    handleArchivePatient: patientMatchActions.handleArchivePatient,
    message,
    modal,
    refreshAll,
    selectedRowKeys,
    setBatchDeleteLoading: modalState.setBatchDeleteLoading,
    setCreatePatientDocIds: modalState.setCreatePatientDocIds,
    setCreatePatientDrawerOpen: modalState.setCreatePatientDrawerOpen,
    setCreatePatientGroupId: modalState.setCreatePatientGroupId,
    setCreatePatientMode: modalState.setCreatePatientMode,
    setCreatePatientPrefillValues: modalState.setCreatePatientPrefillValues,
    setDetailModalVisible: modalState.setDetailModalVisible,
    setFileList: remoteData.setFileList,
    setMatchingDocIds: remoteData.setMatchingDocIds,
    setPollingParseIds: remoteData.setPollingParseIds,
    setSelectedDocument: modalState.setSelectedDocument,
    setSelectedRowKeys,
    setStartingParseIds: remoteData.setStartingParseIds,
    token,
    treeData: remoteData.treeData,
  })
  const groupActions = useFileListGroupActions({
    autoArchivingGroupIds: modalState.autoArchivingGroupIds,
    groupDocsMap: groupDocs.groupDocsMap,
    groupManualArchiveGroupId: modalState.groupManualArchiveGroupId,
    groupManualArchiveVisible: modalState.groupManualArchiveVisible,
    message,
    refreshAll,
    selectedGroupPatient: modalState.selectedGroupPatient,
    setAutoArchivingGroupIds: modalState.setAutoArchivingGroupIds,
    setCreatePatientDocIds: modalState.setCreatePatientDocIds,
    setCreatePatientDrawerOpen: modalState.setCreatePatientDrawerOpen,
    setCreatePatientGroupId: modalState.setCreatePatientGroupId,
    setCreatePatientMode: modalState.setCreatePatientMode,
    setCreatePatientPrefillValues: modalState.setCreatePatientPrefillValues,
    setGroupDocsMap: groupDocs.setGroupDocsMap,
    setGroupManualArchiveGroupId: modalState.setGroupManualArchiveGroupId,
    setGroupManualArchiveVisible: modalState.setGroupManualArchiveVisible,
    setGroupPatientSearchLoading: modalState.setGroupPatientSearchLoading,
    setGroupPatientSearchResults: modalState.setGroupPatientSearchResults,
    setGroupPatientSearchValue: modalState.setGroupPatientSearchValue,
    setSelectedGroupPatient: modalState.setSelectedGroupPatient,
  })
  const groupRenderers = useFileListGroupRenderers({
    activeGroupKey,
    autoArchivingGroupIds: modalState.autoArchivingGroupIds,
    expandedGroups,
    groupDocsMap: groupDocs.groupDocsMap,
    handleAutoArchiveGroup: groupActions.handleAutoArchiveGroup,
    handleCreatePatientForGroup: groupActions.handleCreatePatientForGroup,
    hoveredGroupKey,
    loadArchivedPatientDocs: groupDocs.loadArchivedPatientDocs,
    loadGroupDocs: groupDocs.loadGroupDocs,
    navigate,
    openManualArchiveForGroup: groupActions.openManualArchiveForGroup,
    setActiveGroupKey,
    setExpandedGroups,
    setHoveredGroupKey,
    token,
  })
  const batchActions = useFileListBatchActions({
    activeGroupKey,
    fileRecordMap: dataSources.fileRecordMap,
    groupDocsMap: groupDocs.groupDocsMap,
    message,
    refreshAll,
    selectedRowKeys,
    setCreatePatientDocIds: modalState.setCreatePatientDocIds,
    setCreatePatientDrawerOpen: modalState.setCreatePatientDrawerOpen,
    setCreatePatientGroupId: modalState.setCreatePatientGroupId,
    setCreatePatientMode: modalState.setCreatePatientMode,
    setCreatePatientPrefillValues: modalState.setCreatePatientPrefillValues,
    setFileList: remoteData.setFileList,
    setPollingParseIds: remoteData.setPollingParseIds,
    setSelectedRowKeys,
    setStartingParseIds: remoteData.setStartingParseIds,
    treeData: remoteData.treeData,
    viewMode,
  })
  const columns = useFileListColumns({
    columnFilters,
    columnWidths,
    FilterIcon: filters.FilterIcon,
    handleAiMatchPatient: documentActions.handleAiMatchPatient,
    handleArchivePatient: patientMatchActions.handleArchivePatient,
    handleConfirmRecommendedArchive: documentActions.handleConfirmRecommendedArchive,
    handleCreatePatientFromDoc: documentActions.handleCreatePatientFromDoc,
    handleDeleteDocument: documentActions.handleDeleteDocument,
    handleDownload: documentActions.handleDownload,
    handleParseDocument: documentActions.handleParseDocument,
    handleUnbindDocument: documentActions.handleUnbindDocument,
    matchingDocIds: remoteData.matchingDocIds,
    pollingParseIds: remoteData.pollingParseIds,
    renderGroupRow: groupRenderers.renderGroupRow,
    renderResizableColumnTitle,
    SortIcon: filters.SortIcon,
    startingParseIds: remoteData.startingParseIds,
    viewMode,
  })
  const tableState = useFileListTableViewState({
    columns,
    displayDataSource: dataSources.displayDataSource,
    expandedGroups,
    handleFileClick: documentActions.handleFileClick,
    patientGroupPanelWidth,
    setIsGroupSplitterDragging,
    setPatientGroupPanelWidth,
    selectedRowKeys,
    setSelectedRowKeys,
    token,
    toggleGroup: groupRenderers.toggleGroup,
    treeTableData: dataSources.treeTableData,
    viewMode,
  })
  const shellProps = useFileListShellProps({
    batchActions,
    columnFilters,
    columns,
    dataSources,
    documentActions,
    filters,
    groupActions,
    groupRenderers,
    isGroupSplitterDragging,
    isGroupSplitterHover,
    message,
    modalState,
    patientGroupPanelWidth,
    patientMatchActions,
    refreshAll,
    remoteData,
    selectedRowKeys,
    setColumnFilters,
    setIsGroupSplitterHover,
    setSelectedRowKeys,
    tableState,
    token,
    uploadState,
    viewMode,
  })

  return <FileListPageShell {...shellProps} />
}

export default FileList
