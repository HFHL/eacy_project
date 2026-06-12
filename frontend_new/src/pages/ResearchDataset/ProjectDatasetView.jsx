import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { theme } from 'antd'
import { useDatasetRendererMode } from './hooks/useDatasetRendererMode'
import { useFieldGroupDetailFlow } from './hooks/useFieldGroupDetailFlow'
import { useProjectDatasetColumns } from './hooks/useProjectDatasetColumns'
import { useProjectDatasetDerivedState } from './hooks/useProjectDatasetDerivedState'
import { useProjectDatasetData } from './hooks/useProjectDatasetData'
import { useProjectDatasetExport } from './hooks/useProjectDatasetExport'
import { useProjectDatasetSelection } from './hooks/useProjectDatasetSelection'
import { useProjectDatasetViewActions } from './hooks/useProjectDatasetViewActions'
import { useProjectFieldSourceFlow } from './hooks/useProjectFieldSourceFlow'
import { useProjectPatientPool } from './hooks/useProjectPatientPool'
import { useProjectExtractionController } from './hooks/useProjectExtractionController'
import { useProjectMetaEditor } from './hooks/useProjectMetaEditor'
import ProjectDatasetMainCard from './modules/ProjectDatasetMainCard'
import ProjectDatasetModals from './modules/ProjectDatasetModals'
import SelectedPatientsBar from './modules/SelectedPatientsBar'

