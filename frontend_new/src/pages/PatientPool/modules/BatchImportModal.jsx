import React from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Modal,
  Row,
  Space,
  Steps,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  DownloadOutlined,
  UsergroupAddOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { maskName } from '../../../utils/sensitiveUtils'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography
const { Step } = Steps
const { Dragger } = Upload

const IMPORT_STEPS = [
  { title: '下载模版', description: '获取导入模版' },
  { title: '上传验证', description: '上传并验证Excel' },
  { title: '数据预览', description: '确认患者信息' }
]

const createImportColumns = () => [
  { title: '序号', dataIndex: 'rowIndex', width: 50, fixed: 'left' },
  {
    title: '姓名',
    dataIndex: 'name',
    width: 80,
    fixed: 'left',
    render: (text, record) => (
      <Text type={record.status === 'error' ? 'danger' : undefined}>{text ? maskName(text) : '-'}</Text>
    )
  },
  {
    title: '性别',
    dataIndex: 'gender',
    width: 50,
    render: (text, record) => (
      <Text type={record.status === 'error' ? 'danger' : undefined}>{text || '-'}</Text>
    )
  },
  {
    title: '年龄',
    dataIndex: 'age',
    width: 50,
    render: (text, record) => (
      <Text type={record.status === 'error' ? 'danger' : undefined}>{text || '-'}</Text>
    )
  },
  {
    title: '科室',
    dataIndex: 'department',
    width: 100,
    render: (text, record) => (
      <Text type={record.status === 'error' ? 'danger' : undefined}>{text || '-'}</Text>
    )
  },
  { title: '联系电话', dataIndex: 'phone', width: 110, render: text => text || '-' },
  { title: '主治医师', dataIndex: 'doctor', width: 90, render: text => text || '-' },
  { title: '主要诊断', dataIndex: 'diagnosis', width: 120, ellipsis: { showTitle: true }, render: text => text || '-' },
  { title: 'ICD编码', dataIndex: 'icdCodes', width: 100, ellipsis: true, render: text => text || '-' },
  { title: '既往病史', dataIndex: 'medicalHistory', width: 100, ellipsis: true, render: text => text || '-' },
  { title: '过敏史', dataIndex: 'allergyHistory', width: 100, ellipsis: true, render: text => text || '-' },
  { title: '当前用药', dataIndex: 'currentMedication', width: 100, ellipsis: true, render: text => text || '-' },
  { title: '备注', dataIndex: 'notes', width: 100, ellipsis: true, render: text => text || '-' },
  {
    title: '验证结果',
    width: 100,
    render: (_, record) => {
      const messages = [...record.errors, ...record.warnings]
      return messages.length > 0 ? (
        <div>
          {record.errors.slice(0, 2).map((err, idx) => (
            <div key={`err-${idx}`}>
              <Text type="danger" style={{ fontSize: 12 }}>{err}</Text>
            </div>
          ))}
          {record.errors.length > 2 && (
            <Text type="danger" style={{ fontSize: 12 }}>...还有{record.errors.length - 2}个错误</Text>
          )}
          {record.warnings.slice(0, 1).map((warn, idx) => (
            <div key={`warn-${idx}`}>
              <Text type="warning" style={{ fontSize: 12 }}>{warn}</Text>
            </div>
          ))}
        </div>
      ) : (
        <Text type="success">✓ 通过</Text>
      )
    }
  },
  {
    title: '创建状态',
    width: 100,
    fixed: 'right',
    render: (_, record) => {
      if (record.createStatus === 'success') {
        return <Tag color="success" icon={<CheckCircleOutlined />}>创建成功</Tag>
      }
      if (record.createStatus === 'error') {
        return (
          <Tooltip title={record.createMessage}>
            <Tag color="error" icon={<WarningOutlined />}>创建失败</Tag>
          </Tooltip>
        )
      }
      return '-'
    }
  }
]

