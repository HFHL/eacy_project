import React, { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Alert, Button, DatePicker, Drawer, Form, Input, Select, Space, Typography, message } from 'antd'
import { UserAddOutlined } from '@ant-design/icons'
import { batchCreatePatientAndArchive, confirmCreatePatientAndArchive, getDocumentAiMatchInfo } from '../../api/document'

const { Text } = Typography

/**
 * 复用的“新建患者并归档”右侧抽屉
 * - 支持单个文档/批量文档
 * - 打开时自动从 AI 抽取/元数据中回填：姓名、性别、年龄、出生日期、电话、身份证号、地址
 */
const CreatePatientDrawer = ({
  open,
  onClose,
  documentIds = [],
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
    // 合并策略（更智能）：
    // 1) 对每个字段做去噪/判空/合理性校验（例如年龄=0/--/未知/不详 视为无效）
    // 2) 选“信息最完整”的文档作为主来源
    // 3) 其它文档只用于补齐主来源缺失字段
    const merged = {
      name: '',
      gender: '',
      age: '',
      birthDate: null,
      phone: '',
      idNumber: '',
      address: ''
    }

    const MAX_TRY = Math.min(ids.length, 8)
    const targetIds = ids.slice(0, MAX_TRY)

    const normalizeStr = (v) => (v === null || v === undefined ? '' : String(v)).trim()
    const isPlaceholder = (s) => {
      const v = normalizeStr(s)
      if (!v) return true
      return ['--', '未知', '不详', '待AI提取', '待AI分析'].includes(v)
    }
    const pickMeaningful = (s) => (isPlaceholder(s) ? '' : normalizeStr(s))

    const normalizeGender = (g) => {
      const v = pickMeaningful(g)
      if (v === '男' || v === '女') return v
      return '' // 其它一律当未知，不用于回填
    }

    const parseAge = (a) => {
      const v = pickMeaningful(a)
      if (!v) return null
      const m = v.match(/(\d{1,3})/)
      if (!m) return null
      const n = parseInt(m[1], 10)
      // 智能去噪：0 在批量里通常是默认值/抽取失败；同时过滤不合理年龄
      if (!Number.isFinite(n) || n <= 0 || n > 150) return null
      return n
    }

    const parseBirthDate = (d) => {
      const v = pickMeaningful(d)
      if (!v) return null
      // 兼容 YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日
      const normalized = v.replace(/年|月/g, '-').replace(/日/g, '').replace(/\//g, '-')
      const dt = dayjs(normalized, 'YYYY-MM-DD', true)
      return dt.isValid() ? dt : null
    }

    const normalizePhone = (p) => {
      const v = pickMeaningful(p)
      if (!v) return ''
      const digits = v.replace(/\D/g, '')
      // 允许座机/手机号（保守：>=7 位）
      if (digits.length < 7) return ''
      return digits
    }

    const normalizeIdNumber = (idNo) => {
      const v = pickMeaningful(idNo)
      if (!v) return ''
      const s = v.replace(/\s+/g, '')
      // 身份证常见 15/18 位（18位末尾可为 X）
      if (!/^\d{15}$|^\d{17}[\dXx]$/.test(s)) return ''
      return s.toUpperCase()
    }

    const normalizeAddress = (addr) => {
      const v = pickMeaningful(addr)
      if (!v) return ''
      // 太短的通常是噪声
      if (v.length < 4) return ''
      return v
    }

    const computeScore = (f) => {
      // 权重：姓名最重要，其次证件/电话/出生日期/年龄
      let score = 0
      if (f.name) score += 6
      if (f.idNumber) score += 5
      if (f.phone) score += 4
      if (f.birthDate) score += 4
      if (typeof f.age === 'number') score += 3
      if (f.gender) score += 2
      if (f.address) score += 1
      return score
    }

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

          const fields = {
            id,
            name: pickMeaningful(extracted.name || meta.name),
            gender: normalizeGender(extracted.gender || meta.gender),
            age: parseAge(extracted.age || meta.age),
            birthDate: parseBirthDate(extracted.birth_date),
            phone: normalizePhone(extracted.phone),
            idNumber: normalizeIdNumber(extracted.id_number),
            address: normalizeAddress(extracted.address)
          }
          results.push({ ok: true, fields, score: computeScore(fields) })
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
        results.push({ ok: false, fields: { id }, score: 0 })
      }
    }

    const okResults = results.filter(r => r.ok)
    if (!okResults.length) return merged

    // 选信息最完整的作为主来源
    okResults.sort((a, b) => b.score - a.score)
    const primary = okResults[0].fields
    const others = okResults.slice(1).map(r => r.fields)

    const firstFrom = (getter) => {
      for (const f of [primary, ...others]) {
        const v = getter(f)
        if (v) return v
      }
      return null
    }

    merged.name = firstFrom(f => f.name) || ''
    merged.gender = firstFrom(f => f.gender) || ''
    const ageVal = firstFrom(f => (typeof f.age === 'number' ? String(f.age) : ''))
    merged.age = ageVal || ''
    merged.birthDate = firstFrom(f => f.birthDate) || null
    merged.phone = firstFrom(f => f.phone) || ''
    merged.idNumber = firstFrom(f => f.idNumber) || ''
    merged.address = firstFrom(f => f.address) || ''

    return merged
  }

  useEffect(() => {
    if (!open) return
    if (!docIds.length) return

    let cancelled = false
    ;(async () => {
      setPrefillLoading(true)
      try {
        const merged = await mergePrefillFromDocs(docIds)
        if (cancelled) return
        form.setFieldsValue({
          name: merged.name || '',
          gender: merged.gender || '',
          age: merged.age || '',
          birthDate: merged.birthDate || null,
          phone: merged.phone || '',
          idNumber: merged.idNumber || '',
          address: merged.address || ''
        })
      } finally {
        if (!cancelled) setPrefillLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, docIds.join(','), form]) // eslint-disable-line react-hooks/exhaustive-deps

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
          <UserAddOutlined style={{ color: '#6366f1' }} />
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

