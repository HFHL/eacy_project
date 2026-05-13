/**
 * 全局轮询 localStorage 中登记的后台任务，并在任务终态时
 *   1) 弹出页面内 antd message toast（短时反馈）
 *   2) 显式 dispatch addNotification 到 Redux store（持久化进通知中心）
 *   3) 派发刷新事件
 *
 * 只有这 4 类长耗时后端任务才会进入通知中心：
 *   - patient_extract        电子病历抽取（整患者）
 *   - ehr_targeted_extract   病历靶向抽取
 *   - project_crf_targeted   科研项目靶向抽取
 *   - ehr_folder_batch       电子病历夹批次更新（按 batchId 轮询）
 */
import { message } from 'antd'
import store from '@/store'
import { addNotification } from '@/store/slices/uiSlice'
import { getAllTasks, upsertTask, claimExtractionNotifyOnce } from './taskStore'
import { getExtractionTaskStatus, getTaskBatchProgress } from '@/api/patient'

const POLL_MS = 4000

const TERMINAL = new Set([
  'completed',
  'completed_with_errors',
  'succeeded',
  'failed',
  'cancelled',
])

const POLLABLE_TYPES = new Set([
  'patient_extract',
  'ehr_targeted_extract',
  'project_crf_targeted',
])

const TASK_TYPE_LABEL = {
  patient_extract: '电子病历抽取',
  ehr_targeted_extract: '病历靶向抽取',
  project_crf_targeted: '科研项目靶向抽取',
  ehr_folder_batch: '电子病历夹更新',
}

let intervalId = null
let tickPromise = null

// 调试开关：在浏览器控制台执行 `window.__eacyDebugTaskPoller = true` 即可打开
function debugLog(...args) {
  if (typeof window !== 'undefined' && window.__eacyDebugTaskPoller) {
    // eslint-disable-next-line no-console
    console.log('[task-poller]', ...args)
  }
}

function isTerminalStatus(status) {
  const s = String(status || '').toLowerCase()
  return TERMINAL.has(s)
}

function needsPollingTask(task) {
  if (!task?.task_id || !POLLABLE_TYPES.has(task.type)) return false
  return !isTerminalStatus(task.status)
}

function batchNotifyKey(batchId) {
  return `eacy_ehr_batch_notified_${batchId}`
}

function shouldNotifyBatch(batchId) {
  const k = batchNotifyKey(batchId)
  if (sessionStorage.getItem(k)) return false
  sessionStorage.setItem(k, '1')
  return true
}

function dispatchPatientRefresh(patientId) {
  const id = String(patientId || '')
  if (!id) return
  window.dispatchEvent(new CustomEvent('patient-detail-refresh', { detail: { patientId: id } }))
}

function dispatchProjectCrfRefresh(projectId, projectPatientId) {
  if (!projectId || !projectPatientId) return
  window.dispatchEvent(
    new CustomEvent('eacy:project-crf-refresh', {
      detail: {
        projectId: String(projectId),
        projectPatientId: String(projectPatientId),
      },
    })
  )
}

/**
 * 把一条任务终态写入通知中心（持久化、可在铃铛查看）。
 * @param {object} params
 * @param {'success'|'warning'|'error'} params.type
 * @param {string} params.taskType    任务类型 key（用于 source 标识）
 * @param {string} params.title       通知主标题
 * @param {string} params.description 通知详情
 */
function pushTaskNotification({ type, taskType, title, description }) {
  try {
    store.dispatch(
      addNotification({
        type,
        title,
        description,
        source: `task:${taskType}`,
        timestamp: new Date().toISOString(),
        route: typeof window !== 'undefined' ? window.location?.pathname : undefined,
      })
    )
  } catch (_) {
    // 派发失败不影响 toast 与轮询主流程
  }
}

