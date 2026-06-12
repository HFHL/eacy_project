import {
  ACTIVE_POLL_STATUSES,
  MODE_LABELS,
  TERMINAL_STATUSES,
} from './extractionProgressConstants'

const FIELD_WRITE_STAGES = ['persist_batch_values', 'persist_values']

export const buildFieldWriteSignature = (raw = {}) => {
  const items = Array.isArray(raw.items) ? raw.items : []
  return items
    .filter((item) => FIELD_WRITE_STAGES.includes(item?.stage))
    .map((item) => [
      item.extraction_job_id,
      item.extraction_run_id,
      item.stage,
      item.progress,
      item.updated_at,
    ].filter(Boolean).join(':'))
    .filter(Boolean)
    .join('|')
}

export const normalizeExtractionBatchProgress = (raw = {}) => {
  const backendStatus = String(raw.status || 'running')
  let status = backendStatus
  if (backendStatus === 'succeeded') status = 'completed'
  if (backendStatus === 'queued' || backendStatus === 'pending') status = 'running'

  const totalItems = Number(raw.total_items ?? raw.total_patients ?? 0)
  const emptyItems = Number(raw.empty_items ?? 0)
  const processed = Number(
    raw.processed_patients
    ?? ((Number(raw.succeeded_items || 0) + Number(raw.failed_items || 0) + Number(raw.cancelled_items || 0))),
  )

  if (status === 'completed' && emptyItems > 0) status = 'completed_with_empty'

  return {
    ...raw,
    status,
    progress: Number(raw.progress ?? 0),
    task_id: raw.task_id || raw.batch_id || raw.id || '',
    total_patients: totalItems,
    processed_patients: processed,
    success_count: Number(raw.success_count ?? raw.succeeded_items ?? 0),
    empty_count: emptyItems,
    error_count: Number(raw.error_count ?? raw.failed_items ?? 0),
    current_step: raw.current_step || raw.message || '',
    field_write_signature: buildFieldWriteSignature(raw),
  }
}

export const buildTaskSnapshotFromBatch = (batch = {}) => {
  const normalized = normalizeExtractionBatchProgress(batch)
  const taskId = String(batch.batch_id || batch.id || normalized.task_id || '')
  const totalItems = Number(normalized.total_patients || batch.total_items || 0)
  const isActive = !TERMINAL_STATUSES.has(normalized.status)
  const backendStatus = String(batch.status || '').toLowerCase()
  const phase = isActive ? (backendStatus === 'queued' ? 'queued' : 'running') : normalized.status
  return {
    taskId,
    ...normalized,
    phase,
    mode: batch.plan_json?.options?.mode || 'incremental',
    modeLabel: MODE_LABELS[batch.plan_json?.options?.mode] || MODE_LABELS.incremental,
    scopeLabel: totalItems > 0 ? `${totalItems} 个子任务` : '抽取任务',
    current_step: normalized.current_step || batch.message || (phase === 'queued' ? '排队中' : '抽取中'),
    submitted_jobs: totalItems,
    startedAt: batch.started_at ? new Date(batch.started_at).getTime() : Date.now(),
    lastSyncedAt: batch.updated_at ? new Date(batch.updated_at).getTime() : Date.now(),
    restoredFromServer: true,
  }
}

export const pickPrimaryActiveTaskId = (tasks) => {
  const found = Object.entries(tasks || {}).find(([, task]) => {
    const status = String(task?.status || '').toLowerCase()
    const phase = String(task?.phase || '').toLowerCase()
    if (TERMINAL_STATUSES.has(status)) return false
    return ACTIVE_POLL_STATUSES.has(phase) || ACTIVE_POLL_STATUSES.has(status) || phase === 'running'
  })
  return found?.[0] || null
}

