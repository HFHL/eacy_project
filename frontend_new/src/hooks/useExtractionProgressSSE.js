import { useCallback, useEffect, useRef, useState } from 'react'
import { getAdminExtractionTaskEvents } from '../api/admin'

const TERMINAL_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled', 'succeeded'])

export default function useExtractionProgressSSE(taskId, { enabled = true, intervalMs = 2000 } = {}) {
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState('idle')
  const [error] = useState(null)
  const [terminal, setTerminal] = useState(false)
  const lastEventIdRef = useRef(null)

  const reset = useCallback(() => {
    lastEventIdRef.current = null
    setEvents([])
    setStatus('idle')
    setTerminal(false)
  }, [])

  useEffect(() => {
    reset()
  }, [taskId, reset])

  useEffect(() => {
    if (!enabled || !taskId || terminal) return undefined

    let cancelled = false

    const fetchEvents = async () => {
      setStatus((current) => (current === 'idle' ? 'connecting' : current))
      try {
        const params = lastEventIdRef.current ? { after_id: lastEventIdRef.current } : {}
        const res = await getAdminExtractionTaskEvents(taskId, params)
        if (cancelled) return
        const nextEvents = Array.isArray(res?.data) ? res.data : []
        if (nextEvents.length > 0) {
          lastEventIdRef.current = nextEvents[nextEvents.length - 1].id
          setEvents((current) => {
            const seen = new Set(current.map((item) => item.id))
            return [...current, ...nextEvents.filter((item) => !seen.has(item.id))]
          })
          if (nextEvents.some((item) => TERMINAL_STATUSES.has(item.status))) {
            setTerminal(true)
            setStatus('closed')
            return
          }
        }
        setStatus('open')
      } catch (_) {
        if (!cancelled) setStatus('closed')
      }
    }

    fetchEvents()
    const timer = setInterval(fetchEvents, intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled, intervalMs, reset, taskId, terminal])

  return {
    events,
    lastEvent: events[events.length - 1] || null,
    status,
    error,
    terminal,
    reset,
  }
}
