import React, { useEffect, useState } from 'react'
import { Alert, Button, Col, Form, Input, Modal, Row, Switch, Upload, message } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { importCrfTemplateFromCsv } from '../../api/crfTemplate'
import { modalBodyPreset, modalWidthPreset } from '../../styles/themeTokens'

/**
 * CRF 模板 CSV 导入弹窗（四院层级式 CSV）。
 */
const CrfTemplateCsvImportModal = ({
  open = false,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm()
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!open) {
      form.resetFields()
    }
  }, [open, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      const fileObj = values.file?.[0]?.originFileObj
      if (!fileObj) {
        message.error('请选择 CSV 文件')
        return
      }
      setImporting(true)
      const res = await importCrfTemplateFromCsv({
        template_name: values.template_name,
        category: values.category,
        description: values.description,
        publish: !!values.publish,
        file: fileObj,
      })
      if (!res?.success) {
        message.error(res?.message || '模板导入失败')
        return
      }
      message.success(res.message || '模板导入成功')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('research-template-rail-refresh'))
      }
      onSuccess?.(res?.data)
      onCancel?.()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '模板导入失败')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      title="导入 CSV 创建 CRF 模板"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="导入"
      confirmLoading={importing}
      width={modalWidthPreset.wide}
      styles={modalBodyPreset}
      destroyOnClose
      zIndex={1100}
      getContainer={() => document.body}
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="模板名称"
              name="template_name"
              rules={[{ required: true, message: '请输入模板名称' }]}
            >
              <Input placeholder="例如: 四院字段集 v1" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="分类" name="category">
              <Input placeholder="例如: 四院" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="导入后直接发布" name="publish" valuePropName="checked" initialValue={false}>
              <Switch />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="描述" name="description">
          <Input.TextArea rows={3} placeholder="可选" />
        </Form.Item>

        <Form.Item
          label="CSV 文件"
          name="file"
          valuePropName="fileList"
          getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}
          rules={[
            {
              validator: async (_, fileList) => {
                if (Array.isArray(fileList) && fileList.length > 0) return
                throw new Error('请选择 CSV 文件')
              },
            },
          ]}
        >
          <Upload beforeUpload={() => false} maxCount={1} accept=".csv,text/csv">
            <Button icon={<UploadOutlined />}>选择 CSV 文件</Button>
          </Upload>
        </Form.Item>

        <Alert
          type="info"
          showIcon
          message="说明"
          description="支持四院层级式 CSV（如「字段配置模版-四院.csv」）。导入后写入完整 designer/schema，进入设计器可回填展示类型、单位、选项、必填/可空、抽取提示词、来源文档等配置。"
        />
      </Form>
    </Modal>
  )
}

export default CrfTemplateCsvImportModal
