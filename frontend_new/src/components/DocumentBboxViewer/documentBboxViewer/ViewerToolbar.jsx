import React from 'react'
import { Badge, Select, Slider, Switch } from 'antd'
import { ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'

const { Option } = Select

export const ViewerToolbar = ({
  contentList,
  filterType,
  handleZoomIn,
  handleZoomOut,
  isPdf,
  scale,
  setFilterType,
  setScale,
  setShowAllBoxes,
  showAllBoxes,
  title,
  typeCounts,
}) => (
  <div className="viewer-toolbar">
    <div className="toolbar-left">
      <span className="viewer-title">{title}</span>
      <Badge count={contentList.length} style={{ backgroundColor: appThemeToken.colorPrimary }}>
        <span style={{ marginLeft: 8 }}>内容块</span>
      </Badge>
    </div>

    <div className="toolbar-center">
      {isPdf ? (
        <span style={{ color: appThemeToken.colorTextTertiary }}>PDF 原文档预览模式</span>
      ) : (
        <>
          <span style={{ marginRight: 8 }}>缩放:</span>
          <ZoomOutOutlined onClick={handleZoomOut} style={{ cursor: 'pointer', marginRight: 8 }} />
          <Slider
            value={scale}
            min={0.05}
            max={3}
            step={0.05}
            onChange={setScale}
            style={{ width: 100 }}
          />
          <ZoomInOutlined onClick={handleZoomIn} style={{ cursor: 'pointer', marginLeft: 8 }} />
          <span style={{ marginLeft: 8 }}>{Math.round(scale * 100)}%</span>
        </>
      )}
    </div>

    <div className="toolbar-right">
      {!isPdf && (
        <>
          <span style={{ marginRight: 8 }}>显示全部框:</span>
          <Switch checked={showAllBoxes} onChange={setShowAllBoxes} size="small" />
        </>
      )}

      <Select
        value={filterType}
        onChange={setFilterType}
        style={{ width: 120, marginLeft: 16 }}
        size="small"
      >
        <Option value="all">全部 ({contentList.length})</Option>
        <Option value="text">文本 ({typeCounts.text || 0})</Option>
        <Option value="table">表格 ({typeCounts.table || 0})</Option>
        <Option value="image">图片 ({typeCounts.image || 0})</Option>
      </Select>
    </div>
  </div>
)
