import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Form, message } from 'antd'
import { dispatchRequestPatientCreate } from '../../utils/createIntentEvents'
import PatientEmptyState from './modules/PatientEmptyState'
import PatientPoolPageShell from './modules/PatientPoolPageShell'
import { createPatientColumns } from './modules/patientTableColumns'
import {
  DEFAULT_VISIBLE_COLUMNS,
  INITIAL_ADVANCED_FILTERS,
  INITIAL_FILTERS,
} from './modules/patientPoolConstants'
import { usePatientPoolPageProps } from './modules/usePatientPoolPageProps'
import usePatientBatchImport from './hooks/usePatientBatchImport'
import usePatientPoolData from './hooks/usePatientPoolData'
import usePatientExport from './hooks/usePatientExport'
import usePatientBatchActions from './hooks/usePatientBatchActions'
import usePatientEditor from './hooks/usePatientEditor'

const PatientPool = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [filterVisible, setFilterVisible] = useState(false)
  const [exportModalVisible, setExportModalVisible] = useState(false)
  const [batchImportVisible, setBatchImportVisible] = useState(false)
  const [viewingPatientDetail, setViewingPatientDetail] = useState(null)
  const [patientDetailVisible, setPatientDetailVisible] = useState(false)
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [advancedFilters, setAdvancedFilters] = useState(INITIAL_ADVANCED_FILTERS)
  const [advancedFilterForm] = Form.useForm()
  const {
    patientData,
    loading,
    pagination,
    statistics,
    departmentTreeData,
    departmentLoading,
    fetchPatients,
    getDepartmentNameById,
    handleTableChange,
    resetPaginationPage,
  } = usePatientPoolData({ filters, advancedFilters })
  const {
    exportLoading,
    exportForm,
    setExportForm,
    handleExport,
  } = usePatientExport({
    selectedRowKeys,
    filters,
    advancedFilters,
    onExported: () => setExportModalVisible(false),
  })
  const {
    batchActions,
    handleBatchAction,
  } = usePatientBatchActions({
    selectedRowKeys,
    onOpenExport: () => setExportModalVisible(true),
    onSelectionClear: () => setSelectedRowKeys([]),
    fetchPatients,
  })
  const emitPatientRailRefresh = useCallback(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('patient-rail-refresh'))
  }, [])
  const {
    form: addPatientForm,
    open: addPatientVisible,
    isEditing: isEditingPatient,
    step: addPatientStep,
    loading: addPatientLoading,
    close: closeAddPatientModal,
    goPrev: goPrevAddPatientStep,
    handleSubmit: handleAddPatient,
  } = usePatientEditor({
    fetchPatients,
    emitPatientRailRefresh,
  })
  const [columnWidths, setColumnWidths] = useState({})
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_COLUMNS)
  const [statisticsCollapsed, setStatisticsCollapsed] = useState(false)

  // 处理列宽调整
  const handleResize = (index, size) => {
    const newColumnWidths = { ...columnWidths }
    newColumnWidths[index] = size.width
    setColumnWidths(newColumnWidths)
  }

  /**
   * 清理 URL 中与弹窗流程相关的查询参数，避免旧参数残留影响后续交互。
   *
   * @param {string[]} keys 需要清理的查询参数 key 列表
   * @returns {void}
   */
  const clearModalQueryParams = useCallback((keys) => {
    if (!Array.isArray(keys) || keys.length === 0) return
    setSearchParams((prevParams) => {
      const nextParams = new URLSearchParams(prevParams)
      keys.forEach((key) => nextParams.delete(key))
      return nextParams
    }, { replace: true })
  }, [setSearchParams])

  useEffect(() => {
    if (searchParams.get('openCreate') !== '1') return
    dispatchRequestPatientCreate()
    clearModalQueryParams(['openCreate'])
  }, [searchParams, clearModalQueryParams])

  /**
   * 防止列表自动跳详情与新建弹窗流程抢路由。
   * 仅在未打开患者弹窗、且无 openCreate 指令时才允许自动跳转。
   */
  useEffect(() => {
    const isOpenCreate = searchParams.get('openCreate') === '1'
    const emptyState = searchParams.get('emptyState')
    if (isOpenCreate || loading || addPatientVisible) return

    const latestPatient = [...patientData].sort((left, right) => {
      const leftTs = new Date(left?.updatedAtRaw || 0).getTime()
      const rightTs = new Date(right?.updatedAtRaw || 0).getTime()
      return rightTs - leftTs
    })[0]

    if (latestPatient?.patientId) {
      if (emptyState) {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('emptyState')
        setSearchParams(nextParams, { replace: true })
      }
      navigate(`/patient/detail/${latestPatient.patientId}`, {
        replace: true,
        state: { from: '/patient/pool' }
      })
      return
    }

    if (emptyState !== 'patient') {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('emptyState', 'patient')
      setSearchParams(nextParams, { replace: true })
    }
  }, [addPatientVisible, loading, navigate, patientData, searchParams, setSearchParams])

  // 防抖搜索
  const debounceSearch = useCallback((value) => {
    const timer = setTimeout(() => {
      setFilters(prev => ({...prev, search: value}))
      resetPaginationPage()
    }, 500)
    return () => clearTimeout(timer)
  }, [resetPaginationPage])

  const batchImport = usePatientBatchImport({
    departmentTreeData,
    fetchPatients,
    emitPatientRailRefresh,
    onCloseModal: () => setBatchImportVisible(false),
  })

  const closeImportPatientDetailModal = () => {
    setPatientDetailVisible(false)
    setViewingPatientDetail(null)
  }

  const columns = useMemo(() => createPatientColumns({
    onOpenPatient: (record) => navigate(`/patient/detail/${record.patientId}`)
  }), [navigate])

  // 重置筛选条件
  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS)
    setAdvancedFilters(INITIAL_ADVANCED_FILTERS)
    advancedFilterForm.resetFields()
    resetPaginationPage()
    message.success('筛选条件已重置')
  }

  const handleResetAdvancedFilters = () => {
    advancedFilterForm.resetFields()
    setAdvancedFilters(INITIAL_ADVANCED_FILTERS)
  }

  const handleApplyAdvancedFilters = (values) => {
    setAdvancedFilters({
      diagnosisKeywords: values.diagnosisKeywords || '',
      dateRange: values.dateRange || null,
      projectStatus: values.projectStatus || [],
      docCountMin: values.docCountMin,
      docCountMax: values.docCountMax
    })
    resetPaginationPage()
    setFilterVisible(false)
    message.success('高级筛选已应用')
  }

  const showPatientEmptyState =
    searchParams.get('emptyState') === 'patient' &&
    searchParams.get('openCreate') !== '1' &&
    !loading &&
    patientData.length === 0
  const pageProps = usePatientPoolPageProps({
    addPatient: {
      addPatientForm,
      addPatientLoading,
      addPatientStep,
      addPatientVisible,
      closeAddPatientModal,
      goPrevAddPatientStep,
      handleAddPatient,
      isEditingPatient,
    },
    advancedFilterForm,
    advancedFilters,
    batchImport,
    batchImportVisible,
    columnWidths,
    columns,
    departmentLoading,
    departmentTreeData,
    exportFlow: {
      exportForm,
      exportLoading,
      handleExport,
      setExportForm,
    },
    filters,
    getDepartmentNameById,
    handleApplyAdvancedFilters,
    handleBatchAction,
    handleResetAdvancedFilters,
    handleResetFilters,
    handleResize,
    handleTableChange,
    importDetail: {
      closeImportPatientDetailModal,
      patientDetailVisible,
      viewingPatientDetail,
    },
    loading,
    pagination,
    patientData,
    selectedRowKeys,
    setAdvancedFilterVisible: setFilterVisible,
    setBatchImportVisible,
    setExportModalVisible,
    setPatientDetailVisible,
    setSelectedRowKeys,
    setStatisticsCollapsed,
    setViewingPatientDetail,
    setVisibleColumns,
    statistics,
    statisticsCollapsed,
    toolbar: {
      batchActions,
      debounceSearch,
      exportModalVisible,
      filterVisible,
      resetPaginationPage,
      setFilters,
    },
    visibleColumns,
  })

  if (showPatientEmptyState) {
    return (
      <PatientEmptyState
        onCreate={() => {
          const nextParams = new URLSearchParams(searchParams)
          nextParams.delete('emptyState')
          setSearchParams(nextParams, { replace: true })
          dispatchRequestPatientCreate()
        }}
      />
    )
  }

  return (
    <PatientPoolPageShell {...pageProps} />
   )
 }

 export default PatientPool
