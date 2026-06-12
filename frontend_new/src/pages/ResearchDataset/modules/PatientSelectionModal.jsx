import React from 'react'
import { Alert, Button, Input, Modal, Space, Table, Tag, Typography } from 'antd'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'

const { Text } = Typography

const PatientSelectionModal = ({
  open,
  selectedNewPatients,
  patientPoolSearch,
  patientPoolPagination,
  patientColumns,
  availablePatients,
  loading,
  token,
  projectInfo,
  onCancel,
  onConfirm,
  onSelectedPatientsChange,
  onSearchChange,
  onFetchPatientPool,
  isPatientInCurrentProject,
}) => (
  <Modal
    title="从患者数据池筛选患者"
    open={open}
    onCancel={onCancel}
    footer={[
      <Button key="cancel" onClick={onCancel}>
        取消
      </Button>,
      <Button
        key="add"
        type="primary"
        onClick={onConfirm}
        disabled={selectedNewPatients.length === 0}
      >
        添加选中患者到项目 ({selectedNewPatients.length})
      </Button>
    ]}
    width={modalWidthPreset.xwide}
    styles={modalBodyPreset}
  >
    <div style={{ marginBottom: 16 }}>
      <Space>
        <Input.Search
          id="project-dataset-patient-pool-search"
          name="projectDatasetPatientPoolSearch"
          placeholder="搜索患者姓名、编号..."
          style={{ width: 250 }}
          value={patientPoolSearch}
          onChange={(event) => onSearchChange(event.target.value)}
          onSearch={(value) => {
            onFetchPatientPool(1, patientPoolPagination.pageSize, value)
          }}
          allowClear
          enterButton
        />
      </Space>
    </div>

    <Alert
      message="已入组本项目的患者无法重复选择；曾退出本项目的患者可重新选择入组"
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
    />

    <Table
      rowSelection={{
        type: 'checkbox',
        selectedRowKeys: selectedNewPatients,
        onChange: onSelectedPatientsChange,
        getCheckboxProps: (record) => ({
          disabled: isPatientInCurrentProject(record),
        })
      }}
      columns={patientColumns}
      dataSource={availablePatients}
      loading={loading}
      pagination={{
        current: patientPoolPagination.current,
        pageSize: patientPoolPagination.pageSize,
        total: patientPoolPagination.total,
        showSizeChanger: true,
        showQuickJumper: true,
        pageSizeOptions: ['10', '20', '50'],
        showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`,
        onChange: (page, pageSize) => {
          onFetchPatientPool(page, pageSize, patientPoolSearch)
        }
      }}
      size="small"
      scroll={{ y: 350 }}
      rowClassName={(record) => isPatientInCurrentProject(record) ? 'ant-table-row-disabled' : ''}
    />

    <div style={{ marginTop: 16, padding: 12, background: token.colorBgLayout, borderRadius: 4 }}>
      <Space direction="vertical" size={4}>
        <Text type="secondary">
          💡 提示：基于项目CRF模版"{projectInfo.crfTemplate}"，从患者数据池中筛选患者。
        </Text>
        <Text type="secondary">
          • <Tag color="green" size="small">未关联</Tag> 表示该患者未加入任何项目
        </Text>
        <Text type="secondary">
          • <Tag color="blue" size="small">项目名称</Tag> 表示已关联其他项目（可同时加入本项目）
        </Text>
        <Text type="secondary">
          • <Tag color="red" size="small">本项目</Tag> 表示已入组本项目（无法重复选择）；<Tag color="orange" size="small">本项目(已退出)</Tag> 可重新选择入组
        </Text>
      </Space>
    </div>
  </Modal>
)

export default PatientSelectionModal