function settleExtractionTask(task, data) {
  const status = String(data?.status || '').toLowerCase()
  const targetLabel = task.target_form_key || task.target_section || ''
  const taskLabel = TASK_TYPE_LABEL[task.type] || '后台任务'

  debugLog('settleExtractionTask', { task_id: task.task_id, type: task.type, status })

  if (!claimExtractionNotifyOnce(task.task_id)) {
    debugLog('claim skipped (already notified)', task.task_id)
    upsertTask({
      ...task,
      status,
      message: data.message || data.current_step || task.message,
      percentage: data.percentage ?? data.progress ?? task.percentage,
      updated_at: data.updated_at || new Date().toISOString(),
    })
    return
  }

  if (status === 'completed' || status === 'succeeded') {
    if (task.type === 'project_crf_targeted') {
      const desc = targetLabel ? `科研项目靶向抽取已完成（${targetLabel}）` : '科研项目靶向抽取已完成'
      message.success(desc)
      pushTaskNotification({ type: 'success', taskType: task.type, title: taskLabel, description: desc })
      dispatchProjectCrfRefresh(task.project_id, task.project_patient_id || task.patient_id)
    } else if (task.type === 'ehr_targeted_extract') {
      const desc = targetLabel ? `病历靶向抽取已完成（${targetLabel}）` : '病历靶向抽取已完成'
      message.success(desc)
      pushTaskNotification({ type: 'success', taskType: task.type, title: taskLabel, description: desc })
      dispatchPatientRefresh(task.patient_id)
    } else if (task.type === 'patient_extract') {
      const successCount = data.success_count ?? data.succeeded_items
      const failCount = data.error_count ?? data.fail_count ?? data.failed_items ?? 0
      let msg = '患者病历抽取任务已完成'
      if (successCount != null || failCount) {
        msg = `抽取完成：成功 ${successCount ?? 0}，失败 ${failCount || 0}`
      }
      const notifyType = failCount > 0 ? 'warning' : 'success'
      if (failCount > 0) message.warning(msg)
      else message.success(msg)
      pushTaskNotification({ type: notifyType, taskType: task.type, title: taskLabel, description: msg })
      dispatchPatientRefresh(task.patient_id)
    }
  } else if (status === 'completed_with_errors') {
    const fail = data.error_count ?? data.fail_count ?? data.failed_items ?? 0
    const desc = `抽取已完成，但有 ${fail || 0} 项失败`
    message.warning(desc)
    pushTaskNotification({ type: 'warning', taskType: task.type, title: taskLabel, description: desc })
    if (task.type === 'project_crf_targeted') {
      dispatchProjectCrfRefresh(task.project_id, task.project_patient_id || task.patient_id)
    } else {
      dispatchPatientRefresh(task.patient_id)
    }
  } else if (status === 'failed' || status === 'cancelled') {
    const desc = data.message || data.error_message || '后台抽取任务失败'
    message.error(desc)
    pushTaskNotification({ type: 'error', taskType: task.type, title: taskLabel, description: desc })
    if (task.type === 'project_crf_targeted') {
      dispatchProjectCrfRefresh(task.project_id, task.project_patient_id || task.patient_id)
    } else {
      dispatchPatientRefresh(task.patient_id)
    }
  }

  upsertTask({
    ...task,
    status,
    message: data.message || data.current_step || task.message,
    percentage: data.percentage ?? data.progress ?? task.percentage,
    updated_at: data.updated_at || new Date().toISOString(),
  })
}

async function pollTask(task) {
  const res = await getExtractionTaskStatus(task.task_id)

  debugLog('pollTask result', { task_id: task.task_id, type: task.type, success: res?.success, status: res?.data?.status })

  if (!res?.success || !res.data) return

  const data = res.data
  const status = String(data.status || '').toLowerCase()

  if (!isTerminalStatus(status)) {
    upsertTask({
      ...task,
      status,
      message: data.message || data.current_step || task.message,
      percentage: data.percentage ?? data.progress ?? task.percentage,
      current: data.current ?? data.processed_patients,
      total: data.total ?? data.total_patients,
      updated_at: data.updated_at || new Date().toISOString(),
    })
    return
  }

  settleExtractionTask(task, data)
}

async function pollEhrFolderBatchesFromStorage() {
  try {
    const entries = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith('eacy_ehr_folder_batch_')) continue
      const batchId = localStorage.getItem(key)
      const patientId = key.replace('eacy_ehr_folder_batch_', '')
      if (!batchId || !patientId) continue
      entries.push({ key, batchId, patientId })
    }
    const folderLabel = TASK_TYPE_LABEL.ehr_folder_batch
    for (const { key, batchId, patientId } of entries) {
      const res = await getTaskBatchProgress(batchId)
      if (!res?.success || !res.data) continue

      const batch = res.data
      const st = String(batch.status || '').toLowerCase()
      const terminal = ['succeeded', 'completed', 'completed_with_errors', 'failed', 'cancelled'].includes(st)
      if (!terminal) continue

      if (shouldNotifyBatch(batchId)) {
        let notifyType = 'success'
        let desc = '电子病历夹更新完成'
        if (st === 'succeeded' || st === 'completed') {
          notifyType = 'success'
          desc = '电子病历夹更新完成'
          message.success(desc)
        } else if (st === 'completed_with_errors') {
          notifyType = 'warning'
          desc = `电子病历夹更新完成，失败 ${batch.failed_items || 0} 个任务`
          message.warning(desc)
        } else if (st === 'failed') {
          notifyType = 'error'
          desc = '电子病历夹更新失败'
          message.error(desc)
        } else {
          notifyType = 'warning'
          desc = '电子病历夹更新已结束'
          message.warning(desc)
        }
        pushTaskNotification({
          type: notifyType,
          taskType: 'ehr_folder_batch',
          title: folderLabel,
          description: desc,
        })
        dispatchPatientRefresh(patientId)
      }
      localStorage.removeItem(key)
    }
  } catch {
    // ignore
  }
}

async function tick() {
  const allTasks = getAllTasks()
  const tasks = allTasks.filter(needsPollingTask)
  debugLog('tick', { total: allTasks.length, pollable: tasks.length, types: tasks.map(t => `${t.type}:${t.status}`) })
  await Promise.all(tasks.map((t) => pollTask(t).catch((err) => {
    debugLog('pollTask error', t.task_id, err?.message || err)
  })))
  await pollEhrFolderBatchesFromStorage()
}

export function startGlobalBackgroundTaskPoller() {
  if (intervalId != null) {
    debugLog('startGlobalBackgroundTaskPoller: already running, intervalId=', intervalId)
    return
  }
  debugLog('startGlobalBackgroundTaskPoller: starting')
  intervalId = setInterval(() => {
    if (tickPromise) return
    tickPromise = tick().finally(() => {
      tickPromise = null
    })
  }, POLL_MS)
  tickPromise = tick().finally(() => {
    tickPromise = null
  })
}

export function stopGlobalBackgroundTaskPoller() {
  if (intervalId != null) {
    clearInterval(intervalId)
    intervalId = null
  }
  tickPromise = null
}
