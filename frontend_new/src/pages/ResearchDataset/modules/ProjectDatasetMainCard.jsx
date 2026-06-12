import React from 'react'
import { Card } from 'antd'
import ExtractionProgressCard from './ExtractionProgressCard'
import ProjectDatasetHeader from './ProjectDatasetHeader'
import ProjectDatasetStyles from './ProjectDatasetStyles'
import ProjectDatasetTableRegion from './ProjectDatasetTableRegion'
import ProjectOverviewStats from './ProjectOverviewStats'

const ProjectDatasetMainCard = ({
  cardMinHeight,
  dismissProgressCard,
  fetchProjectPatients,
  groupFieldsLoading,
  handleManualRefresh,
  handleNavigatePatientDetail,
  handlePatientListExtract,
  handleRendererModeChange,
  isOverviewCollapsed,
  loading,
  onAddPatients,
  onExportData,
  onGroupChange,
  onOpenProjectEdit,
  onShowExtractionErrors,
  onToggleOverview,
  onViewModeChange,
  onViewProjectTemplate,
  overviewColumns,
  pagination,
  patientDataset,
  patientExtractionById,
  penetrationColumns,
  projectDatasetTableScrollY,
  projectDatasetViewModel,
  projectInfo,
  projectUpdateDisplay,
  rendererMode,
  showProgressCard,
  showRendererSwitch,
  token,
  toggleSelectPatient,
  v2LayoutTokens,
  viewMode,
  currentTemplateId,
  extractionProgress,
  extractionTasks,
}) => (
  <>
    <ProjectDatasetStyles token={token} layoutTokens={v2LayoutTokens} />

    <Card
      size="small"
      className="project-dataset-main-card"
      style={{ marginBottom: 16 }}
      styles={{
        header: { padding: '12px 16px' },
        body: {
          padding: 16,
          minHeight: cardMinHeight,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
      title={
        <ProjectDatasetHeader
          projectInfo={projectInfo}
          currentTemplateId={currentTemplateId}
          projectUpdateDisplay={projectUpdateDisplay}
          showRendererSwitch={showRendererSwitch}
          rendererMode={rendererMode}
          viewMode={viewMode}
          isOverviewCollapsed={isOverviewCollapsed}
          token={token}
          onRendererModeChange={handleRendererModeChange}
          onViewModeChange={onViewModeChange}
          onRefresh={handleManualRefresh}
          onAddPatients={onAddPatients}
          onExportData={onExportData}
          onOpenProjectEdit={onOpenProjectEdit}
          onViewProjectTemplate={onViewProjectTemplate}
          onToggleOverview={onToggleOverview}
        />
      }
    >
      <ProjectOverviewStats
        collapsed={isOverviewCollapsed}
        projectInfo={projectInfo}
        patientDataset={patientDataset}
        token={token}
      />

      <ExtractionProgressCard
        visible={showProgressCard}
        extractionProgress={extractionProgress}
        extractionTasks={extractionTasks}
        token={token}
        onDismiss={dismissProgressCard}
        onShowErrors={onShowExtractionErrors}
      />

      <ProjectDatasetTableRegion
        fetchProjectPatients={fetchProjectPatients}
        groupFieldsLoading={groupFieldsLoading}
        handleNavigatePatientDetail={handleNavigatePatientDetail}
        handlePatientListExtract={handlePatientListExtract}
        loading={loading}
        overviewColumns={overviewColumns}
        onGroupChange={onGroupChange}
        pagination={pagination}
        patientDataset={patientDataset}
        patientExtractionById={patientExtractionById}
        penetrationColumns={penetrationColumns}
        projectDatasetTableScrollY={projectDatasetTableScrollY}
        projectDatasetViewModel={projectDatasetViewModel}
        rendererMode={rendererMode}
        toggleSelectPatient={toggleSelectPatient}
        viewMode={viewMode}
      />
    </Card>
  </>
)

export default ProjectDatasetMainCard
