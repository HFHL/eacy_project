import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'

import { getFieldConflicts, resolveFieldConflict } from '@/api/patient'

export const usePatientFieldConflicts = ({
  conflictResolveVisible,
  fetchPatientDetail,
  patientId,
  setConflictResolveVisible,
}) => {
  const [conflicts, setConflicts] = useState([])
  const [conflictsLoading, setConflictsLoading] = useState(false)
  const [conflictResolvingId, setConflictResolvingId] = useState(null)

  const loadConflicts = useCallback(async () => {
    if (!patientId) return

    setConflictsLoading(true)
    try {
      const res = await getFieldConflicts(patientId, 'pending')
      setConflicts(res?.data?.conflicts || [])
    } catch {
      setConflicts([])
    } finally {
      setConflictsLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    if (!conflictResolveVisible || !patientId) return
    loadConflicts()
  }, [conflictResolveVisible, patientId, loadConflicts])

  const handleResolveConflict = useCallback(async (conflictId, action) => {
    if (!patientId) return

    setConflictResolvingId(conflictId)
    try {
      await resolveFieldConflict(patientId, conflictId, action)
      message.success(action === 'adopt' ? '已采用新值' : '已保留旧值')

      const res = await getFieldConflicts(patientId, 'pending')
      const list = res?.data?.conflicts || []
      setConflicts(list)
      if (action === 'adopt') {
        fetchPatientDetail?.()
      }
      if (!list.length) {
        setConflictResolveVisible(false)
      }
    } catch (error) {
      message.error(`解决冲突失败: ${error?.message || '未知错误'}`)
    } finally {
      setConflictResolvingId(null)
    }
  }, [fetchPatientDetail, patientId, setConflictResolveVisible])

  return {
    conflicts,
    conflictsLoading,
    conflictResolvingId,
    handleResolveConflict,
  }
}
