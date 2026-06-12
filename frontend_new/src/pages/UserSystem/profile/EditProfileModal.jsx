import React from 'react'
import { Button, Col, Form, Input, Modal, Row, Select, TreeSelect } from 'antd'

export const EditProfileModal = ({
  departmentTree,
  form,
  onCancel,
  onSave,
  visible,
}) => (
  <Modal
    title="编辑个人信息"
    open={visible}
    onCancel={onCancel}
    footer={[
      <Button key="cancel" onClick={onCancel}>
        取消
      </Button>,
      <Button key="save" type="primary" onClick={onSave}>
        保存
      </Button>,
    ]}
    width={600}
  >
    <Form form={form} layout="vertical">
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="邮箱" name="email" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="手机号" name="phone">
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="职位职称" name="position">
            <Input />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="工作单位" name="organization">
            <Input />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="科室部门" name="department">
            <TreeSelect
              showSearch
              style={{ width: '100%' }}
              dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
              placeholder="请选择科室部门"
              allowClear
              treeDefaultExpandAll
              treeData={departmentTree}
              fieldNames={{
                label: 'name',
                value: 'name',
                children: 'children',
              }}
            />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="研究领域" name="researchFields">
            <Select mode="tags" placeholder="选择或输入研究领域">
              <Select.Option value="肿瘤研究">肿瘤研究</Select.Option>
              <Select.Option value="心血管研究">心血管研究</Select.Option>
              <Select.Option value="神经科学">神经科学</Select.Option>
              <Select.Option value="临床试验">临床试验</Select.Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>
    </Form>
  </Modal>
)
