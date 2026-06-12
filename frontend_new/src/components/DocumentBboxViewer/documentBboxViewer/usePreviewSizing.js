import { useEffect, useState } from 'react'

import { PREVIEW_HORIZONTAL_PADDING } from './constants'

export const usePreviewSizing = ({ containerRef, imageSize, scale }) => {
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const updateWidth = () => {
      setContainerWidth(container.clientWidth || 0)
    }
    updateWidth()

    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateWidth)
      observer.observe(container)
    } else {
      window.addEventListener('resize', updateWidth)
    }

    return () => {
      if (observer) observer.disconnect()
      else window.removeEventListener('resize', updateWidth)
    }
  }, [containerRef])

  const fitScale = imageSize.width > 0
    ? Math.max((Math.max(containerWidth - PREVIEW_HORIZONTAL_PADDING, 1) / imageSize.width), 0.01)
    : 1
  const renderScale = fitScale * scale

  return { containerWidth, renderScale }
}
