import store from '@/store'
import { addNotification } from '@/store/slices/uiSlice'

export const TASK_TYPE_LABEL = {
  patient_extract: '电子病历抽取',
  ehr_targeted_extract: '病历靶向抽取',
  project_crf_targeted: '科研项目靶向抽取',
  project_crf_batch: '科研项目 CRF 抽取',
  ehr_folder_batch: '电子病历夹更新',
}

/**
 * 把任务终态写入顶部通知中心（Redux + localStorage 持久化）。
 */
export function pushTaskNotification({ type, taskType, title, description }) {
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
  } catch {
    // 派发失败不影响 toast 与轮询主流程
  }
}

/** 同一 batch 仅通知一次（与 DocumentsTab / 全局轮询共用 key） */
export function claimBatchNotifyOnce(batchId) {
  const id = String(batchId || '')
  if (!id) return true
  const key = `eacy_ehr_batch_notified_${id}`
  if (sessionStorage.getItem(key)) return false
  sessionStorage.setItem(key, '1')
  return true
}
