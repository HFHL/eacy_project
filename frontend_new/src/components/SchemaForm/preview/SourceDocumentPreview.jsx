import React from 'react'
import { Button, Space, Spin, Tooltip } from 'antd'
import {
  FileTextOutlined,
  ReloadOutlined,
  RotateRightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'
import PdfPageWithHighlight from '../../PdfPageWithHighlight'
import { appThemeToken } from '../../../styles/themeTokens'
import { useSourceDocumentPreview } from './useSourceDocumentPreview'

const SourceDocumentPreview = ({
  documentInfo,
  activeCoordinates,
  panelWidth = 480,
  loading = false,
  initialRotation = 0,
}) => {
  const {
    containerRef,
    displayDimensions,
    effectiveMaxW,
    handleImageLoad,
    handleMouseDown,
    handleMouseEnd,
    handleMouseMove,
    handlePdfLoaded,
    handleReset,
    handleRotate,
    handleZoomIn,
    handleZoomOut,
    imageDimensions,
    imageLoaded,
    imgOffset,
    imgRef,
    isDragging,
    isPdf,
    locationsForCurrentPage,
    pdfPage,
    pdfPageCount,
    rotation,
    scale,
    setPdfPage,
  } = useSourceDocumentPreview({
    activeCoordinates,
    documentInfo,
    initialRotation,
    panelWidth,
  })

  const renderHighlight = (opts = {}) => {
    const { baseWidth = null, baseHeight = null, requireImageLoaded = true, applyTransform = true } = opts
    if (!activeCoordinates || isPdf) return null
    if (requireImageLoaded && !imageLoaded) return null
    const coordsList = Array.isArray(activeCoordinates) ? activeCoordinates : [activeCoordinates]
    if (!coordsList.length) return null
    const { pageWidth, pageHeight } = coordsList[0] || {}
    const w0 = baseWidth || displayDimensions.width || imageDimensions.width
    const h0 = baseHeight || displayDimensions.height || imageDimensions.height
    if (!w0 || !h0) return null

    const pw = pageWidth || imageDimensions.width || 1000
    const ph = pageHeight || imageDimensions.height || 1000
    const scaleX = w0 / pw
    const scaleY = h0 / ph
    const svgTransform = applyTransform ? `scale(${scale / 100}) rotate(${rotation}deg)` : undefined

    return (
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: w0,
          height: h0,
          ...(svgTransform ? { transform: svgTransform, transformOrigin: 'center center' } : {}),
          pointerEvents: 'none',
          zIndex: 10,
        }}
        viewBox={`0 0 ${w0} ${h0}`}
      >
        {coordsList.map((c, idx) => {
          if (!c) return null
          const { x, y, width: w, height: h } = c
          return (
            <rect
              key={idx}
              x={x * scaleX}
              y={y * scaleY}
              width={Math.max(w * scaleX, 2)}
              height={Math.max(h * scaleY, 2)}
              fill="none"
              stroke="#ff0000"
              strokeWidth="1"
              rx="0"
            />
          )
        })}
      </svg>
    )
  }

  const renderPdfPreview = () => (
    <div style={{ width: '100%', minWidth: 0, flex: '1 1 auto' }}>
      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
        <Space size={4}>
          <Button
            size="small"
            onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
            disabled={pdfPage <= 1}
          >
            上一页
          </Button>
          <Button
            size="small"
            onClick={() => setPdfPage((p) => (pdfPageCount ? Math.min(pdfPageCount, p + 1) : p + 1))}
            disabled={pdfPageCount != null && pdfPage >= pdfPageCount}
          >
            下一页
          </Button>
        </Space>
        <span>
          第 {pdfPage}
          {pdfPageCount ? ` / ${pdfPageCount}` : ''} 页
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          minWidth: 0,
          transform: scale === 100 && rotation === 0
            ? undefined
            : `translate(${imgOffset.x}px, ${imgOffset.y}px) scale(${scale / 100}) rotate(${rotation}deg)`,
          transformOrigin: 'top center',
          transition: isDragging ? 'none' : 'transform 0.2s',
        }}
      >
        <PdfPageWithHighlight
          pdfUrl={documentInfo.fileUrl}
          pageNumber={pdfPage}
          locations={locationsForCurrentPage}
          loading={false}
          bboxScale={1000}
          onLoaded={handlePdfLoaded}
        />
      </div>
    </div>
  )

  const renderImagePreview = () => (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        transform: `translate(${imgOffset.x}px, ${imgOffset.y}px) scale(${scale / 100}) rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        transition: isDragging ? 'none' : 'transform 0.2s',
      }}
    >
      <img
        ref={imgRef}
        src={documentInfo.fileUrl}
        alt={documentInfo.fileName}
        style={{
          display: 'block',
          width: displayDimensions.width || 'auto',
          height: displayDimensions.height || 'auto',
          maxWidth: effectiveMaxW,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderRadius: 4,
          opacity: imageLoaded ? 1 : 0.3,
          pointerEvents: 'none',
          userSelect: 'none',
          imageRendering: 'high-quality',
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
        }}
        onLoad={handleImageLoad}
        draggable={false}
      />
      {renderHighlight({ requireImageLoaded: true, applyTransform: false })}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #f0f0f0', background: '#fafafa', flexShrink: 0 }}>
      <div style={{ padding: '4px 8px', background: '#fff', display: 'flex', justifyContent: 'center', gap: 2 }}>
        <Tooltip title="缩小"><Button type="text" size="small" icon={<ZoomOutOutlined />} onClick={handleZoomOut} disabled={scale <= 25} /></Tooltip>
        <Tooltip title="放大"><Button type="text" size="small" icon={<ZoomInOutlined />} onClick={handleZoomIn} disabled={scale >= 300} /></Tooltip>
        <Tooltip title="旋转"><Button type="text" size="small" icon={<RotateRightOutlined />} onClick={handleRotate} /></Tooltip>
        <Tooltip title="重置"><Button type="text" size="small" icon={<ReloadOutlined />} onClick={handleReset} /></Tooltip>
      </div>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          minWidth: 0,
          alignSelf: 'stretch',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          background: '#f5f5f5',
          padding: 8,
          cursor: scale > 100 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          userSelect: isDragging ? 'none' : 'auto',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseEnd}
        onMouseLeave={handleMouseEnd}
      >
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
            <Spin size="large" tip="加载溯源文档..." />
          </div>
        ) : documentInfo?.fileUrl ? (
          isPdf ? renderPdfPreview() : renderImagePreview()
        ) : (
          <div style={{ textAlign: 'center', color: appThemeToken.colorTextTertiary, padding: 24 }}><FileTextOutlined style={{ fontSize: 16, marginBottom: 8 }} /><div style={{ fontSize: 12 }}>暂无文档</div></div>
        )}
      </div>
    </div>
  )
}

export default SourceDocumentPreview
