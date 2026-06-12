import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { getDepartmentTree, getPatientList } from '../../../api/patient'

const DEFAULT_STATISTICS = {
  totalPatients: 0,
  totalDocuments: 0,
  averageCompleteness: 0,
  recentlyAdded: 0
}

const buildListParams = ({ pagination, filters, advancedFilters }) => {
  const params = {
    page: pagination.current,
    page_size: pagination.pageSize
  }

  if (filters.search) params.search = filters.search
  if (filters.gender) params.gender = filters.gender
  if (filters.department) params.department_id = filters.department
  if (filters.projectStatus) params.has_projects = filters.projectStatus

  if (advancedFilters.diagnosisKeywords) {
    params.diagnosis_keywords = advancedFilters.diagnosisKeywords
  }
  if (advancedFilters.dateRange && advancedFilters.dateRange.length === 2) {
    params.start_date = advancedFilters.dateRange[0].format('YYYY-MM-DD')
    params.end_date = advancedFilters.dateRange[1].format('YYYY-MM-DD')
  }
  if (advancedFilters.projectStatus && advancedFilters.projectStatus.length > 0) {
    params.project_status = advancedFilters.projectStatus[0]
  }
  if (advancedFilters.docCountMin !== null && advancedFilters.docCountMin !== undefined) {
    params.doc_count_min = advancedFilters.docCountMin
  }
  if (advancedFilters.docCountMax !== null && advancedFilters.docCountMax !== undefined) {
    params.doc_count_max = advancedFilters.docCountMax
  }

  return params
}

const toPatientRow = (patient) => ({
  key: patient.id,
  id: patient.patient_code,
  patientId: patient.id,
  name: patient.name,
  gender: patient.gender,
  age: patient.age,
  birthDate: patient.birth_date,
  diagnosis: patient.diagnosis || [],
  tags: patient.tags || [],
  department: patient.department_name || '未分配',
  documentCount: patient.document_count || 0,
  pendingFieldConflictCount: patient.pending_field_conflict_count || 0,
  hasPendingFieldConflicts: !!patient.has_pending_field_conflicts,
  completeness: parseFloat(patient.data_completeness) || 0,
  projects: patient.projects || [],
  lastUpdate: patient.updated_at ? new Date(patient.updated_at).toLocaleDateString() : '-',
  updatedAtRaw: patient.updated_at || patient.created_at || '',
  doctor: patient.attending_doctor_name || '未分配',
  status: patient.status
})

const toTreeData = (nodes = []) => nodes.map(node => ({
  title: node.name,
  value: node.id,
  key: node.id,
  children: node.children && node.children.length > 0 ? toTreeData(node.children) : undefined
}))

const findDepartmentName = (nodes, departmentId) => {
  for (const node of nodes) {
    if (node.value === departmentId || node.key === departmentId) return node.title
    if (node.children && node.children.length > 0) {
      const found = findDepartmentName(node.children, departmentId)
      if (found) return found
    }
  }
  return null
}

const usePatientPoolData = ({ filters, advancedFilters }) => {
  const [patientData, setPatientData] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  })
  const [statistics, setStatistics] = useState(DEFAULT_STATISTICS)
  const [departmentTreeData, setDepartmentTreeData] = useState([])
  const [departmentLoading, setDepartmentLoading] = useState(false)

  const fetchPatients = useCallback(async () => {
    setLoading(true)
    try {
      const response = await getPatientList(buildListParams({ pagination, filters, advancedFilters }))

      if (response.success && response.code === 0) {
        setPatientData(response.data.map(toPatientRow))
        setPagination(prev => ({
          ...prev,
          total: response.pagination?.total || 0
        }))

        if (response.statistics) {
          setStatistics({
            totalPatients: response.pagination?.total || 0,
            totalDocuments: response.statistics.total_documents || 0,
            averageCompleteness: response.statistics.average_completeness || 0,
            recentlyAdded: response.statistics.recently_added || 0
          })
        }
      }
    } catch (error) {
      console.error('获取患者列表失败:', error)
    } finally {
      setLoading(false)
    }
  }, [
    advancedFilters,
    filters.department,
    filters.gender,
    filters.projectStatus,
    filters.search,
    pagination.current,
    pagination.pageSize,
  ])

  const fetchDepartmentTree = useCallback(async () => {
    setDepartmentLoading(true)
    try {
      const response = await getDepartmentTree()
      if (response.success && response.code === 0) {
        setDepartmentTreeData(toTreeData(response.data))
      }
    } catch (error) {
      console.error('获取科室树失败:', error)
      message.error('获取科室列表失败')
    } finally {
      setDepartmentLoading(false)
    }
  }, [])

  const getDepartmentNameById = useCallback((departmentId) => {
    if (!departmentId || departmentTreeData.length === 0) return '未选择'
    return findDepartmentName(departmentTreeData, departmentId) || '未知科室'
  }, [departmentTreeData])

  const handleTableChange = useCallback((paginationConfig) => {
    setPagination(prev => ({
      ...prev,
      current: paginationConfig.current,
      pageSize: paginationConfig.pageSize
    }))
  }, [])

  const resetPaginationPage = useCallback(() => {
    setPagination(prev => ({ ...prev, current: 1 }))
  }, [])

  useEffect(() => {
    fetchPatients()
  }, [fetchPatients])

  useEffect(() => {
    fetchDepartmentTree()
  }, [fetchDepartmentTree])

  return {
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
  }
}

export default usePatientPoolData
