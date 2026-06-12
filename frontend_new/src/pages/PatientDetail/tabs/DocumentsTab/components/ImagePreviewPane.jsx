import React from 'react'
import { Button, Spin, Tooltip, Typography } from 'antd'
import {
  ReloadOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'
import { appThemeToken } from '../../../../../styles/themeTokens'

const { Text } = Typography

const ImagePreviewPane = ({
  detailLoading,
  documentId,
  dragStart,
  imgOffset,
  imgRotate,
  imgScale,
  isDragging,
  ocrPageNo,
  onFetchPreview,
  previewError,
  previewImageLoading,
  previewLoading,
  previewUrl,
  resolvedOcrPageCount,
  setImgOffset,
  setImgRotate,
  setImgScale,
  setIsDragging,
  setPreviewError,
  setPreviewImageLoading,
  setStart,
  usesOcrPagePreview,
}) => (
  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
    {usesOcrPagePreview && resolvedOcrPageCount > 1 && (
      <div
        style={{
          padding: '8px 16px',
          background: appThemeToken.colorFillTertiary,
          borderBottom: `1px solid ${appThemeToken.colorBorder}`,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Button size="small" disabled={ocrPageNo <= 1 || previewLoading} onClick={() => onFetchPreview(documentId, ocrPageNo - 1)}>
          上一页
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          第 {ocrPageNo} / {resolvedOcrPageCount} 页
        </Text>
        <Button size="small" disabled={ocrPageNo >= resolvedOcrPageCount || previewLoading} onClick={() => onFetchPreview(documentId, ocrPageNo + 1)}>
          下一页
        </Button>
      </div>
    )}

    {!previewError && !previewLoading && !detailLoading && (
      <div
        className="image-toolbar"
        style={{
          padding: '4px 16px',
          background: appThemeToken.colorFillTertiary,
          borderBottom: `1px solid ${appThemeToken.colorBorder}`,
          display: 'flex',
          justifyContent: 'center',
          gap: '16px',
        }}
      >
        <Tooltip title="放大">
          <Button type="text" icon={<ZoomInOutlined />} onClick={() => setImgScale(prev => Math.min(prev + 0.2, 5))} />
        </Tooltip>
        <Tooltip title="缩小">
          <Button type="text" icon={<ZoomOutOutlined />} onClick={() => setImgScale(prev => Math.max(prev - 0.2, 0.2))} />
        </Tooltip>
        <Tooltip title="向左旋转">
          <Button type="text" icon={<RotateLeftOutlined />} onClick={() => setImgRotate(prev => prev - 90)} />
        </Tooltip>
        <Tooltip title="向右旋转">
          <Button type="text" icon={<RotateRightOutlined />} onClick={() => setImgRotate(prev => prev + 90)} />
        </Tooltip>
        <Tooltip title="重置">
          <Button
            type="text"
            icon={<UndoOutlined />}
            onClick={() => {
              setImgScale(1)
              setImgRotate(0)
              setImgOffset({ x: 0, y: 0 })
            }}
          />
        </Tooltip>
      </div>
    )}

    <div
      className="image-preview-container"
      style={{
        position: 'relative',
        flex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '16px',
        background: appThemeToken.colorFillSecondary,
        cursor: isDragging ? 'grabbing' : (imgScale > 1 ? 'move' : 'default'),
        touchAction: 'none',
      }}
      onMouseDown={(event) => {
        if (imgScale <= 1) return
        setIsDragging(true)
        setStart({ x: event.clientX - imgOffset.x, y: event.clientY - imgOffset.y })
        event.preventDefault()
      }}
      onMouseMove={(event) => {
        if (!isDragging) return
        setImgOffset({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y })
      }}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
    >
      {previewImageLoading && !previewError && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1, pointerEvents: 'none' }}>
          <Spin size="large" />
        </div>
      )}
      {previewError ? (
        <div className="preview-placeholder">
          <div className="preview-icon">❌</div>
          <div className="preview-info">
            <Text strong>图片加载失败</Text>
          </div>
          <div className="preview-note">
            <Button size="small" icon={<ReloadOutlined />} onClick={() => onFetchPreview(documentId)} loading={previewLoading}>
              重试
            </Button>
          </div>
        </div>
      ) : (
        <img
          alt="document-preview"
          src={previewUrl}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            opacity: previewImageLoading ? 0.3 : 1,
            transition: isDragging ? 'opacity 0.3s' : 'opacity 0.3s, transform 0.3s cubic-bezier(0.2, 0, 0, 1)',
            transform: `translate(${imgOffset.x}px, ${imgOffset.y}px) scale(${imgScale}) rotate(${imgRotate}deg)`,
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            pointerEvents: 'none',
            WebkitTouchCallout: 'none',
            draggable: false,
          }}
          onLoad={() => {
            setPreviewImageLoading(false)
            setPreviewError(false)
          }}
          onLoadStart={() => setPreviewImageLoading(true)}
          onError={(event) => {
            console.error('图片加载失败:', previewUrl)
            setPreviewImageLoading(false)
            setPreviewError(true)
            event.target.style.display = 'none'
          }}
        />
      )}
    </div>
  </div>
)

export default ImagePreviewPane
