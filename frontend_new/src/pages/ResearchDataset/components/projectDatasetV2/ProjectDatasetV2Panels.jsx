import React from 'react'
import { Input, Select, Space } from 'antd'
import FieldGroupTabs from '../FieldGroupTabs'
import PatientKeyTable from '../PatientKeyTable'

const ProjectDatasetV2Panels = ({
  activeGroupKey,
  completenessFilter,
  enableConsistencyDebug,
  fieldGroups,
  folders,
  groupFieldsLoading,
  groupsByFolder,
  handleToggleAllVisible,
  isAllVisibleSelected,
  isSomeVisibleSelected,
  keyword,
  leftPanelRef,
  leftScrollY,
  loading,
  onExtractPatient,
  onGroupChange,
  onNavigatePatient,
  onPageChange,
  onToggleSelectPatient,
  pagination,
  patientExtractionById,
  rightPanelRef,
  rightScrollY,
  rowIndexByPatientId,
  selectedPatientIds,
  setCompletenessFilter,
  setKeyword,
  visiblePatientIds,
  visiblePatientRenderRows,
}) => (
  <div className="project-dataset-v2-layout">
    <div ref={leftPanelRef} className="project-dataset-v2-panel project-dataset-v2-left-panel">
      <div className="project-dataset-v2-left-header">
        <Input.Search
          id="project-dataset-v2-patient-search"
          name="projectDatasetV2PatientSearch"
          allowClear
          size="small"
          placeholder="搜索编号/姓名"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Space size={8}>
          <Select
            size="small"
            value={completenessFilter}
            style={{ width: 108 }}
            onChange={setCompletenessFilter}
            options={[
              { label: '完整度: 全部', value: 'all' },
              { label: '高(>=90%)', value: 'high' },
              { label: '中(60-90%)', value: 'middle' },
              { label: '低(<60%)', value: 'low' },
            ]}
          />
        </Space>
      </div>
      <PatientKeyTable
        patients={visiblePatientRenderRows}
        selectedPatientIds={selectedPatientIds}
        isAllCurrentPageSelected={isAllVisibleSelected}
        isSomeCurrentPageSelected={isSomeVisibleSelected}
        onToggleSelectAll={handleToggleAllVisible}
        onToggleSelectPatient={onToggleSelectPatient}
        onNavigatePatient={onNavigatePatient}
        onExtractPatient={onExtractPatient}
        patientExtractionById={patientExtractionById}
        pagination={pagination}
        onPageChange={onPageChange}
        loading={loading}
        scrollY={leftScrollY}
      />
    </div>
    <div ref={rightPanelRef} className="project-dataset-v2-panel project-dataset-v2-right-panel">
      <FieldGroupTabs
        loading={loading || groupFieldsLoading}
        fieldGroups={fieldGroups}
        folders={folders}
        groupsByFolder={groupsByFolder}
        patients={visiblePatientRenderRows}
        visiblePatientIds={visiblePatientIds}
        rowIndexByPatientId={rowIndexByPatientId}
        enableConsistencyDebug={enableConsistencyDebug}
        activeGroupKey={activeGroupKey}
        onGroupChange={onGroupChange}
        scrollY={rightScrollY}
      />
    </div>
  </div>
)

export default ProjectDatasetV2Panels
