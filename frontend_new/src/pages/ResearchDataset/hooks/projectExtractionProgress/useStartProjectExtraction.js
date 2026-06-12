import { useCallback } from 'react'
import { message } from 'antd'

import {
  getCrfExtractionProgress,
  updateProjectCrfFolder,
  updateProjectCrfFolderBatch,
} from '../../../../api/project'
import { MODE_LABELS } from './extractionProgressConstants'
import {
  buildPatientStatuses,
  resolveScopePatients,
} from './extractionProgressModel'

export function useStartProjectExtraction({
  applyTaskProgress,
  onTasksFinished,
  patientDataset,
  projectId,
  removeTask,
  setIsProgressCardDismissed,
  setPrimaryTaskId,
  upsertTask,
}) {
  return useCallback(async ({
    patientIds = null,
    mode = 'incremental',
    targetGroups = null,
  } = {}) => {
    if (!projectId) {
      message.error('缺少项目 ID')
      return null
    }

    const targetFormKeys = Array.isArray(targetGroups) && targetGroups.length > 0
      ? targetGroups.filter(Boolean)
      : null
    const {
      normalizedIds,
      projectPatientIds,
      labelsByPatientId,
      scopeLabel,
    } = resolveScopePatients(patientDataset, patientIds)
    const pendingId = `pending-${Date.now()}`
    const patientIdList = normalizedIds || Object.keys(labelsByPatientId)
    const modeLabel = MODE_LABELS[mode] || '抽取'

    setIsProgressCardDismissed(false)
    setPrimaryTaskId(pendingId)
    upsertTask(pendingId, {
      phase: 'submitting',
      status: 'submitting',
      progress: 5,
      mode,
      modeLabel,
      scopeLabel,
      patientIds: patientIdList,
      labelsByPatientId,
      current_step: '正在提交抽取任务…',
      submitted_jobs: 0,
      total_patients: patientIdList.length || patientDataset.length,
      processed_patients: 0,
      patientStatuses: buildPatientStatuses(patientIdList, labelsByPatientId, {}),
      startedAt: Date.now(),
    })

    message.loading({
      key: 'project-crf-extract-submit',
      content: `${scopeLabel} · ${modeLabel}：正在提交…`,
      duration: 0,
    })

    try {
      const response = projectPatientIds.length === 1
        ? await updateProjectCrfFolder(projectId, projectPatientIds[0], { targetFormKeys, mode })
        : await updateProjectCrfFolderBatch(
          projectId,
          projectPatientIds.length > 0 ? projectPatientIds : null,
          { targetFormKeys, mode },
        )

      message.destroy('project-crf-extract-submit')

      if (!response.success) {
        removeTask(pendingId)
        setPrimaryTaskId(null)
        message.error(response.message || '启动抽取任务失败')
        return null
      }

      const data = response.data || {}
      const createdJobs = Number(data.submitted_jobs || data.created_jobs || 0)
      const taskId = data.task_id || data.batch_id || data.job_ids?.[0] || ''

      removeTask(pendingId)
      if (!taskId) {
        setPrimaryTaskId(null)
        message.info(createdJobs > 0 ? `已提交 ${createdJobs} 个抽取任务` : '暂无可提交的抽取任务')
        onTasksFinished?.()
        return null
      }

      setPrimaryTaskId(taskId)
      upsertTask(taskId, {
        phase: createdJobs > 0 ? 'queued' : 'completed',
        status: createdJobs > 0 ? 'running' : 'completed',
        progress: createdJobs > 0 ? 12 : 100,
        mode,
        modeLabel,
        scopeLabel,
        patientIds: patientIdList,
        labelsByPatientId,
        current_step: createdJobs > 0 ? '已进入队列，等待 Worker 执行' : '无需新建抽取任务',
        submitted_jobs: createdJobs,
        total_patients: patientIdList.length || Number(data.total_items || 0),
        processed_patients: 0,
        patientStatuses: buildPatientStatuses(patientIdList, labelsByPatientId, {
          status: createdJobs > 0 ? 'running' : 'completed',
          progress: createdJobs > 0 ? 12 : 100,
          label: createdJobs > 0 ? '排队中' : '已完成',
        }),
        startedAt: Date.now(),
      })

      message.success({
        key: 'project-crf-extract-submit',
        content: createdJobs > 0
          ? `${scopeLabel} · 已提交 ${createdJobs} 个任务，已进入队列`
          : `${scopeLabel} · 暂无可提交任务`,
      })

      const firstPoll = await getCrfExtractionProgress(projectId, taskId)
      if (firstPoll.success) applyTaskProgress(taskId, firstPoll.data)
      return taskId
    } catch (error) {
      message.destroy('project-crf-extract-submit')
      removeTask(pendingId)
      setPrimaryTaskId(null)
      console.error('启动抽取任务失败:', error)
      message.error('启动抽取任务失败')
      return null
    }
  }, [
    applyTaskProgress,
    onTasksFinished,
    patientDataset,
    projectId,
    removeTask,
    setIsProgressCardDismissed,
    setPrimaryTaskId,
    upsertTask,
  ])
}
