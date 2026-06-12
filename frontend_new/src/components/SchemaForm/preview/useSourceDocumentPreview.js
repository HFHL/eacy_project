import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isPdfFileLike } from '../utils/sourceLocationUtils'

const normalizeRotation = (value) => ((Number(value) || 0) % 360 + 360) % 360

const toCoordsList = (activeCoordinates) => (
  Array.isArray(activeCoordinates)
    ? activeCoordinates.filter(Boolean)
    : activeCoordinates
      ? [activeCoordinates]
      : []
)

const toHighlightLocations = (activeCoordinates) => {
  const coordsList = toCoordsList(activeCoordinates)
  return coordsList.map((c) => ({
    page: (c.pageIdx != null ? c.pageIdx : 0) + 1,
    bbox: [c.x, c.y, c.x + (c.width || 0), c.y + (c.height || 0)],
    polygon: Array.isArray(c.polygon) && c.polygon.length >= 8 ? c.polygon : null,
    page_width: c.pageWidth || null,
    page_height: c.pageHeight || null,
    low_confidence: Boolean(c.lowConfidence),
    record_shared: Boolean(c.recordShared),
    coord_warning: c.coordWarning || null,
  }))
}

export function useSourceDocumentPreview({
  activeCoordinates,
  documentInfo,
  initialRotation,
  panelWidth,
}) {
  const containerRef = useRef(null)
  const imgRef = useRef(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 })
  const [scale, setScale] = useState(100)
  const [rotation, setRotation] = useState(normalizeRotation(initialRotation))
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [containerWidth, setContainerWidth] = useState(0)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfPageCount, setPdfPageCount] = useState(null)
  const isPdf = isPdfFileLike(documentInfo)

  useEffect(() => {
    setRotation(normalizeRotation(initialRotation))
  }, [initialRotation])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const node = containerRef.current
    if (!node) return undefined
    const measure = () => {
      const next = node.clientWidth || 0
      if (next > 0) setContainerWidth(next)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const measuredMaxW = containerWidth > 0 ? Math.max(containerWidth - 16, 200) : 0
  const fallbackMaxW = Math.max(panelWidth - 32, 200)
  const effectiveMaxW = measuredMaxW || fallbackMaxW

  const handleImageLoad = useCallback((e) => {
    const { naturalWidth, naturalHeight } = e.target
    setImageDimensions({ width: naturalWidth, height: naturalHeight })
    setImageLoaded(true)
    setScale(100)
  }, [])

  useEffect(() => {
    if (!imageLoaded || !imageDimensions.width || !imageDimensions.height) return
    const { width: nw, height: nh } = imageDimensions
    if (!effectiveMaxW) return
    const displayW = Math.min(nw, effectiveMaxW)
    const displayH = Math.round(displayW * (nh / nw))
    setDisplayDimensions({ width: displayW, height: displayH })
  }, [effectiveMaxW, imageLoaded, imageDimensions])

  const handleZoomIn = useCallback(() => setScale((s) => Math.min(s + 25, 300)), [])
  const handleZoomOut = useCallback(() => setScale((s) => Math.max(s - 25, 25)), [])
  const handleRotate = useCallback(() => setRotation((r) => (r + 90) % 360), [])
  const handleReset = useCallback(() => {
    setScale(100)
    setRotation(0)
    setImgOffset({ x: 0, y: 0 })
  }, [])

  const highlightLocations = useMemo(
    () => toHighlightLocations(activeCoordinates),
    [activeCoordinates]
  )
  const highlightLocationsKey = useMemo(
    () => JSON.stringify(highlightLocations),
    [highlightLocations]
  )

  useEffect(() => {
    if (isPdf) {
      const initial = highlightLocations[0]?.page || 1
      setPdfPage(initial)
    }
  }, [isPdf, documentInfo?.fileUrl, highlightLocationsKey])

  const locationsForCurrentPage = useMemo(
    () => highlightLocations.filter((loc) => loc.page === pdfPage),
    [highlightLocations, pdfPage]
  )

  const handlePdfLoaded = useCallback((total) => {
    if (typeof total === 'number' && total > 0) {
      setPdfPageCount(total)
      setPdfPage((p) => Math.min(Math.max(1, p), total))
    }
  }, [])

  const handleMouseDown = useCallback((e) => {
    if (scale <= 100) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - imgOffset.x, y: e.clientY - imgOffset.y })
    e.preventDefault()
  }, [imgOffset.x, imgOffset.y, scale])

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return
    setImgOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }, [dragStart.x, dragStart.y, isDragging])

  const handleMouseEnd = useCallback(() => setIsDragging(false), [])

  return {
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
  }
}
