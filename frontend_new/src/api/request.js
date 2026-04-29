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

const getErrorMessage = (body, fallback) => {
  if (!body) return fallback
  if (typeof body === 'string') return body
  return body.message || body.detail || body.error || fallback
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
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user_info')
  localStorage.removeItem('user_settings')
  localStorage.removeItem('login_time')
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
