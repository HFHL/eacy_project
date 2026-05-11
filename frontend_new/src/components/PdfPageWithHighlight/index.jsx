/**
 * PdfPageWithHighlight
 * Uses react-pdf to render PDF pages without browser/plugin toolbars.
 * Each page reserves an overlay layer for current and future bbox highlights.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Spin } from 'antd'
import { Document, Page, pdfjs } from 'react-pdf'
import { appThemeToken } from '../../styles/themeTokens'
import pdfjsWorker from 'react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url'

if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `${pdfjsWorker}?v=react-pdf-worker-20260430`
}

const DEFAULT_BBOX_SCALE = 1000
const DEFAULT_PAGE_WIDTH = 900
const MIN_PAGE_WIDTH = 240

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
  maxWidth = 480,
  loading: externalLoading = false,
  bboxScale = DEFAULT_BBOX_SCALE,
  onLoaded,
  renderAllPages = false,
}) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [numPages, setNumPages] = useState(null)
  const [pageSizes, setPageSizes] = useState({})
  const [error, setError] = useState(null)

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

  useEffect(() => {
    setNumPages(null)
    setPageSizes({})
    setError(null)
  }, [pdfUrl])

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width
      if (width > 0) setContainerWidth(width)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const pageWidth = useMemo(() => {
    const measuredWidth = containerWidth ? Math.floor(containerWidth) : null
    const maxNumericWidth = typeof maxWidth === 'number' ? maxWidth : null
    const fallbackWidth = maxNumericWidth || DEFAULT_PAGE_WIDTH

    if (!measuredWidth) return fallbackWidth

    const boundedWidth = maxNumericWidth
      ? Math.min(measuredWidth, maxNumericWidth)
      : measuredWidth

    return Math.max(MIN_PAGE_WIDTH, boundedWidth)
  }, [containerWidth, maxWidth])

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

  const renderOverlay = (pageNo) => {
    const size = pageSizes[pageNo]
    const refW = size?.width || 1
    const refH = size?.height || 1
    const pw = size?.originalWidth || refW
    const ph = size?.originalHeight || refH
    const usePageScale = bboxScale === 'page'
    const visibleList = locationList.filter((loc) => loc.page == null || Number(loc.page) === pageNo)

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
        {size && visibleList.length > 0 && (
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
            {visibleList.map((item, idx) => {
              const polygon = getPolygonPoints(item)
              if (polygon) {
                return (
                  <polygon
                    key={idx}
                    points={polygon.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(255, 77, 79, 0.08)"
                    stroke={appThemeToken.colorError}
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                )
              }
              const rect = getRect(item)
              return (
                <rect
                  key={idx}
                  x={rect.left}
                  y={rect.top}
                  width={Math.max(rect.width, 2)}
                  height={Math.max(rect.height, 2)}
                  fill="rgba(255, 77, 79, 0.08)"
                  stroke={appThemeToken.colorError}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>
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

  return (
    <div
      ref={containerRef}
      className="pdf-document-preview"
      style={{
        width: '100%',
        maxWidth: typeof maxWidth === 'number' ? maxWidth : maxWidth || '100%',
        margin: '0 auto',
      }}
    >
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {showLoading && null}
          {pageNumbers.map((pageNo) => (
            <div
              key={pageNo}
              className="pdf-page-shell"
              data-page-number={pageNo}
              style={{
                position: 'relative',
                display: 'inline-block',
                width: pageWidth,
                maxWidth: '100%',
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
                  renderTextLayer={false}
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
  )
}

export default PdfPageWithHighlight
