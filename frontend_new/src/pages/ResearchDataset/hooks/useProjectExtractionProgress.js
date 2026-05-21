import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { message } from 'antd'
import {
  getCrfExtractionProgress,
  updateProjectCrfFolder,
  updateProjectCrfFolderBatch,
} from '../../../api/project'
import { claimExtractionNotifyOnce } from '../../../utils/taskStore'
import { TASK_TYPE_LABEL, pushTaskNotification } from '../../../utils/taskNotifications'

const TERMINAL_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled', 'succeeded'])
const ACTIVE_POLL_STATUSES = new Set(['submitting', 'queued', 'running', 'pending'])

const MODE_LABELS = {
  incremental: '增量抽取',
  full: '全量重抽',
}

/**
 * 将 task-batches 状态规范为前端统一状态。
 *
 * @param {Record<string, any>} raw 原始批次数据。
 * @returns {Record<string, any>}
 */
export const normalizeExtractionBatchProgress = (raw = {}) => {
  const backendStatus = String(raw.status || 'running')
  let status = backendStatus
  if (backendStatus === 'succeeded') status = 'completed'
  if (backendStatus === 'queued' || backendStatus === 'pending') status = 'running'

  const totalItems = Number(raw.total_items ?? raw.total_patients ?? 0)
  const processed = Number(
    raw.processed_patients
    ?? ((Number(raw.succeeded_items || 0) + Number(raw.failed_items || 0) + Number(raw.cancelled_items || 0))),
  )

  return {
    ...raw,
    status,
    progress: Number(raw.progress ?? 0),
    task_id: raw.task_id || raw.batch_id || raw.id || '',
    total_patients: totalItems,
    processed_patients: processed,
    success_count: Number(raw.success_count ?? raw.succeeded_items ?? 0),
    error_count: Number(raw.error_count ?? raw.failed_items ?? 0),
    current_step: raw.current_step || raw.message || '',
  }
}

/**
 * 科研项目 CRF 抽取进度：即时反馈、多任务轮询、按患者行状态。
 *
 * @param {{
 *   projectId?: string;
 *   patientDataset?: Array<Record<string, any>>;
 *   onTasksFinished?: () => void;
 * }} options
 */
