import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Form, message } from 'antd'

import { assignTemplateToProject, getCRFTemplates } from '../../../api/crfTemplate'
import { getPatientList } from '../../../api/patient'
import { createProject, enrollPatient } from '../../../api/project'
import {
  mapPatientForSelection,
  normalizePatientId,
  normalizeTemplateId,
} from './projectCreateWizardUtils'

export const useProjectCreateWizard = ({ onCancel, onSuccess, open }) => {
  const [wizardForm] = Form.useForm()
  const [step, setStep] = useState(0)
  const [creating, setCreating] = useState(false)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [patientLoading, setPatientLoading] = useState(false)
  const [templates, setTemplates] = useState([])
  const [patients, setPatients] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedPatientIds, setSelectedPatientIds] = useState([])

  const patientRowIds = useMemo(() => (
    patients.map((item) => normalizePatientId(item?.id)).filter(Boolean)
  ), [patients])

  const selectedPatientIdSet = useMemo(
    () => new Set(selectedPatientIds),
    [selectedPatientIds],
  )

  const normalizedTemplates = useMemo(() => (
    templates
      .map((template) => ({
        ...template,
        normalizedId: normalizeTemplateId(template),
      }))
      .filter((template) => Boolean(template.normalizedId))
  ), [templates])

  const resetWizard = () => {
    setStep(0)
    setSelectedTemplateId('')
    setSelectedPatientIds([])
    wizardForm.resetFields()
  }

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

  const fetchPatientPool = async () => {
    setPatientLoading(true)
    try {
      const response = await getPatientList({ page: 1, page_size: 100 })
      if (response?.success) {
        const items = Array.isArray(response.data)
          ? response.data.filter((item) => item?.status !== 'inactive')
          : []
        setPatients(items.map(mapPatientForSelection))
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

  useEffect(() => {
    if (!patientRowIds.length) {
      if (selectedPatientIds.length) {
        setSelectedPatientIds([])
      }
      return
    }
    setSelectedPatientIds((prev) => prev.filter((id) => patientRowIds.includes(id)))
  }, [patientRowIds, selectedPatientIds.length])

  const togglePatientSelection = (patientId) => {
    const normalizedId = normalizePatientId(patientId)
    if (!normalizedId) return
    setSelectedPatientIds((prev) => (
      prev.includes(normalizedId)
        ? prev.filter((id) => id !== normalizedId)
        : [...prev, normalizedId]
    ))
  }

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
      const response = await createProject({
        project_name: values.project_name,
        description: values.description || '',
        principal_investigator_id: values.principal_investigator_id || null,
        expected_patient_count: values.expected_patient_count ? Number(values.expected_patient_count) : null,
        start_date: values.project_period?.[0] ? dayjs(values.project_period[0]).format('YYYY-MM-DD') : null,
        end_date: values.project_period?.[1] ? dayjs(values.project_period[1]).format('YYYY-MM-DD') : null,
        crf_template_id: selectedTemplateId || null,
        patient_criteria: {},
      })
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

      for (const patientId of selectedPatientIds) {
        try {
          await enrollPatient(projectId, { patient_id: String(patientId) })
        } catch (error) {
          console.error('患者入组失败:', error)
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

  return {
    creating,
    handleFinish,
    handleNext,
    normalizedTemplates,
    patientLoading,
    patientRowIds,
    patients,
    resetWizard,
    selectedPatientIdSet,
    selectedPatientIds,
    selectedTemplateId,
    setSelectedTemplateId,
    setStep,
    step,
    templatesLoading,
    togglePatientSelection,
    toggleSelectAllPatients,
    wizardForm,
  }
}
