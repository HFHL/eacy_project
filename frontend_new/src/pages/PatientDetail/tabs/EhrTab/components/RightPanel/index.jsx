/**
 * 右侧面板组件 - 文档溯源预览
 * 显示选中字段的来源文档信息和内容预览
 * 支持显示文档图片并高亮来源区域
 */
import React, { useState, useEffect, useRef } from 'react'
import {
  Card,
  Typography,
  Tag,
  Button,
  Space,
  Tooltip,
  Spin,
  Empty,
  List,
  Divider,
  Modal
} from 'antd'
import {
  FileTextOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  LoadingOutlined,
  HistoryOutlined,
  UserOutlined,
  RobotOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  ZoomInOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { maskSensitiveField } from '@/utils/sensitiveUtils'
import { appThemeToken } from '@/styles/themeTokens'
import PdfPageWithHighlight from '@/components/PdfPageWithHighlight'

const { Text, Title } = Typography

// 变更类型映射
const CHANGE_TYPE_MAP = {
  'extract': { label: 'AI抽取', color: 'blue', icon: <RobotOutlined /> },
  'manual_edit': { label: '手动编辑', color: 'green', icon: <UserOutlined /> },
  'merge': { label: '合并', color: 'purple', icon: <HistoryOutlined /> },
  'merge_append': { label: '累加合并', color: 'purple', icon: <HistoryOutlined /> },
  'delete': { label: '删除', color: 'red', icon: <HistoryOutlined /> },
  'conflict_resolve_adopt': { label: '采用新值', color: 'orange', icon: <HistoryOutlined /> },
  'conflict_resolve_keep': { label: '保留原值', color: 'cyan', icon: <HistoryOutlined /> }
}

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
 */
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
      const scale = Math.min(scaleX, scaleY, 1)
      
      setDisplaySize({
        width: naturalWidth * scale,
        height: naturalHeight * scale
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
            <>
              {/* 页码标签 */}
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
            </>
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
          {/* 页码标签 */}
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

          {/* 点击放大提示 */}
          {imageLoaded && (
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
          )}
        </>
      )}
    </div>
    <FullScreenImageModal />
    </>
  )
}

