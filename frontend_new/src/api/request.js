import { clearUserSessionStorage } from '../utils/authCleanup'

const DEFAULT_API_BASE_URL = '/api/v1'

const trimTrailingSlash = (value) => value.replace(/\/+$/, '')
const trimLeadingSlash = (value) => value.replace(/^\/+/, '')

const getApiBaseUrl = () => {
  const configured = import.meta.env.VITE_API_BASE_URL
  return trimTrailingSlash(configured || DEFAULT_API_BASE_URL)
}

const isAbsoluteUrl = (url) => /^https?:\/\//i.test(url)

const buildUrl = (url, params) => {
  const rawUrl = isAbsoluteUrl(url)
    ? url
    : `${getApiBaseUrl()}/${trimLeadingSlash(url)}`
  const target = new URL(rawUrl, window.location.origin)

  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item !== undefined && item !== null) target.searchParams.append(key, item)
        })
        return
      }
      target.searchParams.set(key, value)
    })
  }

  return target.toString()
}

const readResponseBody = async (response) => {
  if (response.status === 204) return null

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text || null
}

const compactList = (items, limit = 8) => {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  if (!values.length) return ''
  const shown = values.slice(0, limit)
  const suffix = values.length > limit ? ` 等 ${values.length} 项` : ''
  return `${shown.join('、')}${suffix}`
}

const formatInvalidExtractionTargetDetail = (detail) => {
  if (!detail || typeof detail !== 'object' || detail.error !== 'invalid_extraction_target') return ''

  const invalidParts = [
    compactList(detail.invalid_form_keys) && `表单 ${compactList(detail.invalid_form_keys)}`,
    compactList(detail.invalid_field_paths) && `字段路径 ${compactList(detail.invalid_field_paths)}`,
    compactList(detail.invalid_field_keys) && `字段键 ${compactList(detail.invalid_field_keys)}`,
  ].filter(Boolean)
  const availableForms = compactList(detail.available_form_keys, 10)
  const availableFields = compactList(
    (detail.available_fields || detail.available_field_paths || []).map((field) => {
      if (typeof field === 'string') return field
      return field?.field_title
        ? `${field.field_path || field.field_key || ''}（${field.field_title}）`
        : field?.field_path || field?.field_key || ''
    }),
    10,
  )

  const sections = []
  sections.push(invalidParts.length ? `抽取目标不存在：${invalidParts.join('；')}` : (detail.message || '抽取目标不存在'))
  if (availableForms) sections.push(`可用表单：${availableForms}`)
  if (availableFields) sections.push(`可用字段示例：${availableFields}`)
  return sections.join('。')
}

const getErrorMessage = (body, fallback) => {
  if (!body) return fallback
  if (typeof body === 'string') return body
  if (Array.isArray(body.detail)) {
    return body.detail.map((item) => {
      if (typeof item === 'string') return item
      const loc = Array.isArray(item.loc) ? item.loc.filter((part) => part !== 'body').join('.') : ''
      const msg = item.msg || item.message || JSON.stringify(item)
      return loc ? `${loc}: ${msg}` : msg
    }).join('; ')
  }
  const invalidTargetMessage = formatInvalidExtractionTargetDetail(body.detail)
  if (invalidTargetMessage) return invalidTargetMessage
  if (typeof body.detail === 'string') return body.detail
  return body.message || body.error || fallback
}

export class ApiRequestError extends Error {
  constructor(message, { status, data, url, method }) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.data = data
    this.url = url
    this.method = method
  }
}

const createHeaders = (data, headers = {}) => {
  const nextHeaders = { ...headers }

  if (!(data instanceof FormData) && data !== undefined && data !== null) {
    nextHeaders['Content-Type'] = nextHeaders['Content-Type'] || 'application/json'
  }

  const token = localStorage.getItem('access_token')
  if (token && !nextHeaders.Authorization) {
    nextHeaders.Authorization = `Bearer ${token}`
  }

  return nextHeaders
}

const createBody = (data) => {
  if (data === undefined || data === null) return undefined
  if (data instanceof FormData) return data
  return JSON.stringify(data)
}

const clearAuthAndRedirect = () => {
  clearUserSessionStorage()
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

let refreshPromise = null

export const ensureFreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return localStorage.getItem('access_token') || ''

  if (!refreshPromise) {
    refreshPromise = fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      credentials: 'same-origin',
    })
      .then(async (response) => {
        const body = await readResponseBody(response)
        if (!response.ok) {
          throw new ApiRequestError(
            getErrorMessage(body, `Request failed with status ${response.status}`),
            { status: response.status, data: body, url: buildUrl('/auth/refresh'), method: 'POST' }
          )
        }
        if (body?.access_token) localStorage.setItem('access_token', body.access_token)
        if (body?.refresh_token) localStorage.setItem('refresh_token', body.refresh_token)
        if (body?.user) localStorage.setItem('user_info', JSON.stringify(body.user))
        return body?.access_token || localStorage.getItem('access_token') || ''
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

const request = async (method, url, data, options = {}) => {
  const { params, headers, _retried = false, ...fetchOptions } = options
  const hasBody = method !== 'GET' && method !== 'DELETE'
  const bodyData = hasBody ? data : undefined
  const targetUrl = buildUrl(url, hasBody ? params : data || params)

  const response = await fetch(targetUrl, {
    method,
    headers: createHeaders(bodyData, headers),
    body: createBody(bodyData),
    credentials: fetchOptions.credentials || 'same-origin',
    ...fetchOptions,
  })

  const body = await readResponseBody(response)

  if (!response.ok) {
    const isAuthEndpoint = targetUrl.includes('/auth/login') || targetUrl.includes('/auth/register') || targetUrl.includes('/auth/refresh')
    if (response.status === 401 && !isAuthEndpoint && !_retried && localStorage.getItem('refresh_token')) {
      try {
        await ensureFreshAccessToken()
        return request(method, url, data, { ...options, _retried: true })
      } catch (_) {
        clearAuthAndRedirect()
      }
    } else if (response.status === 401 && !isAuthEndpoint) {
      clearAuthAndRedirect()
    }
    throw new ApiRequestError(
      getErrorMessage(body, `Request failed with status ${response.status}`),
      {
        status: response.status,
        data: body,
        url: targetUrl,
        method,
      }
    )
  }

  return body
}

export const get = (url, params, options) => request('GET', url, params, options)
export const post = (url, data, options) => request('POST', url, data, options)
export const put = (url, data, options) => request('PUT', url, data, options)
export const patch = (url, data, options) => request('PATCH', url, data, options)
export const del = (url, params, options) => request('DELETE', url, params, options)

export default {
  get,
  post,
  put,
  patch,
  delete: del,
}
