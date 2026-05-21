/**
 * 按 TextIn OCR 检测到的页级 angle 旋转文档预览容器。
 * polygon 坐标在 OCR 校正空间，预览层需同步旋转才能对齐红框。
 */
export function RotatedDocumentPreview({ rotation = 0, children, style, className }) {
  const normalized = Number.isFinite(Number(rotation))
    ? ((Number(rotation) % 360) + 360) % 360
    : 0

  if (!normalized) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <div
      className={className}
      style={{
        ...style,
        transform: `rotate(${normalized}deg)`,
        transformOrigin: 'top center',
      }}
    >
      {children}
    </div>
  )
}

export default RotatedDocumentPreview