export const resolveScopePatients = (patientDataset, patientIds = null) => {
  const normalizedIds = Array.isArray(patientIds) && patientIds.length > 0
    ? patientIds.filter(Boolean)
    : null
  const scopedPatients = normalizedIds
    ? patientDataset.filter((patient) => (
      normalizedIds.includes(patient.patient_id)
      || normalizedIds.includes(patient.patientId)
      || normalizedIds.includes(patient.id)
    ))
    : patientDataset
  const projectPatientIds = scopedPatients.map((patient) => patient.id || patient.project_patient_id).filter(Boolean)
  const labelsByPatientId = {}
  scopedPatients.forEach((patient) => {
    const pid = patient.patient_id || patient.patientId || patient.id
    if (!pid) return
    labelsByPatientId[pid] = patient.name || patient.subject_id || patient.patientId || pid
  })
  return {
    normalizedIds,
    scopedPatients,
    projectPatientIds,
    labelsByPatientId,
    scopeLabel: normalizedIds
      ? (scopedPatients.length === 1 ? (labelsByPatientId[normalizedIds[0]] || '1 位患者') : `${scopedPatients.length} 位患者`)
      : `全部 ${patientDataset.length} 位患者`,
  }
}

export const buildPatientStatuses = (patientIds, labelsByPatientId, patch) => {
  const statuses = {}
  patientIds.forEach((pid) => {
    statuses[pid] = {
      status: 'submitting',
      progress: 8,
      label: '正在提交…',
      ...patch,
      displayName: labelsByPatientId[pid] || pid,
    }
  })
  return statuses
}

export const getActiveTasks = (tasksById) => Object.values(tasksById).filter((task) => {
  if (task.phase === 'submitting' || String(task.taskId || '').startsWith('pending-')) return true
  return ACTIVE_POLL_STATUSES.has(task.phase) || (task.status && !TERMINAL_STATUSES.has(task.status))
})

export const mergePatientExtractionById = (tasksById) => {
  const merged = {}
  Object.values(tasksById).forEach((task) => {
    Object.entries(task.patientStatuses || {}).forEach(([patientId, row]) => {
      const prev = merged[patientId]
      if (!prev || (row.progress ?? 0) >= (prev.progress ?? 0)) {
        merged[patientId] = { ...row, taskId: task.taskId, modeLabel: task.modeLabel }
      }
    })
  })
  return merged
}

export const buildAggregateProgress = (activeTasks, summaryTask) => {
  if (activeTasks.length === 0) return summaryTask
  if (activeTasks.length === 1) return activeTasks[0]
  const progress = Math.round(activeTasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / activeTasks.length)
  return {
    status: 'running',
    phase: 'running',
    progress,
    current_step: `${activeTasks.length} 个抽取任务进行中`,
    total_patients: activeTasks.reduce((sum, task) => sum + Number(task.total_patients || task.patientIds?.length || 0), 0),
    processed_patients: activeTasks.reduce((sum, task) => sum + Number(task.processed_patients || 0), 0),
    success_count: activeTasks.reduce((sum, task) => sum + Number(task.success_count || 0), 0),
    error_count: activeTasks.reduce((sum, task) => sum + Number(task.error_count || 0), 0),
    scopeLabel: `${activeTasks.length} 个并行任务`,
  }
}

export const buildExtractionProgress = (tasksById, activeTasks, summaryTask, aggregateProgress) => {
  const submittingTasks = Object.values(tasksById).filter((task) => task.phase === 'submitting')
  if (submittingTasks.length > 0) {
    const task = submittingTasks[submittingTasks.length - 1]
    return { ...task, task_id: task.taskId, status: 'submitting', active_task_count: submittingTasks.length + activeTasks.length }
  }
  if (!summaryTask && activeTasks.length === 0) return null
  if (activeTasks.length > 1) {
    return {
      ...summaryTask,
      ...aggregateProgress,
      task_id: summaryTask?.taskId || activeTasks[0]?.taskId,
      active_task_count: activeTasks.length,
    }
  }
  if (!summaryTask) return null
  return { ...summaryTask, task_id: summaryTask.taskId, active_task_count: activeTasks.length }
}