const BatchImportModal = ({
  open,
  step,
  importData,
  selectedKeys,
  uploadProps,
  loading,
  onCancel,
  onPrev,
  onNext,
  onDownloadTemplate,
  onSelectKeys,
  onViewPatient,
}) => {
  const successRows = importData.filter(item => item.status === 'success')
  const errorRows = importData.filter(item => item.status === 'error')
  const warningRows = importData.filter(item => item.warnings && item.warnings.length > 0)

  return (
    <Modal
      title={<Space><UsergroupAddOutlined />批量导入患者</Space>}
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        step > 0 && <Button key="prev" onClick={onPrev}>上一步</Button>,
        (step === 0 || step === 1) && (
          <Button key="next" type="primary" onClick={onNext} style={{ backgroundColor: appThemeToken.colorPrimary, borderColor: appThemeToken.colorPrimary }}>
            下一步
          </Button>
        ),
        step === 2 && (
          <Button
            key="confirm"
            type="primary"
            onClick={onNext}
            loading={loading}
            disabled={successRows.length === 0}
            style={{ backgroundColor: appThemeToken.colorPrimary, borderColor: appThemeToken.colorPrimary }}
          >
            确认导入
          </Button>
        )
      ].filter(Boolean)}
      width={900}
      destroyOnHidden
    >
      <Steps current={step} style={{ marginBottom: 24 }}>
        {IMPORT_STEPS.map(item => (
          <Step key={item.title} title={item.title} description={item.description} />
        ))}
      </Steps>

      {step === 0 && (
        <div>
          <Alert message="导入说明" description="请先下载Excel模版，按照模版格式填写患者信息后上传。" type="info" showIcon style={{ marginBottom: 16 }} />
          <Card>
            <Row gutter={16} align="middle">
              <Col span={16}>
                <Space direction="vertical">
                  <Text strong>患者信息导入模版.xlsx</Text>
                  <Text type="secondary">包含字段：患者姓名、性别、年龄、联系电话、科室、主要诊断等</Text>
                </Space>
              </Col>
              <Col span={8}>
                <Button type="primary" icon={<DownloadOutlined />} onClick={onDownloadTemplate} block style={{ backgroundColor: appThemeToken.colorPrimary, borderColor: appThemeToken.colorPrimary }}>
                  下载模版
                </Button>
              </Col>
            </Row>
          </Card>
        </div>
      )}

      {step === 1 && (
        <div>
          <Alert message="上传Excel文件" description="请选择填写完成的Excel文件进行上传。支持.xlsx和.xls格式，文件大小不超过10MB。" type="info" showIcon style={{ marginBottom: 16 }} />
          <Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon"><CloudUploadOutlined /></p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">支持Excel格式文件(.xlsx, .xls)，文件大小不超过10MB</p>
          </Dragger>
        </div>
      )}

      {step === 2 && (
        <div>
          {errorRows.length > 0 && (
            <Alert message={`发现 ${errorRows.length} 个错误`} description="错误的数据将被跳过，只导入验证通过的数据。" type="warning" showIcon style={{ marginBottom: 16 }} />
          )}
          {successRows.length > 0 && (
            <Alert message="数据验证完成" description={`共 ${importData.length} 条数据，其中 ${successRows.length} 条验证通过，可以导入。`} type="success" showIcon style={{ marginBottom: 16 }} />
          )}
          <Card
            title={
              <Space>
                <span>数据预览 ({importData.length} 条)</span>
                <Checkbox
                  checked={selectedKeys.length > 0 && selectedKeys.length === successRows.length}
                  indeterminate={selectedKeys.length > 0 && selectedKeys.length < successRows.length}
                  onChange={(event) => onSelectKeys(event.target.checked ? successRows.map(item => item.key) : [])}
                >
                  全选
                </Checkbox>
                <Text type="secondary">（已选 {selectedKeys.length} 个）</Text>
              </Space>
            }
            size="small"
          >
            <Table
              dataSource={importData}
              rowKey="key"
              onRow={(record) => ({
                onClick: (event) => {
                  if (event.target.type === 'checkbox' || event.target.closest('.ant-checkbox-wrapper')) return
                  onViewPatient(record)
                },
                style: { cursor: 'pointer' }
              })}
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: onSelectKeys,
                getCheckboxProps: record => ({ disabled: record.status === 'error' })
              }}
              columns={createImportColumns()}
              pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'] }}
              size="small"
              scroll={{ x: 1450, y: 400 }}
            />
          </Card>

          <div style={{ marginTop: 16 }}>
            <Space split={<Divider type="vertical" />}>
              <Text strong>导入统计：</Text>
              <Text>总计 <Text strong>{importData.length}</Text> 条</Text>
              <Text type="success">验证通过 <Text strong>{successRows.length}</Text> 条</Text>
              <Text type="danger">错误 <Text strong>{errorRows.length}</Text> 条</Text>
              {warningRows.length > 0 && <Text type="warning">警告 <Text strong>{warningRows.length}</Text> 条</Text>}
            </Space>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default BatchImportModal
