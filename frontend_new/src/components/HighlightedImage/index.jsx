/**
 * 文档图片高亮组件 - 仅展示溯源区域
 *
 * bbox 坐标单位在不同抽取器之间不统一：
 *   - LLM/Agent 流水线：0-1000 归一化
 *   - Textin / OCR 直出：原图像素坐标（常见量级 ~4000~5000）
 * 因此按 bbox 最大值做自动判断：
 *   maxVal <= 1100  → 视为归一化，按 (v/1000)*imgSize 转像素
 *   maxVal  > 1100  → 视为像素坐标，直接使用
 *
 * sourceLocation 支持两种格式：
 * - TextIn 原始 polygon: { polygon: [x1,y1,x2,y2,x3,y3,x4,y4], page_width, page_height, page: 1 }
 * - 兼容旧 bbox: { bbox: [x1, y1, x2, y2], page: 1 }
 * 也接受单个对象或对象数组（多溯源片段）。
 *
 * 该组件最初实现于 EhrTab 内部，已抽到 src/components/HighlightedImage 共享，
 * 让科研项目（FieldSourceModal）和病历夹（EhrTab）走同一条渲染路径。
 */
import React, { useState, useEffect, useRef } from 'react'
import { Spin, Empty, Modal, Button } from 'antd'
import { CloseOutlined, ZoomInOutlined } from '@ant-design/icons'
import { appThemeToken } from '@/styles/themeTokens'

