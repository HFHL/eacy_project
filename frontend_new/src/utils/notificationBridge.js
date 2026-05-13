import { hydrateNotifications } from '../store/slices/uiSlice'

/**
 * 通知中心持久化层。
 *
 * 说明：早期版本曾把所有 antd `message.success/error/warning/info` 自动桥接到
 * 通知中心，导致大量 toast（保存、删除、登录等小操作）污染消息列表。
 * 现已移除自动桥接 —— 通知只在后端长耗时任务结束时由
 * `utils/globalBackgroundTaskPoller.js` 显式 dispatch。
 *
 * 本文件现在只负责把 `state.ui.notifications.list` 与 localStorage 双向同步，
 * 用于刷新页面后保留通知历史。
 */

const STORAGE_KEY = 'eacy_ui_notifications_v1'

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
