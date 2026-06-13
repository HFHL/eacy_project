import { emptyFileUrl, emptySuccess } from '../_empty'
import request, { ensureFreshAccessToken } from '../request'
import { buildApiUrl, DOCUMENTS_ENDPOINT } from './constants'
import {
  isImageFileLike,
  isOcrPagePreviewResponse,
  isPdfFileLike,
} from './fileTypes'

export const getDocumentTempUrl = async (documentId = '', expiresIn = 3600, options = {}) => {
  if (!documentId) return emptyFileUrl({ document_id: documentId })
  const page = options?.page ?? options?.pageNo
  const query = { expires_in: expiresIn }
  if (page) query.page = page
  const payload = await request.get(`${DOCUMENTS_ENDPOINT}/${documentId}/preview-url`, query)
  const tempUrl = payload.temp_url || payload.preview_url || payload.url || ''
  return emptySuccess({
    ...payload,
    document_id: payload.document_id || documentId,
    url: payload.url || tempUrl,
    temp_url: tempUrl,
    preview_url: payload.preview_url || tempUrl,
    preview_source: payload.preview_source || 'native',
    page_no: payload.page_no ?? null,
    ocr_page_count: payload.ocr_page_count ?? null,
    file_type: payload.file_type || null,
  })
}

export function buildDocumentStreamUrl(documentId = '', { page, token } = {}) {
  if (!documentId) return ''
  const path = buildApiUrl(`${DOCUMENTS_ENDPOINT}/${encodeURIComponent(documentId)}/stream`)
  const params = new URLSearchParams()
  if (token) params.set('access_token', token)
  if (page) params.set('page', String(page))
  const query = params.toString()
  return query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path
}

export function getDocumentPdfStreamUrl(documentId = '', options = {}) {
  return buildDocumentStreamUrl(documentId, options)
}

export async function getFreshDocumentStreamUrl(documentId = '', options = {}) {
  if (!documentId) return ''
  const token = typeof localStorage !== 'undefined' ? await ensureFreshAccessToken() : ''
  return buildDocumentStreamUrl(documentId, { ...options, token })
}

export async function getFreshDocumentPdfStreamUrl(documentId = '') {
  return getFreshDocumentStreamUrl(documentId)
}

export async function resolveDocumentInlinePreviewUrl(documentId, data = {}, { pageNo = 1 } = {}) {
  const tempUrl = data.temp_url || data.preview_url || data.url || ''
  if (!documentId || !tempUrl) return tempUrl

  const resolvedPageNo = Number(data.page_no || pageNo || 1)
  const isOcrPagePreview = isOcrPagePreviewResponse(data)
  const isImagePreview = isImageFileLike({
    fileType: data.file_type,
    fileName: data.file_name,
    fileUrl: tempUrl,
    mimeType: data.mime_type,
  })

  if (isOcrPagePreview) {
    return getFreshDocumentStreamUrl(documentId, { page: resolvedPageNo })
  }
  if (isImagePreview) {
    return getFreshDocumentStreamUrl(documentId)
  }
  return tempUrl
}

export async function resolveTraceDocumentPreviewUrl(documentId, {
  pageNo = 1,
  fileType,
  fileName,
  mimeType,
} = {}) {
  if (!documentId) return null
  const urlRes = await getDocumentTempUrl(documentId, 3600, { page: pageNo })
  if (!urlRes.success || !urlRes.data?.temp_url) return null

  const data = urlRes.data
  const resolvedFileType = data.file_type || data.mime_type || mimeType || fileType
  const resolvedFileName = data.file_name || fileName

  if (isPdfFileLike({
    fileType: resolvedFileType,
    fileName: resolvedFileName,
    fileUrl: data.temp_url,
    mimeType: data.mime_type,
  })) {
    return {
      mode: 'pdf',
      url: await getFreshDocumentPdfStreamUrl(documentId),
      previewSource: 'native',
      ocrPageCount: data.ocr_page_count ?? null,
      pageNo: null,
      fileName: resolvedFileName,
      fileType: resolvedFileType,
      mimeType: data.mime_type,
    }
  }

  if (
    isOcrPagePreviewResponse(data)
    || isImageFileLike({
      fileType: resolvedFileType,
      fileName: resolvedFileName,
      fileUrl: data.temp_url,
      mimeType: data.mime_type,
    })
  ) {
    const resolvedPageNo = data.page_no || pageNo
    const url = await resolveDocumentInlinePreviewUrl(documentId, data, { pageNo: resolvedPageNo })
    return {
      mode: 'image',
      url,
      previewSource: data.preview_source || 'native',
      ocrPageCount: data.ocr_page_count ?? null,
      pageNo: resolvedPageNo,
      fileName: resolvedFileName,
      fileType: resolvedFileType,
      mimeType: data.mime_type || 'image/jpeg',
    }
  }

  return {
    mode: 'unsupported',
    url: data.temp_url,
    previewSource: data.preview_source || 'native',
    ocrPageCount: data.ocr_page_count ?? null,
    pageNo: data.page_no || pageNo,
    fileName: resolvedFileName,
    fileType: resolvedFileType,
    mimeType: data.mime_type,
  }
}
