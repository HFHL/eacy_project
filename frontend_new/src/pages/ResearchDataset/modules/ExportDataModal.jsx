import React from 'react'
import { Button, Checkbox, Form, Modal, Select } from 'antd'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'

const ExportDataModal = ({
  open,
  loading,
  form,
  onCancel,
  onConfirm,
}) => (
  <Modal
    title="数据导出配置"
    open={open}
    onCancel={onCancel}
    footer={[
      <Button key="cancel" onClick={onCancel}>
        取消
      </Button>,
      <Button key="export" type="primary" loading={loading} onClick={onConfirm}>
        开始导出
      </Button>
    ]}
    width={modalWidthPreset.standard}
    styles={modalBodyPreset}
  >
    <Form form={form} layout="vertical" initialValues={{ scope: 'selected', expand_repeatable_rows: true }}>
      <Form.Item label="导出范围" name="scope">
        <Select defaultValue="selected">
          <Select.Option value="all">全部患者</Select.Option>
          <Select.Option value="selected">选中的患者</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item name="expand_repeatable_rows" valuePropName="checked">
        <Checkbox>
          按多行记录展开导出（新增“患者数据(展开)”sheet，每条检验/重复记录一行）
        </Checkbox>
      </Form.Item>
    </Form>
  </Modal>
)

export default ExportDataModal
