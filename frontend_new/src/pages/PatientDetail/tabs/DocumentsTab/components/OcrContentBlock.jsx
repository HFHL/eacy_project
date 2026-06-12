import React from 'react'
import { Space, Spin, Tag, Typography } from 'antd'
import { FileTextOutlined, PictureOutlined, TableOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../../../styles/themeTokens'

const { Text } = Typography

const getBlockTypeConfig = (type) => {
  const configs = {
    text: { icon: <FileTextOutlined />, color: 'blue', label: '文本' },
    table: { icon: <TableOutlined />, color: 'green', label: '表格' },
    image: { icon: <PictureOutlined />, color: 'purple', label: '图片' },
    discarded: { icon: <FileTextOutlined />, color: 'default', label: '其他' }
  }
  return configs[type] || configs.discarded
}

const OcrImageBlock = ({
  block,
  imageLoading,
  onImageLoadingChange,
}) => (
  <div className="ocr-image-wrapper" style={{ position: 'relative' }}>
    {block._image_url ? (
      <>
        {imageLoading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1
          }}>
            <Spin size="small" />
          </div>
        )}
        <img
          src={block._image_url}
          alt={block.img_path || 'OCR图片'}
          style={{
            maxWidth: '100%',
            height: 'auto',
            borderRadius: 4,
            border: `1px solid ${appThemeToken.colorBorderSecondary}`,
            display: 'block',
            marginBottom: 8,
            opacity: imageLoading ? 0.3 : 1,
            transition: 'opacity 0.3s',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            pointerEvents: 'auto',
            WebkitTouchCallout: 'none'
          }}
          onLoad={() => onImageLoadingChange(block._image_url, false)}
          onLoadStart={() => onImageLoadingChange(block._image_url, true)}
          onError={(event) => {
            onImageLoadingChange(block._image_url, false)
            const placeholder = event.target.nextElementSibling
            if (placeholder) {
              event.target.style.display = 'none'
              placeholder.style.display = 'flex'
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            return false
          }}
          onDragStart={(event) => {
            event.preventDefault()
            return false
          }}
          onCopy={(event) => {
            event.preventDefault()
            return false
          }}
          draggable={false}
        />
      </>
    ) : null}
    {(!block._image_url || block.img_path) && (
      <div
        className="ocr-image-placeholder"
        style={{
          display: block._image_url ? 'none' : 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 20,
          background: appThemeToken.colorFillTertiary,
          borderRadius: 4,
          border: `1px dashed ${appThemeToken.colorBorder}`
        }}
      >
        <PictureOutlined style={{ fontSize: 16, color: appThemeToken.colorTextTertiary, marginBottom: 8 }} />
        <Text type="secondary">图片: {block.img_path || '未知'}</Text>
      </div>
    )}
  </div>
)

const OcrContentBlock = ({
  block,
  index,
  imageLoading,
  onImageLoadingChange,
}) => {
  const config = getBlockTypeConfig(block.type)
  const pageNum = (block.page_idx || 0) + 1

  return (
    <div className="ocr-content-block">
      <div className="ocr-block-header">
        <Space size="small">
          <Tag icon={config.icon} color={config.color}>
            {config.label}
          </Tag>
          <Tag color="default">第 {pageNum} 页</Tag>
          {block.text_level && (
            <Tag color="orange">H{block.text_level}</Tag>
          )}
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          #{index + 1}
        </Text>
      </div>
      <div className="ocr-block-content">
        {block.type === 'table' && block.table_body ? (
          <div className="ocr-table-wrapper" dangerouslySetInnerHTML={{ __html: block.table_body }} />
        ) : block.type === 'image' ? (
          <OcrImageBlock
            block={block}
            imageLoading={imageLoading}
            onImageLoadingChange={onImageLoadingChange}
          />
        ) : (
          <div className={`ocr-text-content ${block.text_level ? 'ocr-heading' : ''}`}>
            {block.text || <Text type="secondary" italic>（无文本内容）</Text>}
          </div>
        )}
      </div>
    </div>
  )
}

export default OcrContentBlock
