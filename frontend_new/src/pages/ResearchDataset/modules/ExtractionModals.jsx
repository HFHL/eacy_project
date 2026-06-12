import React from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Col,
  Form,
  Modal,
  Radio,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'

const { Text } = Typography

export const ExtractionErrorModal = ({
  open,
  extractionProgress,
  projectId,
  token,
  onClose,
  onNavigatePatientDetail,
}) => (
  <Modal
    title="CRF 抽取失败原因"
    open={open}
    onCancel={onClose}
    footer={[
      <Button key="close" onClick={onClose}>
        关闭
      </Button>
    ]}
    width={modalWidthPreset.wide}
    styles={modalBodyPreset}
  >
    <Alert
      type="warning"
      showIcon
      message="以下为任务执行时记录的失败明细（patient_id + error）"
      description={
        <div>
          <div>任务ID: <Text code>{extractionProgress?.task_id || '-'}</Text></div>
          <div style={{ marginTop: 4 }}>
            你也可以在浏览器 Network 里查看接口：<Text code>/projects/{projectId}/crf/extraction/progress?task_id=&lt;task_id&gt;</Text>
          </div>
        </div>
      }
      style={{ marginBottom: 12 }}
    />
    <Table
      size="small"
      bordered
      rowKey={(row) => `${row.patient_id || ''}-${row.error || ''}`}
      dataSource={Array.isArray(extractionProgress?.errors) ? extractionProgress.errors : []}
      pagination={{ pageSize: 10 }}
      columns={[
        {
          title: '患者ID',
          dataIndex: 'patient_id',
          width: 340,
          render: (patientId) => (
            <Space>
              <Text code>{patientId}</Text>
              <Button size="small" type="link" onClick={() => onNavigatePatientDetail(patientId)}>
                打开患者
              </Button>
            </Space>
          )
        },
        {
          title: '错误信息',
          dataIndex: 'error',
          render: (error) => <Text style={{ color: token.colorError }}>{String(error || '')}</Text>
        }
      ]}
    />
  </Modal>
)

export const PatientExtractChoiceModal = ({
  choice,
  isExtracting,
  onCancel,
  onStartIncremental,
  onConfirmFull,
}) => (
  <Modal
    title={choice ? `抽取患者数据 · ${choice.displayName}` : '抽取患者数据'}
    open={Boolean(choice)}
    onCancel={onCancel}
    getContainer={() => document.body}
    zIndex={1200}
    destroyOnClose
    maskClosable
    footer={[
      <Button key="cancel" onClick={onCancel}>
        取消
      </Button>,
      <Button
        key="incremental"
        type="primary"
        disabled={isExtracting}
        icon={<PlayCircleOutlined />}
        onClick={onStartIncremental}
      >
        增量抽取
      </Button>,
      <Button
        key="full"
        danger
        disabled={isExtracting}
        icon={<ReloadOutlined />}
        onClick={onConfirmFull}
      >
        重新抽取
      </Button>,
    ]}
    width={modalWidthPreset.standard}
    styles={modalBodyPreset}
  >
    <Alert
      type="info"
      showIcon
      message="该患者已有抽取记录"
      description={
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li><Text strong>增量抽取</Text>：仅补抽尚未入队的文档与字段组（跳过已成功抽取部分）。</li>
          <li><Text strong>重新抽取</Text>：对所有 OCR 合格的文档重新规划并入队，不跳过已有抽取记录。</li>
        </ul>
      }
    />
  </Modal>
)

export const TargetedExtractionModal = ({
  open,
  selectedPatients,
  projectInfo,
  extractionModalGroups,
  extractionModalMode,
  crfFieldGroups,
  isExtracting,
  onCancel,
  onStart,
  onGroupsChange,
  onModeChange,
}) => (
  <Modal
    title="专项抽取配置"
    open={open}
    onCancel={onCancel}
    footer={[
      <Button key="cancel" onClick={onCancel}>
        取消
      </Button>,
      <Button
        key="start"
        type="primary"
        disabled={extractionModalGroups.length === 0 || isExtracting}
        onClick={onStart}
      >
        开始抽取
      </Button>
    ]}
    width={modalWidthPreset.standard}
    styles={modalBodyPreset}
  >
    <Alert
      message="专项抽取任务"
      description={`目标患者: ${selectedPatients.length > 0 ? `已选 ${selectedPatients.length} 名` : `全部 ${projectInfo.totalPatients || 0} 名`} | 已选字段组: ${extractionModalGroups.length} 个`}
      type="info"
      style={{ marginBottom: 16 }}
    />

    <Form layout="vertical">
      <Form.Item label="选择字段组">
        <div style={{ marginBottom: 8 }}>
          <Space>
            <Button
              size="small"
              type="link"
              style={{ padding: 0 }}
              onClick={() => onGroupsChange(crfFieldGroups.map(group => group.group_id))}
            >
              全选
            </Button>
            <Button
              size="small"
              type="link"
              style={{ padding: 0 }}
              onClick={() => onGroupsChange(crfFieldGroups.filter(group => group.status !== 'completed').map(group => group.group_id))}
            >
              选择未完成
            </Button>
            <Button size="small" type="link" style={{ padding: 0 }} onClick={() => onGroupsChange([])}>
              清空
            </Button>
          </Space>
        </div>
        <Checkbox.Group style={{ width: '100%' }} value={extractionModalGroups} onChange={onGroupsChange}>
          <Row>
            {crfFieldGroups.map(group => (
              <Col span={24} key={group.group_id} style={{ marginBottom: 8 }}>
                <Checkbox value={group.group_id}>
                  <Space>
                    <Text>{group.name}</Text>
                    {group.status === 'completed' && <Tag color="green" size="small">已完成</Tag>}
                    {group.status === 'partial' && <Tag color="orange" size="small">部分完成</Tag>}
                    <Text type="secondary">({group.completeness}%)</Text>
                  </Space>
                </Checkbox>
              </Col>
            ))}
          </Row>
        </Checkbox.Group>
      </Form.Item>

      <Form.Item label="抽取模式">
        <Radio.Group value={extractionModalMode} onChange={event => onModeChange(event.target.value)}>
          <Radio value="incremental">增量抽取 - 仅补抽选中组内缺失字段</Radio>
          <Radio value="full">全量抽取 - 重新抽取选中组内所有字段</Radio>
        </Radio.Group>
      </Form.Item>
    </Form>
  </Modal>
)
