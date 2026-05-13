const STORAGE_KEY = 'eacy_task_store_v1'

function _safeParse(json) {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

function _nowIso() {
  return new Date().toISOString()
}

export function getAllTasks() {
  const raw = localStorage.getItem(STORAGE_KEY)
  const obj = _safeParse(raw)
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.tasks)) return []
  return obj.tasks
}

export function setAllTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks }, null, 0))
}

export function upsertTask(task) {
  if (!task || !task.task_id) return
  const tasks = getAllTasks()
  const idx = tasks.findIndex(t => t.task_id === task.task_id)
  const merged = {
    created_at: task.created_at || _nowIso(),
    updated_at: _nowIso(),
    ...task
  }
  if (idx >= 0) {
    tasks[idx] = { ...tasks[idx], ...merged, updated_at: _nowIso() }
  } else {
    tasks.unshift(merged)
  }
  // 控制大小：最多保留 50 条
  setAllTasks(tasks.slice(0, 50))
}

export function removeTask(taskId) {
  const tasks = getAllTasks().filter(t => t.task_id !== taskId)
  setAllTasks(tasks)
}

export function getTasksByPatient(patientId) {
  if (!patientId) return []
  return getAllTasks().filter(t => t.patient_id === patientId)
}

/**
 * Get tasks scoped to a specific patient + section + context.
 * @param {string} patientId
 * @param {string} targetSection - e.g. "影像检查.超声"
 * @param {string} context - e.g. "project_<uuid>" or "patient_pool"
 */
export function getTasksByScope(patientId, targetSection, context) {
  if (!patientId) return []
  return getAllTasks().filter(t => {
    if (t.patient_id !== patientId) return false
    if (targetSection && t.target_section && t.target_section !== targetSection) return false
    if (context && t.context && t.context !== context) return false
    return true
  })
}

/** 同一抽取任务仅提示一次（避免全局轮询与详情页轮询重复 toast） */
export function claimExtractionNotifyOnce(taskId) {
  const id = String(taskId || '')
  if (!id) return true
  const k = `eacy_extraction_notified_${id}`
  if (sessionStorage.getItem(k)) return false
  sessionStorage.setItem(k, '1')
  return true
}

