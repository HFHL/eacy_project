import { useEffect, useRef, useState } from 'react'

export const useProjectSectionHeight = () => {
  const projectSectionRef = useRef(null)
  const [projectSectionHeight, setProjectSectionHeight] = useState(null)

  useEffect(() => {
    if (!projectSectionRef.current || typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const nextHeight = Math.round(entry.contentRect.height)
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return
      setProjectSectionHeight((prev) => (prev === nextHeight ? prev : nextHeight))
    })
    observer.observe(projectSectionRef.current)
    return () => observer.disconnect()
  }, [])

  return { projectSectionHeight, projectSectionRef }
}
