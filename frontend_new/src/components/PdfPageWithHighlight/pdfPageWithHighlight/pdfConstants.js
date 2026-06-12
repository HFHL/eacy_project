export const DEFAULT_BBOX_SCALE = 1000
export const DEFAULT_PAGE_WIDTH = 900
export const MIN_PAGE_WIDTH = 240
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 3
export const ZOOM_STEP = 0.2

export const isFillParentMaxWidth = (maxWidth) =>
  maxWidth == null || maxWidth === '100%' || maxWidth === 'none'

export const resolveBasePageWidth = (containerWidth, maxWidth) => {
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

export const isValidLoc = (loc) =>
  loc && (
    (Array.isArray(loc.polygon) && loc.polygon.length >= 8) ||
    (Array.isArray(loc.bbox) && loc.bbox.length >= 4)
  )

export const normalizePositiveNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}
