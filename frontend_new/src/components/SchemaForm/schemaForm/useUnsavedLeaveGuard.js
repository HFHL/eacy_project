import { useCallback, useRef, useState } from 'react'
import { message } from 'antd'

export function useUnsavedLeaveGuard({
  actions,
  draftData,
  isDirty,
  onSave,
  patientData,
  setHistoryRefreshKey,
  setSaving,
}) {
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false)
  const leaveResolveRef = useRef(null)
  const pendingPathRef = useRef(null)

  const onBeforeSelect = useCallback((nextPath) => {
    if (!isDirty) return Promise.resolve(true)
    pendingPathRef.current = nextPath
    setLeaveConfirmOpen(true)
    return new Promise((resolve) => {
      leaveResolveRef.current = resolve
    })
  }, [isDirty])

  const onBeforeClearForm = useCallback(() => {
    if (!isDirty) return Promise.resolve(true)
    setLeaveConfirmOpen(true)
    return new Promise((resolve) => {
      leaveResolveRef.current = resolve
    })
  }, [isDirty])

  const handleLeaveConfirmSave = useCallback(async () => {
    setSaving(true)
    try {
      if (onSave) await onSave(draftData, 'manual')
      actions.markSaved()
      setHistoryRefreshKey((key) => key + 1)
      message.success('保存成功')
      leaveResolveRef.current?.(true)
      leaveResolveRef.current = null
      setLeaveConfirmOpen(false)
      pendingPathRef.current = null
    } catch (error) {
      message.error('保存失败: ' + (error.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }, [actions, draftData, onSave, setHistoryRefreshKey, setSaving])

  const handleLeaveConfirmDiscard = useCallback(() => {
    actions.setPatientData(patientData)
    leaveResolveRef.current?.(true)
    leaveResolveRef.current = null
    setLeaveConfirmOpen(false)
    pendingPathRef.current = null
  }, [actions, patientData])

  const handleLeaveConfirmCancel = useCallback(() => {
    leaveResolveRef.current?.(false)
    leaveResolveRef.current = null
    setLeaveConfirmOpen(false)
    pendingPathRef.current = null
  }, [])

  return {
    handleLeaveConfirmCancel,
    handleLeaveConfirmDiscard,
    handleLeaveConfirmSave,
    leaveConfirmOpen,
    onBeforeClearForm,
    onBeforeSelect,
  }
}
