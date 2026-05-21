import React, { useEffect, useState } from 'react'
import { Form, Input, Modal, message } from 'antd'
import { cloneCrfTemplate } from '../../api/crfTemplate'

/**
 * 复制 CRF 模板并生成新模板。
 */
const CrfTemplateCloneModal = ({
  open,
  templateId,
  sourceName = '未命名模板',
  onCancel,
  onCloned,
}) => {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      name: `${sourceName || '未命名模板'} 副本`,
    })
  }, [form, open, sourceName])

  const handleOk = async () => {
    if (!templateId) {
      message.error('缺少源模板 ID')
      return
    }
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const response = await cloneCrfTemplate(templateId, {
        template_name: values.name?.trim(),
      })
      if (response?.success === false) {
        message.error(response?.message || '复制模板失败')
        return
      }
      const newId = response?.data?.id
      if (!newId) {
        message.error('复制成功但未返回新模板 ID')
        return
      }
      message.success('已复制为新模板')
      onCloned?.(newId, response?.data)
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '复制模板失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="复制为新 CRF 模板"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="确认复制"
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnClose
      width={520}
    >
      <p style={{ marginBottom: 16, color: 'rgba(0,0,0,0.65)' }}>
        将复制「{sourceName}」的目录结构、字段与表单配置，生成独立的新模板（默认保存为草稿）。
      </p>
      <Form form={form} layout="vertical">
        <Form.Item
          label="新模板名称"
          name="name"
          rules={[{ required: true, message: '请输入新模板名称' }]}
        >
          <Input placeholder="请输入新模板名称" maxLength={200} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default CrfTemplateCloneModal
