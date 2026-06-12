import {
  DEFAULT_COLUMN_FILTERS,
  STAGE_TO_TASK_STATUSES,
  STATUS_INFO_OPTIONS,
  STATUS_OPTIONS,
  TASK_STATUS_TO_STAGE,
} from './constants'

export const getRouteStateFromSearchParams = (searchParams) => {
  const validTabs = new Set(['all', 'parse', 'todo', 'archived'])
  const validViews = new Set(['patient', 'table'])
  const validTaskStatuses = new Set(STATUS_OPTIONS.map((item) => item.value))
  const validStatusInfo = new Set(STATUS_INFO_OPTIONS.map((item) => item.value))

  const tabParam = searchParams.get('tab')
  const tab = validTabs.has(tabParam) ? tabParam : 'all'
  const viewParam = searchParams.get('view')
  const view = validViews.has(viewParam) ? viewParam : 'patient'
  const filters = {
    ...DEFAULT_COLUMN_FILTERS,
    fileName: searchParams.get('q') || '',
    taskStatus: normalizeTaskStatusFilters(
      (searchParams.get('taskStatus') || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    ).filter((item) => validTaskStatuses.has(item)),
    statusInfo: (searchParams.get('statusInfo') || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => validStatusInfo.has(item)),
  }

  return { tab, view, filters }
}

export const getRouteStateSignature = (routeState) => JSON.stringify({
  tab: routeState.tab,
  view: routeState.view,
  fileName: routeState.filters.fileName || '',
  taskStatus: routeState.filters.taskStatus || [],
  statusInfo: routeState.filters.statusInfo || [],
})

export const mapTaskStatusToStage = (status) => TASK_STATUS_TO_STAGE[status] || null

export const normalizeTaskStatusFilters = (values = []) =>
  Array.from(new Set(
    values
      .map((value) => {
        if (STAGE_TO_TASK_STATUSES[value]) return value
        return mapTaskStatusToStage(value)
      })
      .filter(Boolean)
  ))

export const toggleFilterValues = (currentValues = [], targets = [], checked = true) => {
  const next = new Set(currentValues)
  targets.forEach((target) => {
    if (checked) next.add(target)
    else next.delete(target)
  })
  return Array.from(next)
}
