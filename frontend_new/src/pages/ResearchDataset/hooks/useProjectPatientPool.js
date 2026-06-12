import { useCallback, useMemo, useState } from 'react'
import { message } from 'antd'
import { enrollPatient } from '../../../api/project'
import { getPatientList } from '../../../api/patient'
import { buildPatientPoolColumns } from '../modules/patientPoolColumns'

export const useProjectPatientPool = ({
  fetchProjectDetail,
  fetchProjectPatients,
  projectId,
  token,
}) => {
  const [availablePatients, setAvailablePatients] = useState([])
  const [patientPoolLoading, setPatientPoolLoading] = useState(false)
  const [patientPoolPagination, setPatientPoolPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  const [patientPoolSearch, setPatientPoolSearch] = useState('')
  const [patientSelectionVisible, setPatientSelectionVisible] = useState(false)
  const [selectedNewPatients, setSelectedNewPatients] = useState([])

  const fetchPatientPool = useCallback(async (page = 1, pageSize = 10, search = '') => {
    setPatientPoolLoading(true)
    try {
      const response = await getPatientList({
        page,
        page_size: pageSize,
        search: search || undefined,
      })
      if (response.success) {
        const patients = response.data.map(patient => ({
          key: patient.id,
          id: patient.id,
          patient_code: patient.patient_code,
          name: patient.name,
          gender: patient.gender,
          age: patient.age,
          diagnosis: patient.diagnosis || [],
          completeness: parseFloat(patient.data_completeness) || 0,
          projects: patient.projects || [],
        }))
        setAvailablePatients(patients)
        setPatientPoolPagination({
          current: response.pagination.page,
          pageSize: response.pagination.page_size,
          total: response.pagination.total,
        })
      } else {
        message.error(response.message || '获取患者列表失败')
      }
    } catch (error) {
      console.error('获取患者列表失败:', error)
      message.error('获取患者列表失败')
    } finally {
      setPatientPoolLoading(false)
    }
  }, [])

  const handleAddPatients = useCallback(() => {
    setPatientSelectionVisible(true)
    setPatientPoolSearch('')
    setSelectedNewPatients([])
    fetchPatientPool(1, 10, '')
  }, [fetchPatientPool])

  const handleConfirmAddPatients = useCallback(async () => {
    if (selectedNewPatients.length === 0) {
      message.warning('请先选择要添加的患者')
      return
    }

    setPatientPoolLoading(true)
    try {
      let successCount = 0
      let failedCount = 0

      for (const patientId of selectedNewPatients) {
        try {
          const response = await enrollPatient(projectId, { patient_id: patientId })
          if (response.success) {
            successCount++
          } else {
            failedCount++
          }
        } catch {
          failedCount++
        }
      }

      if (successCount > 0) {
        message.success(`成功添加 ${successCount} 名患者到项目`)
        fetchProjectPatients()
        fetchProjectDetail()
      }

      if (failedCount > 0) {
        message.warning(`${failedCount} 名患者添加失败`)
      }

      setPatientSelectionVisible(false)
      setSelectedNewPatients([])
    } catch (error) {
      console.error('添加患者失败:', error)
      message.error('添加患者失败')
    } finally {
      setPatientPoolLoading(false)
    }
  }, [fetchProjectDetail, fetchProjectPatients, projectId, selectedNewPatients])

  const handleCancelPatientSelection = useCallback(() => {
    setPatientSelectionVisible(false)
    setSelectedNewPatients([])
  }, [])

  const isPatientInCurrentProject = useCallback((patient) => {
    if (!patient.projects || !projectId) return false
    return patient.projects.some(
      p => p.id === projectId && p.enrollment_status !== 'withdrawn'
    )
  }, [projectId])

  const patientColumns = useMemo(() => buildPatientPoolColumns({
    token,
    projectId,
  }), [projectId, token])

  return {
    availablePatients,
    fetchPatientPool,
    handleAddPatients,
    handleCancelPatientSelection,
    handleConfirmAddPatients,
    isPatientInCurrentProject,
    patientColumns,
    patientPoolLoading,
    patientPoolPagination,
    patientPoolSearch,
    patientSelectionVisible,
    selectedNewPatients,
    setPatientPoolSearch,
    setSelectedNewPatients,
  }
}
