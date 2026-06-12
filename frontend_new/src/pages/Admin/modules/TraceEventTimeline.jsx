import React from 'react'
import { Alert, Tag, Typography } from 'antd'

import { appThemeToken } from '../../../styles/themeTokens'
import { formatTime, STAGE_META } from './extractionObservatoryShared'

const { Text } = Typography

export const EventTimeline = ({ events = [] }) => {
  if (!events.length) return <Alert type="info" showIcon message="暂无进度事件" />

  return (
    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
      {events.map((event) => {
        const meta = STAGE_META[event.node] || { label: event.node || '-', color: 'default' }
        const timeText = formatTime(event.ts)
        return (
          <div key={event.id} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: `1px dashed ${appThemeToken.colorBorderSecondary}` }}>
            <Text type="secondary" style={{ fontSize: 11, minWidth: 72 }}>
              {timeText.split(' ')[1] || timeText}
            </Text>
            <Tag color={meta.color}>{meta.label}</Tag>
            <Text style={{ fontSize: 12, flex: 1 }}>{event.message || '—'}</Text>
          </div>
        )
      })}
    </div>
  )
}
