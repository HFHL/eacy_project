const CONFIDENCE_DISPLAY = {
  high: { color: '#10b981', label: '高置信度', level: 'high' },
  medium: { color: '#f59e0b', label: '中置信度', level: 'medium' },
  low: { color: '#ef4444', label: '低置信度', level: 'low' }
}

const CONFIDENCE_STYLE = {
  high: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d020',
    icon: '🟢'
  },
  medium: {
    background: '#fffbeb',
    border: '1px solid #fed7aa20',
    icon: '🟡'
  },
  low: {
    background: '#fef2f2',
    border: '1px solid #fecaca20',
    icon: '🔴'
  }
}

const getConfidenceLevel = (confidence) => {
  if (typeof confidence !== 'number') return confidence
  if (confidence >= 90) return 'high'
  if (confidence >= 70) return 'medium'
  return 'low'
}

export const getConfidenceDisplay = (confidence) => (
  CONFIDENCE_DISPLAY[getConfidenceLevel(confidence)] || CONFIDENCE_DISPLAY.medium
)

export const getConfidenceStyle = (confidence) => (
  CONFIDENCE_STYLE[getConfidenceLevel(confidence)] || CONFIDENCE_STYLE.medium
)
