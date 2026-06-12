import { message } from 'antd'

import { claimExtractionNotifyOnce } from '../../../../utils/taskStore'
import { TASK_TYPE_LABEL, pushTaskNotification } from '../../../../utils/taskNotifications'

export const notifyProjectExtractionTerminal = (taskId, task, normalized) => {
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
  if (normalized.status === 'completed_with_empty') {
    const empty = normalized.empty_count || 0
    const desc = `${modePrefix}${scopeLabel}完成（${empty} 个任务未抽到任何字段，请检查模板与文档匹配）`
    message.warning({ key: `extract-done-${taskId}`, content: desc })
    pushTaskNotification({ type: 'warning', taskType: 'project_crf_batch', title, description: desc })
    return
  }
  if (normalized.status === 'failed' || normalized.status === 'timeout') {
    const fallback = normalized.status === 'timeout' ? `${modePrefix}${scopeLabel}超时` : `${modePrefix}${scopeLabel}失败`
    const desc = normalized.current_step || normalized.message || fallback
    message.error({ key: `extract-done-${taskId}`, content: desc })
    pushTaskNotification({ type: 'error', taskType: 'project_crf_batch', title, description: desc })
    return
  }
  if (normalized.status === 'cancelled') {
    const desc = normalized.current_step || `${modePrefix}${scopeLabel}已取消`
    message.warning({ key: `extract-done-${taskId}`, content: desc })
    pushTaskNotification({ type: 'warning', taskType: 'project_crf_batch', title, description: desc })
  }
}
