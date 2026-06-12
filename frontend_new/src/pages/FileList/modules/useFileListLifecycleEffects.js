import { useEffect } from 'react'
import { FILE_LIST_TREE_DEFER_MS } from './constants'
import {
  getRouteStateFromSearchParams,
  getRouteStateSignature,
} from './routeState'

export const useFileListLifecycleEffects = ({
  fetchFileList,
  fetchRequestIdRef,
  fetchTree,
  location,
  refreshAll,
  routeStateSignatureRef,
  searchParams,
  setActiveTab,
  setColumnFilters,
  setExpandedGroups,
  setFileList,
  setPagination,
  setSearchParams,
  setSelectedRowKeys,
  setTempFilters,
  setUploadModalVisible,
  setViewMode,
  treeLoadTimerRef,
}) => {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [location.pathname, location.search])

  useEffect(() => {
    const nextRouteState = getRouteStateFromSearchParams(searchParams)
    const nextSignature = getRouteStateSignature(nextRouteState)
    if (nextSignature === routeStateSignatureRef.current) return

    routeStateSignatureRef.current = nextSignature
    fetchRequestIdRef.current += 1
    setFileList([])
    setActiveTab(nextRouteState.tab)
    setViewMode(nextRouteState.view)
    setColumnFilters(nextRouteState.filters)
    setTempFilters(nextRouteState.filters)
    setSelectedRowKeys([])
    setExpandedGroups([])
    setPagination((prev) => ({ ...prev, current: 1, total: 0 }))
  }, [
    fetchRequestIdRef,
    routeStateSignatureRef,
    searchParams,
    setActiveTab,
    setColumnFilters,
    setExpandedGroups,
    setFileList,
    setPagination,
    setSelectedRowKeys,
    setTempFilters,
    setViewMode,
  ])

  useEffect(() => {
    if (searchParams.get('openUpload') !== '1') return
    setUploadModalVisible(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('openUpload')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams, setUploadModalVisible])

  useEffect(() => { fetchFileList() }, [fetchFileList])

  useEffect(() => {
    if (treeLoadTimerRef.current) clearTimeout(treeLoadTimerRef.current)
    treeLoadTimerRef.current = window.setTimeout(() => {
      fetchTree()
    }, FILE_LIST_TREE_DEFER_MS)
    return () => {
      if (treeLoadTimerRef.current) clearTimeout(treeLoadTimerRef.current)
    }
  }, [fetchTree, treeLoadTimerRef])

  useEffect(() => {
    let timer = null
    const scheduleRefresh = (event) => {
      const reason = event?.detail?.reason || 'all'
      if (reason === 'ehr') return
      if (timer) return
      timer = window.setTimeout(() => {
        timer = null
        refreshAll({ forceTree: true })
      }, 200)
    }

    window.addEventListener('patient-detail-refresh', scheduleRefresh)
    window.addEventListener('patient-rail-refresh', scheduleRefresh)
    return () => {
      window.removeEventListener('patient-detail-refresh', scheduleRefresh)
      window.removeEventListener('patient-rail-refresh', scheduleRefresh)
      if (timer) clearTimeout(timer)
    }
  }, [refreshAll])
}
