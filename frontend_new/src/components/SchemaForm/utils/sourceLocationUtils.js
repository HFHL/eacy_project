import {
  collectPatientAuditFieldMaps,
  resolveFieldAudit,
} from '../../../utils/auditResolver'

export const isPdfFileLike = ({ fileType, fileName, fileUrl } = {}) => {
  const type = String(fileType || '').toLowerCase()
  const name = String(fileName || '').toLowerCase()
  const url = String(fileUrl || '').toLowerCase()
  const cleanUrl = url.split('?')[0].split('#')[0]
  return (
    type === 'pdf' ||
    type === '.pdf' ||
    type.includes('application/pdf') ||
    name.endsWith('.pdf') ||
    cleanUrl.endsWith('.pdf')
  )
}

export function resolveFieldAuditFromExtractionMetadata(data, dotPath) {
  if (!dotPath) return null
  const fieldMaps = collectPatientAuditFieldMaps(data)
  if (fieldMaps.length === 0) return null
  return resolveFieldAudit(fieldMaps, dotPath)
}

export function buildSourceLocationFromAudit(audit) {
  if (!audit || typeof audit !== 'object') return null
  if (audit.source_location) return audit.source_location
  if (Array.isArray(audit.bbox) && audit.bbox.length >= 4) {
    return {
      bbox: audit.bbox,
      page: typeof audit.page_idx === 'number' ? audit.page_idx + 1 : 1,
    }
  }
  return null
}

const positionToBbox = (position, pageWidth, pageHeight) => {
  if (!Array.isArray(position) || position.length < 8) return null
  const xs = [position[0], position[2], position[4], position[6]]
  const ys = [position[1], position[3], position[5], position[7]]
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)

  const allIn01 = xs.every((x) => x >= 0 && x <= 1) && ys.every((y) => y >= 0 && y <= 1)
  const hasPageSize = typeof pageWidth === 'number' && pageWidth > 0 &&
                      typeof pageHeight === 'number' && pageHeight > 0

  if (allIn01 && hasPageSize) {
    return [
      Math.round(minX * pageWidth),
      Math.round(minY * pageHeight),
      Math.round(maxX * pageWidth),
      Math.round(maxY * pageHeight),
    ]
  }

  const maxCoord = Math.max(maxX, maxY)
  if (maxCoord > 1000) {
    return [minX, minY, maxX, maxY]
  }
  return [minX, minY, maxX, maxY]
}

export function sourceLocationToCoordinates(loc) {
  if (!loc) return null

  const toCoord = (item) => {
    if (!item || typeof item !== 'object') return null
    const rawPageWidth = Number(item.page_width || 0)
    const rawPageHeight = Number(item.page_height || 0)
    const hasTextinPageSize = rawPageWidth > 0 && rawPageHeight > 0
    let bbox = item.bbox
    const rawPosition = Array.isArray(item.position) && item.position.length >= 8
      ? item.position
      : Array.isArray(item.polygon) && item.polygon.length >= 8
        ? item.polygon
        : null
    if ((!bbox || bbox.length < 4) && rawPosition) {
      bbox = positionToBbox(rawPosition, rawPageWidth, rawPageHeight)
    }
    if (!Array.isArray(bbox) || bbox.length < 4) return null
    const [rawX1, rawY1, rawX2, rawY2] = bbox.map(Number)
    const x1 = Math.min(rawX1, rawX2)
    const y1 = Math.min(rawY1, rawY2)
    const x2 = Math.max(rawX1, rawX2)
    const y2 = Math.max(rawY1, rawY2)
    const page = item.page != null ? Number(item.page) : 1
    const maxV = Math.max(
      Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2)
    )
    const isPixel = maxV > 1100
    console.debug('[sourceLocationToCoordinates]', { bbox: [x1, y1, x2, y2], maxV, isPixel, page })
    const polygon = Array.isArray(item.polygon) && item.polygon.length >= 8
      ? item.polygon.map(Number)
      : Array.isArray(rawPosition) && rawPosition.length >= 8
        ? rawPosition.map(Number)
        : null
    return {
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
      polygon,
      pageWidth: hasTextinPageSize ? rawPageWidth : (isPixel ? null : 1000),
      pageHeight: hasTextinPageSize ? rawPageHeight : (isPixel ? null : 1000),
      pageIdx: Math.max(0, page - 1),
      lowConfidence: Boolean(item.low_confidence),
      recordShared: Boolean(item.record_shared),
      coordWarning: item.coord_warning || null,
    }
  }

  if (Array.isArray(loc)) {
    const coords = loc.map(toCoord).filter(Boolean)
    return coords.length ? coords : null
  }

  if (typeof loc === 'object') {
    return toCoord(loc)
  }
  return null
}
