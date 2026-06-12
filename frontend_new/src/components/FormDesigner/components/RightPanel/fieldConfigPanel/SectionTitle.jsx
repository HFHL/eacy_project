import React from 'react'

import { appThemeToken } from '../../../../../styles/themeTokens'

export const SectionTitle = ({ title }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      margin: '16px 0 10px',
      paddingTop: 12,
      borderTop: `1px solid ${appThemeToken.colorBorder}`,
    }}
  >
    <span
      style={{
        fontSize: 12,
        fontWeight: 500,
        lineHeight: '20px',
        color: appThemeToken.colorTextSecondary,
      }}
    >
      {title}
    </span>
  </div>
)
