import { emptySuccess } from './_empty'

export const getDashboardStats = async () => emptySuccess({
  overview: {},
  documents: { task_status_counts: {} },
  patients: {},
  projects: { extraction_progress: [] },
  tasks: { active_tasks: [], recent_activities: [], project_extraction_summary: {} },
})

export const getActiveTasks = async () => emptySuccess([])

export default { getDashboardStats, getActiveTasks }