export function useProjectExtractionProgress({
  projectId = '',
  patientDataset = [],
  onTasksFinished,
} = {}) {
  const [tasksById, setTasksById] = useState({})
  const [primaryTaskId, setPrimaryTaskId] = useState(null)
  const [isProgressCardDismissed, setIsProgressCardDismissed] = useState(false)
  const pollingRef = useRef(false)
  const tasksRef = useRef(tasksById)

  useEffect(() => {
    tasksRef.current = tasksById
  }, [tasksById])

  const resolveScopePatients = useCallback((patientIds = null) => {
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

    const projectPatientIds = scopedPatients
      .map((patient) => patient.id || patient.project_patient_id)
      .filter(Boolean)

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
        ? (scopedPatients.length === 1
          ? (labelsByPatientId[normalizedIds[0]] || '1 位患者')
          : `${scopedPatients.length} 位患者`)
        : `全部 ${patientDataset.length} 位患者`,
    }
  }, [patientDataset])

  const upsertTask = useCallback((taskId, patch) => {
    if (!taskId) return
    setTasksById((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        taskId,
        ...patch,
      },
    }))
  }, [])

  const removeTask = useCallback((taskId) => {
    setTasksById((prev) => {
      if (!prev[taskId]) return prev
      const next = { ...prev }
      delete next[taskId]
      return next
    })
  }, [])

  const notifyProjectExtractionTerminal = useCallback((taskId, task, normalized) => {
    if (!claimExtractionNotifyOnce(taskId)) return

    const scopeLabel = task.scopeLabel || '抽取'
    const modePrefix = task.modeLabel ? `${task.modeLabel} · ` : ''
    const title = TASK_TYPE_LABEL.project_crf_batch

    if (normalized.status === 'completed') {
      const desc = `${modePrefix}${scopeLabel}完成`
      message.success({ key: `extract-done-${taskId}`, content: desc })
      pushTaskNotification({ type: 'success', taskType: 'project_crf_batch', title, description: desc })
      return
    }
    if (normalized.status === 'completed_with_errors') {
      const fail = normalized.error_count || 0
      const desc = `${modePrefix}${scopeLabel}完成（有 ${fail} 项失败）`
      message.warning({ key: `extract-done-${taskId}`, content: desc })
      pushTaskNotification({ type: 'warning', taskType: 'project_crf_batch', title, description: desc })
      return
    }
    if (normalized.status === 'failed') {
      const desc = normalized.current_step || normalized.message || `${modePrefix}${scopeLabel}失败`
      message.error({ key: `extract-done-${taskId}`, content: desc })
      pushTaskNotification({ type: 'error', taskType: 'project_crf_batch', title, description: desc })
      return
    }
    if (normalized.status === 'cancelled') {
      const desc = normalized.current_step || `${modePrefix}${scopeLabel}已取消`
      message.warning({ key: `extract-done-${taskId}`, content: desc })
      pushTaskNotification({ type: 'warning', taskType: 'project_crf_batch', title, description: desc })
    }
  }, [])

  const applyTaskProgress = useCallback((taskId, progressPayload) => {
    const normalized = normalizeExtractionBatchProgress(progressPayload)
    const existing = tasksRef.current[taskId] || {}
    const patientStatuses = { ...(existing.patientStatuses || {}) }
    const rowStatus = TERMINAL_STATUSES.has(normalized.status) ? normalized.status : 'running'
    ;(existing.patientIds || []).forEach((pid) => {
      patientStatuses[pid] = {
        ...(patientStatuses[pid] || {}),
        status: rowStatus,
        progress: normalized.progress,
        label: normalized.current_step || existing.modeLabel || '抽取中',
        displayName: existing.labelsByPatientId?.[pid] || pid,
      }
    })

    upsertTask(taskId, {
      ...existing,
      ...normalized,
      phase: TERMINAL_STATUSES.has(normalized.status) ? normalized.status : 'running',
      patientStatuses,
    })

    return normalized
  }, [upsertTask])

  const pollActiveTasks = useCallback(async () => {
    const entries = Object.entries(tasksRef.current)
    const active = entries.filter(([, task]) => ACTIVE_POLL_STATUSES.has(task.phase) || ACTIVE_POLL_STATUSES.has(task.status))
    if (active.length === 0) {
      pollingRef.current = false
      return
    }

    await Promise.all(active.map(async ([taskId, task]) => {
      if (task.phase === 'submitting' || String(taskId).startsWith('pending-')) return
      try {
        const response = await getCrfExtractionProgress(projectId, taskId)
        if (!response.success) return
        const normalized = applyTaskProgress(taskId, response.data)

        if (TERMINAL_STATUSES.has(normalized.status)) {
          notifyProjectExtractionTerminal(taskId, task, normalized)
          window.setTimeout(() => removeTask(taskId), 2500)
        }
      } catch (error) {
        console.error('[extraction] poll failed:', taskId, error)
      }
    }))

    const stillActive = Object.values(tasksRef.current).some((task) => {
      if (task.phase === 'submitting' || String(task.taskId || '').startsWith('pending-')) return true
      return ACTIVE_POLL_STATUSES.has(task.phase) || (task.status && !TERMINAL_STATUSES.has(task.status))
    })
    if (!stillActive) {
      pollingRef.current = false
      onTasksFinished?.()
    }
  }, [applyTaskProgress, notifyProjectExtractionTerminal, onTasksFinished, projectId, removeTask])

  useEffect(() => {
    const hasWork = Object.values(tasksRef.current).some((task) => {
      if (task.phase === 'submitting' || String(task.taskId || '').startsWith('pending-')) return true
      return task.status && !TERMINAL_STATUSES.has(task.status)
    })
    if (!hasWork) {
      pollingRef.current = false
      return undefined
    }
    pollingRef.current = true
    pollActiveTasks()
    const timer = window.setInterval(() => {
      pollActiveTasks()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [pollActiveTasks, tasksById])

  const buildPatientStatuses = useCallback((patientIds, labelsByPatientId, patch) => {
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
  }, [])

  const startExtraction = useCallback(async ({
    patientIds = null,
    mode = 'incremental',
    targetGroups = null,
  } = {}) => {
    if (!projectId) {
      message.error('缺少项目 ID')
      return null
    }

    const targetFormKeys = Array.isArray(targetGroups) && targetGroups.length > 0
      ? targetGroups.filter(Boolean)
      : null
    const {
      normalizedIds,
      projectPatientIds,
      labelsByPatientId,
      scopeLabel,
    } = resolveScopePatients(patientIds)

    const pendingId = `pending-${Date.now()}`
    const patientIdList = normalizedIds || Object.keys(labelsByPatientId)
    const modeLabel = MODE_LABELS[mode] || '抽取'

    setIsProgressCardDismissed(false)
    setPrimaryTaskId(pendingId)
    upsertTask(pendingId, {
      phase: 'submitting',
      status: 'submitting',
      progress: 5,
      mode,
      modeLabel,
      scopeLabel,
      patientIds: patientIdList,
      labelsByPatientId,
      current_step: '正在提交抽取任务…',
      submitted_jobs: 0,
      total_patients: patientIdList.length || patientDataset.length,
      processed_patients: 0,
      patientStatuses: buildPatientStatuses(patientIdList, labelsByPatientId, {}),
      startedAt: Date.now(),
    })

    message.loading({
      key: 'project-crf-extract-submit',
      content: `${scopeLabel} · ${modeLabel}：正在提交…`,
      duration: 0,
    })

    try {
      let response
      if (projectPatientIds.length === 1) {
        response = await updateProjectCrfFolder(projectId, projectPatientIds[0], {
          targetFormKeys,
          mode,
        })
      } else {
        response = await updateProjectCrfFolderBatch(
          projectId,
          projectPatientIds.length > 0 ? projectPatientIds : null,
          { targetFormKeys, mode },
        )
      }

      message.destroy('project-crf-extract-submit')

      if (!response.success) {
        removeTask(pendingId)
        setPrimaryTaskId(null)
        message.error(response.message || '启动抽取任务失败')
        return null
      }

      const data = response.data || {}
      const createdJobs = Number(data.submitted_jobs || data.created_jobs || 0)
      const taskId = data.task_id || data.batch_id || data.job_ids?.[0] || ''

      removeTask(pendingId)

      if (!taskId) {
        setPrimaryTaskId(null)
        message.info(createdJobs > 0 ? `已提交 ${createdJobs} 个抽取任务` : '暂无可提交的抽取任务')
        onTasksFinished?.()
        return null
      }

      setPrimaryTaskId(taskId)
      upsertTask(taskId, {
        phase: createdJobs > 0 ? 'queued' : 'completed',
        status: createdJobs > 0 ? 'running' : 'completed',
        progress: createdJobs > 0 ? 12 : 100,
        mode,
        modeLabel,
        scopeLabel,
        patientIds: patientIdList,
        labelsByPatientId,
        current_step: createdJobs > 0 ? '已进入队列，等待 Worker 执行' : '无需新建抽取任务',
        submitted_jobs: createdJobs,
        total_patients: patientIdList.length || Number(data.total_items || 0),
        processed_patients: 0,
        patientStatuses: buildPatientStatuses(patientIdList, labelsByPatientId, {
          status: createdJobs > 0 ? 'running' : 'completed',
          progress: createdJobs > 0 ? 12 : 100,
          label: createdJobs > 0 ? '排队中' : '已完成',
        }),
        startedAt: Date.now(),
      })

      message.success({
        key: 'project-crf-extract-submit',
        content: createdJobs > 0
          ? `${scopeLabel} · 已提交 ${createdJobs} 个任务，已进入队列`
          : `${scopeLabel} · 暂无可提交任务`,
      })

      const firstPoll = await getCrfExtractionProgress(projectId, taskId)
      if (firstPoll.success) {
        applyTaskProgress(taskId, firstPoll.data)
      }
      return taskId
    } catch (error) {
      message.destroy('project-crf-extract-submit')
      removeTask(pendingId)
      setPrimaryTaskId(null)
      console.error('启动抽取任务失败:', error)
      message.error('启动抽取任务失败')
      return null
    }
  }, [
    applyTaskProgress,
    buildPatientStatuses,
    onTasksFinished,
    patientDataset.length,
    projectId,
    removeTask,
    resolveScopePatients,
    upsertTask,
  ])

  const activeTasks = useMemo(
    () => Object.values(tasksById).filter((task) => {
      if (task.phase === 'submitting' || String(task.taskId || '').startsWith('pending-')) return true
      return ACTIVE_POLL_STATUSES.has(task.phase) || (task.status && !TERMINAL_STATUSES.has(task.status))
    }),
    [tasksById],
  )

  const primaryTask = primaryTaskId ? tasksById[primaryTaskId] : null
  const summaryTask = primaryTask || activeTasks[0] || null

  const patientExtractionById = useMemo(() => {
    const merged = {}
    Object.values(tasksById).forEach((task) => {
      const statuses = task.patientStatuses || {}
      Object.entries(statuses).forEach(([patientId, row]) => {
        const prev = merged[patientId]
        if (!prev || (row.progress ?? 0) >= (prev.progress ?? 0)) {
          merged[patientId] = {
            ...row,
            taskId: task.taskId,
            modeLabel: task.modeLabel,
          }
        }
      })
    })
    return merged
  }, [tasksById])

  const isExtracting = activeTasks.length > 0

  const aggregateProgress = useMemo(() => {
    if (activeTasks.length === 0) return summaryTask
    if (activeTasks.length === 1) return activeTasks[0]
    const progress = Math.round(
      activeTasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / activeTasks.length,
    )
    const totalPatients = activeTasks.reduce((sum, task) => sum + Number(task.total_patients || task.patientIds?.length || 0), 0)
    const processed = activeTasks.reduce((sum, task) => sum + Number(task.processed_patients || 0), 0)
    return {
      status: 'running',
      phase: 'running',
      progress,
      current_step: `${activeTasks.length} 个抽取任务进行中`,
      total_patients: totalPatients,
      processed_patients: processed,
      success_count: activeTasks.reduce((sum, task) => sum + Number(task.success_count || 0), 0),
      error_count: activeTasks.reduce((sum, task) => sum + Number(task.error_count || 0), 0),
      scopeLabel: `${activeTasks.length} 个并行任务`,
    }
  }, [activeTasks, summaryTask])

  const extractionProgress = useMemo(() => {
    const submittingTasks = Object.values(tasksById).filter((task) => task.phase === 'submitting')
    if (submittingTasks.length > 0) {
      const task = submittingTasks[submittingTasks.length - 1]
      return {
        ...task,
        task_id: task.taskId,
        status: 'submitting',
        active_task_count: submittingTasks.length + activeTasks.length,
      }
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
    return {
      ...summaryTask,
      task_id: summaryTask.taskId,
      active_task_count: activeTasks.length,
    }
  }, [activeTasks, aggregateProgress, summaryTask, tasksById])

  return {
    startExtraction,
    isExtracting,
    extractionProgress,
    extractionTasks: activeTasks,
    patientExtractionById,
    primaryTaskId,
    isProgressCardDismissed,
    setIsProgressCardDismissed,
    dismissProgressCard: () => setIsProgressCardDismissed(true),
    showProgressCard: Boolean(extractionProgress) && !isProgressCardDismissed,
  }
}

export default useProjectExtractionProgress