const ProjectDatasetView = () => {
  const { token } = theme.useToken()
  const { projectId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    handleRendererModeChange,
    rendererMode,
    showRendererSwitchFromQuery,
  } = useDatasetRendererMode({ location, navigate })
  const [viewMode, setViewMode] = useState('penetration') // 'penetration' | 'overview'
  const [activeGroupKey, setActiveGroupKey] = useState(null)
  const [isOverviewCollapsed, setIsOverviewCollapsed] = useState(false)
  const [bindTemplateVisible, setBindTemplateVisible] = useState(false)

  const {
    enrolledPatientCount,
    fetchProjectDetail,
    fetchProjectPatients,
    fetchProjectTemplateSchema,
    groupFieldsLoading,
    handleManualRefresh,
    loading,
    pagination,
    patientDataset,
    projectData,
    templateFieldGroups,
    templateFieldMapping,
    templateSchemaJson,
  } = useProjectDatasetData({
    activeGroupKey,
    projectId,
    reloadKey: location?.search,
  })
  const {
    editForm,
    editProjectVisible,
    handleSaveProjectMeta,
    openProjectEditModal,
    projectStatusOptions,
    setEditProjectVisible,
  } = useProjectMetaEditor({
    fetchProjectDetail,
    location,
    navigate,
    projectData,
    projectId,
  })
  const {
    isAllCurrentPageSelected,
    isSomeCurrentPageSelected,
    selectedPatients,
    setSelectedPatients,
    toggleSelectAllCurrentPage,
    toggleSelectPatient,
  } = useProjectDatasetSelection(patientDataset)
  const patientPool = useProjectPatientPool({
    fetchProjectDetail,
    fetchProjectPatients,
    projectId,
    token,
  })
  const exportFlow = useProjectDatasetExport({
    projectId,
    projectName: projectData?.project_name,
    selectedPatients,
  })
  const {
    closePatientExtractChoice,
    confirmAndStartExtraction,
    confirmPatientFullExtract,
    dismissProgressCard,
    extractionErrorModalVisible,
    extractionModalGroups,
    extractionModalMode,
    extractionModalVisible,
    extractionProgress,
    extractionTasks,
    handlePatientListExtract,
    handleSubmitTargetedExtraction,
    isExtracting,
    patientExtractChoice,
    patientExtractionById,
    setExtractionErrorModalVisible,
    setExtractionModalGroups,
    setExtractionModalMode,
    setExtractionModalVisible,
    showProgressCard,
    startPatientExtractFromChoice,
  } = useProjectExtractionController({
    fetchProjectPatients,
    pagination,
    patientDataset,
    projectId,
    selectedPatients,
    setSelectedPatients,
    token,
  })

  const {
    cardMinHeight,
    crfFieldGroups,
    currentSchemaVersion,
    currentTemplateId,
    getCompletenessColor,
    projectDatasetTableScrollY,
    projectDatasetViewModel,
    projectInfo,
    projectUpdateDisplay,
    v2LayoutTokens,
  } = useProjectDatasetDerivedState({
    activeGroupKey,
    enrolledPatientCount,
    patientDataset,
    projectData,
    projectId,
    selectedPatients,
    setActiveGroupKey,
    templateFieldGroups,
    templateFieldMapping,
    templateSchemaJson,
    token,
  })
  const {
    closeDocDetail,
    closeFieldSourceModal,
    currentFieldSource,
    docDetailDoc,
    docDetailVisible,
    fieldSourceModalVisible,
    handleViewFieldSource,
    renderSourcePopover,
  } = useProjectFieldSourceFlow({ patientDataset, token })
  const {
    closeFieldGroupDetail,
    currentFieldGroup,
    currentPatient,
    fieldGroupDetailVisible,
    handleViewFieldGroupDetail,
  } = useFieldGroupDetailFlow({ templateFieldGroups, templateSchemaJson })

  const {
    handleNavigatePatientDetail,
    handleRemovePatients,
    handleTemplateBound,
    handleViewProjectTemplate,
  } = useProjectDatasetViewActions({
    currentTemplateId,
    exportFlow,
    fetchProjectDetail,
    fetchProjectPatients,
    fetchProjectTemplateSchema,
    location,
    navigate,
    pagination,
    projectId,
    selectedPatients,
    setBindTemplateVisible,
    setSelectedPatients,
  })

  const { overviewColumns, penetrationColumns } = useProjectDatasetColumns({
    confirmAndStartExtraction,
    getCompletenessColor,
    handleNavigatePatientDetail,
    handleViewFieldGroupDetail,
    handleViewFieldSource,
    isAllCurrentPageSelected,
    isSomeCurrentPageSelected,
    renderSourcePopover,
    selectedPatients,
    setSelectedPatients,
    templateFieldGroups,
    templateFieldMapping,
    templateSchemaJson,
    token,
    toggleSelectAllCurrentPage,
  })

  return (
    <div className="page-container fade-in">
      <ProjectDatasetMainCard
        cardMinHeight={cardMinHeight}
        currentTemplateId={currentTemplateId}
        dismissProgressCard={dismissProgressCard}
        extractionProgress={extractionProgress}
        extractionTasks={extractionTasks}
        fetchProjectPatients={fetchProjectPatients}
        groupFieldsLoading={groupFieldsLoading}
        handleManualRefresh={handleManualRefresh}
        handleNavigatePatientDetail={handleNavigatePatientDetail}
        handlePatientListExtract={handlePatientListExtract}
        handleRendererModeChange={handleRendererModeChange}
        isOverviewCollapsed={isOverviewCollapsed}
        loading={loading}
        onAddPatients={patientPool.handleAddPatients}
        onExportData={exportFlow.openExportModal}
        onGroupChange={setActiveGroupKey}
        onOpenProjectEdit={openProjectEditModal}
        onShowExtractionErrors={() => setExtractionErrorModalVisible(true)}
        onToggleOverview={() => setIsOverviewCollapsed(prev => !prev)}
        onViewModeChange={setViewMode}
        onViewProjectTemplate={handleViewProjectTemplate}
        overviewColumns={overviewColumns}
        pagination={pagination}
        patientDataset={patientDataset}
        patientExtractionById={patientExtractionById}
        penetrationColumns={penetrationColumns}
        projectDatasetTableScrollY={projectDatasetTableScrollY}
        projectDatasetViewModel={projectDatasetViewModel}
        projectInfo={projectInfo}
        projectUpdateDisplay={projectUpdateDisplay}
        rendererMode={rendererMode}
        showProgressCard={showProgressCard}
        showRendererSwitch={showRendererSwitchFromQuery}
        token={token}
        toggleSelectPatient={toggleSelectPatient}
        v2LayoutTokens={v2LayoutTokens}
        viewMode={viewMode}
      />

      <ProjectDatasetModals
        bindTemplateVisible={bindTemplateVisible}
        closePatientExtractChoice={closePatientExtractChoice}
        confirmPatientFullExtract={confirmPatientFullExtract}
        crfFieldGroups={crfFieldGroups}
        currentFieldGroup={currentFieldGroup}
        currentFieldSource={currentFieldSource}
        currentPatient={currentPatient}
        docDetailDoc={docDetailDoc}
        docDetailVisible={docDetailVisible}
        editForm={editForm}
        editProjectVisible={editProjectVisible}
        exportFlow={exportFlow}
        extractionErrorModalVisible={extractionErrorModalVisible}
        extractionModalGroups={extractionModalGroups}
        extractionModalMode={extractionModalMode}
        extractionModalVisible={extractionModalVisible}
        extractionProgress={extractionProgress}
        fieldGroupDetailVisible={fieldGroupDetailVisible}
        fieldSourceModalVisible={fieldSourceModalVisible}
        handleCloseDocDetail={closeDocDetail}
        handleCloseFieldGroupDetail={closeFieldGroupDetail}
        handleCloseFieldSourceModal={closeFieldSourceModal}
        handleSaveProjectMeta={handleSaveProjectMeta}
        handleSubmitTargetedExtraction={handleSubmitTargetedExtraction}
        handleTemplateBound={handleTemplateBound}
        isExtracting={isExtracting}
        onNavigatePatientDetail={handleNavigatePatientDetail}
        patientExtractChoice={patientExtractChoice}
        patientPool={patientPool}
        projectId={projectId}
        projectInfo={projectInfo}
        selectedPatients={selectedPatients}
        setBindTemplateVisible={setBindTemplateVisible}
        setEditProjectVisible={setEditProjectVisible}
        setExtractionErrorModalVisible={setExtractionErrorModalVisible}
        setExtractionModalGroups={setExtractionModalGroups}
        setExtractionModalMode={setExtractionModalMode}
        setExtractionModalVisible={setExtractionModalVisible}
        startPatientExtractFromChoice={startPatientExtractFromChoice}
        statusOptions={projectStatusOptions}
        token={token}
      />

      <SelectedPatientsBar
        selectedPatients={selectedPatients}
        isExtracting={isExtracting}
        token={token}
        onStartExtraction={confirmAndStartExtraction}
        onRemovePatients={handleRemovePatients}
        onClearSelection={() => setSelectedPatients([])}
      />
    </div>
  )
}

export default ProjectDatasetView
