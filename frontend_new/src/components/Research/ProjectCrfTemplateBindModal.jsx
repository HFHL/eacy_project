import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Card, Modal, Radio, Space, Spin, Tag, Typography, message } from 'antd'
import { assignTemplateToProject, getCRFTemplates } from '../../api/crfTemplate'
import { appThemeToken } from '../../styles/themeTokens'

const { Text } = Typography

/**
 * 为已有科研项目选择并绑定 CRF 模板。
 */
const ProjectCrfTemplateBindModal = ({
  open,
  projectId,
  projectName = '',
  onCancel,
  onBound,
}) => {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  const normalizedTemplates = useMemo(
    () => templates.map((item) => ({
      ...item,
      normalizedId: String(item.id || item.template_id || ''),
    })).filter((item) => item.normalizedId),
    [templates],
  )

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const response = await getCRFTemplates()
      const items = Array.isArray(response?.data) ? response.data : (response?.data?.items || [])
      setTemplates(items)
    } catch {
      setTemplates([])
      message.error('获取 CRF 模板列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setSelectedTemplateId('')
    loadTemplates()
  }, [open, loadTemplates])

  const handleOk = async () => {
    if (!projectId) {
      message.error('缺少项目 ID')
      return
    }
    if (!selectedTemplateId) {
      message.error('请选择一个 CRF 模板')
      return
    }
    setSubmitting(true)
    try {
      const response = await assignTemplateToProject(projectId, selectedTemplateId)
      if (response?.success === false) {
        message.error(response?.message || '绑定模板失败')
        return
      }
      message.success('CRF 模板已绑定')
      onBound?.()
    } catch (error) {
      message.error(error?.message || '绑定模板失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={projectName ? `选择 CRF 模板 · ${projectName}` : '选择 CRF 模板'}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="确认绑定"
      cancelText="取消"
      confirmLoading={submitting}
      width={640}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        message="绑定 CRF 模板"
        description="请选择本项目使用的基础 CRF 模板，系统会为项目创建独立副本用于字段结构与抽取。"
        style={{ marginBottom: 16 }}
      />
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : normalizedTemplates.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          message="暂无可用 CRF 模板"
          description="请先在左侧 CRF 模板管理中创建模板。"
        />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          {normalizedTemplates.map((template) => {
            const checked = selectedTemplateId === template.normalizedId
            return (
              <Card
                key={template.normalizedId}
                size="small"
                hoverable
                onClick={() => setSelectedTemplateId(template.normalizedId)}
                style={{
                  cursor: 'pointer',
                  borderColor: checked ? appThemeToken.colorPrimary : undefined,
                  background: checked ? appThemeToken.colorPrimaryBg : undefined,
                }}
              >
                <Radio
                  checked={checked}
                  onChange={() => setSelectedTemplateId(template.normalizedId)}
                  style={{ width: '100%' }}
                >
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Text strong>{template.template_name || template.name || '未命名模板'}</Text>
                    {template.category ? <Tag color="blue">{template.category}</Tag> : null}
                  </Space>
                </Radio>
              </Card>
            )
          })}
        </Space>
      )}
    </Modal>
  )
}

export default ProjectCrfTemplateBindModal
