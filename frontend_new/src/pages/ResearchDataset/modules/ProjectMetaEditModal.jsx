import React from 'react'
import { Button, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'

const ProjectMetaEditModal = ({
  open,
  form,
  statusOptions,
  onCancel,
  onSave,
}) => (
  <Modal
    title="编辑项目信息"
    open={open}
    onCancel={onCancel}
    footer={[
      <Button key="cancel" onClick={onCancel}>
        取消
      </Button>,
      <Button key="save" type="primary" onClick={onSave}>
        保存修改
      </Button>
    ]}
    width={modalWidthPreset.standard}
    styles={modalBodyPreset}
  >
    <Form form={form} layout="vertical">
      <Row gutter={16}>
        <Col span={24}>
          <Form.Item label="项目名称" name="name" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="项目描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="项目状态" name="status">
            <Select>
              {statusOptions.map((option) => (
                <Select.Option key={option.value} value={option.value}>
                  {option.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="CRF模版" name="crfTemplate">
            <Input disabled />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="预期患者数量" name="expected_patient_count">
            <InputNumber min={0} placeholder="预估参与研究的患者数量" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="项目周期" name="project_period">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  </Modal>
)

export default ProjectMetaEditModal
