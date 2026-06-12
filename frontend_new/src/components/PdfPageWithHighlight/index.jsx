/**
 * PdfPageWithHighlight
 * Uses react-pdf to render PDF pages without browser/plugin toolbars.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

import { appThemeToken } from '../../styles/themeTokens'
import {
  DEFAULT_BBOX_SCALE,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  isValidLoc,
  normalizePositiveNumber,
  resolveBasePageWidth,
} from './pdfPageWithHighlight/pdfConstants'
import { PdfDocumentBody } from './pdfPageWithHighlight/PdfDocumentBody'
import { PdfPageOverlay } from './pdfPageWithHighlight/PdfPageOverlay'
import { PdfToolbar } from './pdfPageWithHighlight/PdfToolbar'
import { useMeasuredContainerWidth } from './pdfPageWithHighlight/useMeasuredContainerWidth'
import './pdfPageWithHighlight/setupPdfWorker'

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
  const containerWidth = useMeasuredContainerWidth(containerRef)
  const [numPages, setNumPages] = useState(null)
  const [pageSizes, setPageSizes] = useState({})
  const [error, setError] = useState(null)
  const [zoom, setZoom] = useState(1)
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

  useEffect(() => {
    setActiveIndex(null)
  }, [locationList])

  useEffect(() => {
    setNumPages(null)
    setPageSizes({})
    setError(null)
    setZoom(1)
  }, [pdfUrl])

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

  useEffect(() => {
    if (activeIndex == null) return
    const target = highlightRefs.current[`evidence-${activeIndex}`]
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

  const zoomOut = () => setZoom((value) => Math.max(MIN_ZOOM, Math.round((value - ZOOM_STEP) * 100) / 100))
  const zoomIn = () => setZoom((value) => Math.min(MAX_ZOOM, Math.round((value + ZOOM_STEP) * 100) / 100))
  const resetZoom = () => setZoom(1)

  const renderOverlay = useCallback((pageNo) => (
    <PdfPageOverlay
      activeIndex={activeIndex}
      bboxScale={bboxScale}
      highlightRefs={highlightRefs}
      locationList={locationList}
      pageNo={pageNo}
      pageSizes={pageSizes}
    />
  ), [activeIndex, bboxScale, locationList, pageSizes])

  if (!pdfUrl) {
    return (
      <div style={{ padding: 12, color: appThemeToken.colorTextSecondary, fontSize: 12 }}>
        未提供 PDF 地址
      </div>
    )
  }

  const showLoading = externalLoading || !numPages
  const measurementReady = containerWidth > 0

  return (
    <div
      ref={containerRef}
      className="pdf-document-preview"
      style={{
        width: '100%',
        margin: '0 auto',
        minWidth: 0,
      }}
    >
      <PdfToolbar
        activeIndex={activeIndex}
        currentPage={currentPage}
        goNext={goNext}
        goPrev={goPrev}
        locationCount={locationList.length}
        numPages={numPages}
        resetZoom={resetZoom}
        shouldRenderAllPages={shouldRenderAllPages}
        showToolbar={showToolbar}
        toggleAll={toggleAll}
        zoom={zoom}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
      />
      <PdfDocumentBody
        enableTextLayer={enableTextLayer}
        error={error}
        measurementReady={measurementReady}
        onDocumentLoadSuccess={onDocumentLoadSuccess}
        onLoadError={setError}
        onPageLoadSuccess={onPageLoadSuccess}
        pageNumbers={pageNumbers}
        pageWidth={pageWidth}
        pdfUrl={pdfUrl}
        renderOverlay={renderOverlay}
        scrollRef={scrollRef}
        showLoading={showLoading}
      />
    </div>
  )
}

export default PdfPageWithHighlight
