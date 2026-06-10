import React, { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { CheckOutlined, FileTextOutlined, InfoCircleOutlined, TeamOutlined } from '@ant-design/icons'
import { assignTemplateToProject, getCRFTemplates } from '../../api/crfTemplate'
import { getPatientList } from '../../api/patient'
import { createProject, enrollPatient } from '../../api/project'
import { appThemeToken } from '../../styles/themeTokens'

const { Text } = Typography

/**
 * 全局项目新建向导弹窗。
 *
 * @param {object} props 组件属性
 * @param {boolean} props.open 是否显示
 * @param {() => void} props.onCancel 取消回调
 * @param {(projectId: string) => void} props.onSuccess 成功回调
 * @returns {JSX.Element}
 */
const ProjectCreateWizardModal = ({ open, onCancel, onSuccess }) => {
  const [wizardForm] = Form.useForm()
  const [step, setStep] = useState(0)
  const [creating, setCreating] = useState(false)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [patientLoading, setPatientLoading] = useState(false)
  const [templates, setTemplates] = useState([])
  const [patients, setPatients] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedPatientIds, setSelectedPatientIds] = useState([])

  /**
   * 归一化患者 ID，统一为字符串，避免选择状态错位。
   *
   * @param {string | number | null | undefined} patientId 患者 ID
   * @returns {string} 归一化后的患者 ID
   */
  const normalizePatientId = (patientId) => String(patientId || '')

  const patientRowIds = useMemo(() => {
    return patients.map((item) => normalizePatientId(item?.id)).filter(Boolean)
  }, [patients])

  const selectedPatientIdSet = useMemo(() => {
    return new Set(selectedPatientIds)
  }, [selectedPatientIds])

  const selectedCurrentPageCount = useMemo(() => {
    return patientRowIds.filter((id) => selectedPatientIdSet.has(id)).length
  }, [patientRowIds, selectedPatientIdSet])

  const isAllPatientsSelected = useMemo(() => {
    return patientRowIds.length > 0 && selectedCurrentPageCount === patientRowIds.length
  }, [patientRowIds.length, selectedCurrentPageCount])

  const isPatientSelectionIndeterminate = useMemo(() => {
    return selectedCurrentPageCount > 0 && selectedCurrentPageCount < patientRowIds.length
  }, [patientRowIds.length, selectedCurrentPageCount])
  /**
   * 归一化模板 ID，兼容不同字段命名。
   *
   * @param {object} template 模板对象
   * @returns {string} 归一化后的模板 ID
   */
  const normalizeTemplateId = (template = {}) => {
    return String(template.id || template.template_id || template.template_code || '')
  }

  const normalizedTemplates = useMemo(() => {
    return templates
      .map((template) => ({
        ...template,
        normalizedId: normalizeTemplateId(template),
      }))
      .filter((template) => Boolean(template.normalizedId))
  }, [templates])

  const stepItems = useMemo(() => ([
    {
      title: '项目信息',
      description: '填写基本信息',
      icon: <InfoCircleOutlined />,
    },
    {
      title: 'CRF模版',
      description: '选择数据模版',
      icon: <FileTextOutlined />,
    },
    {
      title: '患者筛选',
      description: '选择研究对象',
      icon: <TeamOutlined />,
    },
  ]), [])

  /**
   * 重置向导状态。
   *
   * @returns {void}
   */
  const resetWizard = () => {
    setStep(0)
    setSelectedTemplateId('')
    setSelectedPatientIds([])
    wizardForm.resetFields()
  }

  /**
   * 拉取 CRF 模板列表。
   *
   * @returns {Promise<void>}
   */
  const fetchTemplates = async () => {
    setTemplatesLoading(true)
    try {
      const response = await getCRFTemplates()
      if (response?.success) {
        setTemplates(Array.isArray(response.data) ? response.data : [])
      }
    } catch (error) {
      console.error('获取 CRF 模板失败:', error)
      message.error('获取 CRF 模板失败')
    } finally {
      setTemplatesLoading(false)
    }
  }

  /**
   * 拉取患者列表用于入组选择。
   *
   * @returns {Promise<void>}
   */
  const fetchPatientPool = async () => {
    setPatientLoading(true)
    try {
      const response = await getPatientList({ page: 1, page_size: 100 })
      if (response?.success) {
        const items = Array.isArray(response.data)
          ? response.data.filter((item) => item?.status !== 'inactive')
          : []
        setPatients(items.map((item) => ({
          id: item.id,
          name: item.name || '未知',
          gender: item.gender || '未知',
          age: item.age ?? '-',
          diagnosis: Array.isArray(item.diagnosis) ? item.diagnosis.join('、') : (item.diagnosis || '-'),
          completeness: Number(item.data_completeness || 0),
        })))
      }
    } catch (error) {
      console.error('获取患者列表失败:', error)
      message.error('获取患者列表失败')
    } finally {
      setPatientLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    fetchTemplates()
  }, [open])

  /**
   * 当患者池刷新时，清理掉不在当前列表中的历史选择。
   *
   * @returns {void}
   */
  useEffect(() => {
    if (!patientRowIds.length) {
      if (selectedPatientIds.length) {
        setSelectedPatientIds([])
      }
      return
    }
    setSelectedPatientIds((prev) => prev.filter((id) => patientRowIds.includes(id)))
  }, [patientRowIds, selectedPatientIds.length])

  /**
   * 切换单个患者勾选状态。
   *
   * @param {string | number} patientId 患者 ID
   * @returns {void}
   */
  const togglePatientSelection = (patientId) => {
    const normalizedId = normalizePatientId(patientId)
    if (!normalizedId) return
    setSelectedPatientIds((prev) => {
      if (prev.includes(normalizedId)) {
        return prev.filter((id) => id !== normalizedId)
      }
      return [...prev, normalizedId]
    })
  }

  /**
   * 切换“全选/全不选”。
   *
   * @param {boolean} checked 是否全选
   * @returns {void}
   */
  const toggleSelectAllPatients = (checked) => {
    setSelectedPatientIds((prev) => {
      const nextSet = new Set(prev)
      if (checked) {
        patientRowIds.forEach((id) => nextSet.add(id))
      } else {
        patientRowIds.forEach((id) => nextSet.delete(id))
      }
      return Array.from(nextSet)
    })
  }

  /**
   * 跳转到下一步。
   *
   * @returns {Promise<void>}
   */
  const handleNext = async () => {
    if (creating) return
    if (step === 0) {
      try {
        await wizardForm.validateFields(['project_name', 'description'])
      } catch {
        return
      }
    }
    if (step === 1) {
      if (normalizedTemplates.length === 0) {
        message.error('暂无可用 CRF 模板，请先创建模板')
        return
      }
      if (!selectedTemplateId) {
        message.error('请先选择一个 CRF 模板')
        return
      }
    }
    const nextStep = step + 1
    setStep(nextStep)
    if (nextStep === 2) {
      fetchPatientPool()
    }
  }

  /**
   * 完成项目创建。
   *
   * @returns {Promise<void>}
   */
  const handleFinish = async () => {
    if (creating) return
    if (normalizedTemplates.length === 0) {
      message.error('暂无可用 CRF 模板，请先创建模板')
      return
    }
    if (!selectedTemplateId) {
      message.error('请先选择一个 CRF 模板')
      return
    }
    try {
      setCreating(true)
      const values = wizardForm.getFieldsValue(true)
      const payload = {
        project_name: values.project_name,
        description: values.description || '',
        principal_investigator_id: values.principal_investigator_id || null,
        expected_patient_count: values.expected_patient_count ? Number(values.expected_patient_count) : null,
        start_date: values.project_period?.[0] ? dayjs(values.project_period[0]).format('YYYY-MM-DD') : null,
        end_date: values.project_period?.[1] ? dayjs(values.project_period[1]).format('YYYY-MM-DD') : null,
        crf_template_id: selectedTemplateId || null,
        patient_criteria: {},
      }
      const response = await createProject(payload)
      if (!response?.success) {
        message.error(response?.message || '创建项目失败')
        return
      }
      const projectId = String(response?.data?.id || '')
      if (!projectId) {
        message.error('创建成功但未返回项目 ID')
        return
      }

      try {
        await assignTemplateToProject(projectId, selectedTemplateId)
      } catch (error) {
        console.error('关联模板失败:', error)
        message.warning('项目创建成功，但模板关联失败')
      }

      if (selectedPatientIds.length > 0) {
        for (const patientId of selectedPatientIds) {
          try {
            await enrollPatient(projectId, { patient_id: String(patientId) })
          } catch (error) {
            console.error('患者入组失败:', error)
          }
        }
      }

      message.success('项目创建成功')
      resetWizard()
      onCancel()
      onSuccess(projectId)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('research-project-rail-refresh'))
      }
    } catch (error) {
      console.error('创建项目失败:', error)
      message.error('创建项目失败，请稍后重试')
    } finally {
      setCreating(false)
    }
  }

  const patientColumns = [
    { title: '患者姓名', dataIndex: 'name', key: 'name' },
    { title: '性别', dataIndex: 'gender', key: 'gender', width: 80 },
    { title: '年龄', dataIndex: 'age', key: 'age', width: 80 },
    {
      title: '诊断',
      dataIndex: 'diagnosis',
      key: 'diagnosis',
      render: (value) => <Text type="secondary">{value || '-'}</Text>,
    },
    {
      title: '完整度',
      dataIndex: 'completeness',
      key: 'completeness',
      width: 100,
      render: (value) => `${Math.round(Number(value || 0))}%`,
    },
  ]

  const patientSelectionColumns = useMemo(() => {
    const baseIndicatorStyle = {
      width: 16,
      height: 16,
      borderRadius: 4,
      border: `1px solid ${appThemeToken.colorBorder}`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      background: appThemeToken.colorBgContainer,
      color: appThemeToken.colorBgContainer,
      fontSize: 12,
      lineHeight: 1,
      userSelect: 'none',
    }

    const checkedIndicatorStyle = {
      ...baseIndicatorStyle,
      borderColor: appThemeToken.colorPrimary,
      background: appThemeToken.colorPrimary,
      color: appThemeToken.colorBgContainer,
    }

    const indeterminateIndicatorStyle = {
      ...baseIndicatorStyle,
      borderColor: appThemeToken.colorPrimary,
      background: appThemeToken.colorPrimaryBg,
      color: appThemeToken.colorPrimary,
      fontWeight: 700,
    }

    return [
      {
        title: isPatientSelectionIndeterminate ? (
          <span
            className="project-patient-select-control"
            role="checkbox"
            aria-checked="mixed"
            tabIndex={0}
            style={indeterminateIndicatorStyle}
            onClick={(event) => {
              event.stopPropagation()
              toggleSelectAllPatients(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                toggleSelectAllPatients(true)
              }
            }}
          >
            -
          </span>
        ) : (
          <span
            className="project-patient-select-control"
            role="checkbox"
            aria-checked={isAllPatientsSelected}
            tabIndex={0}
            style={isAllPatientsSelected ? checkedIndicatorStyle : baseIndicatorStyle}
            onClick={(event) => {
              event.stopPropagation()
              toggleSelectAllPatients(!isAllPatientsSelected)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                toggleSelectAllPatients(!isAllPatientsSelected)
              }
            }}
          >
            {isAllPatientsSelected ? <CheckOutlined /> : null}
          </span>
        ),
        dataIndex: '__selection__',
        key: '__selection__',
        width: 56,
        className: 'project-patient-select-cell',
        render: (_, record) => {
          const checked = selectedPatientIdSet.has(normalizePatientId(record?.id))
          return (
            <span
              className="project-patient-select-control"
              role="checkbox"
              aria-checked={checked}
              tabIndex={0}
              style={checked ? checkedIndicatorStyle : baseIndicatorStyle}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  togglePatientSelection(record?.id)
                }
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              onMouseUp={(event) => event.stopPropagation()}
              onPointerUp={(event) => {
                event.stopPropagation()
                togglePatientSelection(record?.id)
              }}
            >
              {checked ? <CheckOutlined /> : null}
            </span>
          )
        },
      },
      ...patientColumns,
    ]
  }, [
    isAllPatientsSelected,
    isPatientSelectionIndeterminate,
    patientColumns,
    selectedPatientIdSet,
  ])

  return (
    <Modal
      title="新建科研项目向导"
      open={open}
      onCancel={() => {
        if (creating) return
        resetWizard()
        onCancel()
      }}
      width={860}
      destroyOnHidden
      footer={[
        <Button
          key="cancel"
          disabled={creating}
          onClick={() => {
            resetWizard()
            onCancel()
          }}
        >
          取消
        </Button>,
        step > 0 ? (
          <Button key="prev" disabled={creating} onClick={() => setStep((prev) => prev - 1)}>
            上一步
          </Button>
        ) : null,
        step < 2 ? (
          <Button key="next" type="primary" disabled={creating} onClick={handleNext}>
            下一步
          </Button>
        ) : (
          <Button key="finish" type="primary" loading={creating} disabled={creating} onClick={handleFinish}>
            完成创建
          </Button>
        ),
      ]}
    >
      <Steps current={step} style={{ marginBottom: 24 }} items={stepItems} />

      {step === 0 ? (
        <Form form={wizardForm} layout="vertical">
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
      ) : null}

      {step === 1 ? (
        <div>
          <Alert
            message="选择 CRF 模板"
            description="请选择一个基础模板作为项目默认抽取模板，创建后系统会生成项目内 CRF 副本。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          {templatesLoading ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Spin />
            </div>
          ) : normalizedTemplates.length === 0 ? (
            <Alert
              message="暂无可用 CRF 模板"
              description="请先在 CRF 模板管理中创建模板后再新建项目。"
              type="warning"
              showIcon
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
                        <Space size={8}>
                          {template.category ? <Tag color="blue">{template.category}</Tag> : null}
                          {template.is_system ? <Tag>系统模板</Tag> : null}
                        </Space>
                      </Space>
                    </Radio>
                  </Card>
                )
              })}
            </Space>
          )}
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <Alert
            message="选择入组患者"
            description="可在创建时直接选择患者入组，也可以创建后再到项目内添加。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Table
            rowKey={(record) => String(record.id)}
            loading={patientLoading}
            dataSource={patients}
            columns={patientSelectionColumns}
            size="small"
            pagination={{ pageSize: 8 }}
            onRow={(record) => ({
              onClick: (event) => {
                const target = event?.target
                if (
                  target instanceof Element &&
                  (
                    target.closest('.project-patient-select-checkbox-input') ||
                    target.closest('.project-patient-select-control') ||
                    target.closest('.project-patient-select-cell') ||
                    target.closest('.ant-checkbox-wrapper') ||
                    target.closest('.ant-checkbox') ||
                    target.closest('input[type="checkbox"]')
                  )
                ) {
                  return
                }
                togglePatientSelection(record?.id)
              },
              style: { cursor: 'pointer' },
            })}
          />
        </div>
      ) : null}
    </Modal>
  )
}

export default ProjectCreateWizardModal

