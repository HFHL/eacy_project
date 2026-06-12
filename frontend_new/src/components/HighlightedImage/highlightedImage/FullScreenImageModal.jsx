import React, { useState } from 'react'
import { Modal } from 'antd'

import {
  getFitDisplaySize,
  scaleBoxesForFullScreen,
} from './highlightGeometry'
import { HighlightOverlay } from './HighlightOverlay'
import { ModalCloseButton } from './ModalCloseButton'

export const FullScreenImageModal = ({
  imageUrl,
  modalVisible,
  onClose,
  pixelBoxes,
  pixelBoxQuality,
}) => {
  const [fullImageSize, setFullImageSize] = useState({ width: 0, height: 0 })
  const [fullImageLoaded, setFullImageLoaded] = useState(false)
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })

  const handleFullImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target
    setFullImageSize({ width: naturalWidth, height: naturalHeight })
    setFullImageLoaded(true)
    setDisplaySize(getFitDisplaySize({ naturalHeight, naturalWidth }))
  }

  const fullScreenBoxes = fullImageLoaded && fullImageSize.width > 0
    ? scaleBoxesForFullScreen({ fullImageSize, pixelBoxes })
    : []

  return (
    <Modal
      open={modalVisible}
      onCancel={onClose}
      footer={null}
      width="100%"
      style={{
        top: 0,
        paddingBottom: 0,
        maxWidth: '100vw',
      }}
      styles={{
        body: {
          padding: 0,
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.9)',
          position: 'relative',
        },
      }}
      closeIcon={<ModalCloseButton onClose={onClose} />}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
      >
        <div style={{ position: 'relative', width: displaySize.width || 'auto', height: displaySize.height || 'auto' }}>
          <img
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
              imageOrientation: 'none',
            }}
          />
          {fullImageLoaded && displaySize.width > 0 && displaySize.height > 0 && (
            <HighlightOverlay
              pixelBoxes={fullScreenBoxes}
              pixelBoxQuality={pixelBoxQuality}
              pointsForBox={(box) => box.scaledPoints}
              viewBox={`0 0 ${displaySize.width} ${displaySize.height}`}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            />
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
            pointerEvents: 'none',
          }}>
            第 {pixelBoxes[0]?.page || 1} 页
          </div>
        )}
      </div>
    </Modal>
  )
}
