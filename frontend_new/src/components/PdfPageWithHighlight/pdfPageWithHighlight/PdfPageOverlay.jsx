import React from 'react'

import { appThemeToken } from '../../../styles/themeTokens'
import { normalizePositiveNumber } from './pdfConstants'

const getOverlayAppearance = (loc, isActive) => {
  const isLow = Boolean(loc?.low_confidence)
  const isShared = Boolean(loc?.record_shared) && !isLow

  return {
    accent: isLow || isShared ? '#fa8c16' : appThemeToken.colorError,
    dash: isLow ? '4,3' : undefined,
    fill: isLow
      ? (isActive ? 'rgba(250, 140, 22, 0.16)' : 'rgba(250, 140, 22, 0.08)')
      : isShared
        ? (isActive ? 'rgba(250, 140, 22, 0.18)' : 'rgba(250, 140, 22, 0.10)')
        : (isActive ? 'rgba(255, 77, 79, 0.18)' : 'rgba(255, 77, 79, 0.08)'),
    strokeWidth: isActive ? 2 : 1,
  }
}

export const PdfPageOverlay = ({
  activeIndex,
  bboxScale,
  highlightRefs,
  locationList,
  pageNo,
  pageSizes,
}) => {
  const size = pageSizes[pageNo]
  const refW = size?.width || 1
  const refH = size?.height || 1
  const pw = size?.originalWidth || refW
  const ph = size?.originalHeight || refH
  const usePageScale = bboxScale === 'page'

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
          {visibleItems.map(({ loc, idx }) => {
            let anchorTop = 0
            if (Array.isArray(loc.polygon) && loc.polygon.length >= 8) {
              const points = getPolygonPoints(loc) || []
              const yVals = points.map((point) => point.y)
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
              const polygon = getPolygonPoints(loc)
              const appearance = getOverlayAppearance(loc, activeIndex === idx)
              if (polygon) {
                return (
                  <polygon
                    key={`poly-${idx}`}
                    points={polygon.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill={appearance.fill}
                    stroke={appearance.accent}
                    strokeWidth={appearance.strokeWidth}
                    strokeDasharray={appearance.dash}
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
                  fill={appearance.fill}
                  stroke={appearance.accent}
                  strokeWidth={appearance.strokeWidth}
                  strokeDasharray={appearance.dash}
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
