import { message } from 'antd'
import { addNotification, hydrateNotifications } from '../store/slices/uiSlice'

const STORAGE_KEY = 'eacy_ui_notifications_v1'

const normalizeContent = (content) => {
  if (content === null || content === undefined) return ''
  if (typeof content === 'string') return content
  if (typeof content === 'number' || typeof content === 'boolean') return String(content)
  // ReactNode / object
  try {
    return JSON.stringify(content)
  } catch {
    return '（复杂内容）'
  }
}

const nowIso = () => new Date().toISOString()

// 简单去重：同类型+同消息，在窗口期内只记录一次
const makeDedupeKey = (type, msg) => `${type}::${msg}`

export function setupMessageToNotificationBridge(store, options = {}) {
  const { dedupeWindowMs = 1500, includeRoute = true } = options
  const lastSeen = new Map() // key -> ts

  const wrap = (type, originalFn) => {
    return (content, duration, onClose) => {
      try {
        const msg = normalizeContent(content)
        const key = makeDedupeKey(type, msg)
        const ts = Date.now()
        const prev = lastSeen.get(key)
        if (!prev || ts - prev > dedupeWindowMs) {
          lastSeen.set(key, ts)
          store.dispatch(
            addNotification({
              type,
              title: msg || (type === 'error' ? '发生错误' : '通知'),
              message: msg,
              timestamp: nowIso(),
              route: includeRoute ? window.location?.pathname : undefined,
              source: 'antd_message'
            })
          )
        }
      } catch {
        // ignore bridge errors
      }
      return originalFn(content, duration, onClose)
    }
  }

  // Patch once
  if (message.__EACY_BRIDGED__) return
  message.__EACY_BRIDGED__ = true

  message.success = wrap('success', message.success.bind(message))
  message.error = wrap('error', message.error.bind(message))
  message.warning = wrap('warning', message.warning.bind(message))
  message.info = wrap('info', message.info.bind(message))

  // message.open 支持自定义 type
  if (typeof message.open === 'function') {
    const originalOpen = message.open.bind(message)
    message.open = (config) => {
      try {
        const type = config?.type || 'info'
        const msg = normalizeContent(config?.content)
        const key = makeDedupeKey(type, msg)
        const ts = Date.now()
        const prev = lastSeen.get(key)
        if (!prev || ts - prev > dedupeWindowMs) {
          lastSeen.set(key, ts)
          store.dispatch(
            addNotification({
              type,
              title: msg || '通知',
              message: msg,
              timestamp: nowIso(),
              route: includeRoute ? window.location?.pathname : undefined,
              source: 'antd_message.open'
            })
          )
        }
      } catch {
        // ignore
      }
      return originalOpen(config)
    }
  }
}

export function loadNotificationsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.list)) return null
    return parsed
  } catch {
    return null
  }
}

export function setupNotificationPersistence(store) {
  // hydrate
  const saved = loadNotificationsFromStorage()
  if (saved?.list) {
    store.dispatch(hydrateNotifications({ list: saved.list }))
  }

  let lastJson = ''
  store.subscribe(() => {
    try {
      const state = store.getState()
      const list = state?.ui?.notifications?.list || []
      const payload = { list }
      const json = JSON.stringify(payload)
      if (json !== lastJson) {
        lastJson = json
        localStorage.setItem(STORAGE_KEY, json)
      }
    } catch {
      // ignore
    }
  })
}

