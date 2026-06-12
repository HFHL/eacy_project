import React from 'react'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import AIProcessingOverlays from './modules/AIProcessingOverlays'
import AIProcessingPageFrame from './modules/AIProcessingPageFrame'
import AIProcessingReviewGrid from './modules/AIProcessingReviewGrid'
import { useAIProcessingPreview } from './modules/useAIProcessingPreview'
import { useAIProcessingPatientSearch } from './modules/useAIProcessingPatientSearch'
import { useAutoArchiveConfirmation } from './modules/useAutoArchiveConfirmation'
import { useAIProcessingDocumentQueues } from './modules/useAIProcessingDocumentQueues'
import { useAIProcessingDocumentActions } from './modules/useAIProcessingDocumentActions'
import { useBatchPatientMatchRecommendation } from './modules/useBatchPatientMatchRecommendation'
import { useCreatePatientArchiveFlow } from './modules/useCreatePatientArchiveFlow'
import { useAIProcessingSelectionState } from './modules/useAIProcessingSelectionState'
import { usePatientMatchArchiveActions } from './modules/usePatientMatchArchiveActions'

const AIProcessing = () => {
  const navigate = useNavigate()
  const {
    archivingLoading, patientMatchVisible, processedDocs, selectedAutoDocs,
    selectedDocs, selectedDocument, selectedNewPatientDocs, setArchivingLoading,
    setPatientMatchVisible, setProcessedDocs, setSelectedAutoDocs, setSelectedDocs,
    setSelectedDocument, setSelectedNewPatientDocs,
  } = useAIProcessingSelectionState()

  const {
    autoArchivedDocs,
    autoArchivedLoading,
    autoArchivedSort,
    fetchAutoArchivedDocs,
    fetchNeedsReviewDocs,
    fetchNewPatientDocs,
    groupedAutoArchivedDocs,
    groupedNewPatientDocs,
    needsReviewDocs,
    needsReviewLoading,
    needsReviewSort,
    newPatientDocs,
    newPatientLoading,
    newPatientSort,
    setAutoArchivedDocs,
    setAutoArchivedSort,
    setNeedsReviewSort,
    setNewPatientSort,
    sortedAutoArchivedDocs,
    sortedNeedsReviewDocs,
    sortedNewPatientDocs,
    visibleNewPatientDocs,
  } = useAIProcessingDocumentQueues({ message, processedDocs })
  const {
    batchConfirming,
    confirmingDocId,
    handleBatchConfirmAutoArchive,
    handleConfirmAutoArchive,
  } = useAutoArchiveConfirmation({
    autoArchivedDocs,
    fetchAutoArchivedDocs,
    message,
    setAutoArchivedDocs,
    setSelectedAutoDocs,
  })

  const {
    handlePatientSearch,
    handleSelectSearchPatient,
    patientSearchLoading,
    patientSearchResults,
    patientSearchValue,
    selectedMatchPatient,
    setPatientSearchResults,
    setPatientSearchValue,
    setSelectedMatchPatient,
    setShowSearchResults,
    showSearchResults,
  } = useAIProcessingPatientSearch()

  const {
    detailModalVisible,
    handleArchivePatient,
    handleChangePatient,
    handleDetailModalClose,
    handleDocumentClick,
    handleDownload,
    handleExtractSuccess,
    handleFieldSave,
    handleReExtract,
    handleViewOcr,
    selectedDocumentForDetail,
  } = useAIProcessingDocumentActions({
    autoArchivedDocs,
    fetchAutoArchivedDocs,
    fetchNeedsReviewDocs,
    fetchNewPatientDocs,
    message,
    needsReviewDocs,
    newPatientDocs,
    setPatientMatchVisible,
    setPatientSearchResults,
    setPatientSearchValue,
    setSelectedDocument,
    setSelectedMatchPatient,
    setShowSearchResults,
  })

  const { promptBatchMatchForSamePerson } = useBatchPatientMatchRecommendation({
    fetchNeedsReviewDocs,
    fetchNewPatientDocs,
    newPatientDocs,
  })

  const {
    docPreviewDocumentId,
    docPreviewExtractionRecord,
    docPreviewFileType,
    docPreviewLoading,
    docPreviewName,
    docPreviewTab,
    docPreviewTempUrl,
    docPreviewVisible,
    extractionDocName,
    extractionResultData,
    extractionResultLoading,
    extractionResultVisible,
    handleCopyJson,
    handleViewExtractionResult,
    openDocumentPreview,
    setDocPreviewTab,
    setDocPreviewVisible,
    setExtractionResultVisible,
  } = useAIProcessingPreview({ message })

  const {
    editPatientVisible,
    editingPatientItem,
    handleCloseEditPatient,
    handleCreatePatientAndArchiveFromModal,
    handleCreatePatientDrawerSuccess,
    handleOpenBatchEditPatient,
    handleOpenEditPatient,
  } = useCreatePatientArchiveFlow({
    fetchAutoArchivedDocs,
    fetchNeedsReviewDocs,
    fetchNewPatientDocs,
    promptBatchMatchForSamePerson,
    selectedDocument,
    setProcessedDocs,
    setSelectedNewPatientDocs,
  })

  const {
    closePatientMatchModal,
    handleConfirmMatch,
    handleConfirmPatientMatch,
    handlePatientSearchChangeInModal,
    handleSmartRecommend,
    showPatientMatch,
  } = usePatientMatchArchiveActions({
    autoArchivedDocs,
    fetchAutoArchivedDocs,
    fetchNeedsReviewDocs,
    fetchNewPatientDocs,
    handlePatientSearch,
    patientMatchVisible,
    selectedDocument,
    selectedMatchPatient,
    setArchivingLoading,
    setPatientMatchVisible,
    setPatientSearchResults,
    setPatientSearchValue,
    setProcessedDocs,
    setSelectedDocument,
    setSelectedMatchPatient,
    setShowSearchResults,
  })

  return (
    <AIProcessingPageFrame>
      <AIProcessingReviewGrid
        needsReviewProps={{
          needsReviewLoading,
          needsReviewSort,
          onConfirmMatch: handleConfirmMatch,
          onDocumentClick: handleDocumentClick,
          onRefresh: fetchNeedsReviewDocs,
          onSetNeedsReviewSort: setNeedsReviewSort,
          onSetProcessedDocs: setProcessedDocs,
          onSetSelectedDocs: setSelectedDocs,
          onShowPatientMatch: showPatientMatch,
          onViewExtractionResult: handleViewExtractionResult,
          processedDocs,
          selectedDocs,
          sortedNeedsReviewDocs,
        }}
        newPatientProps={{
          groupedNewPatientDocs,
          newPatientDocs,
          newPatientLoading,
          newPatientSort,
          onCreatePatient: handleOpenEditPatient,
          onCreatePatientBatch: handleOpenBatchEditPatient,
          onDocumentClick: handleDocumentClick,
          onRefresh: fetchNewPatientDocs,
          onSetNewPatientSort: setNewPatientSort,
          onSetSelectedNewPatientDocs: setSelectedNewPatientDocs,
          onShowPatientMatch: showPatientMatch,
          onViewExtractionResult: handleViewExtractionResult,
          processedDocs,
          selectedNewPatientDocs,
          sortedNewPatientDocs,
          visibleNewPatientDocs,
        }}
        autoArchivedProps={{
          autoArchivedDocs,
          autoArchivedLoading,
          autoArchivedSort,
          batchConfirming,
          confirmingDocId,
          groupedAutoArchivedDocs,
          onBatchConfirmAutoArchive: handleBatchConfirmAutoArchive,
          onConfirmAutoArchive: handleConfirmAutoArchive,
          onDocumentClick: handleDocumentClick,
          onRefresh: fetchAutoArchivedDocs,
          onSetAutoArchivedSort: setAutoArchivedSort,
          onSetSelectedAutoDocs: setSelectedAutoDocs,
          onShowPatientMatch: showPatientMatch,
          onViewExtractionResult: handleViewExtractionResult,
          selectedAutoDocs,
          sortedAutoArchivedDocs,
        }}
      />

      <AIProcessingOverlays
        navigate={navigate}
        detailProps={{
          detailModalVisible,
          handleArchivePatient,
          handleChangePatient,
          handleDetailModalClose,
          handleDownload,
          handleExtractSuccess,
          handleFieldSave,
          handleReExtract,
          handleViewOcr,
          selectedDocumentForDetail,
        }}
        patientMatchProps={{
          open: patientMatchVisible,
          selectedDocument,
          selectedMatchPatient,
          archivingLoading,
          patientSearchValue,
          patientSearchLoading,
          patientSearchResults,
          showSearchResults,
          onCancel: closePatientMatchModal,
          onCreatePatient: handleCreatePatientAndArchiveFromModal,
          onConfirmPatientMatch: handleConfirmPatientMatch,
          onPreviewDocument: openDocumentPreview,
          onSmartRecommend: handleSmartRecommend,
          onConfirmMatch: handleConfirmMatch,
          onPatientSearchChange: handlePatientSearchChangeInModal,
          onSearchFocus: () => setShowSearchResults(true),
          onSearchBlur: () => setTimeout(() => setShowSearchResults(false), 200),
          onSearchClear: () => setSelectedMatchPatient(null),
          onSelectSearchPatient: handleSelectSearchPatient,
        }}
        previewProps={{
          open: docPreviewVisible,
          loading: docPreviewLoading,
          documentId: docPreviewDocumentId,
          name: docPreviewName,
          tempUrl: docPreviewTempUrl,
          fileType: docPreviewFileType,
          extractionRecord: docPreviewExtractionRecord,
          activeTab: docPreviewTab,
          onTabChange: setDocPreviewTab,
          onClose: () => setDocPreviewVisible(false),
        }}
        extractionResultProps={{
          open: extractionResultVisible,
          loading: extractionResultLoading,
          data: extractionResultData,
          docName: extractionDocName,
          onCancel: () => setExtractionResultVisible(false),
          onCopy: handleCopyJson,
        }}
        createPatientProps={{
          open: editPatientVisible,
          documentIds: editingPatientItem?.isBatch
            ? (editingPatientItem.documentIds || [])
            : (editingPatientItem?.id ? [editingPatientItem.id] : []),
          onClose: handleCloseEditPatient,
          onSuccess: handleCreatePatientDrawerSuccess,
        }}
      />
    </AIProcessingPageFrame>
  )
}

export default AIProcessing
