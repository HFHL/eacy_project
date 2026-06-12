import React from 'react'
import { FileTextOutlined } from '@ant-design/icons'

import { ContentBlockList } from './ContentBlockList'

export const ContentBlocksPanel = ({
  activeBlockIndex,
  contentList,
  filterType,
  onBlockClick,
  onBlockHover,
}) => (
  <div className="viewer-right">
    <div className="panel-header">
      <FileTextOutlined /> 解析内容
    </div>
    <ContentBlockList
      contentList={contentList}
      activeBlockIndex={activeBlockIndex}
      onBlockHover={onBlockHover}
      onBlockClick={onBlockClick}
      filterType={filterType}
    />
  </div>
)
