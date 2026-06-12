export const isPdfFileType = (type, name, url = '') => {
  const t = String(type || '').toLowerCase()
  const n = String(name || '').toLowerCase()
  const u = String(url || '').toLowerCase()
  return (
    t === 'pdf'
    || t === '.pdf'
    || t.includes('application/pdf')
    || n.endsWith('.pdf')
    || u.includes('.pdf?')
    || u.split('?')[0].endsWith('.pdf')
  )
}

export const resolveMetaStatus = (documentDetail, document) => (
  documentDetail?.meta_status
  ?? documentDetail?.metaStatus
  ?? document?.meta_status
  ?? document?.metaStatus
  ?? ''
)

export const isMetadataInProgress = (metaStatus) => (
  ['queued', 'running'].includes(String(metaStatus || '').toLowerCase())
)

export const computeMetadataStage = (metaStatus) => {
  const meta = String(metaStatus || '').toLowerCase()
  if (meta === 'failed') return { kind: 'error', percent: 100, message: '元数据抽取失败' }
  if (meta === 'skipped') return { kind: 'warning', percent: 100, message: '元数据抽取已跳过' }
  if (meta === 'completed') return { kind: 'success', percent: 100, message: '元数据抽取完成' }
  if (meta === 'running') return { kind: 'progress', percent: 65, message: '正在抽取元数据…' }
  if (meta === 'queued') return { kind: 'progress', percent: 35, message: '元数据抽取排队中…' }
  return null
}

export const resolveBoundPatientId = (documentDetail, document, patientIdProp) => (
  documentDetail?.patient_id
  ?? documentDetail?.patientId
  ?? documentDetail?.linked_patients?.[0]?.patient_id
  ?? document?.patient_id
  ?? document?.patientId
  ?? patientIdProp
  ?? ''
)

export const resolveExtractStatus = (documentDetail, document) => (
  documentDetail?.extract_status
  ?? documentDetail?.extractStatus
  ?? document?.extract_status
  ?? document?.extractStatus
  ?? ''
)

export const isExtractInProgress = (extractStatus) => (
  ['pending', 'running', 'queued'].includes(String(extractStatus || '').toLowerCase())
)

export const computeExtractStage = (extractStatus, progress = null) => {
  const status = String(extractStatus || '').toLowerCase()
  if (['failed', 'timeout'].includes(status)) return { kind: 'error', percent: 100, message: '病历抽取失败' }
  if (status === 'cancelled') return { kind: 'warning', percent: 100, message: '病历抽取已取消' }
  if (['completed', 'succeeded'].includes(status)) return { kind: 'success', percent: 100, message: '病历抽取完成' }
  if (status === 'running') return { kind: 'progress', percent: progress ?? 65, message: '正在抽取病历字段…' }
  if (status === 'pending' || status === 'queued') return { kind: 'progress', percent: progress ?? 25, message: '病历抽取排队中…' }
  return null
}
