import { useEffect, useLayoutEffect, useState } from 'react'

export const useMeasuredContainerWidth = (containerRef) => {
  const [containerWidth, setContainerWidth] = useState(0)

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const width = containerRef.current.getBoundingClientRect().width
    if (width > 0) setContainerWidth(width)
  }, [containerRef])

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width
      if (width > 0) setContainerWidth(width)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [containerRef])

  return containerWidth
}
