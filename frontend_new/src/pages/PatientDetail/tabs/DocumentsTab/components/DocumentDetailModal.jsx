/**
 * 文档详情弹窗组件
 * 双栏布局：左侧文档预览，右侧字段编辑
 */
import React, { useState, forwardRef, useImperativeHandle } from 'react'
import ConflictDetailModal from './ConflictDetailModal'
import PatientDetailDrawer from './PatientDetailDrawer'
import ExtractionMergeModal from './ExtractionMergeModal'
import ArrayFieldDetailModal from './ArrayFieldDetailModal'
import { renderArrayRecordFields } from './ArrayFieldRecordContent'
import DocumentDetailShell from './DocumentDetailShell'
import {
  resolveBoundPatientId,
} from './documentDetailStatus'
import { useOcrContentDisplay } from '../hooks/useOcrContentDisplay'
import { useDocumentPreview } from '../hooks/useDocumentPreview'
import { useDocumentOperationHistory } from '../hooks/useDocumentOperationHistory'
import { useDocumentMetadataEditor } from '../hooks/useDocumentMetadataEditor'
import { useDocumentTaskPolling } from '../hooks/useDocumentTaskPolling'
import { useDocumentDetailLoader } from '../hooks/useDocumentDetailLoader'
import { useDocumentDetailActions } from '../hooks/useDocumentDetailActions'
import './DocumentDetailModal.css'

const DocumentDetailModal = forwardRef(({
  visible,
  document,
  patientId,
  onClose,
  onSave,
  onReExtract,
  onChangePatient,
  onArchivePatient,    // 未绑定患者时点击「选择患者归档」的回调
  onDownload,
  onViewOcr,
  onExtractSuccess,
  onRefresh,           // 解除绑定/更换患者后刷新列表
  onDeleteSuccess,     // 删除文档成功后回调（关闭弹窗、刷新列表）
  refreshTrigger = 0,  // 父组件递增后触发详情重新拉取（如更换患者成功）
  showTaskStatus = false  // 是否显示 task_status（归档审核页面使用）
}, ref) => {
  const [activeTab, setActiveTab] = useState('metadata')
  /** 患者详情弹窗：当前选中的关联患者（来自 linked_patients，含基本信息脱敏字段） */
  const [patientDetailModalVisible, setPatientDetailModalVisible] = useState(false)
  const [selectedPatientForDetail, setSelectedPatientForDetail] = useState(null)

  const closePatientDetailDrawer = () => {
    setPatientDetailModalVisible(false)
    setSelectedPatientForDetail(null)
  }
  // 文档详情数据（从 API 获取，包含 content_list 和 extracted_ehr_data）
  const [documentDetail, setDocumentDetail] = useState(null)

  const preview = useDocumentPreview({ document, documentDetail, visible })
  const ocrContent = useOcrContentDisplay({ document, visible })

  // 冲突详情弹窗状态
  const [conflictModalVisible, setConflictModalVisible] = useState(false)
  const [selectedExtractionId, setSelectedExtractionId] = useState(null)

  // 可重复字段详情弹窗状态
  const [arrayFieldModalVisible, setArrayFieldModalVisible] = useState(false)
  const [selectedArrayField, setSelectedArrayField] = useState(null)

  const closeArrayFieldModal = () => {
    setArrayFieldModalVisible(false)
    setSelectedArrayField(null)
  }

  const history = useDocumentOperationHistory({ activeTab, document, visible })
  const detail = useDocumentDetailLoader({
    document,
    documentDetail,
    refreshTrigger,
    resetImageTransform: preview.resetImageTransform,
    resetOcrDisplay: ocrContent.resetOcrDisplay,
    resetOperationHistory: history.resetOperationHistory,
    resetPreview: preview.resetPreview,
    setActiveTab,
    setDocumentDetail,
    showTaskStatus,
    visible,
  })
  const metadataEditor = useDocumentMetadataEditor({
    document,
    documentDetail,
    fetchDocumentDetail: detail.fetchDocumentDetail,
    onExtractSuccess,
    onSave,
  })

  const boundPatientId = resolveBoundPatientId(documentDetail, document, patientId)
  const polling = useDocumentTaskPolling({
    boundPatientId,
    detailLoading: detail.detailLoading,
    document,
    documentDetail,
    fetchDocumentDetail: detail.fetchDocumentDetail,
    onExtractSuccess,
    onRefresh,
    setDocumentDetail,
    visible,
  })
  const actions = useDocumentDetailActions({
    document,
    fetchDocumentDetail: detail.fetchDocumentDetail,
    onClose,
    onDeleteSuccess,
    onExtractSuccess,
    patientId,
  })

  // 暴露给父组件：强制重新拉取详情（如更换患者成功后刷新 tag）
  useImperativeHandle(ref, () => ({
    refetch: () => {
      if (document?.id) detail.fetchDocumentDetail(document.id)
    }
  }), [document?.id, detail.fetchDocumentDetail])

  if (!document) return null

  const handleViewArrayField = (field) => {
    setSelectedArrayField(field)
    setArrayFieldModalVisible(true)
  }

  const handleExtractionConflictClick = (extractionId) => {
    setSelectedExtractionId(extractionId)
    setConflictModalVisible(true)
  }

  return (
    <>
      <DocumentDetailShell
        actions={actions}
        activeTab={activeTab}
        boundPatientId={boundPatientId}
        detail={detail}
        document={document}
        documentDetail={documentDetail}
        history={history}
        metadataEditor={metadataEditor}
        ocrContent={ocrContent}
        onArchivePatient={onArchivePatient}
        onChangePatient={onChangePatient}
        onClose={onClose}
        onConflictClick={handleExtractionConflictClick}
        onRefresh={onRefresh}
        onTabChange={setActiveTab}
        onViewArrayField={handleViewArrayField}
        onViewPatient={(patient) => {
          setSelectedPatientForDetail(patient)
          setPatientDetailModalVisible(true)
        }}
        polling={polling}
        preview={preview}
        showTaskStatus={showTaskStatus}
        visible={visible}
      />

      <ExtractionMergeModal
        open={actions.mergeModalVisible}
        extractResult={actions.extractResult}
        merging={actions.merging}
        onCancel={actions.handleCancelMerge}
        onConfirm={actions.handleConfirmMerge}
      />

      {/* 冲突详情弹窗 */}
      <ConflictDetailModal
        visible={conflictModalVisible}
        extractionId={selectedExtractionId}
        onClose={() => {
          setConflictModalVisible(false)
          setSelectedExtractionId(null)
        }}
        onResolve={() => {
          // 冲突解决后刷新文档详情
          if (document?.id) {
            detail.fetchDocumentDetail(document.id)
          }
        }}
      />

      <ArrayFieldDetailModal
        open={arrayFieldModalVisible}
        field={selectedArrayField}
        onClose={closeArrayFieldModal}
        renderRecordFields={renderArrayRecordFields}
      />

      <PatientDetailDrawer
        open={patientDetailModalVisible}
        patient={selectedPatientForDetail}
        onClose={closePatientDetailDrawer}
      />
    </>
  )
})

DocumentDetailModal.displayName = 'DocumentDetailModal'

export default DocumentDetailModal
