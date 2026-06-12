import { useCallback, useEffect } from 'react'

import { appThemeToken } from '../../../styles/themeTokens'
import { TYPE_COLORS } from './constants'

export const useHighlightCanvas = ({
  activeBlockIndex,
  canvasRef,
  contentList,
  currentPageBlocks,
  hoveredBlockIndex,
  imageLoaded,
  imageRef,
  imageSize,
  pageIndex,
  renderScale,
  sensitiveRegions,
  showAllBoxes,
}) => {
  const drawHighlightBoxes = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !imageLoaded) return

    const ctx = canvas.getContext('2d')
    const { width, height } = imageSize
    canvas.width = width * renderScale
    canvas.height = height * renderScale
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const scaleX = (width * renderScale) / 1000
    const scaleY = (height * renderScale) / 1000

    if (showAllBoxes) {
      currentPageBlocks.forEach((block) => {
        const globalIdx = contentList.findIndex((item) => item === block)
        if (globalIdx === hoveredBlockIndex || globalIdx === activeBlockIndex) return
        const bbox = block.bbox
        if (!bbox || bbox.length !== 4) return

        const [x1, y1, x2, y2] = bbox
        ctx.strokeStyle = TYPE_COLORS[block.type] || appThemeToken.colorTextTertiary
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.3
        ctx.strokeRect(
          x1 * scaleX,
          y1 * scaleY,
          (x2 - x1) * scaleX,
          (y2 - y1) * scaleY,
        )
      })
    }

    const highlightIndex = hoveredBlockIndex !== null ? hoveredBlockIndex : activeBlockIndex
    if (highlightIndex !== null) {
      const block = contentList[highlightIndex]
      if (block && block.page_idx === pageIndex) {
        const bbox = block.bbox
        if (bbox && bbox.length === 4) {
          const [x1, y1, x2, y2] = bbox
          const x = x1 * scaleX
          const y = y1 * scaleY
          const w = (x2 - x1) * scaleX
          const h = (y2 - y1) * scaleY

          ctx.globalAlpha = 0.15
          ctx.fillStyle = TYPE_COLORS[block.type] || appThemeToken.colorPrimary
          ctx.fillRect(x, y, w, h)

          ctx.globalAlpha = 1
          ctx.strokeStyle = TYPE_COLORS[block.type] || appThemeToken.colorPrimary
          ctx.lineWidth = 2
          ctx.strokeRect(x, y, w, h)

          ctx.fillStyle = TYPE_COLORS[block.type] || appThemeToken.colorPrimary
          ctx.fillRect(x, y - 20, 60, 20)
          ctx.fillStyle = appThemeToken.colorBgContainer
          ctx.font = '12px sans-serif'
          ctx.fillText(`#${highlightIndex + 1}`, x + 4, y - 6)
        }
      }
    }

    if (sensitiveRegions && sensitiveRegions.length > 0) {
      const pageRegions = sensitiveRegions.filter((region) => region.page_idx === pageIndex)
      pageRegions.forEach((region) => {
        const bbox = region.bbox
        if (!bbox || bbox.length !== 4) return
        const [rx1, ry1, rx2, ry2] = bbox
        ctx.globalAlpha = 1
        ctx.fillStyle = 'rgb(0, 0, 0)'
        ctx.fillRect(
          rx1 * scaleX,
          ry1 * scaleY,
          (rx2 - rx1) * scaleX,
          (ry2 - ry1) * scaleY,
        )
      })
    }

    ctx.globalAlpha = 1
  }, [
    activeBlockIndex,
    canvasRef,
    contentList,
    currentPageBlocks,
    hoveredBlockIndex,
    imageLoaded,
    imageRef,
    imageSize,
    pageIndex,
    renderScale,
    sensitiveRegions,
    showAllBoxes,
  ])

  useEffect(() => {
    drawHighlightBoxes()
  }, [drawHighlightBoxes])
}
