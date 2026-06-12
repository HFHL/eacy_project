import React, { useCallback, useMemo, useState } from 'react'
import {
  buildProjectFieldSourceContext,
} from '../../../utils/auditResolver'
import ProjectSourcePopoverContent, {
  buildPatientDocTypeGroups,
} from '../modules/ProjectSourcePopoverContent'

export function useProjectFieldSourceFlow({ patientDataset, token }) {
  const [fieldSourceModalVisible, setFieldSourceModalVisible] = useState(false)
  const [currentFieldSource, setCurrentFieldSource] = useState(null)
  const [docDetailVisible, setDocDetailVisible] = useState(false)
  const [docDetailDoc, setDocDetailDoc] = useState(null)

  const openDocDetail = useCallback((docId) => {
    setDocDetailDoc({ id: docId })
    setDocDetailVisible(true)
  }, [])

  const closeDocDetail = useCallback(() => {
    setDocDetailVisible(false)
    setDocDetailDoc(null)
  }, [])

  const closeFieldSourceModal = useCallback(() => {
    setFieldSourceModalVisible(false)
    setCurrentFieldSource(null)
  }, [])

  const patientDocTypeGroups = useMemo(
    () => buildPatientDocTypeGroups(patientDataset),
    [patientDataset]
  )

  const renderSourcePopover = useCallback(({
    groupLabel = null,
    includeUnmatched = false,
    maxDocLinkWidth = 260,
    sources,
    title,
  }) => (
    <ProjectSourcePopoverContent
      docTypeGroups={patientDocTypeGroups}
      groupLabel={groupLabel}
      includeUnmatched={includeUnmatched}
      maxDocLinkWidth={maxDocLinkWidth}
      onOpenDoc={openDocDetail}
      patientCount={patientDataset.length}
      sources={sources}
      title={title}
      token={token}
    />
  ), [openDocDetail, patientDataset.length, patientDocTypeGroups, token])

  const handleViewFieldSource = useCallback((patientId, fieldName, fieldData, patient, options = {}) => {
    const patientRecord = patient || patientDataset.find((item) => item.patientId === patientId || item.id === patientId)
    if (!patientRecord) {
      console.warn('未找到患者数据:', patientId)
      return
    }

    const sourceContext = buildProjectFieldSourceContext(patientRecord, fieldData, {
      fieldName,
      fieldPath: options.fieldPath || fieldName,
      rowIndex: Number.isInteger(options.rowIndex) ? options.rowIndex : null,
      groupName: options.groupName || null,
    })

    const crfData = patientRecord?.crf_data || {}
    const allChangeLogs = Array.isArray(crfData._change_logs) ? crfData._change_logs : []
    const fieldPath = options.fieldPath || fieldName
    const fieldChangeLogs = allChangeLogs.filter((log) => {
      if (!log || !log.field_path) return false
      return log.field_path === fieldPath
        || log.field_path.startsWith(fieldPath + '.')
        || fieldPath.startsWith(log.field_path + '.')
    }).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

    setCurrentFieldSource({
      fieldName,
      fieldValue: fieldData?.value,
      fieldData,
      audit: sourceContext.audit,
      documents: sourceContext.documents,
      changeLogs: fieldChangeLogs,
      projectPatientId: patientRecord?.id || null,
      fieldPath,
    })
    setFieldSourceModalVisible(true)
  }, [patientDataset])

  return {
    closeDocDetail,
    closeFieldSourceModal,
    currentFieldSource,
    docDetailDoc,
    docDetailVisible,
    fieldSourceModalVisible,
    handleViewFieldSource,
    renderSourcePopover,
  }
}