const HighlightedImage = ({ imageUrl, sourceLocation, loading }) => {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [containerWidth, setContainerWidth] = useState(0)
  const containerRef = useRef(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)

  // 监听容器宽度变化
  useEffect(() => {
    const updateContainerWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }
    updateContainerWidth()
    window.addEventListener('resize', updateContainerWidth)
    return () => window.removeEventListener('resize', updateContainerWidth)
  }, [])

  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target
    setImageSize({ width: naturalWidth, height: naturalHeight })
    setImageLoaded(true)
  }

  if (loading) {
    return (
      <div style={{
        height: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: appThemeToken.colorFillTertiary,
        borderRadius: 4
      }}>
        <Spin tip="加载片段..." />
      </div>
    )
  }

  if (!imageUrl) {
    return (
      <div style={{
        height: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: appThemeToken.colorFillTertiary,
        borderRadius: 4,
        border: `1px dashed ${appThemeToken.colorBorder}`
      }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无来源文档"
        />
      </div>
    )
  }

  // 标准化 sourceLocation：统一为数组格式
  const normalizeSourceLocation = (loc) => {
    if (!loc) return []
    const isValid = (item) => item && (
      (Array.isArray(item.polygon) && item.polygon.length >= 8) ||
      (Array.isArray(item.bbox) && item.bbox.length >= 4)
    )
    if (Array.isArray(loc)) {
      return loc.filter(isValid)
    }
    if (isValid(loc)) {
      return [loc]
    }
    return []
  }

  const locations = normalizeSourceLocation(sourceLocation)

  // 无 bbox 时使用的全屏预览（避免引用 FullScreenImageModal 造成 TDZ）
  const SimpleFullScreenImageModal = () => (
    <Modal
      open={modalVisible}
      onCancel={() => setModalVisible(false)}
      footer={null}
      width="100%"
      style={{ top: 0, paddingBottom: 0, maxWidth: '100vw' }}
      styles={{
        body: {
          padding: 0,
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.9)',
          position: 'relative'
        }
      }}
      closeIcon={
        <Button
          type="text"
          icon={<CloseOutlined />}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 1000,
            color: 'white',
            background: 'rgba(0, 0, 0, 0.6)',
            border: 'none',
            fontSize: 20,
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%'
          }}
          onClick={() => setModalVisible(false)}
        />
      }
    >
      <img
        src={imageUrl}
        alt="source-document-full"
        style={{ maxWidth: '90vw', maxHeight: '90vh' }}
      />
    </Modal>
  )

  // 没有位置坐标：仍然展示原图（不高亮/不裁剪）
  if (locations.length === 0) {
    return (
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          borderRadius: 6,
          overflow: 'hidden',
          border: `1px solid ${appThemeToken.colorBorder}`,
          background: appThemeToken.colorFillTertiary,
          cursor: 'zoom-in'
        }}
        onClick={() => setModalVisible(true)}
      >
        <img
          src={imageUrl}
          alt="source-document"
          style={{ width: '100%', display: 'block' }}
          onLoad={handleImageLoad}
        />
        <div style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          background: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          padding: '4px 8px',
          borderRadius: 2,
          fontSize: 12,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
          <ZoomInOutlined />
          <span>点击放大</span>
        </div>
        <SimpleFullScreenImageModal />
      </div>
    )
  }

  const { width: imgW, height: imgH } = imageSize

  const scalePointToImage = (x, y, loc) => {
    const pageW = Number(loc?.page_width || 0)
    const pageH = Number(loc?.page_height || 0)
    if (pageW > 0 && pageH > 0) {
      return { x: (x / pageW) * imgW, y: (y / pageH) * imgH }
    }
    const rawCoords = Array.isArray(loc?.polygon) && loc.polygon.length >= 8
      ? loc.polygon
      : Array.isArray(loc?.bbox)
        ? loc.bbox
        : [x, y]
    const maxV = Math.max(...rawCoords.map(value => Math.abs(Number(value) || 0)))
    if (maxV <= 1100) {
      return { x: (x / 1000) * imgW, y: (y / 1000) * imgH }
    }
    return { x, y }
  }

  const toPixelPolygon = (loc) => {
    if (Array.isArray(loc?.polygon) && loc.polygon.length >= 8) {
      const raw = loc.polygon.map(Number)
      return [
        scalePointToImage(raw[0], raw[1], loc),
        scalePointToImage(raw[2], raw[3], loc),
        scalePointToImage(raw[4], raw[5], loc),
        scalePointToImage(raw[6], raw[7], loc),
      ]
    }
    if (Array.isArray(loc?.bbox) && loc.bbox.length >= 4) {
      const [rawX1, rawY1, rawX2, rawY2] = loc.bbox.slice(0, 4).map(Number)
      const p1 = scalePointToImage(rawX1, rawY1, loc)
      const p2 = scalePointToImage(rawX2, rawY2, loc)
      return [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p1.y },
        { x: p2.x, y: p2.y },
        { x: p1.x, y: p2.y },
      ]
    }
    return []
  }

  // 计算所有 polygon 的合并外接区域（仅用于裁剪显示，高亮仍使用原始 polygon）
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const pixelBoxes = locations.map(loc => {
    const points = toPixelPolygon(loc)
    const xs = points.map(point => point.x)
    const ys = points.map(point => point.y)
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
      page: loc.page || loc.page_no || 1
    }
  })

  const cropWidth = maxX - minX
  const cropHeight = maxY - minY

  // 增加一点边距，让片段有上下文 (左右各30%, 上下各50%)
  const paddingX = Math.max(cropWidth * 0.3, 20)
  const paddingY = Math.max(cropHeight * 0.5, 20)

  const finalX1 = Math.max(0, minX - paddingX)
  const finalY1 = Math.max(0, minY - paddingY)
  const finalX2 = Math.min(imgW, maxX + paddingX)
  const finalY2 = Math.min(imgH, maxY + paddingY)

  const finalCropWidth = finalX2 - finalX1
  const finalCropHeight = finalY2 - finalY1

  // 计算显示比例：将裁剪后的区域宽度缩放到容器宽度
  const scale = (containerWidth > 0 && finalCropWidth > 0) ? (containerWidth / finalCropWidth) : 1
  const displayHeight = finalCropHeight * scale

  // 全屏 Modal 组件
  const FullScreenImageModal = () => {
    const [fullImageSize, setFullImageSize] = useState({ width: 0, height: 0 })
    const [fullImageLoaded, setFullImageLoaded] = useState(false)
    const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })
    const fullImageRef = useRef(null)
    const containerRef2 = useRef(null)

    const handleFullImageLoad = (e) => {
      const { naturalWidth, naturalHeight } = e.target
      setFullImageSize({ width: naturalWidth, height: naturalHeight })
      setFullImageLoaded(true)

      // 计算实际显示尺寸
      const viewportWidth = window.innerWidth * 0.9
      const viewportHeight = window.innerHeight * 0.9
      const scaleX = viewportWidth / naturalWidth
      const scaleY = viewportHeight / naturalHeight
      const fitScale = Math.min(scaleX, scaleY, 1)

      setDisplaySize({
        width: naturalWidth * fitScale,
        height: naturalHeight * fitScale
      })
    }

    // 计算全屏时的位置（基于实际显示尺寸）
    const fullScreenBoxes = fullImageLoaded && fullImageSize.width > 0 ? pixelBoxes.map(box => {
      const viewportWidth = window.innerWidth * 0.9
      const viewportHeight = window.innerHeight * 0.9
      const scaleX = viewportWidth / fullImageSize.width
      const scaleY = viewportHeight / fullImageSize.height
      const fullScale = Math.min(scaleX, scaleY, 1)

      return {
        ...box,
        scaledX1: box.x1 * fullScale,
        scaledY1: box.y1 * fullScale,
        scaledWidth: (box.x2 - box.x1) * fullScale,
        scaledHeight: (box.y2 - box.y1) * fullScale,
        scaledPoints: box.points.map(point => ({ x: point.x * fullScale, y: point.y * fullScale }))
      }
    }) : []

    return (
      <Modal
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width="100%"
        style={{
          top: 0,
          paddingBottom: 0,
          maxWidth: '100vw'
        }}
        styles={{
          body: {
            padding: 0,
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.9)',
            position: 'relative'
          }
        }}
        closeIcon={
          <Button
            type="text"
            icon={<CloseOutlined />}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              zIndex: 1000,
              color: 'white',
              background: 'rgba(0, 0, 0, 0.6)',
              border: 'none',
              fontSize: 20,
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%'
            }}
            onClick={() => setModalVisible(false)}
          />
        }
      >
        <div
          ref={containerRef2}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%'
          }}
        >
          <div style={{ position: 'relative', width: displaySize.width || 'auto', height: displaySize.height || 'auto' }}>
            <img
              ref={fullImageRef}
              src={imageUrl}
              alt="溯源图片全屏"
              onLoad={handleFullImageLoad}
              style={{
                width: displaySize.width || undefined,
                height: displaySize.height || undefined,
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain',
                display: 'block',
                imageOrientation: 'none'
              }}
            />
            {fullImageLoaded && displaySize.width > 0 && displaySize.height > 0 && (
              <svg
                viewBox={`0 0 ${displaySize.width} ${displaySize.height}`}
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
              >
                {fullScreenBoxes.map((box, index) => (
                  <polygon
                    key={index}
                    points={box.scaledPoints.map(point => `${point.x},${point.y}`).join(' ')}
                    fill="rgba(255, 77, 79, 0.12)"
                    stroke={appThemeToken.colorError}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            )}
          </div>

          {fullImageLoaded && fullImageSize.width > 0 && (
            <div style={{
              position: 'fixed',
              bottom: 20,
              right: 20,
              background: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: 4,
              fontSize: 14,
              zIndex: 20,
              pointerEvents: 'none'
            }}>
              第 {pixelBoxes[0]?.page || 1} 页
            </div>
          )}
        </div>
      </Modal>
    )
  }

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: imageLoaded ? Math.max(80, displayHeight) : 120,
          overflow: 'hidden',
          border: `1px solid ${appThemeToken.colorBorder}`,
          borderRadius: 4,
          background: appThemeToken.colorBgContainer,
          cursor: imageLoaded ? 'pointer' : 'default'
        }}
        onClick={() => {
          if (imageLoaded && imageUrl) {
            setModalVisible(true)
          }
        }}
      >
        <img
          src={imageUrl}
          alt="溯源图片"
          onLoad={handleImageLoad}
          style={{
            position: 'absolute',
            // 通过负值偏移定位到裁剪区域
            left: -finalX1 * scale,
            top: -finalY1 * scale,
            // 缩放整张图片
            width: imgW * scale,
            height: 'auto',
            display: 'block',
            maxWidth: 'none',
            visibility: imageLoaded ? 'visible' : 'hidden',
            // 禁用 EXIF 自动旋转，bbox 与 Textin 原图坐标系保持一致
            imageOrientation: 'none'
          }}
        />

        {imageLoaded && imgW > 0 && (
          <svg
            viewBox={`0 0 ${finalCropWidth} ${finalCropHeight}`}
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
          >
            {pixelBoxes.map((box, index) => (
              <polygon
                key={index}
                points={box.points.map(point => `${point.x - finalX1},${point.y - finalY1}`).join(' ')}
                fill="rgba(255, 77, 79, 0.12)"
                stroke={appThemeToken.colorError}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        )}

        {imageLoaded && imgW > 0 && (
          <>
            <div style={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              background: 'rgba(0,0,0,0.65)',
              color: 'white',
              padding: '2px 8px',
              borderRadius: 2,
              fontSize: 12,
              zIndex: 2,
              pointerEvents: 'none'
            }}>
              第 {pixelBoxes[0]?.page || 1} 页 | {locations.length > 1 ? `${locations.length} 个溯源片段` : '溯源片段'}
            </div>

            <div style={{
              position: 'absolute',
              top: 4,
              left: 4,
              background: 'rgba(0,0,0,0.5)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: 2,
              fontSize: 12,
              zIndex: 2,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              <ZoomInOutlined />
              <span>点击放大</span>
            </div>
          </>
        )}
      </div>
      <FullScreenImageModal />
    </>
  )
}

export default HighlightedImage
