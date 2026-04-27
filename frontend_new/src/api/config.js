export const getBaseUrl = () => ''
export const API_URL = ''
export const API_VERSION = ''

export const BusinessCode = {
  SUCCESS: 0,
  AUTH_ERROR: 40001,
  TOKEN_EXPIRED: 40002,
  TOKEN_INVALID: 40003,
  UNAUTHORIZED: 40004,
}

export default {
  baseUrl: '',
  apiUrl: '',
  apiVersion: '',
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
}
