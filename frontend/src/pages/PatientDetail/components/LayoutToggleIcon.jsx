/**
 * 布局切换图标组件
 * 具象化显示两栏/三栏布局
 */
import React from 'react'

const LayoutToggleIcon = ({ layoutMode, size = 16 }) => {
  const iconStyle = {
    width: size,
    height: size,
    display: 'inline-block',
    position: 'relative'
  }

  if (layoutMode === 'two-column') {
    // 两栏布局图标：左窄右宽
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={iconStyle}>
        <rect x="1" y="2" width="5" height="12" fill="#666" rx="1" />
        <rect x="8" y="2" width="7" height="12" fill="#666" rx="1" />
      </svg>
    )
  } else {
    // 三栏布局图标：左中右三栏
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={iconStyle}>
        <rect x="1" y="2" width="4" height="12" fill="#666" rx="1" />
        <rect x="6" y="2" width="5" height="12" fill="#666" rx="1" />
        <rect x="12" y="2" width="3" height="12" fill="#666" rx="1" />
      </svg>
    )
  }
}

export default LayoutToggleIcon