import React from 'react'
import { Table } from 'antd'

import { useFieldGroupColumns } from './fieldGroupTable/useFieldGroupColumns'
import { useFieldGroupDiagnostics } from './fieldGroupTable/useFieldGroupDiagnostics'

const FieldGroupTable = ({
  loading = false,
  group,
  patients,
  enableConsistencyDebug = false,
  scrollY,
  onOpenNestedDetail,
}) => {
  const columns = useFieldGroupColumns({
    enableConsistencyDebug,
    group,
    onOpenNestedDetail,
    patients,
  })

  useFieldGroupDiagnostics({
    enableConsistencyDebug,
    group,
    patients,
  })

  if (!group) return null

  return (
    <Table
      size="small"
      bordered
      rowKey={(row) => row.__rowKey || row.patient_id}
      columns={columns}
      dataSource={patients}
      loading={loading}
      pagination={false}
      scroll={{ x: 'max-content', y: scrollY }}
      tableLayout="fixed"
      style={{ width: '100%' }}
      rowClassName={() => 'project-dataset-v2-row'}
      className="project-dataset-table project-dataset-v2-table table-scrollbar-unified"
    />
  )
}

export default FieldGroupTable
