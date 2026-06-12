import React, { useState } from 'react'
import { Spin } from 'antd'

import { ContentBlocksPanel } from './documentBboxViewer/ContentBlocksPanel'
import { DocumentPreviewPanel } from './documentBboxViewer/DocumentPreviewPanel'
import { ViewerToolbar } from './documentBboxViewer/ViewerToolbar'
import './styles.css'

const DocumentBboxViewer = ({
  imageUrl,
  fileType = 'image',
  contentList = [],
  loading = false,
  pageIndex = 0,
  onPageChange,
  totalPages = 1,
  title = '文档坐标溯源',
  sensitiveRegions = [],
  pageAngle = 0,
}) => {
  const [activeBlockIndex, setActiveBlockIndex] = useState(null)
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState(null)
  const [scale, setScale] = useState(1)
  const [showAllBoxes, setShowAllBoxes] = useState(true)
  const [filterType, setFilterType] = useState('all')
  const isPdf = fileType === 'pdf'

  const typeCounts = contentList.reduce((acc, block) => {
    acc[block.type] = (acc[block.type] || 0) + 1
    return acc
  }, {})

  const handleBlockClick = (index) => {
    setActiveBlockIndex(activeBlockIndex === index ? null : index)
  }

  const handleZoomIn = () => setScale((value) => Math.min(value + 0.05, 3))
  const handleZoomOut = () => setScale((value) => Math.max(value - 0.05, 0.05))

  return (
    <div className="document-bbox-viewer">
      <ViewerToolbar
        contentList={contentList}
        filterType={filterType}
        handleZoomIn={handleZoomIn}
        handleZoomOut={handleZoomOut}
        isPdf={isPdf}
        scale={scale}
        setFilterType={setFilterType}
        setScale={setScale}
        setShowAllBoxes={setShowAllBoxes}
        showAllBoxes={showAllBoxes}
        title={title}
        typeCounts={typeCounts}
      />

      <div className="viewer-content">
        {loading ? (
          <div className="viewer-loading">
            <Spin size="large" tip="解析中..." />
          </div>
        ) : (
          <>
            <DocumentPreviewPanel
              imageUrl={imageUrl}
              fileType={fileType}
              contentList={contentList}
              activeBlockIndex={activeBlockIndex}
              hoveredBlockIndex={hoveredBlockIndex}
              pageIndex={pageIndex}
              onPageChange={onPageChange}
              totalPages={totalPages}
              scale={scale}
              showAllBoxes={showAllBoxes}
              sensitiveRegions={sensitiveRegions}
              pageAngle={pageAngle}
            />
            <ContentBlocksPanel
              contentList={contentList}
              activeBlockIndex={activeBlockIndex}
              onBlockHover={setHoveredBlockIndex}
              onBlockClick={handleBlockClick}
              filterType={filterType}
            />
          </>
        )}
      </div>
    </div>
  )
}

export default DocumentBboxViewer
