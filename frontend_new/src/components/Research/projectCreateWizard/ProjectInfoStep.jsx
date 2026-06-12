import React from 'react'
import { Col, DatePicker, Form, Input, InputNumber, Row } from 'antd'

export const ProjectInfoStep = ({ form }) => (
  <Form form={form} layout="vertical">
    <Row gutter={16}>
      <Col span={12}>
        <Form.Item label="项目名称" name="project_name" rules={[{ required: true, message: '请输入项目名称' }]}>
          <Input placeholder="请输入项目名称" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="项目负责人" name="principal_investigator_id">
          <Input placeholder="可留空，默认当前用户" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="项目描述" name="description" rules={[{ required: true, message: '请输入项目描述' }]}>
          <Input.TextArea rows={3} placeholder="请描述项目的研究目标、方法和预期成果" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="预期患者数量" name="expected_patient_count">
          <InputNumber min={0} style={{ width: '100%' }} placeholder="预估参与研究的患者数量" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="项目周期" name="project_period">
          <DatePicker.RangePicker style={{ width: '100%' }} />
        </Form.Item>
      </Col>
    </Row>
  </Form>
)
