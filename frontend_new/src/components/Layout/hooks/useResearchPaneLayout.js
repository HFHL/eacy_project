import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getDefaultResearchPaneHeight,
  isResearchPaneHeightRestorable,
  shouldAcceptResearchContainerHeight,
} from '../researchRailLayout'
import {
  RESEARCH_PANE_DEFAULT_HEIGHT,
  RESEARCH_PANE_MIN_HEIGHT,
  RESEARCH_PANE_STORED_MAX_HEIGHT,
  RESEARCH_SPLITTER_HANDLE_HEIGHT,
  RESEARCH_SPLITTER_STORAGE_KEY,
  RESEARCH_SPLITTER_USER_ADJUSTED_STORAGE_KEY,
  clampNumber,
} from '../layoutRailModel'

export const useResearchPaneLayout = ({
  activePrimaryNavKey,
  pathname,
  siderCollapsed,
}) => {
  const [researchProjectPaneHeight, setResearchProjectPaneHeight] = useState(null)
  const [researchRailContainerHeight, setResearchRailContainerHeight] = useState(0)
  const [isResearchSplitterDragging, setIsResearchSplitterDragging] = useState(false)
  const [hasUserAdjustedResearchPane, setHasUserAdjustedResearchPane] = useState(false)
  const [researchPanePreferenceHydrated, setResearchPanePreferenceHydrated] = useState(false)
  const researchRailContainerRef = useRef(null)

  const researchPaneBounds = useMemo(() => {
    if (!Number.isFinite(researchRailContainerHeight) || researchRailContainerHeight <= 0) {
      return { min: RESEARCH_PANE_MIN_HEIGHT, max: RESEARCH_PANE_DEFAULT_HEIGHT, total: 0 }
    }
    const min = RESEARCH_PANE_MIN_HEIGHT
    const max = Math.max(min, researchRailContainerHeight - RESEARCH_SPLITTER_HANDLE_HEIGHT - min)
    return { min, max, total: researchRailContainerHeight }
  }, [researchRailContainerHeight])

  const handleResearchSplitterMouseDown = useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()
    setIsResearchSplitterDragging(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const hasUserAdjusted = window.localStorage.getItem(RESEARCH_SPLITTER_USER_ADJUSTED_STORAGE_KEY) === '1'
    const stored = Number(window.localStorage.getItem(RESEARCH_SPLITTER_STORAGE_KEY))
    if (isResearchPaneHeightRestorable({
      storedHeight: stored,
      hasUserAdjusted,
      minPaneHeight: RESEARCH_PANE_MIN_HEIGHT,
      maxStoredHeight: RESEARCH_PANE_STORED_MAX_HEIGHT,
    })) {
      setHasUserAdjustedResearchPane(true)
      setResearchProjectPaneHeight(stored)
    }
    setResearchPanePreferenceHydrated(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (activePrimaryNavKey !== 'research' || siderCollapsed) return undefined

    const container = researchRailContainerRef.current
    if (!container) return undefined

    const updateHeight = () => {
      const rawHeight = Number(container.clientHeight || 0)
      const minContainerHeight = RESEARCH_PANE_MIN_HEIGHT * 2 + RESEARCH_SPLITTER_HANDLE_HEIGHT
      if (!shouldAcceptResearchContainerHeight({ rawHeight, minContainerHeight })) return
      const viewportCap = Math.max(400, Number(window.innerHeight || 0))
      const normalizedHeight = clampNumber(rawHeight, minContainerHeight, viewportCap)
      setResearchRailContainerHeight(normalizedHeight)
    }

    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight)
      return () => {
        window.removeEventListener('resize', updateHeight)
      }
    }

    const observer = new ResizeObserver(() => updateHeight())
    observer.observe(container)
    return () => observer.disconnect()
  }, [activePrimaryNavKey, pathname, siderCollapsed])

  useEffect(() => {
    if (!researchPaneBounds.total) return
    if (!hasUserAdjustedResearchPane) return
    setResearchProjectPaneHeight((current) => clampNumber(current, researchPaneBounds.min, researchPaneBounds.max))
  }, [hasUserAdjustedResearchPane, researchPaneBounds])

  useEffect(() => {
    if (!isResearchSplitterDragging) return undefined

    const handleMouseMove = (event) => {
      const container = researchRailContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const nextHeight = event.clientY - rect.top
      setHasUserAdjustedResearchPane(true)
      setResearchProjectPaneHeight(clampNumber(nextHeight, researchPaneBounds.min, researchPaneBounds.max))
    }

    const handleMouseUp = () => {
      setIsResearchSplitterDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResearchSplitterDragging, researchPaneBounds.max, researchPaneBounds.min])

  useEffect(() => {
    if (!researchPanePreferenceHydrated) return
    if (typeof window === 'undefined') return
    if (!hasUserAdjustedResearchPane) {
      window.localStorage.removeItem(RESEARCH_SPLITTER_STORAGE_KEY)
      window.localStorage.removeItem(RESEARCH_SPLITTER_USER_ADJUSTED_STORAGE_KEY)
      return
    }
    if (!Number.isFinite(researchProjectPaneHeight)) return
    if (researchProjectPaneHeight < RESEARCH_PANE_MIN_HEIGHT || researchProjectPaneHeight > RESEARCH_PANE_STORED_MAX_HEIGHT) return
    window.localStorage.setItem(RESEARCH_SPLITTER_STORAGE_KEY, String(Math.round(researchProjectPaneHeight)))
    window.localStorage.setItem(RESEARCH_SPLITTER_USER_ADJUSTED_STORAGE_KEY, '1')
  }, [hasUserAdjustedResearchPane, researchPanePreferenceHydrated, researchProjectPaneHeight])

  const projectPaneHeight = researchPaneBounds.total
    ? clampNumber(
        hasUserAdjustedResearchPane && Number.isFinite(researchProjectPaneHeight)
          ? researchProjectPaneHeight
          : getDefaultResearchPaneHeight({
              totalHeight: researchPaneBounds.total,
              minPaneHeight: researchPaneBounds.min,
              splitterHeight: RESEARCH_SPLITTER_HANDLE_HEIGHT,
            }),
        researchPaneBounds.min,
        researchPaneBounds.max
      )
    : null

  const templatePaneHeight = researchPaneBounds.total && Number.isFinite(projectPaneHeight)
    ? Math.max(
        RESEARCH_PANE_MIN_HEIGHT,
        researchPaneBounds.total - projectPaneHeight - RESEARCH_SPLITTER_HANDLE_HEIGHT
      )
    : null

  return {
    handleResearchSplitterMouseDown,
    isResearchSplitterDragging,
    projectPaneHeight,
    researchRailContainerRef,
    templatePaneHeight,
  }
}
