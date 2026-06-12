import React from 'react'
import { Alert, Button, Card, Col, Modal, Row, Space, Table, Typography } from 'antd'
import { FileTextOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { ClickableFieldValue } from '../../../components/FieldSourceViewer'
import StructuredDataView from '../../../components/Common/StructuredDataView'
import { buildProjectFieldSourceContext } from '../../../utils/auditResolver'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'
import { isEmptyFieldValue } from './groupDisplayModel'

const { Text } = Typography

const buildDetailColumns = ({ detailModel, currentPatient, currentFieldGroup, projectId }) => {
  const tableFieldOrder = Array.isArray(detailModel.tableFieldOrder) ? detailModel.tableFieldOrder : []
  const nestedTableOrder = Array.isArray(detailModel.nestedTableOrder) ? detailModel.nestedTableOrder : []

  return [
    ...tableFieldOrder.map((fieldName) => ({
      title: fieldName,
      dataIndex: fieldName,
      key: `field_${fieldName}`,
      width: 220,
      render: (_ignored, rowRecord) => {
        const cell = rowRecord?._cellMap?.[fieldName]
        if (!cell) return <Text type="secondary">-</Text>
        if (isEmptyFieldValue(cell.value)) return <Text type="secondary">暂无数据</Text>

        const sourceContext = buildProjectFieldSourceContext(currentPatient, cell.fieldData, {
          fieldName: cell.fieldName,
          fieldPath: cell.fieldPath,
          rowIndex: Number.isInteger(rowRecord?._rowIndex) ? rowRecord._rowIndex : null,
          groupName: currentFieldGroup?.name,
        })

        return (
          <ClickableFieldValue
            fieldName={cell.fieldName}
            fieldValue={cell.value}
            fieldData={cell.fieldData}
            audit={sourceContext.audit}
            documents={sourceContext.documents}
            showSourceTag={true}
            projectId={projectId}
            projectPatientId={currentPatient?.id}
            fieldPath={cell.fieldPath}
          />
        )
      }
    })),
    ...nestedTableOrder.map((tableName) => ({
      title: tableName,
      dataIndex: tableName,
      key: `nested_${tableName}`,
      width: 260,
      render: (_ignored, rowRecord) => {
        const tableValue = rowRecord?._nestedTables?.[tableName]
        if (!tableValue || (Array.isArray(tableValue) && tableValue.length === 0)) {
          return <Text type="secondary">暂无数据</Text>
        }
        return <StructuredDataView data={tableValue} dense={false} />
      }
    })),
  ]
}

const FieldGroupScalarCells = ({ cells, currentPatient, currentFieldGroup, projectId, token }) => (
  <Card size="small" title="字段值" style={{ marginBottom: 12 }}>
    <Row gutter={[16, 8]}>
      {cells.map((cell) => {
        const displayName = cell.fieldName
        const value = cell.value
        const hasValue = !isEmptyFieldValue(value)
        const isComplexValue = Array.isArray(value) || (typeof value === 'object' && value !== null)
        const sourceContext = buildProjectFieldSourceContext(currentPatient, cell.fieldData, {
          fieldName: displayName,
          fieldPath: cell.fieldPath,
          groupName: currentFieldGroup?.name
        })

        return (
          <Col span={12} key={cell.fieldPath || displayName}>
            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 12, color: token.colorTextSecondary }}>
                {displayName}:
              </Text>
              <div style={{ marginTop: 4 }}>
                {hasValue ? (
                  <div>
                    <ClickableFieldValue
                      fieldName={displayName}
                      fieldValue={value}
                      fieldData={cell.fieldData}
                      audit={sourceContext.audit}
                      documents={sourceContext.documents}
                      showSourceTag={true}
                      projectId={projectId}
                      projectPatientId={currentPatient?.id}
                      fieldPath={cell.fieldPath}
                    />
                    {isComplexValue && (
                      <div style={{ marginTop: 6 }}>
                        <StructuredDataView data={value} dense={false} />
                      </div>
                    )}
                  </div>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    暂无数据
                  </Text>
                )}
              </div>
            </div>
          </Col>
        )
      })}
    </Row>
  </Card>
)

const FieldGroupDetailBody = ({ currentFieldGroup, currentPatient, projectId, token }) => {
  const detailModel = currentFieldGroup.data.displayModel || {
    rows: currentFieldGroup.data.records || [],
    scalarCells: [],
    rowCount: (currentFieldGroup.data.records || []).length
  }

  if (detailModel.rowCount > 0) {
    const rowsForTable = Array.isArray(detailModel.rowsForTable) ? detailModel.rowsForTable : []
    return (
      <Table
        size="small"
        bordered
        rowKey={(row) => String(row?._rowIndex)}
        pagination={false}
        scroll={{ x: 'max-content', y: 460 }}
        dataSource={rowsForTable}
        columns={[
          {
            title: '记录',
            dataIndex: '_rowIndex',
            key: '_rowIndex',
            width: 90,
            fixed: 'left',
            render: (rowIndex) => `#${Number(rowIndex) + 1}`
          },
          ...buildDetailColumns({ detailModel, currentPatient, currentFieldGroup, projectId }),
        ]}
      />
    )
  }

  if ((detailModel.scalarCells || []).length > 0) {
    return (
      <FieldGroupScalarCells
        cells={detailModel.scalarCells}
        currentPatient={currentPatient}
        currentFieldGroup={currentFieldGroup}
        projectId={projectId}
        token={token}
      />
    )
  }

  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <Text type="secondary">暂无记录数据</Text>
      <div style={{ marginTop: 8 }}>
        <Button type="primary" icon={<PlayCircleOutlined />}>
          开始抽取数据
        </Button>
      </div>
    </div>
  )
}

const FieldGroupDetailModal = ({
  open,
  currentFieldGroup,
  currentPatient,
  projectId,
  token,
  onClose,
}) => (
  <Modal
    title={
      <Space>
        <FileTextOutlined />
        {currentFieldGroup?.name} - {currentPatient?.name} ({currentPatient?.patientId})
      </Space>
    }
    open={open}
    onCancel={onClose}
    footer={[
      <Button key="close" onClick={onClose}>
        关闭
      </Button>,
    ]}
    width={modalWidthPreset.wide}
    styles={modalBodyPreset}
  >
    {currentFieldGroup && currentPatient && (
      <div>
        <Alert
          message={`${currentFieldGroup.name}详细信息`}
          description={`患者: ${currentPatient.name} | 完整度: ${currentFieldGroup.data.completeness}% | 记录数: ${(currentFieldGroup.data.displayModel?.rowCount ?? currentFieldGroup.data.records?.length) || 0}条`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <FieldGroupDetailBody
          currentFieldGroup={currentFieldGroup}
          currentPatient={currentPatient}
          projectId={projectId}
          token={token}
        />
      </div>
    )}
  </Modal>
)

export default FieldGroupDetailModal
