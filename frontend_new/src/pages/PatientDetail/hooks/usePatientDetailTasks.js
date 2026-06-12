import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import {
  extractEhrData,
  getDocumentTaskProgress,
  getFileStatusesByIds,
} from '@/api/document'
import { getExtractionTaskStatus, startPatientExtraction } from '@/api/patient'
import {
  getTaskUiFields,
  getUploadStage,
  MAX_EXTRACTION_POLLS,
  MAX_UPLOAD_WAIT_MS,
  mergePolledTask,
  notifyExtractionCompletion,
  notifyExtractionFailure,
  POLL_INTERVAL_MS,
  TERMINAL_STATUSES,
  toTaskStatus,
} from '../utils/patientTaskUtils'
import { getTasksByPatient, upsertTask } from '@/utils/taskStore'

export const usePatientDetailTasks = ({
  fetchPatientDocuments,
  patientId,
  syncPatientStatsAfterDocumentChange,
}) => {
  const [taskCenterVisible, setTaskCenterVisible] = useState(false)
  const [taskItems, setTaskItems] = useState([])
  const [taskPolling, setTaskPolling] = useState(false)

  const loadTaskItems = useCallback(() => {
    const list = getTasksByPatient(patientId) || []
    setTaskItems(list)
  }, [patientId])

  const handleReExtract = useCallback(async (docId) => {
    if (docId) {
      try {
        console.log('开始重新抽取文档:', docId)
        const response = await extractEhrData(docId)
        if (response.success) {
          message.success(`重新抽取成功，共抽取 ${response.data?.fields_count || 0} 个字段`)
          fetchPatientDocuments?.()
        } else {
          message.error(response.message || '重新抽取失败')
        }
      } catch (error) {
        console.error('重新抽取异常:', error)
        const errorMsg = error.response?.data?.message || error.message || '重新抽取失败'
        message.error(`重新抽取失败: ${errorMsg}`)
      }
      return
    }

    message.loading({ content: '正在启动抽取任务...', key: 'extraction', duration: 0 })
    try {
      const startResponse = await startPatientExtraction(patientId)
      if (!startResponse.success) {
        message.error({ content: startResponse.message || '启动抽取任务失败', key: 'extraction' })
        return
      }

      const taskId = startResponse.data?.task_id
      if (!taskId) {
        message.error({ content: '未获取到任务ID', key: 'extraction' })
        return
      }

      upsertTask({
        task_id: taskId,
        patient_id: patientId,
        type: 'patient_extract',
        status: 'pending',
        percentage: 0,
        message: '抽取任务已启动',
        created_at: new Date().toISOString(),
      })
      loadTaskItems()
      message.loading({ content: '抽取任务已启动，正在处理...', key: 'extraction', duration: 0 })

      let pollCount = 0
      const pollStatus = async () => {
        try {
          const statusResponse = await getExtractionTaskStatus(taskId)
          if (!statusResponse.success) {
            pollCount++
            if (pollCount < MAX_EXTRACTION_POLLS) {
              setTimeout(pollStatus, POLL_INTERVAL_MS)
            } else {
              message.warning({ content: '任务状态查询超时，请稍后手动刷新查看结果', key: 'extraction' })
            }
            return
          }

          const taskData = statusResponse.data
          const status = taskData.status
          const uiFields = getTaskUiFields(taskData)
          if (uiFields.percentage && uiFields.message) {
            message.loading({ content: `${uiFields.message} (${uiFields.percentage}%)`, key: 'extraction', duration: 0 })
          }

          upsertTask({
            task_id: taskId,
            patient_id: patientId,
            type: 'patient_extract',
            status: taskData.status,
            percentage: uiFields.percentage,
            current: uiFields.current,
            total: uiFields.total,
            message: uiFields.message,
            updated_at: taskData.updated_at || new Date().toISOString(),
          })
          loadTaskItems()

          if (status === 'completed' || status === 'completed_with_errors' || status === 'succeeded') {
            notifyExtractionCompletion(taskId, status, taskData, uiFields)
            fetchPatientDocuments?.()
          } else if (status === 'failed' || status === 'timeout' || status === 'cancelled') {
            notifyExtractionFailure(taskId, taskData.message || taskData.error_message || '抽取任务失败')
          } else if (++pollCount < MAX_EXTRACTION_POLLS) {
            setTimeout(pollStatus, POLL_INTERVAL_MS)
          } else {
            message.warning({ content: '任务仍在后台执行中，请稍后刷新页面查看结果', key: 'extraction', duration: 5 })
          }
        } catch (error) {
          console.error('轮询任务状态异常:', error)
          if (++pollCount < MAX_EXTRACTION_POLLS) {
            setTimeout(pollStatus, POLL_INTERVAL_MS)
          } else {
            message.error({ content: '查询任务状态失败，请稍后手动刷新', key: 'extraction', duration: 5 })
          }
        }
      }

      setTimeout(pollStatus, POLL_INTERVAL_MS)
    } catch (error) {
      console.error('启动抽取任务异常:', error)
      const errorMsg = error.response?.data?.message || error.message || '启动抽取任务失败'
      message.error({ content: errorMsg, key: 'extraction', duration: 5 })
    }
  }, [fetchPatientDocuments, loadTaskItems, patientId])

  const pollUploadArchiveTask = useCallback(async ({ documentId, fileName }) => {
    if (!documentId) return
    const startAt = Date.now()

    const writeTask = (stage, extra = {}) => {
      upsertTask({
        task_id: documentId,
        patient_id: patientId,
        document_id: documentId,
        file_name: fileName,
        type: 'upload_archive',
        status: toTaskStatus(stage),
        percentage: stage.percent,
        message: stage.message,
        updated_at: new Date().toISOString(),
        ...extra,
      })
      loadTaskItems()
    }

    try {
      while (Date.now() - startAt < MAX_UPLOAD_WAIT_MS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        let res
        try {
          res = await getFileStatusesByIds([documentId])
        } catch (err) {
          console.warn('查询文档状态失败，将重试:', err?.message)
          continue
        }

        const item = res?.data?.items?.[0] || res?.items?.[0]
        if (!item) continue

        const stage = getUploadStage(item.ocr_status, item.meta_status)
        writeTask(stage)
        if (stage.kind === 'success') {
          await syncPatientStatsAfterDocumentChange?.()
          fetchPatientDocuments?.()
          return
        }
        if (stage.kind === 'error') return
      }

      writeTask({ kind: 'error', percent: 99, message: '后台处理超时，请稍后在任务中心查看结果' })
    } catch (error) {
      writeTask({ kind: 'error', percent: 100, message: error?.message || '任务状态查询失败' })
    }
  }, [fetchPatientDocuments, loadTaskItems, patientId, syncPatientStatsAfterDocumentChange])

  useEffect(() => {
    loadTaskItems()
  }, [loadTaskItems])

  useEffect(() => {
    if (!taskCenterVisible || !patientId) return undefined
    let cancelled = false
    let timer = null

    const pollOnce = async () => {
      if (cancelled) return
      setTaskPolling(true)
      try {
        const list = getTasksByPatient(patientId) || []
        const updated = []
        for (const task of list) {
          if (TERMINAL_STATUSES.includes(task.status)) {
            updated.push(task)
            continue
          }

          try {
            const isUploadArchiveTask = task.type === 'upload_archive' || String(task.task_id || '').startsWith('upload_archive_')
            const res = isUploadArchiveTask
              ? await getDocumentTaskProgress(task.task_id, { silent: true })
              : await getExtractionTaskStatus(task.task_id)
            const data = res?.data
            if (data) {
              const merged = mergePolledTask(task, data, isUploadArchiveTask)
              upsertTask(merged)
              updated.push(merged)
            } else {
              updated.push(task)
            }
          } catch {
            updated.push(task)
          }
        }
        if (!cancelled) setTaskItems(updated)
      } finally {
        if (!cancelled) setTaskPolling(false)
      }
      timer = setTimeout(pollOnce, POLL_INTERVAL_MS)
    }

    pollOnce()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [patientId, taskCenterVisible])

  return {
    handleReExtract,
    loadTaskItems,
    pollUploadArchiveTask,
    setTaskCenterVisible,
    taskCenterVisible,
    taskItems,
    taskPolling,
  }
}
