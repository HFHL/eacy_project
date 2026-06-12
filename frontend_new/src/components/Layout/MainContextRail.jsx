import React from 'react'
import DocumentRail from './DocumentRail'
import PatientRail from './PatientRail'
import ResearchRail from './ResearchRail'

const MainContextRail = ({
  activePatientId,
  activePrimaryNavKey,
  activeProjectId,
  activeTemplateId,
  activeToolbarPanel,
  documentCounts,
  documentTab,
  documentView,
  goFirstPatientDetail,
  goFirstProjectDetail,
  goFirstTemplateView,
  hoveredRailCardKey,
  location,
  navigate,
  onCreatePatient,
  onCreateProject,
  onCreateTemplate,
  onCsvImport,
  onSetSiderExpanded,
  onSetToolbarPanel,
  paneLayout,
  patientController,
  researchController,
  setHoveredRailCardKey,
  siderCollapsed,
  token,
}) => {
  if (activePrimaryNavKey === 'document') {
    return (
      <DocumentRail
        counts={documentCounts}
        documentTab={documentTab}
        documentView={documentView}
        navigate={navigate}
        siderCollapsed={siderCollapsed}
        token={token}
      />
    )
  }

  if (activePrimaryNavKey === 'patient') {
    return (
      <PatientRail
        activePatientId={activePatientId}
        activeToolbarPanel={activeToolbarPanel}
        deletingPatientId={patientController.deletingPatientId}
        ehrExtractingMap={patientController.ehrExtractingMap}
        goFirstPatientDetail={goFirstPatientDetail}
        hoveredRailCardKey={hoveredRailCardKey}
        location={location}
        navigate={navigate}
        onDeletePatient={patientController.handleDeletePatientFromRail}
        onOpenCreatePatient={onCreatePatient}
        onSetToolbarPanel={onSetToolbarPanel}
        onTriggerPatientRefresh={patientController.triggerPatientDetailRefresh}
        patientRailItems={patientController.patientRailItems}
        patientRailLoading={patientController.patientRailLoading}
        patientRailSearch={patientController.patientRailSearch}
        patientRailSort={patientController.patientRailSort}
        setHoveredRailCardKey={setHoveredRailCardKey}
        setPatientRailSearch={patientController.setPatientRailSearch}
        setPatientRailSort={patientController.setPatientRailSort}
        setSiderExpanded={onSetSiderExpanded}
        siderCollapsed={siderCollapsed}
        token={token}
      />
    )
  }

  if (activePrimaryNavKey === 'research') {
    return (
      <ResearchRail
        activeProjectId={activeProjectId}
        activeTemplateId={activeTemplateId}
        activeToolbarPanel={activeToolbarPanel}
        deletingProjectId={researchController.deletingProjectId}
        deletingTemplateId={researchController.deletingTemplateId}
        goFirstProjectDetail={goFirstProjectDetail}
        goFirstTemplateView={goFirstTemplateView}
        handleResearchSplitterMouseDown={paneLayout.handleResearchSplitterMouseDown}
        hoveredRailCardKey={hoveredRailCardKey}
        isResearchSplitterDragging={paneLayout.isResearchSplitterDragging}
        location={location}
        navigate={navigate}
        onCloneTemplate={researchController.handleCloneTemplateFromRail}
        onCreateProject={onCreateProject}
        onCreateTemplate={onCreateTemplate}
        onCsvImport={onCsvImport}
        onDeleteProject={researchController.handleDeleteProjectFromRail}
        onDeleteTemplate={researchController.handleDeleteTemplateFromRail}
        onOpenTemplateMeta={researchController.handleOpenTemplateMeta}
        onPreviewTemplate={researchController.handlePreviewTemplateFromRail}
        onSetSiderExpanded={onSetSiderExpanded}
        onSetToolbarPanel={onSetToolbarPanel}
        projectItems={researchController.researchProjectItems}
        projectLoading={researchController.researchProjectLoading}
        projectPaneHeight={paneLayout.projectPaneHeight}
        projectSearch={researchController.researchProjectSearch}
        projectSort={researchController.researchProjectSort}
        researchRailContainerRef={paneLayout.researchRailContainerRef}
        setHoveredRailCardKey={setHoveredRailCardKey}
        setProjectSearch={researchController.setResearchProjectSearch}
        setProjectSort={researchController.setResearchProjectSort}
        setTemplateSearch={researchController.setResearchTemplateSearch}
        setTemplateSort={researchController.setResearchTemplateSort}
        siderCollapsed={siderCollapsed}
        templateItems={researchController.researchTemplateItems}
        templateLoading={researchController.researchTemplateLoading}
        templatePaneHeight={paneLayout.templatePaneHeight}
        templateSearch={researchController.researchTemplateSearch}
        templateSort={researchController.researchTemplateSort}
        token={token}
      />
    )
  }

  return null
}

export default MainContextRail
