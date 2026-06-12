import { emptySuccess } from '../_empty'
import request from '../request'
import { PATIENTS_ENDPOINT } from './constants'

const normalizeAiSummary = (payload = {}, fallbackContent = '') => emptySuccess({
  content: payload?.content || fallbackContent,
  generated_at: payload?.generated_at || null,
  source_documents: Array.isArray(payload?.source_documents) ? payload.source_documents : [],
})

export const getAiSummary = async (patientId = '', options) => {
  if (!patientId) return emptySuccess({ content: '', source_documents: [] })
  const payload = await request.get(`${PATIENTS_ENDPOINT}/${patientId}/ai-summary`, undefined, options)
  return normalizeAiSummary(payload)
}

export const generateAiSummary = async (patientId = '') => {
  if (!patientId) return emptySuccess({ content: '', source_documents: [] })
  const payload = await request.post(`${PATIENTS_ENDPOINT}/${patientId}/ai-summary/generate`)
  return normalizeAiSummary(payload)
}

export const saveAiSummary = async (patientId = '', content = '') => {
  if (!patientId) return emptySuccess({ content: '', source_documents: [] })
  const payload = await request.put(`${PATIENTS_ENDPOINT}/${patientId}/ai-summary`, { content })
  return normalizeAiSummary(payload, content)
}
