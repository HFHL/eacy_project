const ok = (data = null, message = '本地模式') =>
  Promise.resolve({ success: true, code: 0, message, data })

export const getDashboardStats = () =>
  ok({ overview: {}, documents: {}, patients: {} })

export const getActiveTasks = () => ok({ tasks: [], total: 0, active_count: 0 })

export default {
  getDashboardStats,
  getActiveTasks
}
