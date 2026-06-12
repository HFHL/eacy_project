import React, { useRef } from 'react'
import { Empty } from 'antd'
import ProjectDatasetV2Panels from './projectDatasetV2/ProjectDatasetV2Panels'
import { useProjectDatasetV2Diagnostics } from './projectDatasetV2/useProjectDatasetV2Diagnostics'
import { useProjectDatasetV2Model } from './projectDatasetV2/useProjectDatasetV2Model'
import { useSynchronizedTableScroll } from './projectDatasetV2/useSynchronizedTableScroll'

/**
 * 项目详情页 V2 主渲染容器。
 *
 * @param {{
 *  loading: boolean;
 *  patients: Array<Record<string, any>>;
 *  fieldGroups: Array<Record<string, any>>;
 *  folders: Array<{folderKey:string,folderName:string,groups:Array<Record<string, any>>}>;
 *  groupsByFolder: Record<string, Array<Record<string, any>>>;
 *  activeGroupKey: string | null;
 *  onGroupChange: (groupKey: string) => void;
 *  selectedPatientIds: string[];
 *  onToggleSelectPatient: (patientId: string, checked: boolean) => void;
 *  onNavigatePatient: (patientId: string) => void;
 *  onExtractPatient: (patient: Record<string, any>) => void;
 *  patientExtractionById?: Record<string, { status?: string; progress?: number; label?: string; modeLabel?: string }>;
 *  pagination: Record<string, any>;
 *  onPageChange: (page: number, pageSize: number) => void;
 *  leftScrollY: number;
 *  rightScrollY: number;
 * }} props 组件参数。
 * @returns {JSX.Element}
 */
const ProjectDatasetV2 = ({
  loading,
  groupFieldsLoading = false,
  patients,
  fieldGroups,
  folders,
  groupsByFolder,
  activeGroupKey,
  onGroupChange,
  selectedPatientIds,
  onToggleSelectPatient,
  onNavigatePatient,
  onExtractPatient,
  patientExtractionById = {},
  pagination,
  onPageChange,
  leftScrollY,
  rightScrollY,
}) => {
  const leftPanelRef = useRef(null)
  const rightPanelRef = useRef(null)
  const model = useProjectDatasetV2Model({
    activeGroupKey,
    fieldGroups,
    onToggleSelectPatient,
    patients,
    selectedPatientIds,
  })

  useSynchronizedTableScroll({
    activeGroupKey,
    leftPanelRef,
    rightPanelRef,
    visiblePatientsLength: model.visiblePatients.length,
  })
  useProjectDatasetV2Diagnostics({
    activeGroup: model.activeGroup,
    enableConsistencyDebug: model.enableConsistencyDebug,
    enableLegacyGroupFallback: model.enableLegacyGroupFallback,
    groupMatchMode: model.groupMatchMode,
    rowIndexByPatientId: model.rowIndexByPatientId,
    visiblePatientRenderRows: model.visiblePatientRenderRows,
    visiblePatients: model.visiblePatients,
  })

  if (!patients?.length) {
    return <Empty description="暂无患者数据" />
  }

  return (
    <ProjectDatasetV2Panels
      activeGroupKey={activeGroupKey}
      completenessFilter={model.completenessFilter}
      enableConsistencyDebug={model.enableConsistencyDebug}
      fieldGroups={fieldGroups}
      folders={folders}
      groupFieldsLoading={groupFieldsLoading}
      groupsByFolder={groupsByFolder}
      handleToggleAllVisible={model.handleToggleAllVisible}
      isAllVisibleSelected={model.isAllVisibleSelected}
      isSomeVisibleSelected={model.isSomeVisibleSelected}
      keyword={model.keyword}
      leftPanelRef={leftPanelRef}
      leftScrollY={leftScrollY}
      loading={loading}
      onExtractPatient={onExtractPatient}
      onGroupChange={onGroupChange}
      onNavigatePatient={onNavigatePatient}
      onPageChange={onPageChange}
      onToggleSelectPatient={onToggleSelectPatient}
      pagination={pagination}
      patientExtractionById={patientExtractionById}
      rightPanelRef={rightPanelRef}
      rightScrollY={rightScrollY}
      rowIndexByPatientId={model.rowIndexByPatientId}
      selectedPatientIds={selectedPatientIds}
      setCompletenessFilter={model.setCompletenessFilter}
      setKeyword={model.setKeyword}
      visiblePatientIds={model.visiblePatientIds}
      visiblePatientRenderRows={model.visiblePatientRenderRows}
    />
  )
}

export default ProjectDatasetV2
