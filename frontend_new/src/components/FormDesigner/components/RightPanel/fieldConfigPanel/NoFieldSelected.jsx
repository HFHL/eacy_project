import React from 'react'
import { Alert } from 'antd'

import { appThemeToken } from '../../../../../styles/themeTokens'

export const NoFieldSelected = () => (
  <div style={{
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: appThemeToken.colorBgContainer,
    borderRadius: 4,
    padding: 16,
  }}>
    <Alert
      message="未选中字段"
      description="请从左侧选择字段进行配置"
      type="info"
      showIcon
      style={{ width: '100%' }}
    />
  </div>
)
