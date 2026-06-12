import { useCallback, useEffect, useRef, useState } from 'react'

import { getActiveTasks, getDashboardStats } from '../../../api/stats'
import { toNumber } from '../utils'

const emptyTaskPayload = {
  tasks: [],
  total: 0,
  active_count: 0,
  summary_by_status: {},
  summary_by_category: {},
}

export const useDashboardData = () => {
  const dashboardTimerRef = useRef(null)
  const taskTimerRef = useRef(null)
  const [dashboard, setDashboard] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskPayload, setTaskPayload] = useState(emptyTaskPayload)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)

  const fetchDashboard = useCallback(async () => {
    setDashboardLoading(true)
    try {
      const statsRes = await getDashboardStats()
      setDashboard(statsRes?.success ? statsRes.data : null)
      setLastRefreshedAt(new Date())
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error)
      setDashboard(null)
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  const fetchActiveTasks = useCallback(async () => {
    setTaskLoading(true)
    try {
      const res = await getActiveTasks()
      if (res?.success && res?.data) {
        setTaskPayload({
          tasks: res.data.tasks || [],
          total: res.data.total || 0,
          active_count: res.data.active_count || 0,
          summary_by_status: res.data.summary_by_status || {},
          summary_by_category: res.data.summary_by_category || {},
        })
      } else {
        setTaskPayload(emptyTaskPayload)
      }
    } catch (error) {
      console.error('Failed to fetch active tasks:', error)
      setTaskPayload(emptyTaskPayload)
    } finally {
      setTaskLoading(false)
    }
  }, [])

  const refreshAll = useCallback(() => {
    fetchDashboard()
    fetchActiveTasks()
  }, [fetchDashboard, fetchActiveTasks])

  useEffect(() => {
    refreshAll()
    if (dashboardTimerRef.current) clearInterval(dashboardTimerRef.current)
    dashboardTimerRef.current = setInterval(fetchDashboard, 60000)
    return () => {
      if (dashboardTimerRef.current) clearInterval(dashboardTimerRef.current)
    }
  }, [fetchDashboard, refreshAll])

  useEffect(() => {
    if (taskTimerRef.current) clearInterval(taskTimerRef.current)
    const pollInterval = toNumber(taskPayload.active_count) > 0 ? 15000 : 45000
    taskTimerRef.current = setInterval(fetchActiveTasks, pollInterval)
    return () => {
      if (taskTimerRef.current) clearInterval(taskTimerRef.current)
    }
  }, [fetchActiveTasks, taskPayload.active_count])

  return {
    dashboard,
    dashboardLoading,
    fetchActiveTasks,
    fetchDashboard,
    lastRefreshedAt,
    refreshAll,
    taskLoading,
    taskPayload,
  }
}
