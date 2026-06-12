import { Card, Space, Table, Tag } from 'antd'
import {
  buildColumnRawValue,
  buildGroupRecords,
  getGroupColumns,
  isRepeatableGroup,
} from './singlePatientGroupModel'
import SinglePatientValueCell from './SinglePatientValueCell'

const buildFlatRows = ({ group, groupColumns, patient, onOpenNestedDetail }) => (
  groupColumns.map((column) => {
    const rawValue = buildColumnRawValue({ column, group, patient })

    return {
      key: column.key,
      field: column.title,
      value: (
        <SinglePatientValueCell
          group={group}
          column={column}
          rawValue={rawValue}
          onOpenNestedDetail={onOpenNestedDetail}
        />
      ),
    }
  })
)

const buildRepeatableColumns = ({ group, groupColumns, patient, repeatableRecords, onOpenNestedDetail }) => (
  groupColumns.map((column) => ({
    title: column.title,
    key: column.key,
    dataIndex: column.key,
    width: 180,
    ellipsis: true,
    render: (_unused, rowRecord, rowIndex) => {
      const activeRowFields = rowRecord?.__rowFields && typeof rowRecord.__rowFields === 'object'
        ? rowRecord.__rowFields
        : {}
      const scopedRecord = {
        ...patient,
        __activeGroupRecord: activeRowFields,
        __groupRowIndex: Number.isFinite(rowIndex) ? rowIndex : 0,
        __groupRowCount: repeatableRecords.length,
      }
      const scopedResult = buildColumnRawValue({
        column,
        group,
        patient,
        scopedRecord,
        includeSource: true,
      })

      return (
        <SinglePatientValueCell
          group={group}
          column={column}
          rawValue={scopedResult?.value}
          onOpenNestedDetail={onOpenNestedDetail}
        />
      )
    },
  }))
)

const SinglePatientGroupCard = ({ group, patient, onOpenNestedDetail }) => {
  const groupColumns = getGroupColumns(group)
  const repeatableRecords = buildGroupRecords({ patient, group, groupColumns })
  const repeatableGroup = isRepeatableGroup(group)
  const rows = buildFlatRows({ group, groupColumns, patient, onOpenNestedDetail })
  const repeatableColumns = buildRepeatableColumns({
    group,
    groupColumns,
    patient,
    repeatableRecords,
    onOpenNestedDetail,
  })

  return (
    <Card
      key={group.group_id}
      size="small"
      title={group.group_name}
      extra={(
        <Space size={6}>
          <Tag>{`${groupColumns.length} 字段`}</Tag>
          {repeatableGroup ? <Tag color="purple">{`${repeatableRecords.length || 1} 行`}</Tag> : null}
        </Space>
      )}
      styles={{ body: { padding: 8 } }}
    >
      {repeatableGroup && repeatableRecords.length > 0 ? (
        <Table
          size="small"
          rowKey="__rowKey"
          pagination={false}
          dataSource={repeatableRecords}
          columns={repeatableColumns}
          scroll={{ x: 'max-content' }}
        />
      ) : (
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={rows}
          columns={[
            { title: '字段', dataIndex: 'field', key: 'field', width: 180 },
            { title: '值', dataIndex: 'value', key: 'value' },
          ]}
        />
      )}
    </Card>
  )
}

export default SinglePatientGroupCard
