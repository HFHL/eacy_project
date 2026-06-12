export const getRotatedPreviewLayout = ({ pageAngle, scaledHeight, scaledWidth }) => {
  const needsClientRotation = pageAngle && pageAngle !== 0
  if (!needsClientRotation || scaledWidth <= 0 || scaledHeight <= 0) {
    return {
      innerOffsetX: 0,
      innerOffsetY: 0,
      needsClientRotation: false,
      scrollBoxHeight: scaledHeight,
      scrollBoxWidth: scaledWidth,
    }
  }

  const theta = (-pageAngle * Math.PI) / 180
  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)
  const corners = [
    { x: 0, y: 0 },
    { x: scaledWidth, y: 0 },
    { x: 0, y: scaledHeight },
    { x: scaledWidth, y: scaledHeight },
  ].map(({ x, y }) => ({
    x: x * cosT - y * sinT,
    y: x * sinT + y * cosT,
  }))
  const minX = Math.min(...corners.map((point) => point.x))
  const maxX = Math.max(...corners.map((point) => point.x))
  const minY = Math.min(...corners.map((point) => point.y))
  const maxY = Math.max(...corners.map((point) => point.y))

  return {
    innerOffsetX: -minX,
    innerOffsetY: -minY,
    needsClientRotation,
    scrollBoxHeight: Math.ceil(maxY - minY),
    scrollBoxWidth: Math.ceil(maxX - minX),
  }
}
