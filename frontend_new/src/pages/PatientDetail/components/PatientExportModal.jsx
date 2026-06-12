import React from 'react'
import { Alert, Button, Checkbox, Col, Form, Modal, Radio, Row } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'

const PatientExportModal = ({ onCancel, onConfirmExport, open }) => (
  <Modal
    title="导出患者数据"
    open={open}
    onCancel={onCancel}
    footer={[
      <Button key="cancel" onClick={onCancel}>
        取消
      </Button>,
      <Button key="export" type="primary" icon={<DownloadOutlined />} onClick={onConfirmExport}>
        开始导出
      </Button>,
    ]}
  >
    <Form layout="vertical">
      <Form.Item label="导出格式">
        <Radio.Group defaultValue="excel">
          <Radio value="excel">Excel (.xlsx)</Radio>
          <Radio value="csv">CSV (.csv)</Radio>
          <Radio value="pdf">PDF报告</Radio>
        </Radio.Group>
      </Form.Item>

      <Form.Item label="导出内容">
        <Checkbox.Group defaultValue={['basic', 'documents', 'extracted']}>
          <Row>
            <Col span={24}><Checkbox value="basic">电子病历信息</Checkbox></Col>
            <Col span={24}><Checkbox value="documents">文档列表</Checkbox></Col>
            <Col span={24}><Checkbox value="extracted">抽取数据</Checkbox></Col>
            <Col span={24}><Checkbox value="timeline">操作时间线</Checkbox></Col>
          </Row>
        </Checkbox.Group>
      </Form.Item>

      <Alert
        message="数据导出说明"
        description="导出的数据将包含患者的所有相关信息，请确保符合数据使用规范。"
        type="info"
        showIcon
      />
    </Form>
  </Modal>
)

export default PatientExportModal
