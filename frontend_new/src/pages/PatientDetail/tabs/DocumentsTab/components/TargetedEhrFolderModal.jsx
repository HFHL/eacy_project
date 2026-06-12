import React from 'react'
import { Alert, Button, Checkbox, Col, Form, Modal, Radio, Row, Space, Typography } from 'antd'

const { Text } = Typography

const TargetedEhrFolderModal = ({
  groups,
  mode,
  onCancel,
  onGroupsChange,
  onModeChange,
  onSubmit,
  open,
  patientLabel,
  targetFormGroups,
  updating,
}) => (
  <Modal
    title="病历专项抽取"
    open={open}
    onCancel={onCancel}
    footer={[
      <Button key="cancel" onClick={onCancel}>
        取消
      </Button>,
      <Button
        key="start"
        type="primary"
        disabled={groups.length === 0 || updating}
        onClick={onSubmit}
      >
        开始抽取
      </Button>,
    ]}
    width={600}
  >
    <Alert
      message="专项抽取任务"
      description={`患者: ${patientLabel || '-'} | 已选字段组: ${groups.length} 个`}
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
              onClick={() => onGroupsChange(targetFormGroups.map((group) => group.key))}
            >
              全选
            </Button>
            <Button
              size="small"
              type="link"
              style={{ padding: 0 }}
              onClick={() => onGroupsChange([])}
            >
              清空
            </Button>
          </Space>
        </div>
        <Checkbox.Group
          style={{ width: '100%' }}
          value={groups}
          onChange={onGroupsChange}
        >
          <Row>
            {targetFormGroups.map((group) => (
              <Col span={24} key={group.key} style={{ marginBottom: 8 }}>
                <Checkbox value={group.key}>
                  <Text>{group.name}</Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>({group.key})</Text>
                </Checkbox>
              </Col>
            ))}
          </Row>
        </Checkbox.Group>
      </Form.Item>
      <Form.Item label="抽取模式">
        <Radio.Group value={mode} onChange={(event) => onModeChange(event.target.value)}>
          <Radio value="incremental">增量抽取 — 仅补抽选中表单内尚未抽取的文档</Radio>
          <Radio value="full">全量抽取 — 对选中表单强制重新抽取</Radio>
        </Radio.Group>
      </Form.Item>
    </Form>
  </Modal>
)

export default TargetedEhrFolderModal
