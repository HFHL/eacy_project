import { useState } from 'react'
import { message } from 'antd'
import { exportPatients } from '../../../api/patient'

const buildFilteredExportData = ({ exportForm, selectedRowKeys, filters, advancedFilters }) => {
  const exportData = {
    format: exportForm.format,
    scope: exportForm.scope,
    include_basic_info: exportForm.include_basic_info,
    include_diagnosis: exportForm.include_diagnosis,
    include_completeness: exportForm.include_completeness,
    include_ehr: exportForm.include_ehr,
    desensitize: exportForm.desensitize
  }

  if (exportForm.scope === 'selected') {
    exportData.patient_ids = selectedRowKeys
  } else if (exportForm.scope === 'filtered') {
    if (filters.search) exportData.search = filters.search
    if (filters.gender) exportData.gender = filters.gender
    if (filters.department) exportData.department_id = filters.department
    if (filters.projectStatus) exportData.has_projects = filters.projectStatus

    if (advancedFilters.diagnosisKeywords) {
      exportData.diagnosis_keywords = advancedFilters.diagnosisKeywords
    }
    if (advancedFilters.dateRange && advancedFilters.dateRange.length === 2) {
      exportData.start_date = advancedFilters.dateRange[0].format('YYYY-MM-DD')
      exportData.end_date = advancedFilters.dateRange[1].format('YYYY-MM-DD')
    }
    if (advancedFilters.projectStatus && advancedFilters.projectStatus.length > 0) {
      exportData.project_status = advancedFilters.projectStatus[0]
    }
    if (advancedFilters.docCountMin !== null && advancedFilters.docCountMin !== undefined) {
      exportData.doc_count_min = advancedFilters.docCountMin
    }
    if (advancedFilters.docCountMax !== null && advancedFilters.docCountMax !== undefined) {
      exportData.doc_count_max = advancedFilters.docCountMax
    }
  }

  return exportData
}

const downloadExportBlob = ({ response, format }) => {
  const blob = new Blob([response], {
    type: format === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : format === 'csv'
        ? 'text/csv'
        : 'application/json'
  })

  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const extension = format === 'excel' ? 'xlsx' : format

  link.href = url
  link.download = `患者数据导出_${timestamp}.${extension}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

const usePatientExport = ({
  selectedRowKeys,
  filters,
  advancedFilters,
  onExported,
}) => {
  const [exportLoading, setExportLoading] = useState(false)
  const [exportForm, setExportForm] = useState({
    format: 'excel',
    scope: 'selected',
    include_basic_info: true,
    include_diagnosis: true,
    include_completeness: true,
    include_ehr: true,
    desensitize: false
  })

  const handleExport = async () => {
    if (exportForm.scope === 'selected' && selectedRowKeys.length === 0) {
      message.warning('请先选择要导出的患者')
      return
    }

    setExportLoading(true)
    try {
      const exportData = buildFilteredExportData({
        exportForm,
        selectedRowKeys,
        filters,
        advancedFilters,
      })
      const response = await exportPatients(exportData)

      downloadExportBlob({ response, format: exportForm.format })
      message.success('导出成功')
      onExported()
    } catch (error) {
      console.error('导出失败:', error)
      message.error('导出失败，请稍后重试')
    } finally {
      setExportLoading(false)
    }
  }

  return {
    exportLoading,
    exportForm,
    setExportForm,
    handleExport,
  }
}

export default usePatientExport
