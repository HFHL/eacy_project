import React from 'react'
import { Button } from 'antd'
import { FileTextOutlined, PlayCircleOutlined } from '@ant-design/icons'

import { appThemeToken } from '@/styles/themeTokens'

export const RepeatableEmptyState = ({ groupName }) => (
  <div style={{ textAlign: 'center', padding: 40, color: appThemeToken.colorTextTertiary }}>
    <FileTextOutlined style={{ fontSize: 16, marginBottom: 12 }} />
    <div>暂无{groupName}记录</div>
    <Button
      type="dashed"
      icon={<PlayCircleOutlined />}
      style={{ marginTop: 12 }}
      onClick={() => console.log('添加新记录')}
    >
      + 添加{groupName}
    </Button>
  </div>
)
