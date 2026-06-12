const isValidLocation = (item) => item && (
  (Array.isArray(item.polygon) && item.polygon.length >= 8) ||
  (Array.isArray(item.bbox) && item.bbox.length >= 4)
)

const getRawCoords = (loc, fallbackX, fallbackY) => {
  if (Array.isArray(loc?.polygon) && loc.polygon.length >= 8) return loc.polygon
  if (Array.isArray(loc?.bbox)) return loc.bbox
  return [fallbackX, fallbackY]
}

const scalePointToImage = (x, y, loc, imageSize) => {
  const pageW = Number(loc?.page_width || 0)
  const pageH = Number(loc?.page_height || 0)
  const imgW = imageSize.width
  const imgH = imageSize.height

  if (pageW > 0 && pageH > 0) {
    return { x: (x / pageW) * imgW, y: (y / pageH) * imgH }
  }

  const rawCoords = getRawCoords(loc, x, y)
  const maxV = Math.max(...rawCoords.map((value) => Math.abs(Number(value) || 0)))
  if (maxV <= 1100) {
    return { x: (x / 1000) * imgW, y: (y / 1000) * imgH }
  }
  return { x, y }
}

export const normalizeSourceLocation = (loc) => {
  if (!loc) return []
  if (Array.isArray(loc)) return loc.filter(isValidLocation)
  return isValidLocation(loc) ? [loc] : []
}

export const toPixelPolygon = (loc, imageSize) => {
  if (Array.isArray(loc?.polygon) && loc.polygon.length >= 8) {
    const raw = loc.polygon.map(Number)
    return [
      scalePointToImage(raw[0], raw[1], loc, imageSize),
      scalePointToImage(raw[2], raw[3], loc, imageSize),
      scalePointToImage(raw[4], raw[5], loc, imageSize),
      scalePointToImage(raw[6], raw[7], loc, imageSize),
    ]
  }

  if (Array.isArray(loc?.bbox) && loc.bbox.length >= 4) {
    const [rawX1, rawY1, rawX2, rawY2] = loc.bbox.slice(0, 4).map(Number)
    const p1 = scalePointToImage(rawX1, rawY1, loc, imageSize)
    const p2 = scalePointToImage(rawX2, rawY2, loc, imageSize)
    return [
      { x: p1.x, y: p1.y },
      { x: p2.x, y: p1.y },
      { x: p2.x, y: p2.y },
      { x: p1.x, y: p2.y },
    ]
  }

  return []
}

export const buildPixelBoxData = (locations, imageSize) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const pixelBoxes = locations.map((loc) => {
    const points = toPixelPolygon(loc, imageSize)
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const pixelX1 = Math.min(...xs)
    const pixelY1 = Math.min(...ys)
    const pixelX2 = Math.max(...xs)
    const pixelY2 = Math.max(...ys)

    minX = Math.min(minX, pixelX1)
    minY = Math.min(minY, pixelY1)
    maxX = Math.max(maxX, pixelX2)
    maxY = Math.max(maxY, pixelY2)

    return {
      x1: pixelX1,
      y1: pixelY1,
      x2: pixelX2,
      y2: pixelY2,
      points,
      page: loc.page || loc.page_no || 1,
    }
  })

  return {
    bounds: pixelBoxes.length ? { minX, minY, maxX, maxY } : null,
    pixelBoxes,
  }
}

export const buildPixelBoxQuality = (locations) => locations.map((loc = {}) => ({
  lowConfidence: Boolean(loc.low_confidence),
  recordShared: Boolean(loc.record_shared),
}))

export const buildCropLayout = ({ bounds, imageSize }) => {
  if (!bounds) {
    return { finalX1: 0, finalY1: 0, finalX2: 0, finalY2: 0, finalCropWidth: 0, finalCropHeight: 0 }
  }

  const cropWidth = bounds.maxX - bounds.minX
  const cropHeight = bounds.maxY - bounds.minY
  const paddingX = Math.max(cropWidth * 0.3, 20)
  const paddingY = Math.max(cropHeight * 0.5, 20)
  const maxImageX = imageSize.width > 0 ? imageSize.width : bounds.maxX + paddingX
  const maxImageY = imageSize.height > 0 ? imageSize.height : bounds.maxY + paddingY

  const finalX1 = Math.max(0, bounds.minX - paddingX)
  const finalY1 = Math.max(0, bounds.minY - paddingY)
  const finalX2 = Math.min(maxImageX, bounds.maxX + paddingX)
  const finalY2 = Math.min(maxImageY, bounds.maxY + paddingY)

  return {
    finalX1,
    finalY1,
    finalX2,
    finalY2,
    finalCropWidth: finalX2 - finalX1,
    finalCropHeight: finalY2 - finalY1,
  }
}

export const getDisplayScale = (containerWidth, finalCropWidth) => (
  containerWidth > 0 && finalCropWidth > 0 ? containerWidth / finalCropWidth : 1
)

export const getFitDisplaySize = ({ naturalHeight, naturalWidth }) => {
  const viewportWidth = window.innerWidth * 0.9
  const viewportHeight = window.innerHeight * 0.9
  const scaleX = viewportWidth / naturalWidth
  const scaleY = viewportHeight / naturalHeight
  const fitScale = Math.min(scaleX, scaleY, 1)

  return {
    height: naturalHeight * fitScale,
    width: naturalWidth * fitScale,
  }
}

export const scaleBoxesForFullScreen = ({ fullImageSize, pixelBoxes }) => {
  const viewportWidth = window.innerWidth * 0.9
  const viewportHeight = window.innerHeight * 0.9
  const scaleX = viewportWidth / fullImageSize.width
  const scaleY = viewportHeight / fullImageSize.height
  const fullScale = Math.min(scaleX, scaleY, 1)

  return pixelBoxes.map((box) => ({
    ...box,
    scaledPoints: box.points.map((point) => ({ x: point.x * fullScale, y: point.y * fullScale })),
  }))
}
