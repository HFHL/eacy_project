import React from 'react'
import { Typography } from 'antd'

import { appThemeToken } from '../../../styles/themeTokens'

const { Text, Paragraph } = Typography

export const RawTextHighlight = ({ raw, value }) => {
  if (!raw) return <Text type="secondary">无原文记录</Text>

  if (value && typeof value === 'string' && raw.includes(value)) {
    const parts = raw.split(value)
    return (
      <Text>
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {part}
            {index < parts.length - 1 && <Text mark strong>{value}</Text>}
          </React.Fragment>
        ))}
      </Text>
    )
  }

  return (
    <Paragraph
      style={{
        margin: 0,
        padding: '8px 12px',
        background: appThemeToken.colorFillTertiary,
        borderRadius: 4,
        borderLeft: `3px solid ${appThemeToken.colorPrimary}`,
        fontFamily: 'monospace',
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      {raw}
    </Paragraph>
  )
}
