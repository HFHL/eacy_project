import React from 'react'
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Dropdown,
  Space,
  Table,
  Tooltip,
  Typography,
} from 'antd'
import {
  InfoCircleOutlined,
  MoreOutlined,
  PlusOutlined,
  UserAddOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

const PatientListCard = ({
  selectedRowKeys,
  patientData,
  pagination,
  columns,
  visibleColumns,
  columnWidths,
  batchActions,
  loading,
  onSelectRows,
  onBatchAction,
  onAddPatient,
  onBatchImport,
  onTableChange,
  onResize,
}) => {
  const rowSelection = {
    selectedRowKeys,
    onChange: onSelectRows,
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_INVERT,
      Table.SELECTION_NONE,
      {
        key: 'high-completeness',
        text: '选择高完整度患者',
        onSelect: () => {
          const highCompletenessKeys = patientData
            .filter(item => item.completeness >= 90)
            .map(item => item.key)
          onSelectRows(highCompletenessKeys)
        }
      }
    ]
  }

  const tableColumns = columns
    .filter(col => visibleColumns.includes(col.key))
    .map((col, index) => ({
      ...col,
      width: columnWidths[index] || col.width,
      onHeaderCell: (column) => ({
        width: columnWidths[index] || column.width,
        onResize: (event, { size }) => onResize(index, size),
      }),
    }))

  return (
    <Card
      title={
        <Space>
          <Text strong style={{ fontSize: 16, color: appThemeToken.colorText }}>患者数据池</Text>
          <Divider type="vertical" />
          <Checkbox
            indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < patientData.length}
            checked={selectedRowKeys.length === patientData.length && patientData.length > 0}
            onChange={(event) => {
              onSelectRows(event.target.checked ? patientData.map(item => item.key) : [])
            }}
          >
            全选
          </Checkbox>
          <Text>已选择 {selectedRowKeys.length} 名患者</Text>
          <Text type="secondary">当前显示: {patientData.length}/{pagination.total.toLocaleString()} 名患者</Text>
          <Divider type="vertical" />
          <Tooltip title="点击患者姓名查看详情，使用右上角列设置调整显示内容">
            <InfoCircleOutlined style={{ color: appThemeToken.colorPrimary }} />
          </Tooltip>
        </Space>
      }
      extra={
        <Space>
          {selectedRowKeys.length > 0 && (
            <Dropdown menu={{ items: batchActions, onClick: onBatchAction }}>
              <Button type="primary" style={{ backgroundColor: appThemeToken.colorPrimary, borderColor: appThemeToken.colorPrimary }}>
                批量操作 <MoreOutlined />
              </Button>
            </Dropdown>
          )}
          <Dropdown
            menu={{
              items: [
                {
                  key: 'add-single',
                  icon: <UserAddOutlined />,
                  label: '新建患者',
                  onClick: onAddPatient
                },
                {
                  key: 'batch-import',
                  icon: <UsergroupAddOutlined />,
                  label: '批量导入',
                  onClick: onBatchImport
                }
              ]
            }}
          >
            <Button type="primary" icon={<PlusOutlined />} style={{ backgroundColor: appThemeToken.colorPrimary, borderColor: appThemeToken.colorPrimary }}>
              添加患者 <MoreOutlined />
            </Button>
          </Dropdown>
        </Space>
      }
    >
      <Table
        rowSelection={rowSelection}
        columns={tableColumns}
        dataSource={patientData}
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`
        }}
        onChange={onTableChange}
        scroll={{ x: 'max-content' }}
        size="small"
        bordered
        tableLayout="auto"
      />
    </Card>
  )
}

export default PatientListCard
