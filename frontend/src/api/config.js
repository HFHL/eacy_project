/**
 * 纯前端运行配置（无后端）
 */

export const API_URL = ''
export const API_BASE_URL = ''
export const API_VERSION = ''

export const BusinessCode = {
  SUCCESS: 0
}

export const getBaseUrl = () => ''

export default {
  baseUrl: '',
  apiUrl: '',
  apiVersion: '',
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD
}

