import React from 'react'
import { Select } from 'antd'
import { AimOutlined } from '@ant-design/icons'

import { ImagePreviewArea } from './ImagePreviewArea'

const { Option } = Select

export const DocumentPreviewPanel = ({
  activeBlockIndex,
  contentList,
  fileType,
  hoveredBlockIndex,
  imageUrl,
  onPageChange,
  pageAngle,
  pageIndex,
  scale,
  sensitiveRegions,
  showAllBoxes,
  totalPages,
}) => (
  <div className="viewer-left">
    <div className="panel-header">
      <AimOutlined /> 文档预览
      {totalPages > 1 && (
        <Select
          value={pageIndex}
          onChange={onPageChange}
          size="small"
          style={{ marginLeft: 16, width: 100 }}
        >
          {Array.from({ length: totalPages }, (_, i) => (
            <Option key={i} value={i}>第 {i + 1} 页</Option>
          ))}
        </Select>
      )}
    </div>

    <ImagePreviewArea
      imageUrl={imageUrl}
      fileType={fileType}
      contentList={contentList}
      activeBlockIndex={activeBlockIndex}
      hoveredBlockIndex={hoveredBlockIndex}
      pageIndex={pageIndex}
      scale={scale}
      showAllBoxes={showAllBoxes}
      sensitiveRegions={sensitiveRegions}
      pageAngle={pageAngle}
    />
  </div>
)
