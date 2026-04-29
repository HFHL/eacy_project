import request from './request'
import { emptySuccess } from './_empty'

export const getDashboardStats = async () => {
  const payload = await request.get('/dashboard/stats')
  return emptySuccess({
    overview: payload?.overview || {},
    documents: {
      task_status_counts: {},
      ...(payload?.documents || {}),
    },
    patients: payload?.patients || {},
    projects: {
      extraction_progress: [],
      ...(payload?.projects || {}),
    },
    tasks: {
      active_tasks: [],
      recent_activities: [],
      project_extraction_summary: {},
      ...(payload?.tasks || {}),
    },
    activities: payload?.activities || { recent: [] },
  })
}

export const getActiveTasks = async () => {
  const payload = await request.get('/dashboard/active-tasks')
  return emptySuccess({
    tasks: payload?.tasks || [],
    total: payload?.total || 0,
    active_count: payload?.active_count || 0,
    summary_by_status: payload?.summary_by_status || {},
    summary_by_category: payload?.summary_by_category || {},
  })
}

export default { getDashboardStats, getActiveTasks }
