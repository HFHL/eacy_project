export const RIGHT_PANEL_WIDTH_KEY = 'schemaFormRightPanelWidth'
export const LEFT_PANEL_WIDTH_KEY = 'schemaFormLeftPanelWidth'
export const LEGACY_MIDDLE_PANEL_WIDTH_KEY = 'schemaFormMiddlePanelWidth'
export const DEFAULT_LEFT_PANEL_WIDTH = 240
export const MIN_RIGHT_PANEL_WIDTH = 240
export const MIN_LEFT_PANEL_WIDTH = 180
export const FALLBACK_VIEWPORT_WIDTH = 1440

export const COLUMN_RESIZE_BAR_STYLE = {
  width: 6,
  flexShrink: 0,
  cursor: 'col-resize',
  background: 'transparent',
  alignSelf: 'stretch',
}

export const DIVIDER_LINE_STYLE = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 1,
  background: '#f0f0f0',
  pointerEvents: 'none',
  zIndex: 4,
}

export const getViewportWidth = () => (
  typeof window !== 'undefined' ? window.innerWidth : FALLBACK_VIEWPORT_WIDTH
)

export const safeStorageGet = (key) => {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export const safeStorageSet = (key, value) => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore storage write errors
  }
}

export const safeStorageRemove = (key) => {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore storage remove errors
  }
}

export const getDefaultRightPanelWidth = () => Math.round(getViewportWidth() * 0.25)
export const getMaxLeftPanelWidth = () => Math.round(getViewportWidth() * 0.38)
export const getMaxRightPanelWidth = () => Math.round(getViewportWidth() * 0.4)

export const clampLeftPanelWidth = (width) => (
  Math.min(getMaxLeftPanelWidth(), Math.max(MIN_LEFT_PANEL_WIDTH, width))
)

export const clampRightPanelWidth = (width) => (
  Math.min(getMaxRightPanelWidth(), Math.max(MIN_RIGHT_PANEL_WIDTH, width))
)
