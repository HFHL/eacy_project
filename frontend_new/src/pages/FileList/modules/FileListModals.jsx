import React from 'react'
import DocumentDetailModal from '../../PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal'
import CreatePatientDrawer from '../../../components/Patient/CreatePatientDrawer'
import { archiveDocument, confirmGroupArchive } from '../../../api/document'
import { createPatient } from '../../../api/patient'
import { PatientMatchModal } from './PatientMatchModal'
import { ManualArchiveModals } from './ManualArchiveModals'

export const FileListModals = ({
  batchManualArchiveVisible,
  batchPatientSearchLoading,
  batchPatientSearchResults,
  batchPatientSearchValue,
  batchProcessing,
  createPatientDocIds,
  createPatientDrawerOpen,
  createPatientGroupId,
  createPatientMode,
  createPatientPrefillValues,
  detailModalRef,
  detailModalVisible,
  detailRefreshTrigger,
  groupManualArchiveVisible,
  groupPatientSearchLoading,
  groupPatientSearchResults,
  groupPatientSearchValue,
  handleArchivePatient,
  handleBatchPatientSearch,
  handleChangePatient,
  handleConfirmBatchManualArchive,
  handleConfirmGroupManualArchive,
  handleConfirmMatch,
  handleConfirmPatientMatch,
  handleDetailModalClose,
  handleGroupPatientSearch,
  handlePatientSearch,
  handleReExtract,
  matchInfoLoading,
  matchModalMode,
  message,
  patientMatchVisible,
  patientSearchLoading,
  patientSearchResults,
  patientSearchValue,
  refreshAll,
  selectedBatchPatient,
  selectedDocument,
  selectedGroupPatient,
  selectedMatchDocument,
  selectedMatchPatient,
  setBatchManualArchiveVisible,
  setCreatePatientDrawerOpen,
  setCreatePatientPrefillValues,
  setDetailModalVisible,
  setGroupManualArchiveVisible,
  setPatientMatchVisible,
  setPatientSearchValue,
  setSelectedBatchPatient,
  setSelectedDocument,
  setSelectedGroupPatient,
  setSelectedMatchDocument,
  setSelectedMatchPatient,
  setSelectedRowKeys,
  setShowSearchResults,
  showSearchResults,
  token,
  archivingLoading,
}) => {
  const handleCreatePatientSuccess = async (result) => {
    setCreatePatientDrawerOpen(false)
    setCreatePatientPrefillValues(null)
    const patient = result?.response?.data || result?.patient || null
    const patientId = patient?.id || result?.patientId
    if (!patientId) {
      message.error('患者创建成功，但未获取到患者 ID，无法归档')
      refreshAll({ forceTree: true })
      return
    }

    if (createPatientMode === 'group' && createPatientGroupId) {
      try {
        const res = await confirmGroupArchive(createPatientGroupId, patientId, true)
        if (res?.success) {
          message.success(`新建患者「${patient?.name || '未知'}」并归档完成：成功 ${res.data?.archived_count || 0} 个文档`)
        } else {
          message.error(res?.message || '新建患者成功但归档失败')
        }
      } catch {
        message.error('归档失败')
      }
    } else if (createPatientMode === 'docs' && createPatientDocIds.length) {
      try {
        let archivedCount = 0
        const errors = []
        for (const documentId of createPatientDocIds) {
          try {
            const res = await archiveDocument(documentId, patientId, true)
            if (res?.success) archivedCount += 1
            else errors.push({ documentId, message: res?.message || '归档失败' })
          } catch (error) {
            errors.push({ documentId, message: error?.message || '归档失败' })
          }
        }
        if (archivedCount === createPatientDocIds.length) {
          message.success(`新建患者「${patient?.name || '未知'}」并归档完成：成功 ${archivedCount} 个文档`)
        } else if (archivedCount > 0) {
          message.warning(`新建患者成功，归档成功 ${archivedCount} 个，失败 ${errors.length} 个`)
        } else {
          message.error('新建患者成功但归档失败')
        }
      } catch {
        message.error('归档失败')
      }
    }

    setSelectedRowKeys([])
    refreshAll({ forceTree: true })
  }

  return (
    <>
      <DocumentDetailModal
        ref={detailModalRef}
        visible={detailModalVisible}
        document={selectedDocument}
        patientId={selectedDocument?.patientId}
        onClose={handleDetailModalClose}
        onReExtract={handleReExtract}
        onChangePatient={handleChangePatient}
        onArchivePatient={handleArchivePatient}
        onExtractSuccess={() => refreshAll({ forceTree: true })}
        onRefresh={() => refreshAll({ forceTree: true })}
        onDeleteSuccess={() => { setDetailModalVisible(false); setSelectedDocument(null); refreshAll({ forceTree: true }) }}
        refreshTrigger={detailRefreshTrigger}
        showTaskStatus
      />

      <CreatePatientDrawer
        open={createPatientDrawerOpen}
        onClose={() => { setCreatePatientDrawerOpen(false); setCreatePatientPrefillValues(null) }}
        documentIds={createPatientDocIds}
        prefillValues={createPatientPrefillValues}
        mode={createPatientMode}
        groupId={createPatientGroupId}
        onSubmit={async (patientData) => createPatient(patientData)}
        onSuccess={handleCreatePatientSuccess}
      />

      <PatientMatchModal
        archivingLoading={archivingLoading}
        handleConfirmMatch={handleConfirmMatch}
        handleConfirmPatientMatch={handleConfirmPatientMatch}
        handlePatientSearch={handlePatientSearch}
        matchInfoLoading={matchInfoLoading}
        matchModalMode={matchModalMode}
        patientMatchVisible={patientMatchVisible}
        patientSearchLoading={patientSearchLoading}
        patientSearchResults={patientSearchResults}
        patientSearchValue={patientSearchValue}
        selectedMatchDocument={selectedMatchDocument}
        selectedMatchPatient={selectedMatchPatient}
        setPatientMatchVisible={setPatientMatchVisible}
        setPatientSearchValue={setPatientSearchValue}
        setSelectedMatchDocument={setSelectedMatchDocument}
        setSelectedMatchPatient={setSelectedMatchPatient}
        setShowSearchResults={setShowSearchResults}
        showSearchResults={showSearchResults}
        token={token}
      />

      <ManualArchiveModals
        batchManualArchiveVisible={batchManualArchiveVisible}
        batchPatientSearchLoading={batchPatientSearchLoading}
        batchPatientSearchResults={batchPatientSearchResults}
        batchPatientSearchValue={batchPatientSearchValue}
        batchProcessing={batchProcessing}
        groupManualArchiveVisible={groupManualArchiveVisible}
        groupPatientSearchLoading={groupPatientSearchLoading}
        groupPatientSearchResults={groupPatientSearchResults}
        groupPatientSearchValue={groupPatientSearchValue}
        handleBatchPatientSearch={handleBatchPatientSearch}
        handleConfirmBatchManualArchive={handleConfirmBatchManualArchive}
        handleConfirmGroupManualArchive={handleConfirmGroupManualArchive}
        handleGroupPatientSearch={handleGroupPatientSearch}
        selectedBatchPatient={selectedBatchPatient}
        selectedGroupPatient={selectedGroupPatient}
        setBatchManualArchiveVisible={setBatchManualArchiveVisible}
        setGroupManualArchiveVisible={setGroupManualArchiveVisible}
        setSelectedBatchPatient={setSelectedBatchPatient}
        setSelectedGroupPatient={setSelectedGroupPatient}
        token={token}
      />
    </>
  )
}
