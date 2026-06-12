import { appThemeToken } from '@/styles/themeTokens'

export const getHighlightAppearance = ({ lowConfidence, recordShared } = {}) => {
  const isLow = Boolean(lowConfidence)
  const isShared = Boolean(recordShared && !isLow)

  return {
    dash: isLow ? '4,3' : undefined,
    fill: isLow
      ? 'rgba(250, 140, 22, 0.08)'
      : isShared
        ? 'rgba(250, 140, 22, 0.10)'
        : 'rgba(255, 77, 79, 0.12)',
    stroke: isLow || isShared ? '#fa8c16' : appThemeToken.colorError,
  }
}
