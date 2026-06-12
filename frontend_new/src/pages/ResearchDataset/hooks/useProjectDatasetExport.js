import { useCallback, useState } from 'react'
import { Form, message } from 'antd'
import { exportProjectCrfFile } from '../../../api/project'

export const useProjectDatasetExport = ({ projectId, projectName, selectedPatients }) => {
  const [exportModalVisible, setExportModalVisible] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportForm] = Form.useForm()

  const openExportModal = useCallback(() => {
    setExportModalVisible(true)
  }, [])

  const closeExportModal = useCallback(() => {
    setExportModalVisible(false)
  }, [])

  const handleConfirmExport = useCallback(async () => {
    if (!projectId) return
    try {
      const values = await exportForm.validateFields()
      const scope = values.scope || 'all'
      const expandRepeatableRows = values.expand_repeatable_rows !== false

      if (!['all', 'selected'].includes(scope)) {
        message.error('不支持的导出范围')
        return
      }

      if (scope === 'selected' && (!selectedPatients || selectedPatients.length === 0)) {
        message.warning('当前未选择患者，无法导出"选中的患者"')
        return
      }

      setExportLoading(true)

      const response = await exportProjectCrfFile(projectId, {
        format: 'excel',
        scope,
        patient_ids: scope === 'selected' ? selectedPatients : undefined,
        expand_repeatable_rows: expandRepeatableRows,
      })

      if (response instanceof Blob && response.type && response.type.includes('application/json')) {
        const text = await response.text()
        try {
          const errObj = JSON.parse(text)
          message.error(errObj?.message || '导出失败')
        } catch {
          message.error('导出失败')
        }
        return
      }

      const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const blob = new Blob([response], { type: mime })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const safeName = (projectName || '项目').replace(/[\\/:*?"<>|]+/g, '_')
      link.download = `${safeName}_CRF导出_${timestamp}.xlsx`

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      message.success('导出成功')
      setExportModalVisible(false)
    } catch (error) {
      if (error?.errorFields) return
      console.error('导出失败:', error)
      message.error(error?.message || '导出失败，请稍后重试')
    } finally {
      setExportLoading(false)
    }
  }, [exportForm, projectId, projectName, selectedPatients])

  return {
    closeExportModal,
    exportForm,
    exportLoading,
    exportModalVisible,
    handleConfirmExport,
    openExportModal,
  }
}
