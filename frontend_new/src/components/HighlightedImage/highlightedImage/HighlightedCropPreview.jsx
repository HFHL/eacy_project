import React from 'react'
import { ZoomInOutlined } from '@ant-design/icons'

import { appThemeToken } from '@/styles/themeTokens'
import { HighlightOverlay } from './HighlightOverlay'

export const HighlightedCropPreview = ({
  containerRef,
  cropLayout,
  displayHeight,
  imageLoaded,
  imageSize,
  imageUrl,
  locations,
  onImageLoad,
  onOpen,
  pixelBoxes,
  pixelBoxQuality,
  scale,
}) => {
  const { finalCropHeight, finalCropWidth, finalX1, finalY1 } = cropLayout
  const imgW = imageSize.width

  return (
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
        cursor: imageLoaded ? 'pointer' : 'default',
      }}
      onClick={() => {
        if (imageLoaded && imageUrl) onOpen()
      }}
    >
      <img
        src={imageUrl}
        alt="溯源图片"
        onLoad={onImageLoad}
        style={{
          position: 'absolute',
          left: -finalX1 * scale,
          top: -finalY1 * scale,
          width: imgW * scale,
          height: 'auto',
          display: 'block',
          maxWidth: 'none',
          visibility: imageLoaded ? 'visible' : 'hidden',
          imageOrientation: 'none',
        }}
      />

      {imageLoaded && imgW > 0 && (
        <HighlightOverlay
          pixelBoxes={pixelBoxes}
          pixelBoxQuality={pixelBoxQuality}
          pointsForBox={(box) => box.points.map((point) => ({
            x: point.x - finalX1,
            y: point.y - finalY1,
          }))}
          viewBox={`0 0 ${finalCropWidth} ${finalCropHeight}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
        />
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
            pointerEvents: 'none',
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
            gap: 4,
          }}>
            <ZoomInOutlined />
            <span>点击放大</span>
          </div>
        </>
      )}
    </div>
  )
}
