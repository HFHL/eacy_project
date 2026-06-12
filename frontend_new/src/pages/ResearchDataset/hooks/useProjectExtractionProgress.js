import { useCallback, useMemo } from 'react'

import { TERMINAL_STATUSES } from './projectExtractionProgress/extractionProgressConstants'
import {
  buildAggregateProgress,
  buildExtractionProgress,
  getActiveTasks,
  mergePatientExtractionById,
  normalizeExtractionBatchProgress,
} from './projectExtractionProgress/extractionProgressModel'
import { notifyProjectExtractionTerminal } from './projectExtractionProgress/extractionProgressNotifications'
import { useExtractionTaskPolling } from './projectExtractionProgress/useExtractionTaskPolling'
import { useExtractionTaskStore } from './projectExtractionProgress/useExtractionTaskStore'
import { useRestoreActiveExtractionBatches } from './projectExtractionProgress/useRestoreActiveExtractionBatches'
import { useStartProjectExtraction } from './projectExtractionProgress/useStartProjectExtraction'

export { normalizeExtractionBatchProgress }

export function useProjectExtractionProgress({
  projectId = '',
  patientDataset = [],
  onTasksFinished,
  onValuesPersisted,
} = {}) {
  const {
    tasksById,
    tasksRef,
    primaryTaskId,
    setPrimaryTaskId,
    isProgressCardDismissed,
    setIsProgressCardDismissed,
    upsertTask,
    removeTask,
  } = useExtractionTaskStore(projectId)

  useRestoreActiveExtractionBatches({
    projectId,
    setIsProgressCardDismissed,
    setPrimaryTaskId,
    upsertTask,
  })

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
      lastSyncedAt: Date.now(),
      patientStatuses,
    })
    return normalized
  }, [tasksRef, upsertTask])

  useExtractionTaskPolling({
    applyTaskProgress,
    notifyTerminal: notifyProjectExtractionTerminal,
    onTasksFinished,
    onValuesPersisted,
    projectId,
    removeTask,
    tasksById,
    tasksRef,
  })

  const startExtraction = useStartProjectExtraction({
    applyTaskProgress,
    onTasksFinished,
    patientDataset,
    projectId,
    removeTask,
    setIsProgressCardDismissed,
    setPrimaryTaskId,
    upsertTask,
  })

  const activeTasks = useMemo(() => getActiveTasks(tasksById), [tasksById])
  const primaryTask = primaryTaskId ? tasksById[primaryTaskId] : null
  const summaryTask = primaryTask || activeTasks[0] || null
  const patientExtractionById = useMemo(() => mergePatientExtractionById(tasksById), [tasksById])
  const aggregateProgress = useMemo(
    () => buildAggregateProgress(activeTasks, summaryTask),
    [activeTasks, summaryTask],
  )
  const extractionProgress = useMemo(
    () => buildExtractionProgress(tasksById, activeTasks, summaryTask, aggregateProgress),
    [activeTasks, aggregateProgress, summaryTask, tasksById],
  )
  const isExtracting = activeTasks.length > 0

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
