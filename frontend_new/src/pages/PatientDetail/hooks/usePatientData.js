import { useState, useEffect, useCallback, useRef } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import { getPatientDetail, updatePatient, getPatientDocuments } from '@/api/patient'
import { usePatientAiSummary } from './usePatientAiSummary'
import { maskPhone, maskIdCard, maskAddress } from '@/utils/sensitiveUtils'
import { syncPatientStatsAfterDocumentChange as runPatientStatSync } from '../utils/patientStatSync'

const emptyPatientInfo = {
  id: '',
  name: '',
  gender: '',
  age: null,
  birthDate: '',
  phone: '',
  idCard: '',
  address: '',
  diagnosis: [],
  department: '',
  doctor: '',
  admissionDate: '',
  completeness: 0,
  projects: [],
  status: 'active',
  notes: ''
}

export const usePatientData = (patientId = null) => {
  const [loading, setLoading] = useState(false)
  const [patientInfo, setPatientInfo] = useState(emptyPatientInfo)
  const [patientDocuments, setPatientDocuments] = useState([])
  const [documentsLoading, setDocumentsLoading] = useState(false)

  const detailAbortRef = useRef(null)
  const documentsAbortRef = useRef(null)
  const currentPatientIdRef = useRef(patientId)

  const {
    aiSummary,
    fetchAiSummary,
    handleEditSummary,
    handleRegenerateSummary,
    handleSaveSummary,
    setSummaryEditMode,
    summaryEditMode,
    summaryGenerating,
  } = usePatientAiSummary(patientId)

  const isAbortError = (error) => (
    error?.name === 'AbortError' || error?.code === 20 || error?.code === 'ERR_CANCELED'
  )

  const fetchPatientDetail = useCallback(async () => {
    if (!patientId) return

    const requestPatientId = patientId
    detailAbortRef.current?.abort()
    const controller = new AbortController()
    detailAbortRef.current = controller

    setLoading(true)
    try {
      const res = await getPatientDetail(requestPatientId, { signal: controller.signal })
      if (controller.signal.aborted || String(currentPatientIdRef.current || '') !== String(requestPatientId)) return
      if (res.success && res.data) {
        const data = res.data
        const mergedData = data.merged_data || {}
        setPatientInfo({
          id: data.id,
          patientCode: data.patient_code,
          name: data.name,
          gender: data.gender,
          age: data.age,
          birthDate: data.birth_date,
          phone: data.phone,
          idCard: data.id_card,
          address: data.address,
          diagnosis: data.diagnosis || [],
          department: data.department_name || '',
          doctor: data.attending_doctor_name || '',
          admissionDate: mergedData.admission_date || '',
          completeness: parseFloat(data.data_completeness) || 0,
          projects: (data.projects || []).map(p => ({
            id: p.id,
            code: p.project_code,
            name: p.project_name,
            status: p.status
          })),
          status: data.status,
          notes: mergedData.notes || '',
          mergedData,
          sourceDocumentIds: data.source_document_ids || [],
          documentCount: data.document_count || 0,
          tags: data.tags || []
        })
      } else {
        message.error(res.message || '获取患者详情失败')
      }
    } catch (error) {
      if (isAbortError(error)) return
      console.error('获取患者详情失败:', error)
      message.error('获取患者详情失败')
    } finally {
      if (detailAbortRef.current === controller && String(currentPatientIdRef.current || '') === String(requestPatientId)) {
        detailAbortRef.current = null
        setLoading(false)
      }
    }
  }, [patientId])

  const emitPatientRailRefresh = useCallback(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('patient-rail-refresh'))
  }, [])

  const fetchPatientDocuments = useCallback(async () => {
    if (!patientId) return

    const requestPatientId = patientId
    documentsAbortRef.current?.abort()
    const controller = new AbortController()
    documentsAbortRef.current = controller

    setDocumentsLoading(true)
    try {
      const res = await getPatientDocuments(requestPatientId, { signal: controller.signal })
      if (controller.signal.aborted || String(currentPatientIdRef.current || '') !== String(requestPatientId)) return
      if (res.success && res.data) {
        setPatientDocuments(res.data)
        console.log('患者关联文档:', res.data)
      } else {
        message.error(res.message || '获取患者文档失败')
      }
    } catch (error) {
      if (isAbortError(error)) return
      console.error('获取患者文档失败:', error)
      message.error('获取患者文档失败')
    } finally {
      if (documentsAbortRef.current === controller && String(currentPatientIdRef.current || '') === String(requestPatientId)) {
        documentsAbortRef.current = null
        setDocumentsLoading(false)
      }
    }
  }, [patientId])

  const syncPatientStatsAfterDocumentChange = useCallback(async () => {
    await runPatientStatSync({
      fetchPatientDetail,
      fetchPatientDocuments,
      emitPatientRailRefresh,
    })
  }, [fetchPatientDetail, fetchPatientDocuments, emitPatientRailRefresh])

  const handleEditPatient = (form) => {
    const formData = {
      ...patientInfo,
      phone: maskPhone(patientInfo.phone),
      idCard: maskIdCard(patientInfo.idCard),
      address: maskAddress(patientInfo.address),
      birthDate: patientInfo.birthDate ? dayjs(patientInfo.birthDate) : null,
      admissionDate: patientInfo.admissionDate ? dayjs(patientInfo.admissionDate) : null
    }
    form.setFieldsValue(formData)
  }

  const handleSavePatient = async (form, opts = {}) => {
    try {
      const values = await form.validateFields()
      const { sensitiveModified = {} } = opts

      const emptyToNull = (v) => (v == null || v === '') ? null : v
      const emptyArrayToNull = (v) => (v == null || !Array.isArray(v) || v.length === 0) ? null : v
      const processedValues = {
        ...values,
        birthDate: values.birthDate ? values.birthDate.format('YYYY-MM-DD') : null,
        admissionDate: values.admissionDate ? values.admissionDate.format('YYYY-MM-DD') : null,
        age: values.age !== '' && values.age != null && !Number.isNaN(Number(values.age)) ? parseInt(values.age, 10) : null
      }

      if (patientId) {
        try {
          const payload = {
            name: processedValues.name,
            gender: emptyToNull(processedValues.gender),
            age: processedValues.age,
            birth_date: emptyToNull(processedValues.birthDate),
            diagnosis: emptyArrayToNull(processedValues.diagnosis),
            tags: emptyArrayToNull(processedValues.tags),
            department_name: emptyToNull(processedValues.department),
            attending_doctor_name: emptyToNull(processedValues.doctor),
            admission_date: emptyToNull(processedValues.admissionDate),
            notes: emptyToNull(processedValues.notes),
          }
          if (sensitiveModified.phone) {
            const v = processedValues.phone != null && String(processedValues.phone).trim() !== '' ? processedValues.phone.trim() : null
            payload.phone = v
          }
          if (sensitiveModified.idCard) {
            const v = processedValues.idCard != null && String(processedValues.idCard).trim() !== '' ? processedValues.idCard.trim() : null
            payload.id_card = v
          }
          if (sensitiveModified.address) {
            const v = processedValues.address != null && String(processedValues.address).trim() !== '' ? processedValues.address.trim() : null
            payload.address = v
          }
          const res = await updatePatient(patientId, payload)
          if (!res.success) {
            message.error(res.message || '保存失败')
            return false
          }

          await fetchPatientDetail()
          emitPatientRailRefresh()
          message.success('患者信息已更新')
          return true
        } catch (error) {
          console.error('保存患者信息失败:', error)
          message.error('保存患者信息失败')
          return false
        }
      }

      setPatientInfo({ ...patientInfo, ...processedValues })
      message.success('患者信息已更新')

      console.log('保存的患者信息:', { ...patientInfo, ...processedValues })

      return true
    } catch (error) {
      console.error('表单验证失败:', error)
      message.error('请检查输入信息')
      return false
    }
  }

  useEffect(() => {
    currentPatientIdRef.current = patientId
    detailAbortRef.current?.abort()
    documentsAbortRef.current?.abort()
    setPatientInfo({ ...emptyPatientInfo })
    setPatientDocuments([])
    setLoading(false)
    setDocumentsLoading(false)

    if (patientId) {
      fetchPatientDetail()
    }
    return () => {
      detailAbortRef.current?.abort()
      documentsAbortRef.current?.abort()
    }
  }, [patientId, fetchPatientDetail])

  return {
    patientInfo,
    aiSummary,
    summaryEditMode,
    setSummaryEditMode,
    summaryGenerating,
    patientDocuments,
    documentsLoading,
    loading,
    fetchPatientDetail,
    fetchPatientDocuments,
    syncPatientStatsAfterDocumentChange,
    fetchAiSummary,
    handleEditPatient,
    handleSavePatient,
    handleEditSummary,
    handleSaveSummary,
    handleRegenerateSummary,
  }
}

export default usePatientData
