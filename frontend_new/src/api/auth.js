import { emptySuccess } from './_empty'

const emptyUser = {
  id: 'local-ui-user',
  name: '本地用户',
  email: '',
  role: 'admin',
}

export const register = async () => emptySuccess(null)
export const sendRegisterEmailCode = async () => emptySuccess(null)
export const sendResetPasswordEmailCode = async () => emptySuccess(null)
export const resetPasswordByEmail = async () => emptySuccess(null)
export const loginByEmail = async () => emptySuccess({ access_token: '', refresh_token: '', user: emptyUser })
export const getWechatQrCode = async () => emptySuccess({ ticket: '', qr_code_url: '' })
export const checkWechatScanStatus = async () => emptySuccess({ status: 'idle' })
export const refreshToken = async () => emptySuccess({ access_token: '', refresh_token: '' })
export const logout = async () => emptySuccess(null)
export const getCurrentUser = async () => emptySuccess(emptyUser)
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
