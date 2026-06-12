import React, { useEffect, useRef, useState } from 'react'
import { Empty, Spin } from 'antd'

import PdfPageWithHighlight from '../../PdfPageWithHighlight'
import {
  PREVIEW_HORIZONTAL_PADDING,
  PREVIEW_VERTICAL_PADDING,
} from './constants'
import { getRotatedPreviewLayout } from './previewGeometry'
import { useHighlightCanvas } from './useHighlightCanvas'
import { usePreviewSizing } from './usePreviewSizing'

export const ImagePreviewArea = ({
  imageUrl,
  fileType,
  contentList,
  activeBlockIndex,
  hoveredBlockIndex,
  pageIndex,
  scale,
  showAllBoxes,
  onImageLoad,
  sensitiveRegions = [],
  pageAngle = 0,
}) => {
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const containerRef = useRef(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)
  const currentPageBlocks = contentList.filter((block) => block.page_idx === pageIndex)
  const { containerWidth, renderScale } = usePreviewSizing({ containerRef, imageSize, scale })

  useHighlightCanvas({
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
  })

  const handleImageLoad = () => {
    const img = imageRef.current
    if (img) {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
      setImageLoaded(true)
      onImageLoad?.({ width: img.naturalWidth, height: img.naturalHeight })
    }
  }

  useEffect(() => {
    if (hoveredBlockIndex === null || !containerRef.current || !imageLoaded) return
    const block = contentList[hoveredBlockIndex]
    if (!block || block.page_idx !== pageIndex) return
    const bbox = block.bbox
    if (!bbox || bbox.length !== 4) return

    const scaleY = (imageSize.height * renderScale) / 1000
    containerRef.current.scrollTo({
      top: Math.max(0, bbox[1] * scaleY - 100),
      behavior: 'smooth',
    })
  }, [hoveredBlockIndex, contentList, pageIndex, renderScale, imageSize, imageLoaded])

  useEffect(() => {
    if (!containerRef.current || !imageLoaded) return
    containerRef.current.scrollTo({ left: 0, top: 0, behavior: 'auto' })
  }, [scale, pageAngle, imageLoaded])

  if (!imageUrl) {
    return (
      <div className="preview-empty">
        <Empty description="请选择要预览的文档" />
      </div>
    )
  }

  if (fileType === 'pdf') {
    return (
      <div className="preview-container" ref={containerRef}>
        <PdfPageWithHighlight
          pdfUrl={imageUrl}
          pageNumber={Math.max(0, pageIndex) + 1}
          locations={currentPageBlocks}
          loading={false}
          showToolbar={false}
        />
      </div>
    )
  }

  const scaledWidth = imageSize.width * renderScale
  const scaledHeight = imageSize.height * renderScale
  const {
    innerOffsetX,
    innerOffsetY,
    needsClientRotation,
    scrollBoxHeight,
    scrollBoxWidth,
  } = getRotatedPreviewLayout({ pageAngle, scaledHeight, scaledWidth })

  const padX = PREVIEW_HORIZONTAL_PADDING / 2
  const padY = PREVIEW_VERTICAL_PADDING / 2
  const scrollContentWidth = Math.max(
    Math.ceil((scrollBoxWidth || 0) + PREVIEW_HORIZONTAL_PADDING),
    containerWidth || 0,
  )
  const scrollContentHeight = Math.ceil((scrollBoxHeight || 0) + PREVIEW_VERTICAL_PADDING)

  return (
    <div className="preview-container" ref={containerRef}>
      <div
        className="preview-scroll-content"
        style={{
          width: scrollContentWidth || '100%',
          height: scrollContentHeight || '100%',
        }}
      >
        <div
          className={`preview-image-wrapper ${scale !== 1 ? 'scaled' : ''}`}
          style={{
            position: 'absolute',
            left: padX + innerOffsetX,
            top: padY + innerOffsetY,
            width: scaledWidth || 'auto',
            height: scaledHeight || 'auto',
            ...(needsClientRotation ? {
              transform: `rotate(${-pageAngle}deg)`,
              transformOrigin: 'top left',
            } : {}),
          }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Document preview"
            onLoad={handleImageLoad}
            style={{
              display: imageLoaded ? 'block' : 'none',
              width: scaledWidth || '100%',
              height: scaledHeight || 'auto',
              ...(needsClientRotation ? { imageOrientation: 'none' } : {}),
            }}
          />
          <canvas
            ref={canvasRef}
            className="preview-canvas"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
            }}
          />
          {!imageLoaded && (
            <div className="preview-loading">
              <Spin tip="加载中..." />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
