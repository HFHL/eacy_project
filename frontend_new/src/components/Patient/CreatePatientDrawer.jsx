import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Drawer, Form, Input, Select, Space, Typography, message } from 'antd'
import { UserAddOutlined } from '@ant-design/icons'
import { batchCreatePatientAndArchive, confirmCreatePatientAndArchive, getDocumentAiMatchInfo } from '../../api/document'
import { appThemeToken } from '../../styles/themeTokens'
import { mergePatientPrefills, toPatientFormValues } from './patientPrefill'

const { Text } = Typography

const hasPatientPrefillValue = (values = {}) => Object.values(toPatientFormValues(values)).some(Boolean)

/**
 * 复用的“新建患者并归档”右侧抽屉
 * - 支持单个文档/批量文档
 * - 打开时自动从 AI 抽取/元数据中回填：姓名、性别、年龄、出生日期、电话、身份证号、地址
 */
const CreatePatientDrawer = ({
  open,
  onClose,
  documentIds = [],
  prefillValues = null,
  zIndex = 3000,
  width = 480,
  onSubmit,
  onSuccess
}) => {
  const [form] = Form.useForm()
  const [prefillLoading, setPrefillLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)

  const docIds = useMemo(() => (Array.isArray(documentIds) ? documentIds.filter(Boolean) : []), [documentIds])
  const isBatch = docIds.length > 1

  const titleText = isBatch ? `批量创建新患者（${docIds.length} 个文档）` : '创建新患者'

  const mergePrefillFromDocs = async (ids) => {
    const MAX_TRY = Math.min(ids.length, 8)
    const targetIds = ids.slice(0, MAX_TRY)

    // 注意：批量时不要并发打爆后端（会导致全部失败→回填为空），改为顺序拉取 + 轻量重试
    const results = []
    for (const id of targetIds) {
      let ok = false
      let lastErr = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await getDocumentAiMatchInfo(id)
          const info = res?.data
          const extracted = info?.extracted_info || {}
          const meta = info?.document_metadata || {}

          results.push({ ok: true, fields: { id, extracted_info: extracted, document_metadata: meta } })
          ok = true
          break
        } catch (e) {
          lastErr = e
          // 简单退避
          await new Promise(r => setTimeout(r, 120))
        }
      }
      if (!ok) {
        console.warn('prefill failed for document:', id, lastErr)
        results.push({ ok: false, fields: { id } })
      }
    }

    const okResults = results.filter(r => r.ok)
    return mergePatientPrefills(okResults.map(r => r.fields))
  }

  useEffect(() => {
    if (!open) return
    if (!docIds.length) return

    let cancelled = false
    ;(async () => {
      setPrefillLoading(true)
      try {
        const merged = hasPatientPrefillValue(prefillValues) ? toPatientFormValues(prefillValues) : await mergePrefillFromDocs(docIds)
        if (cancelled) return
        form.setFieldsValue(toPatientFormValues(merged))
      } finally {
        if (!cancelled) setPrefillLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, docIds.join(','), prefillValues, form]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!docIds.length) {
      message.warning('缺少文档信息')
      return
    }

    try {
      const values = await form.validateFields()
      const patientData = {
        name: values.name || '',
        gender: values.gender || '未知',
        age: values.age ? parseInt(values.age) || null : null,
        birth_date: values.birthDate ? values.birthDate.format('YYYY-MM-DD') : null,
        phone: values.phone || null,
        id_card: values.idNumber || null,
        address: values.address || null
      }

      setSubmitLoading(true)
      const res = onSubmit
        ? await onSubmit(patientData)
        : (isBatch
            ? await batchCreatePatientAndArchive(docIds, patientData)
            : await confirmCreatePatientAndArchive(docIds[0], patientData))

      if (res?.success) {
        message.success(isBatch ? '批量创建患者并归档完成' : '创建患者并归档完成')
        onSuccess?.({ documentIds: docIds, patientData, response: res })
        onClose?.()
      } else {
        message.error(res?.message || (isBatch ? '批量创建患者并归档失败' : '创建患者并归档失败'))
      }
    } catch (e) {
      if (e?.errorFields) return // 表单校验错误
      console.error('create patient failed:', e)
      message.error('创建患者并归档失败')
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <Drawer
      title={
        <Space>
          <UserAddOutlined style={{ color: appThemeToken.colorPrimary }} />
          <Text>{titleText}</Text>
        </Space>
      }
      placement="right"
      width={width}
      open={open}
      zIndex={zIndex}
      onClose={() => {
        form.resetFields()
        onClose?.()
      }}
      extra={
        <Space>
          <Button onClick={onClose} disabled={submitLoading}>
            取消
          </Button>
          <Button type="primary" onClick={handleSubmit} loading={submitLoading}>
            确认创建
          </Button>
        </Space>
      }
    >
      <Alert
        message="创建新患者"
        description={
          isBatch
            ? `将基于所选 ${docIds.length} 个文档的 AI 抽取信息创建 1 位新患者，并将这些文档归档到该患者名下。`
            : '您可以编辑 AI 抽取的患者信息来创建患者。确认后将创建新患者并归档该文档。'
        }
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
      />

      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="姓名"
          rules={[{ required: true, message: '请输入患者姓名' }]}
        >
          <Input placeholder={prefillLoading ? '识别中...' : '请输入姓名'} disabled={prefillLoading} />
        </Form.Item>

        <Form.Item name="gender" label="性别" rules={[{ required: true, message: '请选择性别' }]}>
          <Select
            placeholder={prefillLoading ? '识别中...' : '请选择性别'}
            disabled={prefillLoading}
            options={[
              { label: '男', value: '男' },
              { label: '女', value: '女' },
              { label: '未知', value: '未知' },
              { label: '不详', value: '不详' }
            ]}
            allowClear
          />
        </Form.Item>

        <Form.Item name="age" label="年龄">
          <Input placeholder={prefillLoading ? '识别中...' : '请输入年龄'} disabled={prefillLoading} />
        </Form.Item>

        <Form.Item name="birthDate" label="出生日期">
          <DatePicker
            style={{ width: '100%' }}
            placeholder={prefillLoading ? '识别中...' : '请选择出生日期'}
            disabled={prefillLoading}
          />
        </Form.Item>

        <Form.Item name="phone" label="联系电话">
          <Input placeholder={prefillLoading ? '识别中...' : '请输入联系电话'} disabled={prefillLoading} />
        </Form.Item>

        <Form.Item name="idNumber" label="身份证号">
          <Input placeholder={prefillLoading ? '识别中...' : '请输入身份证号'} disabled={prefillLoading} />
        </Form.Item>

        <Form.Item name="address" label="地址">
          <Input.TextArea
            placeholder={prefillLoading ? '识别中...' : '请输入地址'}
            disabled={prefillLoading}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

export default CreatePatientDrawer
