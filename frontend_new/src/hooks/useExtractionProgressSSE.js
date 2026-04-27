import { useCallback, useState } from 'react'

export default function useExtractionProgressSSE() {
  const [events] = useState([])
  const [status] = useState('idle')
  const [error] = useState(null)
  const [terminal] = useState(false)
  const reset = useCallback(() => {}, [])

  return {
    events,
    lastEvent: null,
    status,
    error,
    terminal,
    reset,
  }
}
