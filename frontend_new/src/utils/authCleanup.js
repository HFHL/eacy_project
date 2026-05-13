/**
 * 集中清理「登出 / 会话失效 / 数据损坏」时需要从浏览器移除的存储项。
 *
 * 由 userSlice.logout（主动登出）和 request.js 的 clearAuthAndRedirect
 * （token 过期自动跳登录）共同调用，确保多账号切换、会话过期等场景下
 * 不会把上一个用户的通知、任务、去重标记泄漏给下一个用户。
 */

const LOCAL_KEYS = [
  'access_token',
  'refresh_token',
  'user_info',
  'user_settings',
  'login_time',
  'eacy_task_store_v1',
  'eacy_ui_notifications_v1',
]

const LOCAL_PREFIXES = ['eacy_ehr_folder_batch_']
const SESSION_PREFIXES = ['eacy_extraction_notified_', 'eacy_ehr_batch_notified_']

function clearByPrefix(storage, prefixes) {
  if (!storage || !prefixes.length) return
  const keysToRemove = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key && prefixes.some((p) => key.startsWith(p))) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach((k) => storage.removeItem(k))
}

/**
 * 清空当前会话的认证信息和业务缓存。
 * 不会触发跳转或派发 Redux action —— 调用方负责后续处理。
 */
export function clearUserSessionStorage() {
  try {
    LOCAL_KEYS.forEach((k) => localStorage.removeItem(k))
    clearByPrefix(localStorage, LOCAL_PREFIXES)
    clearByPrefix(sessionStorage, SESSION_PREFIXES)
  } catch (_) {
    // localStorage / sessionStorage 在隐私模式或被禁用时可能抛错，忽略
  }
}
