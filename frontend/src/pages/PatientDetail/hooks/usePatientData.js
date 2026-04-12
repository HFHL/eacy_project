/**
 * 患者数据管理Hook
 * 封装患者基础信息、AI综述等相关状态和操作
 * 只使用 API 数据
 */
import { useState, useEffect, useCallback } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import { getPatientDetail, updatePatient, getPatientEhr, getPatientDocuments, generateAiSummary, getAiSummary } from '@/api/patient'
import { maskPhone, maskIdCard, maskAddress } from '@/utils/sensitiveUtils'

// 默认空患者信息
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

// 默认空 AI 综述
const emptyAiSummary = {
  content: '',
  lastUpdate: '',
  confidence: 0,
  sourceDocuments: [],
}

export const usePatientData = (patientId = null) => {
  // 默认关闭旧版电子病历（patient_ehr）加载；需要旧版页面时再显式打开
  const includeLegacyEhr = false
  // 加载状态
  const [loading, setLoading] = useState(false)
  
  // 患者基础信息状态
  const [patientInfo, setPatientInfo] = useState(emptyPatientInfo)
  
  // AI病情综述状态
  const [aiSummary, setAiSummary] = useState(emptyAiSummary)
  const [summaryEditMode, setSummaryEditMode] = useState(false)
  const [summaryContent, setSummaryContent] = useState('')
  const [summaryGenerating, setSummaryGenerating] = useState(false)
  
  // 患者电子病历数据
  const [ehrData, setEhrData] = useState(null)
  const [ehrLoading, setEhrLoading] = useState(false)
  
  // 患者关联文档列表
  const [patientDocuments, setPatientDocuments] = useState([])
  const [documentsLoading, setDocumentsLoading] = useState(false)

  // 从 API 获取患者详情
  const fetchPatientDetail = useCallback(async () => {
    if (!patientId) return
    
    setLoading(true)
    try {
      const res = await getPatientDetail(patientId)
      if (res.success && res.data) {
        const data = res.data
        // 转换 API 数据为前端格式
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
          admissionDate: '', // API 暂无此字段
          completeness: parseFloat(data.data_completeness) || 0,
          projects: (data.projects || []).map(p => ({
            id: p.id,
            code: p.project_code,
            name: p.project_name,
            status: p.status
          })),
          status: data.status,
          notes: '',
          // 保留原始数据供后续使用
          mergedData: data.merged_data || {},
          sourceDocumentIds: data.source_document_ids || [],
          documentCount: data.document_count || 0,
          tags: data.tags || []
        })
      } else {
        message.error(res.message || '获取患者详情失败')
      }
    } catch (error) {
      console.error('获取患者详情失败:', error)
      message.error('获取患者详情失败')
    } finally {
      setLoading(false)
    }
  }, [patientId])
  
  // 从 API 获取患者电子病历
  const fetchPatientEhr = useCallback(async () => {
    if (!patientId) return
    
    setEhrLoading(true)
    try {
      const res = await getPatientEhr(patientId)
      if (res.success && res.data) {
        setEhrData(res.data)
        console.log('患者病历数据:', res.data)
      } else if (res.code === 40401) {
        // 患者病历不存在是正常情况
        setEhrData(null)
        console.log('患者暂无病历数据')
      } else {
        message.error(res.message || '获取患者病历失败')
      }
    } catch (error) {
      console.error('获取患者病历失败:', error)
      message.error('获取患者病历失败')
    } finally {
      setEhrLoading(false)
    }
  }, [patientId])
  
  // 从 API 获取患者关联文档列表
  const fetchPatientDocuments = useCallback(async () => {
    if (!patientId) return
    
    setDocumentsLoading(true)
    try {
      const res = await getPatientDocuments(patientId)
      if (res.success && res.data) {
        setPatientDocuments(res.data)
        console.log('患者关联文档:', res.data)
      } else {
        message.error(res.message || '获取患者文档失败')
      }
    } catch (error) {
      console.error('获取患者文档失败:', error)
      message.error('获取患者文档失败')
    } finally {
      setDocumentsLoading(false)
    }
  }, [patientId])

  // 编辑患者信息（脱敏后填入表单，防止明文直接展示）
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

  // 保存患者信息
  // opts.sensitiveModified: { phone, idCard, address } 为 true 表示用户点击过该脱敏框（视为修改），此时才提交该字段：有值传值，空白传 null 表示置空
  const handleSavePatient = async (form, opts = {}) => {
    try {
      const values = await form.validateFields()
      const { sensitiveModified = {} } = opts

      // 空字符串/空数组视为用户主动清空，统一为 null 以支持置空
      const emptyToNull = (v) => (v == null || v === '') ? null : v
      const emptyArrayToNull = (v) => (v == null || !Array.isArray(v) || v.length === 0) ? null : v
      // 处理日期、年龄：用户清空时传 null，不回退到旧值
      const processedValues = {
        ...values,
        birthDate: values.birthDate ? values.birthDate.format('YYYY-MM-DD') : null,
        admissionDate: values.admissionDate ? values.admissionDate.format('YYYY-MM-DD') : null,
        age: values.age !== '' && values.age != null && !Number.isNaN(Number(values.age)) ? parseInt(values.age, 10) : null
      }

      // 调用后端接口保存（部分更新：未传入的字段保持原值）
      // 除姓名外，其余字段均支持清空：空值统一传 null
      // 脱敏字段仅当「已标记为修改」时传入：非空则传 trimmed 值，空白则传 null
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
            attending_doctor_name: emptyToNull(processedValues.doctor)
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
          
          // 保存成功后重新获取最新数据，确保数据一致性
          await fetchPatientDetail()
          message.success('患者信息已更新')
          return true
        } catch (error) {
          console.error('保存患者信息失败:', error)
          message.error('保存患者信息失败')
          return false
        }
      }
      
      // 无 patientId 时仅更新本地状态
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

  // 获取已有的 AI 综述
  const fetchAiSummary = useCallback(async () => {
    if (!patientId) return
    try {
      const res = await getAiSummary(patientId)
      if (res.success && res.data && res.data.content) {
        setAiSummary({
          content: res.data.content || '',
          lastUpdate: res.data.generated_at
            ? new Date(res.data.generated_at).toLocaleString()
            : '',
          confidence: 0,
          sourceDocuments: (res.data.source_documents || []).map((d, idx) => ({
            id: d.id,
            name: d.name,
            ref: d.ref || `[${idx + 1}]`,
            type: d.type || '',
          })),
        })
      }
    } catch (error) {
      console.log('获取 AI 综述失败（可能尚未生成）:', error)
    }
  }, [patientId])

  // 当 patientId 变化时获取数据
  useEffect(() => {
    if (patientId) {
      fetchPatientDetail()
      if (includeLegacyEhr) {
        fetchPatientEhr()
      }
      fetchPatientDocuments()
      fetchAiSummary()
    }
  }, [patientId, fetchPatientDetail, fetchPatientEhr, fetchPatientDocuments, fetchAiSummary])

  // 编辑病情综述
  const handleEditSummary = (summaryForm) => {
    setSummaryContent(aiSummary.content)
    summaryForm.setFieldsValue({ content: aiSummary.content })
    setSummaryEditMode(true)
  }

  // 保存病情综述
  const handleSaveSummary = async (summaryForm) => {
    try {
      const values = await summaryForm.validateFields()
      setAiSummary({
        ...aiSummary,
        content: values.content,
        lastUpdate: new Date().toLocaleString()
      })
      setSummaryEditMode(false)
      message.success('病情综述已保存')
      return true
    } catch (error) {
      message.error('请检查输入内容')
      return false
    }
  }

  // 生成/重新生成 AI 综述
  const handleRegenerateSummary = useCallback(async () => {
    if (!patientId) {
      message.warning('请先保存患者信息')
      return
    }
    setSummaryGenerating(true)
    try {
      const res = await generateAiSummary(patientId)
      if (res.success && res.data) {
        setAiSummary({
          content: res.data.content || '',
          lastUpdate: res.data.generated_at
            ? new Date(res.data.generated_at).toLocaleString()
            : new Date().toLocaleString(),
          confidence: 95,
          sourceDocuments: (res.data.source_documents || []).map((d, idx) => ({
            id: d.id,
            name: d.name,
            ref: d.ref || `[${idx + 1}]`,
            type: d.type || '',
          })),
        })
        message.success('AI 病情综述已生成')
      } else {
        message.error(res.message || 'AI 综述生成失败')
      }
    } catch (error) {
      console.error('AI 综述生成失败:', error)
      message.error('AI 综述生成失败，请稍后重试')
    } finally {
      setSummaryGenerating(false)
    }
  }, [patientId])

  return {
    // 状态
    patientInfo,
    setPatientInfo,
    aiSummary,
    setAiSummary,
    summaryEditMode,
    setSummaryEditMode,
    summaryContent,
    setSummaryContent,
    summaryGenerating,
    setSummaryGenerating,
    
    // 病历数据
    ehrData,
    setEhrData,
    ehrLoading,
    
    // 文档数据
    patientDocuments,
    setPatientDocuments,
    documentsLoading,
    
    // API 操作
    loading,
    fetchPatientDetail,
    fetchPatientEhr,
    fetchPatientDocuments,
    fetchAiSummary,
    
    // 操作函数
    handleEditPatient,
    handleSavePatient,
    handleEditSummary,
    handleSaveSummary,
    handleRegenerateSummary
  }
}

export default usePatientData
