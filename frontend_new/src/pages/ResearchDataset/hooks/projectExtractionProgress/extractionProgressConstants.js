export const TERMINAL_STATUSES = new Set([
  'completed',
  'completed_with_errors',
  'completed_with_empty',
  'failed',
  'timeout',
  'cancelled',
  'succeeded',
  'succeeded_empty',
])

export const ACTIVE_POLL_STATUSES = new Set(['submitting', 'queued', 'running', 'pending'])

export const MODE_LABELS = {
  incremental: '增量抽取',
  full: '全量重抽',
}
