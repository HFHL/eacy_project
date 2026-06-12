import { useCallback, useRef, useState } from 'react'
import {
  DEFAULT_LEFT_PANEL_WIDTH,
  LEFT_PANEL_WIDTH_KEY,
  RIGHT_PANEL_WIDTH_KEY,
  clampLeftPanelWidth,
  clampRightPanelWidth,
  getDefaultRightPanelWidth,
  safeStorageGet,
  safeStorageSet,
} from './layoutSizing'

export function useSchemaPanelResize({ siderWidth, sourcePanelWidth, leftCollapsed }) {
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const saved = safeStorageGet(LEFT_PANEL_WIDTH_KEY)
    if (saved) {
      const width = parseInt(saved, 10)
      if (!Number.isNaN(width)) return clampLeftPanelWidth(width)
    }
    return clampLeftPanelWidth(siderWidth || DEFAULT_LEFT_PANEL_WIDTH)
  })

  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const saved = safeStorageGet(RIGHT_PANEL_WIDTH_KEY)
    if (saved) {
      const width = parseInt(saved, 10)
      if (!Number.isNaN(width)) return clampRightPanelWidth(width)
    }
    return clampRightPanelWidth(sourcePanelWidth ?? getDefaultRightPanelWidth())
  })

  const rightPanelResizeStart = useRef({ x: 0, w: 0 })
  const rightPanelLastWidthRef = useRef(rightPanelWidth)
  const leftPanelLastWidthRef = useRef(leftPanelWidth)
  const leftPanelResizeStart = useRef({ x: 0, w: 0 })
  const [isLeftPanelResizing, setIsLeftPanelResizing] = useState(false)
  const [isRightPanelResizing, setIsRightPanelResizing] = useState(false)

  const handleLeftPanelResizeStart = useCallback((event) => {
    if (leftCollapsed) return
    event.preventDefault()
    setIsLeftPanelResizing(true)
    leftPanelResizeStart.current = { x: event.clientX, w: leftPanelWidth }

    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - leftPanelResizeStart.current.x
      const nextWidth = clampLeftPanelWidth(leftPanelResizeStart.current.w + delta)
      leftPanelLastWidthRef.current = nextWidth
      setLeftPanelWidth(nextWidth)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setIsLeftPanelResizing(false)
      safeStorageSet(LEFT_PANEL_WIDTH_KEY, String(leftPanelLastWidthRef.current))
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [leftCollapsed, leftPanelWidth])

  const handleRightPanelResizeStart = useCallback((event) => {
    event.preventDefault()
    setIsRightPanelResizing(true)
    rightPanelResizeStart.current = { x: event.clientX, w: rightPanelWidth }

    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - rightPanelResizeStart.current.x
      const nextWidth = clampRightPanelWidth(rightPanelResizeStart.current.w - delta)
      rightPanelLastWidthRef.current = nextWidth
      setRightPanelWidth(nextWidth)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setIsRightPanelResizing(false)
      safeStorageSet(RIGHT_PANEL_WIDTH_KEY, String(rightPanelLastWidthRef.current))
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [rightPanelWidth])

  return {
    handleLeftPanelResizeStart,
    handleRightPanelResizeStart,
    isLeftPanelResizing,
    isRightPanelResizing,
    leftPanelWidth,
    rightPanelWidth,
  }
}
