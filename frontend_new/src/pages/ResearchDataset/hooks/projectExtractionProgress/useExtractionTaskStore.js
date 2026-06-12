import { useCallback, useEffect, useRef, useState } from 'react'

import {
  safeReadProgressStore,
  safeWriteProgressStore,
} from './extractionProgressStorage'
import { pickPrimaryActiveTaskId } from './extractionProgressModel'

export function useExtractionTaskStore(projectId) {
  const [tasksById, setTasksById] = useState(() => safeReadProgressStore(projectId))
  const [primaryTaskId, setPrimaryTaskId] = useState(() => pickPrimaryActiveTaskId(safeReadProgressStore(projectId)))
  const [isProgressCardDismissed, setIsProgressCardDismissed] = useState(false)
  const tasksRef = useRef(tasksById)
  const lastProjectIdRef = useRef(projectId)

  useEffect(() => {
    tasksRef.current = tasksById
    safeWriteProgressStore(projectId, tasksById)
  }, [projectId, tasksById])

  useEffect(() => {
    if (lastProjectIdRef.current === projectId) return
    lastProjectIdRef.current = projectId
    const restored = safeReadProgressStore(projectId)
    setTasksById(restored)
    setPrimaryTaskId(pickPrimaryActiveTaskId(restored))
    setIsProgressCardDismissed(false)
  }, [projectId])

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

  return {
    tasksById,
    tasksRef,
    primaryTaskId,
    setPrimaryTaskId,
    isProgressCardDismissed,
    setIsProgressCardDismissed,
    upsertTask,
    removeTask,
  }
}
