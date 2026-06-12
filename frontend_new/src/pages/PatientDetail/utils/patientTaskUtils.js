import { message } from 'antd'
import { claimExtractionNotifyOnce } from '@/utils/taskStore'
import { TASK_TYPE_LABEL, pushTaskNotification } from '@/utils/taskNotifications'

export const POLL_INTERVAL_MS = 2000
export const MAX_EXTRACTION_POLLS = 60
export const MAX_UPLOAD_WAIT_MS = 15 * 60 * 1000
export const TERMINAL_STATUSES = ['completed', 'completed_with_errors', 'failed', 'timeout', 'cancelled']

export const getUploadStage = (ocrStatus, metaStatus) => {
  const ocr = String(ocrStatus || '').toLowerCase()
  const meta = String(metaStatus || '').toLowerCase()
  if (ocr === 'failed') return { kind: 'error', percent: 100, message: 'OCR 失败' }
  if (meta === 'failed') return { kind: 'error', percent: 100, message: '元数据抽取失败' }
  if (meta === 'completed') return { kind: 'success', percent: 100, message: '已归档完成（电子病历夹后台更新中）' }
  if (ocr === 'completed') return { kind: 'progress', percent: 85, message: '正在抽取元数据…' }
  if (ocr === 'processing') return { kind: 'progress', percent: 50, message: '正在进行 OCR…' }
  return { kind: 'progress', percent: 35, message: 'OCR 排队中…' }
}

export const toTaskStatus = (stage) => (
  stage.kind === 'success' ? 'completed' : stage.kind === 'error' ? 'failed' : 'processing'
)

export const getTaskUiFields = (taskData) => ({
  percentage: taskData.percentage ?? taskData.progress ?? 0,
  message: taskData.message || taskData.current_step || '抽取任务处理中',
  current: taskData.current ?? taskData.processed_patients,
  total: taskData.total ?? taskData.total_patients,
  failCount: taskData.fail_count ?? taskData.error_count ?? 0,
})

export const notifyExtractionCompletion = (taskId, status, taskData, uiFields) => {
  const successCount = taskData.success_count || 0
  const failCount = uiFields.failCount
  const mergeStats = taskData.merge_stats || {}
  let successMsg = `抽取完成：处理 ${successCount + failCount} 个文档`
  if (mergeStats.updated_count || mergeStats.added_count) {
    successMsg += `，更新 ${mergeStats.updated_count || 0} 个字段，新增 ${mergeStats.added_count || 0} 个字段`
  }

  if (!claimExtractionNotifyOnce(taskId)) return

  const hasFailures = failCount > 0 || status === 'completed_with_errors'
  const description = status === 'completed_with_errors'
    ? `抽取已完成，但有 ${failCount || 0} 项失败`
    : (failCount > 0 ? `${successMsg}（${failCount} 个失败）` : successMsg)

  if (hasFailures) {
    message.warning({ content: description, key: 'extraction', duration: 5 })
  } else {
    message.success({ content: successMsg, key: 'extraction', duration: 5 })
  }

  pushTaskNotification({
    type: hasFailures ? 'warning' : 'success',
    taskType: 'patient_extract',
    title: TASK_TYPE_LABEL.patient_extract,
    description,
  })
}

export const notifyExtractionFailure = (taskId, description) => {
  if (!claimExtractionNotifyOnce(taskId)) return

  message.error({ content: description, key: 'extraction', duration: 5 })
  pushTaskNotification({
    type: 'error',
    taskType: 'patient_extract',
    title: TASK_TYPE_LABEL.patient_extract,
    description,
  })
}

export const mergePolledTask = (task, data, isUploadArchiveTask) => (
  isUploadArchiveTask
    ? {
        ...task,
        status: data.status,
        message: data.current_step || data.message,
        percentage: data.progress ?? data.percentage,
        current: data.current ?? data.processed_patients,
        total: data.total ?? data.total_patients,
        updated_at: data.updated_at || new Date().toISOString(),
      }
    : {
        ...task,
        status: data.status,
        message: data.message || data.current_step,
        percentage: data.percentage ?? data.progress,
        current: data.current ?? data.processed_patients,
        total: data.total ?? data.total_patients,
        updated_at: data.updated_at,
      }
)
