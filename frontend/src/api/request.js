/**
 * 前端纯本地模式请求适配器
 * 保留 get/post/... 调用签名，避免页面改动。
 */

const ok = (data = null, message = '本地模式') =>
  Promise.resolve({ success: true, code: 0, message, data })

const request = {
  get: () => ok(),
  post: () => ok(),
  put: () => ok(),
  patch: () => ok(),
  delete: () => ok()
}

export default request

