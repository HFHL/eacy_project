/**
 * 文档图片高亮组件 - 仅展示溯源区域
 *
 * sourceLocation 支持 TextIn polygon 和旧 bbox 两种格式。坐标可能是
 * 0-1000 归一化值，也可能是原图像素值，统一转换逻辑在 highlightedImage
 * 纯函数里，避免渲染组件继续膨胀。
 */
import React, { useEffect, useRef, useState } from 'react'

import { EmptyImagePreview, LoadingPreview } from './highlightedImage/PreviewStates'
import { FullScreenImageModal } from './highlightedImage/FullScreenImageModal'
import { HighlightedCropPreview } from './highlightedImage/HighlightedCropPreview'
import { PlainImagePreview } from './highlightedImage/PlainImagePreview'
import {
  buildCropLayout,
  buildPixelBoxData,
  buildPixelBoxQuality,
  getDisplayScale,
  normalizeSourceLocation,
} from './highlightedImage/highlightGeometry'

const HighlightedImage = ({ imageUrl, sourceLocation, loading }) => {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [containerWidth, setContainerWidth] = useState(0)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const containerRef = useRef(null)

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

  if (loading) return <LoadingPreview />
  if (!imageUrl) return <EmptyImagePreview />

  const locations = normalizeSourceLocation(sourceLocation)
  const openModal = () => setModalVisible(true)
  const closeModal = () => setModalVisible(false)

  if (locations.length === 0) {
    return (
      <PlainImagePreview
        containerRef={containerRef}
        imageUrl={imageUrl}
        modalVisible={modalVisible}
        onImageLoad={handleImageLoad}
        onModalClose={closeModal}
        onOpen={openModal}
      />
    )
  }

  const { bounds, pixelBoxes } = buildPixelBoxData(locations, imageSize)
  const pixelBoxQuality = buildPixelBoxQuality(locations)
  const cropLayout = buildCropLayout({ bounds, imageSize })
  const scale = getDisplayScale(containerWidth, cropLayout.finalCropWidth)
  const displayHeight = cropLayout.finalCropHeight * scale

  return (
    <>
      <HighlightedCropPreview
        containerRef={containerRef}
        cropLayout={cropLayout}
        displayHeight={displayHeight}
        imageLoaded={imageLoaded}
        imageSize={imageSize}
        imageUrl={imageUrl}
        locations={locations}
        onImageLoad={handleImageLoad}
        onOpen={openModal}
        pixelBoxes={pixelBoxes}
        pixelBoxQuality={pixelBoxQuality}
        scale={scale}
      />
      <FullScreenImageModal
        imageUrl={imageUrl}
        modalVisible={modalVisible}
        onClose={closeModal}
        pixelBoxes={pixelBoxes}
        pixelBoxQuality={pixelBoxQuality}
      />
    </>
  )
}

export default HighlightedImage
