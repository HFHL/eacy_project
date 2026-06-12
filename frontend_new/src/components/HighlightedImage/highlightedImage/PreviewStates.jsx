import React from 'react'
import { Empty, Spin } from 'antd'

import { appThemeToken } from '@/styles/themeTokens'

export const LoadingPreview = () => (
  <div style={{
    height: 120,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: appThemeToken.colorFillTertiary,
    borderRadius: 4,
  }}>
    <Spin tip="加载片段..." />
  </div>
)

export const EmptyImagePreview = () => (
  <div style={{
    height: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: appThemeToken.colorFillTertiary,
    borderRadius: 4,
    border: `1px dashed ${appThemeToken.colorBorder}`,
  }}>
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description="暂无来源文档"
    />
  </div>
)
