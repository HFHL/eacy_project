import React from 'react'
import { Typography } from 'antd'

import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

export const FieldValueDisplay = ({ value }) => {
  if (value === null || value === undefined) {
    return <Text type="secondary">—</Text>
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return (
      <Text strong style={{ fontSize: 16, color: appThemeToken.colorPrimary }}>
        {String(value) || '空'}
      </Text>
    )
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <Text type="secondary">（空数组）</Text>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {value.map((item, idx) => (
          <div key={idx} style={{ background: appThemeToken.colorFillTertiary, padding: '6px 10px', borderRadius: 4 }}>
            <Text type="secondary" style={{ marginRight: 6 }}>#{idx + 1}</Text>
            {typeof item === 'object' && item !== null ? (
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(item).filter(([, itemValue]) => itemValue != null && itemValue !== '').slice(0, 5).map(([key, itemValue]) => (
                  <span key={key}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{key}: </Text>
                    <Text style={{ color: appThemeToken.colorPrimary }}>{String(itemValue)}</Text>
                  </span>
                ))}
                {Object.entries(item).filter(([, itemValue]) => itemValue != null && itemValue !== '').length > 5 && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    +{Object.entries(item).filter(([, itemValue]) => itemValue != null && itemValue !== '').length - 5} 更多
                  </Text>
                )}
              </span>
            ) : (
              <Text strong style={{ color: appThemeToken.colorPrimary }}>{String(item)}</Text>
            )}
          </div>
        ))}
      </div>
    )
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, itemValue]) => itemValue != null && itemValue !== '')
    if (entries.length === 0) return <Text type="secondary">（空对象）</Text>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entries.map(([key, itemValue]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <Text type="secondary" style={{ minWidth: 80, fontSize: 12 }}>{key}:</Text>
            <Text strong style={{ color: appThemeToken.colorPrimary }}>
              {typeof itemValue === 'object' ? JSON.stringify(itemValue) : String(itemValue)}
            </Text>
          </div>
        ))}
      </div>
    )
  }
  return <Text>{String(value)}</Text>
}