const RightPanel = ({ 
  // 选中的字段信息
  selectedField,
  // 项目表单：选中的文档（用于直接预览原文档）
  selectedDocument,
  // 字段溯源历史
  fieldHistory,
  // 加载状态
  historyLoading,
  // 文档图片URL
  documentImageUrl,
  imageLoading,
  // 文档预览URL（用于直接预览原文档）
  documentPreviewUrl,
  documentPreviewLoading = false,
  // 来源位置信息
  sourceLocation,
  // 兜底文档（无变更历史时由字段类型规则匹配到的关联文档）
  fallbackDocument = null,
  // 事件处理
  onViewFullDocument,
  onViewDocument,
  onReExtract,
  extracting = false
}) => {
  // 获取最新的变更记录
  const latestHistory = fieldHistory && fieldHistory.length > 0 ? fieldHistory[0] : null
  // 是否处于兜底模式：有选中字段、无可溯源历史、但有兜底文档
  const isFallbackMode = selectedField && !latestHistory?.source_document_id && !!fallbackDocument
  const isDocumentMode = !selectedField && !!selectedDocument

  const getFileExt = (nameOrUrl) => {
    if (!nameOrUrl) return ''
    const value = String(nameOrUrl).toLowerCase()
    if (value.includes('image/jpeg') || value.includes('image/jpg')) return 'jpg'
    if (value.includes('image/png')) return 'png'
    if (value.includes('image/webp')) return 'webp'
    if (value.includes('image/gif')) return 'gif'
    if (value.includes('application/pdf')) return 'pdf'
    const raw = String(nameOrUrl).split('?')[0].split('#')[0]
    const idx = raw.lastIndexOf('.')
    if (idx === -1) return ''
    return raw.slice(idx + 1).toLowerCase()
  }

  const previewExt = getFileExt(documentPreviewUrl) || getFileExt(selectedDocument?.fileName || selectedDocument?.name)
  const isPdf = previewExt === 'pdf'
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(previewExt)

  // 溯源模式下，用同样的逻辑判断文档类型（documentImageUrl 通常是 temp_url）
  const sourceName = Array.isArray(sourceLocation)
    ? sourceLocation.find(item => item?.file_name || item?.source_document_name)?.file_name || sourceLocation.find(item => item?.file_name || item?.source_document_name)?.source_document_name
    : sourceLocation?.file_name || sourceLocation?.source_document_name
  const sourceMime = Array.isArray(sourceLocation)
    ? sourceLocation.find(item => item?.mime_type)?.mime_type
    : sourceLocation?.mime_type
  const traceExt = getFileExt(documentImageUrl) || getFileExt(sourceName) || getFileExt(sourceMime) || getFileExt(latestHistory?.source_document_name) || getFileExt(fallbackDocument?.name)
  const traceIsPdf = traceExt === 'pdf'
  const traceIsImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(traceExt)
  const traceDocId =
    (Array.isArray(sourceLocation) ? sourceLocation.find(item => item?.document_id)?.document_id : sourceLocation?.document_id) ||
    latestHistory?.source_document_id ||
    selectedField?.document_id ||
    selectedField?.documentId ||
    selectedField?.source_document_id ||
    fallbackDocument?.id

  return (
    <Card 
      title={
        <Space>
          {isDocumentMode ? <EyeOutlined /> : <HistoryOutlined />}
          <span>{isDocumentMode ? '文档预览' : '文档溯源'}</span>
        </Space>
      }
      size="small" 
      style={{ 
        border: 'none',
        borderRadius: 0,
        height: '100%'
      }}
      styles={{ body: { padding: '12px', height: 'calc(100% - 46px)', overflow: 'auto' } }}
    >
      {isDocumentMode ? (
        <div>
          <div style={{
            marginBottom: 12,
            padding: 12,
            background: 'rgba(82, 196, 26, 0.1)',
            borderRadius: 6,
            border: `1px solid ${appThemeToken.colorSuccess}`
          }}>
            <Text strong style={{ fontSize: 14 }}>
              {selectedDocument?.fileName || selectedDocument?.name || '未命名文档'}
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              文档ID: {selectedDocument?.id || '-'}
            </Text>
          </div>

          <div style={{ marginBottom: 12, textAlign: 'center' }}>
            <Space>
              <Button
                size="small"
                icon={<EyeOutlined />}
                disabled={!selectedDocument?.id}
                onClick={() => onViewDocument && onViewDocument(selectedDocument)}
              >
                查看完整文档
              </Button>
            </Space>
          </div>

          {documentPreviewLoading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spin tip="加载文档..." />
            </div>
          ) : documentPreviewUrl ? (
            <div style={{ border: `1px solid ${appThemeToken.colorBorder}`, borderRadius: 6, overflow: 'hidden' }}>
              {isPdf ? (
                <div style={{ maxHeight: '70vh', overflow: 'auto', padding: 8, display: 'flex', justifyContent: 'center' }}>
                  <PdfPageWithHighlight
                    pdfUrl={documentPreviewUrl}
                    maxWidth="100%"
                    renderAllPages
                    loading={false}
                  />
                </div>
              ) : isImage ? (
                <img
                  src={documentPreviewUrl}
                  alt="document-preview"
                  style={{ width: '100%', display: 'block' }}
                />
              ) : (
                <Empty
                  description="该文档类型暂不支持内嵌预览，请点击「查看完整文档」"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )}
            </div>
          ) : (
            <Empty
              description="暂无可预览链接"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </div>
      ) : historyLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin tip="加载溯源信息..." />
        </div>
      ) : selectedField ? (
        <div>
          {/* 当前选中字段信息 */}
          <div style={{ 
            marginBottom: 12, 
            padding: 12, 
            background: appThemeToken.colorPrimaryBg, 
            borderRadius: 6,
            border: `1px solid ${appThemeToken.colorPrimaryBorder}`
          }}>
            <Text strong style={{ fontSize: 14 }}>
              {selectedField.name || selectedField.fieldName}
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              字段ID: {selectedField.id || selectedField.fieldId}
            </Text>
          </div>

          {/* 兜底匹配提示 */}
          {isFallbackMode && (
            <div style={{
              marginBottom: 12,
              padding: '8px 12px',
              background: 'rgba(250, 173, 20, 0.1)',
              borderRadius: 6,
              border: `1px solid ${appThemeToken.colorWarning}`
            }}>
              <Text style={{ fontSize: 12, color: appThemeToken.colorWarning }}>
                <FileTextOutlined style={{ marginRight: 4 }} />
                未找到精确溯源记录，已根据字段类型规则匹配到关联文档
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                文档: {fallbackDocument?.name || fallbackDocument?.fileName || '未命名文档'}
              </Text>
            </div>
          )}

          {/* 文档图片预览区域 */}
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
              {isFallbackMode ? '关联文档:' : '来源文档:'}
            </Text>
            {imageLoading ? (
              <div style={{ 
                height: 120, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                background: appThemeToken.colorFillTertiary,
                borderRadius: 4
              }}>
                <Spin tip="加载文档..." />
              </div>
            ) : documentImageUrl ? (
              traceIsPdf ? (
                <div style={{ border: `1px solid ${appThemeToken.colorBorder}`, borderRadius: 6, overflow: 'auto', padding: 8, maxHeight: '70vh' }}>
                  <PdfPageWithHighlight
                    pdfUrl={documentImageUrl}
                    pageNumber={Array.isArray(sourceLocation) ? null : (sourceLocation?.page ?? null)}
                    locations={Array.isArray(sourceLocation) ? sourceLocation : (sourceLocation ? [sourceLocation] : [])}
                    maxWidth="100%"
                    loading={false}
                  />
                </div>
              ) : traceIsImage ? (
                <HighlightedImage
                  imageUrl={documentImageUrl}
                  sourceLocation={sourceLocation}
                  loading={false}
                />
              ) : (
                <Empty
                  description="该文档类型暂不支持内嵌预览，请点击「查看完整文档」"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )
            ) : (
              <Empty 
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无来源文档"
              />
            )}
          </div>

          {/* 最新变更信息 */}
          {latestHistory && (
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                最新变更:
              </Text>
              <div style={{ 
                padding: 12, 
                background: appThemeToken.colorFillTertiary, 
                borderRadius: 6,
                border: `1px solid ${appThemeToken.colorBorder}`
              }}>
                <Space wrap size={[8, 4]}>
                  <Tag 
                    color={CHANGE_TYPE_MAP[latestHistory.change_type]?.color || 'default'}
                    icon={CHANGE_TYPE_MAP[latestHistory.change_type]?.icon}
                  >
                    {CHANGE_TYPE_MAP[latestHistory.change_type]?.label || latestHistory.change_type}
                  </Tag>
                  {latestHistory.operator_name && (
                    <Tag icon={latestHistory.operator_type === 'ai' ? <RobotOutlined /> : <UserOutlined />}>
                      {latestHistory.operator_name}
                    </Tag>
                  )}
                </Space>
                
                {latestHistory.source_document_name && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <FileTextOutlined style={{ marginRight: 4 }} />
                      {latestHistory.source_document_name}
                    </Text>
                  </div>
                )}
                
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {dayjs(latestHistory.created_at).format('YYYY-MM-DD HH:mm:ss')}
                  </Text>
                </div>
                
                {latestHistory.new_value && (
                  <div style={{ marginTop: 8, padding: 8, background: appThemeToken.colorInfoBg || appThemeToken.colorPrimaryBg, borderRadius: 4 }}>
                    <Text style={{ fontSize: 12 }}>
                      值: {(() => {
                        const raw = typeof latestHistory.new_value === 'object'
                          ? JSON.stringify(latestHistory.new_value).substring(0, 200)
                          : String(latestHistory.new_value).substring(0, 200)
                        if (selectedField?.sensitive) {
                          return maskSensitiveField(raw, selectedField.name, selectedField.id)
                        }
                        return raw.length > 100 ? raw.substring(0, 100) + '...' : raw
                      })()}
                    </Text>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          {traceDocId && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <Space>
                <Button 
                  size="small" 
                  icon={<EyeOutlined />}
                  onClick={() => onViewFullDocument && onViewFullDocument(traceDocId)}
                >
                  查看完整文档
                </Button>
              </Space>
            </div>
          )}

          <Divider style={{ margin: '12px 0' }} />

          {/* 变更历史列表 */}
          {fieldHistory && fieldHistory.length > 0 && (
            <div>
              <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                变更历史 ({fieldHistory.length}):
              </Text>
              <List
                size="small"
                dataSource={fieldHistory.slice(0, 10)} // 最多显示10条
                renderItem={(item, index) => (
                  <List.Item style={{ padding: '8px 0', borderBottom: `1px solid ${appThemeToken.colorBorder}` }}>
                    <div style={{ width: '100%' }}>
                      <Space size={4}>
                        <Tag 
                          color={CHANGE_TYPE_MAP[item.change_type]?.color || 'default'}
                          style={{ fontSize: 12 }}
                        >
                          {CHANGE_TYPE_MAP[item.change_type]?.label || item.change_type}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(item.created_at).format('MM-DD HH:mm')}
                        </Text>
                      </Space>
                      {item.operator_name && (
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                          by {item.operator_name}
                        </Text>
                      )}
                    </div>
                  </List.Item>
                )}
              />
              {fieldHistory.length > 10 && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', marginTop: 8 }}>
                  还有 {fieldHistory.length - 10} 条历史记录...
                </Text>
              )}
            </div>
          )}
        </div>
      ) : (
        /* 空状态 */
        <div style={{ textAlign: 'center', padding: 60, color: appThemeToken.colorTextTertiary }}>
          <FileTextOutlined style={{ fontSize: 16 }} />
          <div style={{ marginTop: 16, fontSize: 14 }}>
            点击字段值查看来源文档
          </div>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            文档溯源预览区域
          </div>
        </div>
      )}
    </Card>
  )
}

export default RightPanel
