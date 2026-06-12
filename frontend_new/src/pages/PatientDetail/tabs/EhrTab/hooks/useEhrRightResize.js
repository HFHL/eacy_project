import { useCallback } from 'react'

export const useEhrRightResize = ({
  ehrRightWidth,
  setEhrRightWidth,
}) => useCallback((event) => {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = ehrRightWidth

  const handleMouseMove = (moveEvent) => {
    moveEvent.preventDefault()
    const delta = startX - moveEvent.clientX
    const maxWidth = Math.round(window.innerWidth * 0.5)
    const newWidth = Math.max(280, Math.min(maxWidth, startWidth + delta))
    setEhrRightWidth(newWidth)
  }

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'default'
    document.body.style.userSelect = 'auto'
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}, [ehrRightWidth, setEhrRightWidth])
