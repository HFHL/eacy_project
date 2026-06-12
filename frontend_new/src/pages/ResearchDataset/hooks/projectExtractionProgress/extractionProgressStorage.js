import { TERMINAL_STATUSES } from './extractionProgressConstants'

const PROGRESS_STORAGE_PREFIX = 'eacy_project_extract_progress_v1:'
const PROGRESS_STALE_MS = 30 * 60 * 1000

const getProgressStorageKey = (projectId) => {
  if (!projectId) return null
  return `${PROGRESS_STORAGE_PREFIX}${projectId}`
}

const isProgressTaskFresh = (task) => {
  const marker = Number(task?.lastSyncedAt || task?.startedAt || 0)
  if (!marker || Number.isNaN(marker)) return true
  return Date.now() - marker < PROGRESS_STALE_MS
}

export const safeReadProgressStore = (projectId) => {
  const key = getProgressStorageKey(projectId)
  if (!key || typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage?.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}

    const cleaned = {}
    Object.entries(parsed).forEach(([taskId, task]) => {
      if (!taskId || !task || typeof task !== 'object') return
      const status = String(task.status || '').toLowerCase()
      if (TERMINAL_STATUSES.has(status)) return
      if (!isProgressTaskFresh(task)) return
      cleaned[taskId] = task
    })
    return cleaned
  } catch (error) {
    console.warn('[extraction] read progress store failed:', error)
    return {}
  }
}

export const safeWriteProgressStore = (projectId, tasksById) => {
  const key = getProgressStorageKey(projectId)
  if (!key || typeof window === 'undefined') return
  try {
    const persisted = {}
    Object.entries(tasksById || {}).forEach(([taskId, task]) => {
      if (!taskId || String(taskId).startsWith('pending-')) return
      if (!task || typeof task !== 'object') return
      persisted[taskId] = task
    })
    if (Object.keys(persisted).length === 0) {
      window.localStorage?.removeItem(key)
      return
    }
    window.localStorage?.setItem(key, JSON.stringify(persisted))
  } catch (error) {
    console.warn('[extraction] write progress store failed:', error)
  }
}
