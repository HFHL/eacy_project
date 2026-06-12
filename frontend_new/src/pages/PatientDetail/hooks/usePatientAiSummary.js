import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { generateAiSummary, getAiSummary, saveAiSummary } from '@/api/patient'

const emptyAiSummary = {
  content: '',
  lastUpdate: '',
  confidence: 0,
  sourceDocuments: [],
}

const isAbortError = (error) => (
  error?.name === 'AbortError' || error?.code === 20 || error?.code === 'ERR_CANCELED'
)

const mapSourceDocuments = (sourceDocuments = []) => sourceDocuments.map((doc, idx) => ({
  id: doc.id,
  name: doc.name,
  ref: doc.ref || `[${idx + 1}]`,
  type: doc.type || '',
}))

const formatGeneratedAt = (generatedAt, fallback = '') => (
  generatedAt ? new Date(generatedAt).toLocaleString() : fallback
)

export const usePatientAiSummary = (patientId) => {
  const [aiSummary, setAiSummary] = useState(emptyAiSummary)
  const [summaryEditMode, setSummaryEditMode] = useState(false)
  const [summaryGenerating, setSummaryGenerating] = useState(false)
  const aiSummaryAbortRef = useRef(null)
  const activePatientIdRef = useRef(patientId)

  useEffect(() => {
    activePatientIdRef.current = patientId
    aiSummaryAbortRef.current?.abort()
    setAiSummary({ ...emptyAiSummary })
    setSummaryEditMode(false)
    setSummaryGenerating(false)

    return () => {
      aiSummaryAbortRef.current?.abort()
    }
  }, [patientId])

  const fetchAiSummary = useCallback(async () => {
    if (!patientId) return
    const requestPatientId = patientId

    aiSummaryAbortRef.current?.abort()
    const controller = new AbortController()
    aiSummaryAbortRef.current = controller

    try {
      const res = await getAiSummary(requestPatientId, { signal: controller.signal })
      if (controller.signal.aborted || String(activePatientIdRef.current || '') !== String(requestPatientId)) return
      if (res.success && res.data && res.data.content) {
        setAiSummary({
          content: res.data.content || '',
          lastUpdate: formatGeneratedAt(res.data.generated_at),
          confidence: 0,
          sourceDocuments: mapSourceDocuments(res.data.source_documents),
        })
      }
    } catch (error) {
      if (isAbortError(error)) return
      console.log('获取 AI 综述失败（可能尚未生成）:', error)
    } finally {
      if (aiSummaryAbortRef.current === controller) {
        aiSummaryAbortRef.current = null
      }
    }
  }, [patientId])

  const handleEditSummary = (summaryForm) => {
    summaryForm.setFieldsValue({ content: aiSummary.content })
    setSummaryEditMode(true)
  }

  const handleSaveSummary = async (summaryForm) => {
    try {
      const values = await summaryForm.validateFields()
      if (!patientId) {
        message.warning('请先保存患者信息')
        return false
      }

      const res = await saveAiSummary(patientId, values.content)
      if (!res.success) {
        message.error(res.message || '病情综述保存失败')
        return false
      }

      setAiSummary({
        ...aiSummary,
        content: res.data?.content || values.content,
        lastUpdate: formatGeneratedAt(res.data?.generated_at, new Date().toLocaleString()),
        sourceDocuments: mapSourceDocuments(res.data?.source_documents || aiSummary.sourceDocuments || []),
      })
      setSummaryEditMode(false)
      message.success('病情综述已保存')
      return true
    } catch (error) {
      message.error('请检查输入内容')
      return false
    }
  }

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
          lastUpdate: formatGeneratedAt(res.data.generated_at, new Date().toLocaleString()),
          confidence: 95,
          sourceDocuments: mapSourceDocuments(res.data.source_documents),
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
    aiSummary,
    fetchAiSummary,
    handleEditSummary,
    handleRegenerateSummary,
    handleSaveSummary,
    setSummaryEditMode,
    summaryEditMode,
    summaryGenerating,
  }
}
