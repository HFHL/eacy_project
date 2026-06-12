export const DOCUMENTS_ENDPOINT = '/documents'
export const DEFAULT_API_BASE_URL = '/api/v1'

const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '')
const trimLeadingSlash = (value = '') => value.replace(/^\/+/, '')

export const getApiBaseUrl = () => trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL)

export const buildApiUrl = (path = '') => {
  const apiBaseUrl = getApiBaseUrl()
  const url = `${apiBaseUrl}/${trimLeadingSlash(path)}`
  if (/^https?:\/\//i.test(url)) return url
  return url
}
