import { pickRecommendedPatientId } from '../../../api/document/archiveApi'
import { maskName } from '../../../utils/sensitiveUtils'

export const formatFileSize = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let unitIndex = 0
  let size = bytes
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`
}

export const formatTime = (time) =>
  time
    ? new Date(time).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--'

/**
 * 格式化患者摘要展示文案（姓名/性别/年龄）。
 * @param {{name?: string, gender?: string, age?: string|number}|null|undefined} summary 患者摘要对象
 * @returns {string} 摘要字符串
 */
export const formatPatientSummary = (summary) => {
  const rawName = summary?.name || summary?.patient_name ? String(summary.name || summary.patient_name).trim() : ''
  const rawGender = summary?.gender || summary?.patient_gender ? String(summary.gender || summary.patient_gender).trim() : ''
  const rawAge = summary?.age ?? summary?.patient_age ?? ''
  const normalizedAge = rawAge == null ? '' : String(rawAge).trim()

  const name = rawName ? maskName(rawName) : '--'
  const gender = rawGender || '--'
  const age = normalizedAge ? (normalizedAge.endsWith('岁') ? normalizedAge : `${normalizedAge}岁`) : '--'

  if (name === '--' && gender === '--' && age === '--') {
    return '--'
  }

  return `${name} · ${gender} · ${age}`
}

export const formatDocumentMetadataTooltip = (record) => {
  const summary = record?.document_metadata_summary || {}
  const lines = [
    formatPatientSummary(summary),
    summary.document_title ? `标题：${summary.document_title}` : '',
    summary.effective_date ? `生效：${summary.effective_date}` : '',
    summary.document_type ? `类型：${summary.document_type}${summary.document_subtype ? ` / ${summary.document_subtype}` : ''}` : '',
    summary.organization_name ? `机构：${summary.organization_name}` : '',
  ].filter(Boolean)
  return lines.join('\n') || '--'
}

export const formatMatchScorePercent = (score) => {
  if (score == null || score === '') return ''
  const numericScore = Number(score)
  if (!Number.isFinite(numericScore)) return ''
  const percent = numericScore <= 1 ? Math.round(numericScore * 100) : Math.round(numericScore)
  return `${percent}%`
}

export const getRecommendedArchiveLabel = (patientName, matchScore, { masked = true } = {}) => {
  const displayName = patientName
    ? (masked ? maskName(patientName) : patientName)
    : ''
  const scoreText = formatMatchScorePercent(matchScore)
  if (!displayName) return '确认推荐'
  return `绑定${displayName}${scoreText ? `（${scoreText}）` : ''}`
}

export const getCandidatePatientId = (candidate = {}) => (
  candidate?.id || candidate?.patient_id || candidate?.patientId || candidate?.patientID || ''
)

export const getGroupRecommendedPatient = (matchInfo = {}) => {
  const candidates = Array.isArray(matchInfo?.candidates) ? matchInfo.candidates : []
  const matchedPatientId = pickRecommendedPatientId(matchInfo)
  const matchedCandidate = matchedPatientId
    ? candidates.find((item) => getCandidatePatientId(item) === matchedPatientId) || candidates[0]
    : candidates[0]
  return {
    patientId: matchedPatientId || getCandidatePatientId(matchedCandidate),
    candidate: matchedCandidate || null,
  }
}
