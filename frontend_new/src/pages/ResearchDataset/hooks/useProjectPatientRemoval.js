import { useCallback } from 'react'
import { Modal, message } from 'antd'
import { removeProjectPatient } from '../../../api/project'

export function useProjectPatientRemoval({
  fetchProjectDetail,
  fetchProjectPatients,
  pagination,
  projectId,
  selectedPatients,
  setSelectedPatients,
}) {
  return useCallback(() => {
    if (selectedPatients.length === 0) {
      message.warning('请先选择要移出的患者')
      return
    }

    Modal.confirm({
      title: '确认移出患者',
      content: `确定要将 ${selectedPatients.length} 名患者从项目中移出吗？移出后患者数据将保留在患者池中。`,
      okText: '确认移出',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        if (!projectId) return
        const patientIds = [...selectedPatients]
        let successCount = 0
        let failedCount = 0

        for (const patientId of patientIds) {
          try {
            const response = await removeProjectPatient(projectId, patientId)
            if (response?.success) {
              successCount += 1
            } else {
              failedCount += 1
            }
          } catch {
            failedCount += 1
          }
        }

        if (successCount > 0) {
          message.success(`成功移出 ${successCount} 名患者`)
          setSelectedPatients([])
          fetchProjectPatients(pagination.current, pagination.pageSize)
          fetchProjectDetail()
        }
        if (failedCount > 0) {
          message.warning(`${failedCount} 名患者移出失败`)
        }
      },
    })
  }, [fetchProjectDetail, fetchProjectPatients, pagination.current, pagination.pageSize, projectId, selectedPatients, setSelectedPatients])
}
