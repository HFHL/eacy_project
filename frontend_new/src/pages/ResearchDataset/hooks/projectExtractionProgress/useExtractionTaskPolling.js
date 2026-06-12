import { useCallback, useEffect, useRef } from 'react'

import { getCrfExtractionProgress } from '../../../../api/project'
import {
  ACTIVE_POLL_STATUSES,
  TERMINAL_STATUSES,
} from './extractionProgressConstants'

const hasPollingWork = (task) => {
  if (task.phase === 'submitting' || String(task.taskId || '').startsWith('pending-')) return true
  return task.status && !TERMINAL_STATUSES.has(task.status)
}

export function useExtractionTaskPolling({
  applyTaskProgress,
  notifyTerminal,
  onTasksFinished,
  onValuesPersisted,
  projectId,
  removeTask,
  tasksById,
  tasksRef,
}) {
  const pollingRef = useRef(false)
  const fieldWriteSigRef = useRef({})

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
        if (!response.data || response.notFound) {
          removeTask(taskId)
          return
        }
        const normalized = applyTaskProgress(taskId, response.data)
        if (
          normalized.field_write_signature &&
          fieldWriteSigRef.current[taskId] !== normalized.field_write_signature
        ) {
          fieldWriteSigRef.current[taskId] = normalized.field_write_signature
          onValuesPersisted?.(taskId, normalized)
        }
        if (TERMINAL_STATUSES.has(normalized.status)) {
          notifyTerminal(taskId, task, normalized)
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
  }, [applyTaskProgress, notifyTerminal, onTasksFinished, onValuesPersisted, projectId, removeTask, tasksRef])

  useEffect(() => {
    const hasWork = Object.values(tasksRef.current).some(hasPollingWork)
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
  }, [pollActiveTasks, tasksById, tasksRef])
}
