/**
 * 认证相关本地 Mock API
 */

const ok = (data = null, message = '本地模式') =>
  Promise.resolve({ success: true, code: 0, message, data })

/**
 * 用户注册
 * @param {object} data - 注册信息
 * @param {string} data.email - 邮箱
 * @param {string} data.password - 密码
 * @param {string} data.name - 用户姓名
 * @param {string} [data.phone] - 手机号（可选）
 * @param {string} [data.organization] - 所属机构（可选）
 * @param {string} [data.department] - 科室（可选）
 * @param {string} [data.job_title] - 职称（可选）
 * @returns {Promise} 注册结果
 */
export const register = (data) => {
  return ok({ user: data || null })
}

/**
 * 发送注册邮箱验证码
 * @param {object} data
 * @param {string} data.email - 注册邮箱
 * @returns {Promise}
 */
export const sendRegisterEmailCode = (data) => {
  return ok({ email: data?.email || '' })
}

/**
 * 发送忘记密码邮箱验证码
 * @param {object} data
 * @param {string} data.email - 账户邮箱
 * @returns {Promise}
 */
export const sendResetPasswordEmailCode = (data) => {
  return ok({ email: data?.email || '' })
}

/**
 * 忘记密码-通过邮箱验证码重置密码
 * @param {object} data
 * @param {string} data.email - 账户邮箱
 * @param {string} data.code - 邮箱验证码
 * @param {string} data.new_password - 新密码
 * @returns {Promise}
 */
export const resetPasswordByEmail = (data) => {
  return ok({ email: data?.email || '' })
}

/**
 * 邮箱密码登录
 * @param {object} data - 登录信息
 * @param {string} data.email - 邮箱
 * @param {string} data.password - 密码
 * @returns {Promise} 登录结果
 */
export const loginByEmail = (data) => {
  return ok({
    access_token: 'local-access-token',
    refresh_token: 'local-refresh-token',
    user: {
      id: 'local-user',
      email: data?.email || 'local@example.com',
      name: '本地用户'
    }
  })
}

/**
 * 获取微信登录二维码
 * @returns {Promise} 二维码信息
 */
export const getWechatQrCode = () => {
  return ok({ ticket: 'local-ticket', qrcode_url: '' })
}

/**
 * 检查微信扫码状态
 * @param {string} ticket - 二维码ticket
 * @returns {Promise} 扫码状态
 */
export const checkWechatScanStatus = (ticket) => {
  return ok({ ticket, status: 'pending' })
}

/**
 * 刷新Token
 * @param {string} refreshToken - 刷新token
 * @returns {Promise} 新的token
 */
export const refreshToken = (refreshToken) => {
  return ok({ access_token: 'local-access-token', refresh_token: refreshToken })
}

/**
 * 登出
 * @returns {Promise}
 */
export const logout = () => {
  return ok()
}

/**
 * 获取当前用户信息
 * @returns {Promise} 用户信息
 */
export const getCurrentUser = () => {
  return ok({ id: 'local-user', name: '本地用户', email: 'local@example.com' })
}

/**
 * 更新当前用户信息
 * @param {object} data - 个人信息
 * @returns {Promise} 更新结果
 */
export const updateUserInfo = (data) => {
  return ok(data || {})
}

/**
 * 用户软登录（更新用户追踪信息）
 * 用于前端启动时更新累积使用天数、本月活跃天数等
 * @returns {Promise} 软登录结果
 */
export const softLogin = () => {
  return ok({ tracked: true })
}

/**
 * 获取当前用户设置
 * @returns {Promise} { success, data: { settings } }
 */
export const getUserSettings = () => {
  return ok({ settings: {} })
}

/**
 * 更新当前用户设置（与现有设置合并）
 * @param {object} settings - 要更新的键值对，如 { theme_mode, data_masking }
 * @returns {Promise} { success, data: { settings } } 更新后的完整 settings
 */
export const updateUserSettings = (settings) => {
  return ok({ settings: settings || {} })
}

/**
 * 获取可用的 OCR 脱敏模式
 * @returns {Promise} { success, data: { patterns: [{key, name, enabled}] } }
 */
export const getDesensitizePatterns = () => {
  return ok({ patterns: [] })
}

export default {
  register,
  sendRegisterEmailCode,
  loginByEmail,
  getWechatQrCode,
  checkWechatScanStatus,
  refreshToken,
  logout,
  getCurrentUser,
  updateUserInfo,
  softLogin,
  getUserSettings,
  updateUserSettings,
  getDesensitizePatterns
}

