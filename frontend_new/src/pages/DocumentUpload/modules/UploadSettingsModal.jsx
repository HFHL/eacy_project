import React from 'react'
import { Alert, Button, Checkbox, Col, Form, Modal, Radio, Row, Select } from 'antd'

import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'

export const UploadSettingsModal = ({
  setUploadSettings,
  setVisible,
  uploadSettings,
  visible,
}) => (
  <Modal
    title="上传设置"
    open={visible}
    onCancel={() => setVisible(false)}
    width={modalWidthPreset.standard}
    styles={modalBodyPreset}
    footer={[
      <Button key="cancel" onClick={() => setVisible(false)}>
        取消
      </Button>,
      <Button key="save" type="primary">
        保存设置
      </Button>,
    ]}
  >
    <Form layout="vertical" initialValues={uploadSettings}>
      <Form.Item label="Excel/CSV文件处理方式">
        <Radio.Group
          value={uploadSettings.csvMode}
          onChange={(event) => setUploadSettings({ ...uploadSettings, csvMode: event.target.value })}
        >
          <Radio value="multiple">每行代表一位独立患者 (适用于患者列表)</Radio>
          <Radio value="single">整个文件属于一位患者 (适用于单患者多项检查)</Radio>
        </Radio.Group>
      </Form.Item>

      <Form.Item label="文档标签 (可选)">
        <Select
          mode="tags"
          placeholder="添加文档标签，便于后续管理"
          value={uploadSettings.tags}
          onChange={(tags) => setUploadSettings({ ...uploadSettings, tags })}
        >
          <Select.Option value="临床检查">临床检查</Select.Option>
          <Select.Option value="常规检查">常规检查</Select.Option>
          <Select.Option value="随访记录">随访记录</Select.Option>
          <Select.Option value="影像资料">影像资料</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item label="处理选项">
        <Checkbox.Group>
          <Row>
            <Col span={24}>
              <Checkbox
                checked={uploadSettings.autoProcess}
                onChange={(event) => setUploadSettings({ ...uploadSettings, autoProcess: event.target.checked })}
              >
                上传完成后自动开始AI处理
              </Checkbox>
            </Col>
            <Col span={24}>
              <Checkbox defaultChecked>启用智能文档分类</Checkbox>
            </Col>
            <Col span={24}>
              <Checkbox defaultChecked>自动检测重复文档</Checkbox>
            </Col>
          </Row>
        </Checkbox.Group>
      </Form.Item>

      <Alert
        message="隐私保护提醒"
        description="所有上传的医疗文档都将进行加密存储，仅用于您的科研数据分析，不会用于其他用途。"
        type="info"
        showIcon
        style={{ marginTop: 16 }}
      />
    </Form>
  </Modal>
)
