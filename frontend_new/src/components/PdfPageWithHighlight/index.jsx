/**
 * PdfPageWithHighlight
 * Uses react-pdf to render PDF pages without browser/plugin toolbars.
 * Each page reserves an overlay layer for current and future bbox highlights.
 *
 * Features:
 *   - Built-in toolbar with zoom (out / in / 100% / fit width)
 *   - Multi-evidence navigation (prev / next / all)
 *   - Auto-scroll to the active highlight
 *   - Selectable PDF text layer (Ctrl/Cmd+F friendly)
 *
 * Toolbar and text layer can be disabled per-consumer for embedded usage
 * (see DocumentBboxViewer which provides its own controls).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Space, Spin, Tooltip, Typography } from 'antd'
import {
  ColumnWidthOutlined,
  LeftOutlined,
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { appThemeToken } from '../../styles/themeTokens'
import pdfjsWorker from 'react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url'

if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `${pdfjsWorker}?v=react-pdf-worker-20260430`
}

const { Text } = Typography

const DEFAULT_BBOX_SCALE = 1000
const DEFAULT_PAGE_WIDTH = 900
const MIN_PAGE_WIDTH = 240

/** 是否按父容器宽度铺满（不传 maxWidth、传 "100%" 等均视为铺满） */
const isFillParentMaxWidth = (maxWidth) =>
  maxWidth == null || maxWidth === '100%' || maxWidth === 'none'

/** 根据容器实测宽度与 maxWidth 上限计算单页渲染宽度 */
const resolveBasePageWidth = (containerWidth, maxWidth) => {
  const measured = containerWidth > 0 ? Math.floor(containerWidth) : null
  if (isFillParentMaxWidth(maxWidth)) {
    return measured ? Math.max(MIN_PAGE_WIDTH, measured) : DEFAULT_PAGE_WIDTH
  }
  if (typeof maxWidth === 'number' && Number.isFinite(maxWidth) && maxWidth > 0) {
    const cap = Math.floor(maxWidth)
    if (!measured) return Math.max(MIN_PAGE_WIDTH, cap)
    return Math.max(MIN_PAGE_WIDTH, Math.min(measured, cap))
  }
  return measured ? Math.max(MIN_PAGE_WIDTH, measured) : DEFAULT_PAGE_WIDTH
}
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.2

const isValidLoc = (loc) =>
  loc && (
    (Array.isArray(loc.polygon) && loc.polygon.length >= 8) ||
    (Array.isArray(loc.bbox) && loc.bbox.length >= 4)
  )

const normalizePositiveNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export function PdfPageWithHighlight({
  pdfUrl,
  pageNumber = null,
  bbox,
  locations,
  maxWidth,
  loading: externalLoading = false,
  bboxScale = DEFAULT_BBOX_SCALE,
  onLoaded,
  renderAllPages = false,
  showToolbar = true,
  enableTextLayer = true,
}) {
  const containerRef = useRef(null)
  const scrollRef = useRef(null)
  const highlightRefs = useRef({})
  const [containerWidth, setContainerWidth] = useState(0)
  const [numPages, setNumPages] = useState(null)
  const [pageSizes, setPageSizes] = useState({})
  const [error, setError] = useState(null)
  const [zoom, setZoom] = useState(1)
  // activeIndex: null = show all evidences; number = focus that single evidence
  const [activeIndex, setActiveIndex] = useState(null)

  const requestedPage = normalizePositiveNumber(pageNumber)
  const shouldRenderAllPages = renderAllPages || requestedPage == null
  const currentPage = requestedPage ? Math.floor(requestedPage) : 1

  const locationList = useMemo(() => {
    if (Array.isArray(locations) && locations.length > 0) {
      return locations.filter(isValidLoc)
    }
    if (Array.isArray(bbox) && bbox.length >= 4) {
      return [{ bbox, page: currentPage }]
    }
    return []
  }, [bbox, locations, currentPage])

  // When the list of evidences changes, reset focus to "show all".
  useEffect(() => {
    setActiveIndex(null)
  }, [locationList])

  useEffect(() => {
    setNumPages(null)
    setPageSizes({})
    setError(null)
    setZoom(1)
  }, [pdfUrl])

  // Synchronously measure the container BEFORE the first paint so we
  // never render the page at DEFAULT_PAGE_WIDTH (900) and accidentally
  // expand the parent (which then locks ResizeObserver at 900).
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const w = containerRef.current.getBoundingClientRect().width
    if (w > 0) setContainerWidth(w)
  }, [])

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width
      if (width > 0) setContainerWidth(width)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const basePageWidth = useMemo(
    () => resolveBasePageWidth(containerWidth, maxWidth),
    [containerWidth, maxWidth],
  )

  const pageWidth = Math.round(basePageWidth * zoom)

  const pageNumbers = useMemo(() => {
    if (!numPages) return shouldRenderAllPages ? [] : [currentPage]
    if (shouldRenderAllPages) {
      return Array.from({ length: numPages }, (_, index) => index + 1)
    }
    return [Math.min(Math.max(1, currentPage), numPages)]
  }, [currentPage, numPages, shouldRenderAllPages])

  const onDocumentLoadSuccess = (pdf) => {
    const count = pdf?.numPages || 1
    setNumPages(count)
    if (typeof onLoaded === 'function') {
      onLoaded(count)
    }
  }

  const onPageLoadSuccess = (page) => {
    setPageSizes((prev) => ({
      ...prev,
      [page.pageNumber]: {
        width: page.width,
        height: page.height,
        originalWidth: page.originalWidth,
        originalHeight: page.originalHeight,
      },
    }))
  }

  // Auto-scroll the highlight into view whenever the active evidence
  // changes, the active page renders, or the user picks a new evidence.
  useEffect(() => {
    if (activeIndex == null) return
    const key = `evidence-${activeIndex}`
    const target = highlightRefs.current[key]
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeIndex, pageSizes, zoom])

  const goPrev = useCallback(() => {
    setActiveIndex((idx) => {
      if (locationList.length === 0) return null
      if (idx == null) return 0
      return Math.max(0, idx - 1)
    })
  }, [locationList.length])

  const goNext = useCallback(() => {
    setActiveIndex((idx) => {
      if (locationList.length === 0) return null
      if (idx == null) return 0
      return Math.min(locationList.length - 1, idx + 1)
    })
  }, [locationList.length])

  const toggleAll = useCallback(() => {
    setActiveIndex((idx) => (idx == null ? 0 : null))
  }, [])

  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))
  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))
  const resetZoom = () => setZoom(1)

  const renderToolbar = () => {
    if (!showToolbar) return null
    const hasMultipleEvidences = locationList.length > 1
    const label = activeIndex == null
      ? (locationList.length > 0 ? '全部' : '—')
      : `${activeIndex + 1}/${locationList.length}`
    return (
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          marginBottom: 8,
          background: appThemeToken.colorBgContainer,
          border: `1px solid ${appThemeToken.colorBorderSecondary}`,
          borderRadius: 6,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <Space size={4}>
          <Tooltip title="缩小">
            <Button size="small" icon={<ZoomOutOutlined />} onClick={zoomOut} disabled={zoom <= MIN_ZOOM} />
          </Tooltip>
          <Tooltip title="点击重置 100%">
            <Button size="small" type="text" onClick={resetZoom} style={{ minWidth: 56 }}>
              {Math.round(zoom * 100)}%
            </Button>
          </Tooltip>
          <Tooltip title="放大">
            <Button size="small" icon={<ZoomInOutlined />} onClick={zoomIn} disabled={zoom >= MAX_ZOOM} />
          </Tooltip>
          <Tooltip title="适应宽度">
            <Button size="small" icon={<ColumnWidthOutlined />} onClick={resetZoom} />
          </Tooltip>
        </Space>
        {hasMultipleEvidences && (
          <>
            <div style={{ width: 1, height: 18, background: appThemeToken.colorBorderSecondary }} />
            <Space size={4}>
              <Tooltip title="上一条溯源">
                <Button
                  size="small"
                  icon={<LeftOutlined />}
                  onClick={goPrev}
                  disabled={activeIndex != null && activeIndex <= 0}
                />
              </Tooltip>
              <Text style={{ fontSize: 12, minWidth: 56, textAlign: 'center', color: appThemeToken.colorTextSecondary }}>
                溯源 {label}
              </Text>
              <Tooltip title="下一条溯源">
                <Button
                  size="small"
                  icon={<RightOutlined />}
                  onClick={goNext}
                  disabled={activeIndex != null && activeIndex >= locationList.length - 1}
                />
              </Tooltip>
              <Button size="small" type="link" onClick={toggleAll} style={{ padding: 0 }}>
                {activeIndex == null ? '逐条查看' : '显示全部'}
              </Button>
            </Space>
          </>
        )}
        <div style={{ flex: 1 }} />
        {numPages && !shouldRenderAllPages && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            第 {currentPage} / {numPages} 页
          </Text>
        )}
      </div>
    )
  }

  const renderOverlay = (pageNo) => {
    const size = pageSizes[pageNo]
    const refW = size?.width || 1
    const refH = size?.height || 1
    const pw = size?.originalWidth || refW
    const ph = size?.originalHeight || refH
    const usePageScale = bboxScale === 'page'

    // Pair each visible item with its original index so refs match the
    // global evidence order even when filtering by page.
    const visibleItems = locationList
      .map((loc, idx) => ({ loc, idx }))
      .filter(({ loc }) => loc.page == null || Number(loc.page) === pageNo)
      .filter(({ idx }) => activeIndex == null || idx === activeIndex)

    const mapPoint = (x, y, item, bounds = null) => {
      if (usePageScale && pw > 0 && ph > 0) {
        return { x: (x / pw) * refW, y: (y / ph) * refH }
      }

      const origW = normalizePositiveNumber(item.page_width)
      const origH = normalizePositiveNumber(item.page_height)
      if (origW && origH) {
        return { x: (x / origW) * refW, y: (y / origH) * refH }
      }

      const maxPage = Math.max(pw, ph)
      const maxValue = bounds?.maxValue ?? Math.max(Math.abs(x), Math.abs(y))
      if (maxPage > 0 && maxValue > maxPage * 1.1) {
        const pageAspect = pw / ph
        let inferredW = Math.max(bounds?.maxX ?? Math.abs(x), 1)
        let inferredH = inferredW / pageAspect
        if (inferredH < Math.max(bounds?.maxY ?? Math.abs(y), 1)) {
          inferredH = Math.max(bounds?.maxY ?? Math.abs(y), 1)
          inferredW = inferredH * pageAspect
        }
        return { x: (x / inferredW) * refW, y: (y / inferredH) * refH }
      }

      if (pw > 0 && ph > 0) {
        return { x: (x / pw) * refW, y: (y / ph) * refH }
      }

      return {
        x: (x / Number(bboxScale)) * refW,
        y: (y / Number(bboxScale)) * refH,
      }
    }

    const getPolygonPoints = (item) => {
      if (!Array.isArray(item.polygon) || item.polygon.length < 8) return null
      const raw = item.polygon.map(Number)
      const xs = [raw[0], raw[2], raw[4], raw[6]].map((value) => Math.abs(value))
      const ys = [raw[1], raw[3], raw[5], raw[7]].map((value) => Math.abs(value))
      const bounds = {
        maxX: Math.max(...xs, 1),
        maxY: Math.max(...ys, 1),
        maxValue: Math.max(...xs, ...ys, 1),
      }
      return [
        mapPoint(raw[0], raw[1], item, bounds),
        mapPoint(raw[2], raw[3], item, bounds),
        mapPoint(raw[4], raw[5], item, bounds),
        mapPoint(raw[6], raw[7], item, bounds),
      ]
    }

    const getRect = (item) => {
      const [rawX1, rawY1, rawX2, rawY2] = item.bbox.map(Number)
      const bounds = {
        maxX: Math.max(Math.abs(rawX1), Math.abs(rawX2), 1),
        maxY: Math.max(Math.abs(rawY1), Math.abs(rawY2), 1),
        maxValue: Math.max(Math.abs(rawX1), Math.abs(rawY1), Math.abs(rawX2), Math.abs(rawY2), 1),
      }
      const topLeft = mapPoint(Math.min(rawX1, rawX2), Math.min(rawY1, rawY2), item, bounds)
      const bottomRight = mapPoint(Math.max(rawX1, rawX2), Math.max(rawY1, rawY2), item, bounds)
      return {
        left: topLeft.x,
        top: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      }
    }

    return (
      <div
        className="pdf-page-overlay"
        data-page-number={pageNo}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1000,
          transform: 'translateZ(0)',
        }}
      >
        {size && visibleItems.length > 0 && (
          <>
            {/* Invisible scroll anchors aligned with each highlight, used by
                auto-scroll so the active polygon lands near the viewport center.
                Positioned in page-local coords (% of page) for resilience to zoom. */}
            {visibleItems.map(({ loc, idx }) => {
              let anchorTop = 0
              if (Array.isArray(loc.polygon) && loc.polygon.length >= 8) {
                const pts = getPolygonPoints(loc) || []
                const yVals = pts.map((p) => p.y)
                anchorTop = yVals.length ? (Math.min(...yVals) + Math.max(...yVals)) / 2 : 0
              } else if (Array.isArray(loc.bbox) && loc.bbox.length >= 4) {
                const rect = getRect(loc)
                anchorTop = rect.top + rect.height / 2
              }
              const ratio = refH > 0 ? Math.min(1, Math.max(0, anchorTop / refH)) : 0
              return (
                <div
                  key={`anchor-${idx}`}
                  ref={(el) => {
                    if (el) highlightRefs.current[`evidence-${idx}`] = el
                  }}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: `${ratio * 100}%`,
                    width: 1,
                    height: 1,
                  }}
                />
              )
            })}
            <svg
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                zIndex: 1000,
                transform: 'translateZ(0)',
              }}
              viewBox={`0 0 ${refW} ${refH}`}
              preserveAspectRatio="none"
            >
              {visibleItems.map(({ loc, idx }) => {
                const isActive = activeIndex === idx
                const isLow = Boolean(loc?.low_confidence)
                const isShared = Boolean(loc?.record_shared) && !isLow
                // 低置信度模糊匹配/record_shared 用橙色，正常高置信度匹配维持红色
                const accent = isLow || isShared ? '#fa8c16' : appThemeToken.colorError
                const fill = isLow
                  ? (isActive ? 'rgba(250, 140, 22, 0.16)' : 'rgba(250, 140, 22, 0.08)')
                  : isShared
                    ? (isActive ? 'rgba(250, 140, 22, 0.18)' : 'rgba(250, 140, 22, 0.10)')
                    : (isActive ? 'rgba(255, 77, 79, 0.18)' : 'rgba(255, 77, 79, 0.08)')
                const strokeWidth = isActive ? 2 : 1
                const dash = isLow ? '4,3' : undefined
                const polygon = getPolygonPoints(loc)
                if (polygon) {
                  return (
                    <polygon
                      key={`poly-${idx}`}
                      points={polygon.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill={fill}
                      stroke={accent}
                      strokeWidth={strokeWidth}
                      strokeDasharray={dash}
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                }
                const rect = getRect(loc)
                return (
                  <rect
                    key={`rect-${idx}`}
                    x={rect.left}
                    y={rect.top}
                    width={Math.max(rect.width, 2)}
                    height={Math.max(rect.height, 2)}
                    fill={fill}
                    stroke={accent}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dash}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
            </svg>
          </>
        )}
      </div>
    )
  }

  if (!pdfUrl) {
    return (
      <div style={{ padding: 12, color: appThemeToken.colorTextSecondary, fontSize: 12 }}>
        未提供 PDF 地址
      </div>
    )
  }

  const showLoading = externalLoading || !numPages

  // Wait for at least one real measurement before rendering pages. This
  // avoids the "renders at 900px, parent grows to 900px, locks at 900px"
  // loop when the parent has overflow:auto.
  const measurementReady = containerWidth > 0

  return (
    <div
      ref={containerRef}
      className="pdf-document-preview"
      style={{
        width: '100%',
        margin: '0 auto',
        // Critical: prevents inner pages from forcing this container to
        // grow past its parent's available width.
        minWidth: 0,
      }}
    >
      {renderToolbar()}
      <div ref={scrollRef} style={{ width: '100%', minWidth: 0 }}>
        <Document
          file={pdfUrl}
          loading={
            <div style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Spin />
              <span style={{ fontSize: 12, color: appThemeToken.colorTextSecondary }}>加载 PDF...</span>
            </div>
          }
          error={
            <div style={{ padding: 12, background: 'rgba(255, 77, 79, 0.1)', borderRadius: 4, color: appThemeToken.colorError, fontSize: 12 }}>
              {error || 'PDF 加载失败'}
            </div>
          }
          noData={
            <div style={{ padding: 12, color: appThemeToken.colorTextSecondary, fontSize: 12 }}>
              未提供 PDF 地址
            </div>
          }
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={(err) => setError(err?.message || 'PDF 加载失败')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%', gap: 16 }}>
            {showLoading && null}
            {measurementReady && pageNumbers.map((pageNo) => (
              <div
                key={pageNo}
                className="pdf-page-shell"
                data-page-number={pageNo}
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: pageWidth,
                  margin: '0 auto',
                  background: '#fff',
                  borderRadius: 4,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  overflow: 'hidden',
                  isolation: 'isolate',
                }}
              >
                <div className="pdf-page-canvas-layer" style={{ position: 'relative', zIndex: 0 }}>
                  <Page
                    className="pdf-page-react-layer"
                    pageNumber={pageNo}
                    width={pageWidth}
                    canvasBackground="transparent"
                    loading={
                      <div style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Spin size="small" />
                      </div>
                    }
                    renderTextLayer={enableTextLayer}
                    renderAnnotationLayer={false}
                    onLoadSuccess={onPageLoadSuccess}
                  />
                </div>
                {renderOverlay(pageNo)}
              </div>
            ))}
          </div>
        </Document>
      </div>
    </div>
  )
}

export default PdfPageWithHighlight
