import React from 'react'

import { getHighlightAppearance } from './highlightAppearance'

export const HighlightOverlay = ({
  pixelBoxQuality,
  pixelBoxes,
  pointsForBox,
  style,
  viewBox,
}) => (
  <svg
    viewBox={viewBox}
    preserveAspectRatio="none"
    style={style}
  >
    {pixelBoxes.map((box, index) => {
      const appearance = getHighlightAppearance(pixelBoxQuality[index])
      return (
        <polygon
          key={index}
          points={pointsForBox(box).map((point) => `${point.x},${point.y}`).join(' ')}
          fill={appearance.fill}
          stroke={appearance.stroke}
          strokeWidth="2"
          strokeDasharray={appearance.dash}
          vectorEffect="non-scaling-stroke"
        />
      )
    })}
  </svg>
)
