import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Form, theme } from 'antd'

import { useModals } from './hooks/useModals'
import { usePatientAiAssistant } from './hooks/usePatientAiAssistant'
import { usePatientData } from './hooks/usePatientData'
import { usePatientDetailActions } from './hooks/usePatientDetailActions'
import { usePatientDetailLazyTabs } from './hooks/usePatientDetailLazyTabs'
import { usePatientDetailTasks } from './hooks/usePatientDetailTasks'
import { usePatientEditIntent } from './hooks/usePatientEditIntent'
import { usePatientFieldConflicts } from './hooks/usePatientFieldConflicts'
import { PatientDetailModals } from './components/PatientDetailModals'
import PatientDetailPanel from './components/PatientDetailPanel'

const SENSITIVE_MODIFIED_RESET = { phone: false, idCard: false, address: false }

const PatientDetail = () => {
  const { token } = theme.useToken()
  const { patientId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [form] = Form.useForm()
  const [summaryForm] = Form.useForm()

  const [activeTab, setActiveTab] = useState('ehr-schema')
  const [sensitiveModified, setSensitiveModified] = useState(SENSITIVE_MODIFIED_RESET)

  const {
    patientInfo,
    aiSummary,
    summaryEditMode,
    setSummaryEditMode,
    summaryGenerating,
    handleEditPatient,
    handleSavePatient,
    handleEditSummary,
    handleSaveSummary,
    handleRegenerateSummary,
    patientDocuments,
    documentsLoading,
    loading,
    fetchPatientDetail,
    fetchPatientDocuments,
    fetchAiSummary,
    syncPatientStatsAfterDocumentChange,
  } = usePatientData(patientId)

  const {
    handleReExtract,
    loadTaskItems,
    pollUploadArchiveTask,
    setTaskCenterVisible,
    taskCenterVisible,
    taskItems,
    taskPolling,
  } = usePatientDetailTasks({
    fetchPatientDocuments,
    patientId,
    syncPatientStatsAfterDocumentChange,
  })

  const {
    uploadVisible,
    extractionVisible,
    editModalVisible,
    exportModalVisible,
    aiAssistantVisible,
    conflictResolveVisible,
    changeLogVisible,
    setUploadVisible,
    setExtractionVisible,
    setEditModalVisible,
    setExportModalVisible,
    setAiAssistantVisible,
    setConflictResolveVisible,
    setChangeLogVisible,
  } = useModals()

  const aiAssistant = usePatientAiAssistant()
  const { documentsTabLoadedRef } = usePatientDetailLazyTabs({
    activeTab,
    fetchAiSummary,
    fetchPatientDocuments,
    patientId,
  })
  const { openPatientEditModal } = usePatientEditIntent({
    form,
    handleEditPatient,
    loading,
    location,
    navigate,
    patientId,
    patientInfo,
    setEditModalVisible,
    setSensitiveModified,
  })

  const documents = patientDocuments || []
  const actions = usePatientDetailActions({
    aiSummary,
    documents,
    setActiveTab,
    setExportModalVisible,
    syncPatientStatsAfterDocumentChange,
    token,
  })
  const {
    conflicts,
    conflictsLoading,
    conflictResolvingId,
    handleResolveConflict,
  } = usePatientFieldConflicts({
    conflictResolveVisible,
    fetchPatientDetail,
    patientId,
    setConflictResolveVisible,
  })

  useEffect(() => {
    const handleRefreshFromRail = (event) => {
      const targetPatientId = String(event?.detail?.patientId || '')
      if (!targetPatientId || String(patientId) !== targetPatientId) return

      const reason = event?.detail?.reason || 'all'
      if (reason === 'all' || reason === 'documents') {
        if (documentsTabLoadedRef.current || activeTab === 'documents') {
          syncPatientStatsAfterDocumentChange?.()
        } else {
          fetchPatientDetail?.()
        }
      } else if (reason === 'stats') {
        fetchPatientDetail?.()
      }
    }

    window.addEventListener('patient-detail-refresh', handleRefreshFromRail)
    return () => window.removeEventListener('patient-detail-refresh', handleRefreshFromRail)
  }, [patientId, activeTab, documentsTabLoadedRef, fetchPatientDetail, syncPatientStatsAfterDocumentChange])

  return (
    <div className="page-container fade-in">
      <PatientDetailPanel
        activeTab={activeTab}
        aiSummary={aiSummary}
        documents={documents}
        documentsLoading={documentsLoading}
        fetchPatientDocuments={fetchPatientDocuments}
        getConfidenceTag={actions.getConfidenceTag}
        getDocumentIcon={actions.getDocumentIcon}
        handleDeleteDocument={actions.handleDeleteDocument}
        handleDocumentClick={actions.handleDocumentClick}
        handleEditSummary={handleEditSummary}
        handleExportData={actions.handleExportData}
        handleRegenerateSummary={handleRegenerateSummary}
        handleReExtract={handleReExtract}
        handleSaveSummary={handleSaveSummary}
        handleViewSourceDocument={actions.handleViewSourceDocument}
        loading={loading}
        navigate={navigate}
        onEditPatient={openPatientEditModal}
        patientId={patientId}
        patientInfo={patientInfo}
        renderSummaryWithFootnotes={actions.renderSummaryWithFootnotes}
        setActiveTab={setActiveTab}
        setSummaryEditMode={setSummaryEditMode}
        setUploadVisible={setUploadVisible}
        summaryEditMode={summaryEditMode}
        summaryForm={summaryForm}
        summaryGenerating={summaryGenerating}
        token={token}
      />

      <PatientDetailModals
        aiAssistant={{
          aiInput: aiAssistant.aiInput,
          aiMessages: aiAssistant.aiMessages,
          aiModalPosition: aiAssistant.aiModalPosition,
          isDragging: aiAssistant.isDragging,
          onCancel: () => setAiAssistantVisible(false),
          onDragEnd: aiAssistant.handleDragEnd,
          onDragStart: () => aiAssistant.setIsDragging(true),
          onInputChange: aiAssistant.setAiInput,
          onSend: aiAssistant.handleSendAiMessage,
          open: aiAssistantVisible,
          patientInfo,
          setAiInput: aiAssistant.setAiInput,
          setAiMessages: aiAssistant.setAiMessages,
        }}
        batchExtraction={{
          documents,
          getDocumentIcon: actions.getDocumentIcon,
          onCancel: () => setExtractionVisible(false),
          open: extractionVisible,
        }}
        changeLog={{
          changeLogs: [],
          onCancel: () => setChangeLogVisible(false),
          onConfirmChange: actions.handleConfirmChange,
          onRevertChange: actions.handleRevertChange,
          open: changeLogVisible,
        }}
        conflictResolve={{
          conflicts,
          conflictsLoading,
          conflictResolvingId,
          onCancel: () => setConflictResolveVisible(false),
          onResolveConflict: handleResolveConflict,
          open: conflictResolveVisible,
        }}
        editPatient={{
          form,
          handleSavePatient,
          open: editModalVisible,
          patientInfo,
          sensitiveModified,
          setOpen: setEditModalVisible,
          setSensitiveModified,
        }}
        exportPatient={{
          onCancel: () => setExportModalVisible(false),
          onConfirmExport: actions.handleConfirmExport,
          open: exportModalVisible,
        }}
        taskCenter={{
          loadTaskItems,
          onClose: () => setTaskCenterVisible(false),
          open: taskCenterVisible,
          taskItems,
          taskPolling,
        }}
        token={token}
        uploadDocument={{
          loadTaskItems,
          onClose: () => setUploadVisible(false),
          open: uploadVisible,
          patientId,
          pollUploadArchiveTask,
        }}
      />
    </div>
  )
}

export default PatientDetail
