import React from 'react'
import { Table } from 'antd'
import ProjectDatasetV2 from '../components/ProjectDatasetV2'

const ProjectDatasetTableRegion = ({
  fetchProjectPatients,
  groupFieldsLoading,
  handleNavigatePatientDetail,
  handlePatientListExtract,
  loading,
  overviewColumns,
  onGroupChange,
  pagination,
  patientDataset,
  patientExtractionById,
  penetrationColumns,
  projectDatasetTableScrollY,
  projectDatasetViewModel,
  rendererMode,
  toggleSelectPatient,
  viewMode,
}) => (
  <div className="project-dataset-table-region">
    {rendererMode === 'v2' ? (
      <ProjectDatasetV2
        loading={loading}
        groupFieldsLoading={groupFieldsLoading}
        patients={projectDatasetViewModel.visiblePatients}
        fieldGroups={projectDatasetViewModel.fieldGroups}
        folders={projectDatasetViewModel.folders}
        groupsByFolder={projectDatasetViewModel.groupsByFolder}
        activeGroupKey={projectDatasetViewModel.activeGroupKey}
        onGroupChange={onGroupChange}
        selectedPatientIds={projectDatasetViewModel.selectedPatientIds}
        onToggleSelectPatient={toggleSelectPatient}
        onNavigatePatient={handleNavigatePatientDetail}
        onExtractPatient={handlePatientListExtract}
        patientExtractionById={patientExtractionById}
        pagination={pagination}
        onPageChange={(page, pageSize) => fetchProjectPatients(page, pageSize)}
        leftScrollY={projectDatasetTableScrollY}
        rightScrollY={projectDatasetTableScrollY}
      />
    ) : (
      <Table
        columns={viewMode === 'penetration' ? penetrationColumns : overviewColumns}
        dataSource={patientDataset}
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`,
          onChange: (page, pageSize) => fetchProjectPatients(page, pageSize),
        }}
        scroll={{ x: 'max-content', y: projectDatasetTableScrollY }}
        size="small"
        bordered
        tableLayout="fixed"
        className="compact-table project-dataset-table table-scrollbar-unified"
      />
    )}
  </div>
)

export default ProjectDatasetTableRegion
