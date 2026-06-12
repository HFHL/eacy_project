import { useMemo } from 'react'

import { DASHBOARD_COLORS, FLOW_STAGE_COLORS } from '../styleTokens'
import { isToday, sortByStatusAndTime, toNumber } from '../utils'

const statusOrder = {
  processing: 0,
  initializing: 0,
  pending: 1,
  failed: 2,
  completed_with_errors: 3,
  completed: 4,
  cancelled: 5,
}

export const useDashboardModel = ({
  dashboard,
  lastRefreshedAt,
  navigateToFileList,
  taskPayload,
}) => {
  const overview = dashboard?.overview || {}
  const activities = (dashboard?.activities?.recent || []).slice(0, 6)
  const queueTasks = dashboard?.tasks?.queue || []
  const taskStatusCounts = dashboard?.documents?.task_status_counts || {}
  const activeTasks = taskPayload.tasks || []
  const parseTasks = useMemo(
    () => sortByStatusAndTime(activeTasks.filter((task) => task.task_category === 'parse'), statusOrder),
    [activeTasks],
  )

  const patientProjectDistribution = useMemo(
    () => dashboard?.patients?.project_distribution || [],
    [dashboard?.patients?.project_distribution],
  )
  const patientCompletenessDistribution = useMemo(
    () => dashboard?.patients?.completeness_distribution || [],
    [dashboard?.patients?.completeness_distribution],
  )
  const patientConflictDistribution = useMemo(
    () => dashboard?.patients?.conflict_distribution || [],
    [dashboard?.patients?.conflict_distribution],
  )
  const projectStatusDistribution = useMemo(
    () => dashboard?.projects?.status_distribution || [],
    [dashboard?.projects?.status_distribution],
  )
  const projectEnrollmentProgress = useMemo(
    () => dashboard?.projects?.enrollment_progress || [],
    [dashboard?.projects?.enrollment_progress],
  )
  const projectExtractionProgress = useMemo(
    () => dashboard?.projects?.extraction_progress || [],
    [dashboard?.projects?.extraction_progress],
  )

  const flowStages = useMemo(() => {
    const uploading = 0
    const uploadFailed = 0
    const parseProcessing = ['uploaded', 'parsing', 'parsed', 'extracted', 'ai_matching']
      .reduce((sum, key) => sum + toNumber(taskStatusCounts[key]), 0)
    const parseFailed = toNumber(taskStatusCounts.parse_failed)
    const todoSegments = [
      {
        key: 'pending_confirm_new',
        label: '需新建患者',
        value: toNumber(taskStatusCounts.pending_confirm_new),
        color: FLOW_STAGE_COLORS.todo,
        onClick: () => navigateToFileList({ tab: 'todo', statusInfo: ['pending_new'] }),
      },
      {
        key: 'pending_confirm_review',
        label: '自动推荐匹配',
        value: toNumber(taskStatusCounts.pending_confirm_review),
        color: DASHBOARD_COLORS.warning,
        onClick: () => navigateToFileList({ tab: 'todo', statusInfo: ['has_recommendation'] }),
      },
      {
        key: 'pending_confirm_uncertain',
        label: '多候选待确认',
        value: toNumber(taskStatusCounts.pending_confirm_uncertain),
        color: DASHBOARD_COLORS.warning,
        onClick: () => navigateToFileList({ tab: 'todo', statusInfo: ['has_recommendation'] }),
      },
      {
        key: 'auto_archived',
        label: '高置信推荐',
        value: toNumber(taskStatusCounts.auto_archived),
        color: DASHBOARD_COLORS.success,
        onClick: () => navigateToFileList({ tab: 'todo', statusInfo: ['has_recommendation'] }),
      },
    ]
    const todoTotal = todoSegments.reduce((sum, item) => sum + item.value, 0)
    const archived = toNumber(taskStatusCounts.archived)

    return [
      {
        key: 'upload',
        label: '上传',
        total: uploading + uploadFailed,
        color: FLOW_STAGE_COLORS.upload,
        helper: '文件上传 / 失败重试',
        onClick: () => navigateToFileList({ tab: 'all', openUpload: true }),
        segments: [
          {
            key: 'uploading',
            label: '上传中',
            value: uploading,
            color: DASHBOARD_COLORS.primary,
            onClick: () => navigateToFileList({ tab: 'all', statusInfo: ['uploading'] }),
          },
          {
            key: 'upload_failed',
            label: '上传失败',
            value: uploadFailed,
            color: DASHBOARD_COLORS.error,
            onClick: () => navigateToFileList({ tab: 'all', openUpload: true }),
          },
        ],
      },
      {
        key: 'parse',
        label: '解析 / 抽取',
        total: parseProcessing + parseFailed,
        color: FLOW_STAGE_COLORS.parse,
        helper: '解析失败 / 处理中',
        onClick: () => navigateToFileList({ tab: 'parse' }),
        segments: [
          {
            key: 'parse_processing',
            label: '解析中',
            value: parseProcessing,
            color: FLOW_STAGE_COLORS.parse,
            onClick: () => navigateToFileList({ tab: 'parse', taskStatus: ['processing'] }),
          },
          {
            key: 'parse_failed',
            label: '解析失败',
            value: parseFailed,
            color: DASHBOARD_COLORS.error,
            onClick: () => navigateToFileList({ tab: 'parse', statusInfo: ['parse_failed'] }),
          },
        ],
      },
      {
        key: 'todo',
        label: '匹配待确认',
        total: todoTotal,
        color: FLOW_STAGE_COLORS.todo,
        helper: '待归档 / 待确认',
        onClick: () => navigateToFileList({ tab: 'todo' }),
        segments: todoSegments,
      },
      {
        key: 'archived',
        label: '已归档',
        total: archived,
        color: FLOW_STAGE_COLORS.archived,
        helper: '已完成归档',
        onClick: () => navigateToFileList({ tab: 'archived' }),
        segments: [
          {
            key: 'archived_total',
            label: '已归档',
            value: archived,
            color: DASHBOARD_COLORS.success,
            onClick: () => navigateToFileList({ tab: 'archived' }),
          },
        ],
      },
    ]
  }, [navigateToFileList, taskStatusCounts])

  const notifications = useMemo(() => {
    const items = []
    queueTasks.forEach((item) => {
      const status = item.task_status
      if (status === 'parse_failed') {
        items.push({
          key: `doc-failed-${item.document_id}`,
          title: '文档解析失败',
          description: item.file_name || '未命名文档',
          created_at: item.created_at,
          kind: 'document_failed',
          tagLabel: '解析失败',
          tagColor: 'error',
          color: DASHBOARD_COLORS.error,
        })
      } else if (['pending_confirm_new', 'pending_confirm_review', 'pending_confirm_uncertain', 'auto_archived'].includes(status)) {
        items.push({
          key: `doc-todo-${item.document_id}`,
          title: '文档待归档确认',
          description: item.file_name || '未命名文档',
          created_at: item.created_at,
          kind: 'document_todo',
          tagLabel: '待归档',
          tagColor: 'processing',
          color: FLOW_STAGE_COLORS.todo,
        })
      }
    })

    if (toNumber(overview.pending_field_conflicts) > 0) {
      items.push({
        key: 'patient-conflict',
        title: '患者字段冲突待处理',
        description: `${toNumber(overview.pending_field_conflicts)} 条冲突待解决`,
        created_at: lastRefreshedAt?.toISOString(),
        kind: 'patient_conflict',
        tagLabel: '字段冲突',
        tagColor: 'warning',
        color: DASHBOARD_COLORS.warning,
      })
    }

    parseTasks.forEach((task) => {
      items.push({
        key: `project-task-${task.task_id}`,
        title: task.status === 'failed' ? '项目抽取任务失败' : '项目抽取任务更新',
        description: task.file_name || task.current_step || task.message || 'CRF 抽取任务',
        created_at: task.updated_at || task.created_at,
        kind: 'project_task',
        projectId: task.project_id,
        tagLabel: task.status === 'failed' ? '抽取失败' : '抽取更新',
        tagColor: task.status === 'failed' ? 'error' : 'processing',
        color: task.status === 'failed' ? DASHBOARD_COLORS.error : DASHBOARD_COLORS.primary,
      })
    })

    return items
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 6)
  }, [lastRefreshedAt, overview.pending_field_conflicts, parseTasks, queueTasks])

  const extractionSummary = dashboard?.tasks?.project_extraction_summary || {}
  const taskTodayCount = toNumber(extractionSummary.today)
    || parseTasks.filter((task) => isToday(task.created_at || task.updated_at)).length

  return {
    activities,
    extractionSummary,
    flowStages,
    notifications,
    overview,
    parseTasks,
    patientCompletenessDistribution,
    patientConflictDistribution,
    patientProjectDistribution,
    projectEnrollmentProgress,
    projectExtractionProgress,
    projectStatusDistribution,
    taskTodayCount,
  }
}
