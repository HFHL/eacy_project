import { useEffect } from 'react'

import { listProjectActiveExtractionBatches } from '../../../../api/project'
import { buildTaskSnapshotFromBatch } from './extractionProgressModel'

export function useRestoreActiveExtractionBatches({
  projectId,
  setIsProgressCardDismissed,
  setPrimaryTaskId,
  upsertTask,
}) {
  useEffect(() => {
    if (!projectId) return undefined
    let cancelled = false

    const restoreActiveBatches = async () => {
      try {
        const response = await listProjectActiveExtractionBatches(projectId)
        if (cancelled || !response?.success) return
        const batches = Array.isArray(response.data) ? response.data : []
        if (batches.length === 0) return

        setIsProgressCardDismissed(false)
        batches.forEach((batch) => {
          const snapshot = buildTaskSnapshotFromBatch(batch)
          if (!snapshot.taskId) return
          upsertTask(snapshot.taskId, snapshot)
        })
        const latestBatch = batches[0]
        const latestTaskId = String(latestBatch?.batch_id || latestBatch?.id || '')
        if (latestTaskId) setPrimaryTaskId((prev) => prev || latestTaskId)
      } catch (error) {
        console.warn('[extraction] restore active batches failed:', error)
      }
    }

    restoreActiveBatches()
    return () => {
      cancelled = true
    }
  }, [projectId, setIsProgressCardDismissed, setPrimaryTaskId, upsertTask])
}
