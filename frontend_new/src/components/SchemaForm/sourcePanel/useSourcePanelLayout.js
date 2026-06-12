import { useCallback, useRef, useState } from 'react'

const FALLBACK_VIEWPORT_WIDTH = 1440

const getWindowWidth = () => (typeof window !== 'undefined' ? window.innerWidth : FALLBACK_VIEWPORT_WIDTH)
const getWindowHeight = () => (typeof window !== 'undefined' ? window.innerHeight : 900)

const safeStorageGet = (key) => {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeStorageSet = (key, value) => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore storage failures in restricted browser modes
  }
}

export function useSourcePanelLayout({ contentAdaptive, isPinned, width }) {
  const [floatingWidth, setFloatingWidth] = useState(() => {
    const saved = safeStorageGet('sourcePanelFloatingWidth')
    return saved ? parseInt(saved, 10) : Math.round(getWindowWidth() * 0.3)
  })
  const [floatingPos, setFloatingPos] = useState(() => {
    const saved = safeStorageGet('sourcePanelFloatingPos')
    if (saved) {
      try { return JSON.parse(saved) } catch { /* ignore */ }
    }
    return { x: null, y: 0 }
  })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const handlePanelDragStart = useCallback((e) => {
    if (isPinned) return
    e.preventDefault()
    setIsDragging(true)
    const panelEl = dragRef.current?.closest?.('[data-source-panel]') || dragRef.current?.parentElement
    if (!panelEl) return
    const rect = panelEl.getBoundingClientRect()
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }

    const onMouseMove = (ev) => {
      ev.preventDefault()
      const newX = Math.max(0, Math.min(getWindowWidth() - 200, ev.clientX - dragOffsetRef.current.x))
      const newY = Math.max(0, Math.min(getWindowHeight() - 100, ev.clientY - dragOffsetRef.current.y))
      setFloatingPos({ x: newX, y: newY })
    }
    const onMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'auto'
      setFloatingPos((pos) => {
        safeStorageSet('sourcePanelFloatingPos', JSON.stringify(pos))
        return pos
      })
    }
    document.body.style.cursor = 'move'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [isPinned])

  const handleWidthDragStart = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = floatingWidth
    const startPosX = floatingPos.x !== null ? floatingPos.x : (getWindowWidth() - floatingWidth)
    const onMouseMove = (ev) => {
      const maxWidth = Math.round(getWindowWidth() * 0.75)
      const delta = startX - ev.clientX
      const newWidth = Math.min(Math.max(startWidth + delta, 300), maxWidth)
      setFloatingWidth(newWidth)
      const newPosX = Math.max(0, startPosX - (newWidth - startWidth))
      setFloatingPos((prev) => ({ ...prev, x: newPosX }))
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'auto'
      setFloatingWidth((w) => {
        safeStorageSet('sourcePanelFloatingWidth', String(w))
        return w
      })
      setFloatingPos((pos) => {
        safeStorageSet('sourcePanelFloatingPos', JSON.stringify(pos))
        return pos
      })
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [floatingWidth, floatingPos.x])

  const effectivePanelWidth = isPinned ? width : floatingWidth
  const floatingLeft = floatingPos.x !== null ? floatingPos.x : (getWindowWidth() - floatingWidth)
  const floatingTop = floatingPos.y || 0
  const panelStyle = isPinned
    ? (contentAdaptive
        ? {
            width,
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            position: 'sticky',
            top: 56,
            alignSelf: 'flex-start',
            maxHeight: 'calc(100vh - 56px)',
            overflow: 'hidden',
            zIndex: 1,
          }
        : {
            width,
            height: '100%',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          })
    : {
        position: 'fixed',
        left: floatingLeft,
        top: floatingTop,
        width: floatingWidth,
        height: `calc(100vh - ${floatingTop}px)`,
        background: '#fff',
        borderRadius: '8px 0 0 8px',
        boxShadow: isDragging ? '0 8px 32px rgba(0, 0, 0, 0.25)' : '-4px 0 20px rgba(0, 0, 0, 0.12)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: isDragging ? 'none' : 'box-shadow 0.3s ease',
      }

  return {
    dragRef,
    effectivePanelWidth,
    handlePanelDragStart,
    handleWidthDragStart,
    panelStyle,
  }
}
