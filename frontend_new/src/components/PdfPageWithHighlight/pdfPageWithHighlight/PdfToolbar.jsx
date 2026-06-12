import React from 'react'
import { Button, Space, Tooltip, Typography } from 'antd'
import {
  ColumnWidthOutlined,
  LeftOutlined,
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'
import { MAX_ZOOM, MIN_ZOOM } from './pdfConstants'

const { Text } = Typography

export const PdfToolbar = ({
  activeIndex,
  currentPage,
  goNext,
  goPrev,
  locationCount,
  numPages,
  resetZoom,
  shouldRenderAllPages,
  showToolbar,
  toggleAll,
  zoom,
  zoomIn,
  zoomOut,
}) => {
  if (!showToolbar) return null

  const hasMultipleEvidences = locationCount > 1
  const label = activeIndex == null
    ? (locationCount > 0 ? '全部' : '—')
    : `${activeIndex + 1}/${locationCount}`

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        marginBottom: 8,
        background: appThemeToken.colorBgContainer,
        border: `1px solid ${appThemeToken.colorBorderSecondary}`,
        borderRadius: 6,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <Space size={4}>
        <Tooltip title="缩小">
          <Button size="small" icon={<ZoomOutOutlined />} onClick={zoomOut} disabled={zoom <= MIN_ZOOM} />
        </Tooltip>
        <Tooltip title="点击重置 100%">
          <Button size="small" type="text" onClick={resetZoom} style={{ minWidth: 56 }}>
            {Math.round(zoom * 100)}%
          </Button>
        </Tooltip>
        <Tooltip title="放大">
          <Button size="small" icon={<ZoomInOutlined />} onClick={zoomIn} disabled={zoom >= MAX_ZOOM} />
        </Tooltip>
        <Tooltip title="适应宽度">
          <Button size="small" icon={<ColumnWidthOutlined />} onClick={resetZoom} />
        </Tooltip>
      </Space>
      {hasMultipleEvidences && (
        <>
          <div style={{ width: 1, height: 18, background: appThemeToken.colorBorderSecondary }} />
          <Space size={4}>
            <Tooltip title="上一条溯源">
              <Button
                size="small"
                icon={<LeftOutlined />}
                onClick={goPrev}
                disabled={activeIndex != null && activeIndex <= 0}
              />
            </Tooltip>
            <Text style={{ fontSize: 12, minWidth: 56, textAlign: 'center', color: appThemeToken.colorTextSecondary }}>
              溯源 {label}
            </Text>
            <Tooltip title="下一条溯源">
              <Button
                size="small"
                icon={<RightOutlined />}
                onClick={goNext}
                disabled={activeIndex != null && activeIndex >= locationCount - 1}
              />
            </Tooltip>
            <Button size="small" type="link" onClick={toggleAll} style={{ padding: 0 }}>
              {activeIndex == null ? '逐条查看' : '显示全部'}
            </Button>
          </Space>
        </>
      )}
      <div style={{ flex: 1 }} />
      {numPages && !shouldRenderAllPages && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          第 {currentPage} / {numPages} 页
        </Text>
      )}
    </div>
  )
}
