import React from 'react'
import { Modal } from 'antd'
import { ZoomInOutlined } from '@ant-design/icons'

import { appThemeToken } from '@/styles/themeTokens'
import { ModalCloseButton } from './ModalCloseButton'

const PlainImageModal = ({ imageUrl, onClose, open }) => (
  <Modal
    open={open}
    onCancel={onClose}
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
        position: 'relative',
      },
    }}
    closeIcon={<ModalCloseButton onClose={onClose} />}
  >
    <img
      src={imageUrl}
      alt="source-document-full"
      style={{ maxWidth: '90vw', maxHeight: '90vh' }}
    />
  </Modal>
)

export const PlainImagePreview = ({
  containerRef,
  imageUrl,
  modalVisible,
  onImageLoad,
  onModalClose,
  onOpen,
}) => (
  <div
    ref={containerRef}
    style={{
      position: 'relative',
      width: '100%',
      borderRadius: 6,
      overflow: 'hidden',
      border: `1px solid ${appThemeToken.colorBorder}`,
      background: appThemeToken.colorFillTertiary,
      cursor: 'zoom-in',
    }}
    onClick={onOpen}
  >
    <img
      src={imageUrl}
      alt="source-document"
      style={{ width: '100%', display: 'block' }}
      onLoad={onImageLoad}
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
      gap: 4,
    }}>
      <ZoomInOutlined />
      <span>点击放大</span>
    </div>
    <PlainImageModal imageUrl={imageUrl} open={modalVisible} onClose={onModalClose} />
  </div>
)
