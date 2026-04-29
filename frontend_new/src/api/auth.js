import { emptySuccess } from './_empty'
import request from './request'

const emptyUser = {
  id: 'local-ui-user',
  name: '本地用户',
  email: '',
  role: 'admin',
}

export const register = async (data = {}) => {
  const payload = await request.post('/auth/register', data)
  return emptySuccess(payload)
}
export const sendRegisterEmailCode = async () => emptySuccess(null)
export const sendResetPasswordEmailCode = async () => emptySuccess(null)
export const resetPasswordByEmail = async () => emptySuccess(null)
export const loginByEmail = async (data = {}) => {
  const payload = await request.post('/auth/login', data)
  return emptySuccess(payload)
}
export const getWechatQrCode = async () => emptySuccess({ ticket: '', qr_code_url: '' })
export const checkWechatScanStatus = async () => emptySuccess({ status: 'idle' })
export const refreshToken = async (refreshTokenValue = localStorage.getItem('refresh_token')) => {
  if (!refreshTokenValue) return emptySuccess({ access_token: '', refresh_token: '' })
  const payload = await request.post('/auth/refresh', { refresh_token: refreshTokenValue })
  return emptySuccess(payload)
}
export const logout = async () => {
  await request.post('/auth/logout', {})
  return emptySuccess(null)
}
export const getCurrentUser = async () => {
  const user = await request.get('/auth/me')
  return emptySuccess({
    ...user,
    name: user.name || user.username || user.id,
  })
}
export const updateUserInfo = async (data = {}) => emptySuccess({ ...emptyUser, ...data })
export const softLogin = async () => emptySuccess(null)
export const getUserSettings = async () => emptySuccess(null)
export const updateUserSettings = async (settings = null) => emptySuccess(settings)
export const getDesensitizePatterns = async () => emptySuccess([])

export default {
  register,
  sendRegisterEmailCode,
  sendResetPasswordEmailCode,
  resetPasswordByEmail,
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
  getDesensitizePatterns,
}
