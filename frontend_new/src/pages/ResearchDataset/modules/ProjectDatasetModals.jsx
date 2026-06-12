import React from 'react'
import { FieldSourceModal } from '../../../components/FieldSourceViewer'
import DocumentDetailModal from '../../PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal'
import ProjectCrfTemplateBindModal from '../../../components/Research/ProjectCrfTemplateBindModal'
import {
  ExtractionErrorModal,
  PatientExtractChoiceModal,
  TargetedExtractionModal,
} from './ExtractionModals'
import ExportDataModal from './ExportDataModal'
import FieldGroupDetailModal from './FieldGroupDetailModal'
import PatientSelectionModal from './PatientSelectionModal'
import ProjectMetaEditModal from './ProjectMetaEditModal'

const ProjectDatasetModals = ({
  bindTemplateVisible,
  closePatientExtractChoice,
  confirmPatientFullExtract,
  crfFieldGroups,
  currentFieldGroup,
  currentFieldSource,
  currentPatient,
  docDetailDoc,
  docDetailVisible,
  editForm,
  editProjectVisible,
  exportFlow,
  extractionErrorModalVisible,
  extractionModalGroups,
  extractionModalMode,
  extractionModalVisible,
  extractionProgress,
  fieldGroupDetailVisible,
  fieldSourceModalVisible,
  handleCloseDocDetail,
  handleCloseFieldGroupDetail,
  handleCloseFieldSourceModal,
  handleSaveProjectMeta,
  handleSubmitTargetedExtraction,
  handleTemplateBound,
  isExtracting,
  onNavigatePatientDetail,
  patientExtractChoice,
  patientPool,
  projectId,
  projectInfo,
  selectedPatients,
  setBindTemplateVisible,
  setEditProjectVisible,
  setExtractionErrorModalVisible,
  setExtractionModalGroups,
  setExtractionModalMode,
  setExtractionModalVisible,
  startPatientExtractFromChoice,
  statusOptions,
  token,
}) => (
  <>
    <PatientExtractChoiceModal
      choice={patientExtractChoice}
      isExtracting={isExtracting}
      onCancel={closePatientExtractChoice}
      onStartIncremental={() => startPatientExtractFromChoice('incremental')}
      onConfirmFull={confirmPatientFullExtract}
    />

    <TargetedExtractionModal
      open={extractionModalVisible}
      selectedPatients={selectedPatients}
      projectInfo={projectInfo}
      extractionModalGroups={extractionModalGroups}
      extractionModalMode={extractionModalMode}
      crfFieldGroups={crfFieldGroups}
      isExtracting={isExtracting}
      onCancel={() => setExtractionModalVisible(false)}
      onStart={handleSubmitTargetedExtraction}
      onGroupsChange={setExtractionModalGroups}
      onModeChange={setExtractionModalMode}
    />

    <ExportDataModal
      open={exportFlow.exportModalVisible}
      loading={exportFlow.exportLoading}
      form={exportFlow.exportForm}
      onCancel={exportFlow.closeExportModal}
      onConfirm={exportFlow.handleConfirmExport}
    />

    <PatientSelectionModal
      open={patientPool.patientSelectionVisible}
      selectedNewPatients={patientPool.selectedNewPatients}
      patientPoolSearch={patientPool.patientPoolSearch}
      patientPoolPagination={patientPool.patientPoolPagination}
      patientColumns={patientPool.patientColumns}
      availablePatients={patientPool.availablePatients}
      loading={patientPool.patientPoolLoading}
      token={token}
      projectInfo={projectInfo}
      onCancel={patientPool.handleCancelPatientSelection}
      onConfirm={patientPool.handleConfirmAddPatients}
      onSelectedPatientsChange={patientPool.setSelectedNewPatients}
      onSearchChange={patientPool.setPatientPoolSearch}
      onFetchPatientPool={patientPool.fetchPatientPool}
      isPatientInCurrentProject={patientPool.isPatientInCurrentProject}
    />

    <FieldGroupDetailModal
      open={fieldGroupDetailVisible}
      currentFieldGroup={currentFieldGroup}
      currentPatient={currentPatient}
      projectId={projectId}
      token={token}
      onClose={handleCloseFieldGroupDetail}
    />

    <ProjectMetaEditModal
      open={editProjectVisible}
      form={editForm}
      statusOptions={statusOptions}
      onCancel={() => setEditProjectVisible(false)}
      onSave={handleSaveProjectMeta}
    />

    <ProjectCrfTemplateBindModal
      open={bindTemplateVisible}
      projectId={projectId}
      projectName={projectInfo.name}
      onCancel={() => setBindTemplateVisible(false)}
      onBound={handleTemplateBound}
    />

    <FieldSourceModal
      visible={fieldSourceModalVisible}
      onClose={handleCloseFieldSourceModal}
      fieldName={currentFieldSource?.fieldName}
      fieldValue={currentFieldSource?.fieldValue}
      audit={currentFieldSource?.audit}
      documents={currentFieldSource?.documents}
      changeLogs={currentFieldSource?.changeLogs}
      projectId={projectId}
      projectPatientId={currentFieldSource?.projectPatientId}
      fieldPath={currentFieldSource?.fieldPath}
    />

    {docDetailDoc && (
      <DocumentDetailModal
        visible={docDetailVisible}
        document={docDetailDoc}
        onClose={handleCloseDocDetail}
      />
    )}

    <ExtractionErrorModal
      open={extractionErrorModalVisible}
      extractionProgress={extractionProgress}
      projectId={projectId}
      token={token}
      onClose={() => setExtractionErrorModalVisible(false)}
      onNavigatePatientDetail={onNavigatePatientDetail}
    />
  </>
)

export default ProjectDatasetModals
