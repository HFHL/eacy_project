export const MAX_UPLOAD_FILE_SIZE_MB = 100
export const MAX_UPLOAD_FILE_SIZE = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024
export const MAX_UPLOAD_FILES_PER_BATCH = 49

export const SUPPORTED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/jpg',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
]

export const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.docx',
  '.xlsx',
  '.csv',
])

export const UPLOAD_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv'

export const LEGACY_DOC_MIME = 'application/msword'
export const LEGACY_DOC_EXTENSION = '.doc'

const normalizeExtension = (fileName = '') => {
  const lower = String(fileName).toLowerCase()
  const dotIndex = lower.lastIndexOf('.')
  return dotIndex >= 0 ? lower.slice(dotIndex) : ''
}

export const isLegacyDocFile = (file = {}) => {
  const mime = String(file.type || '').toLowerCase()
  const ext = normalizeExtension(file.name)
  return mime === LEGACY_DOC_MIME || ext === LEGACY_DOC_EXTENSION
}

const hasSupportedMime = (mime) => {
  const normalized = String(mime || '').toLowerCase()
  if (!normalized) return false
  return SUPPORTED_UPLOAD_MIME_TYPES.includes(normalized)
}

const hasSupportedExtension = (fileName = '') => SUPPORTED_UPLOAD_EXTENSIONS.has(normalizeExtension(fileName))

export const validateUploadFile = (file = {}) => {
  if (isLegacyDocFile(file)) {
    return {
      ok: false,
      message: `${file.name || '文件'}: 不支持旧版 .doc，请转换为 .docx 或 PDF 后上传`,
    }
  }

  if (!hasSupportedMime(file.type) && !hasSupportedExtension(file.name)) {
    return {
      ok: false,
      message: `${file.name || '文件'}: 不支持的文件格式`,
    }
  }

  if (file.size > MAX_UPLOAD_FILE_SIZE) {
    return {
      ok: false,
      message: `${file.name || '文件'}: 文件超过 ${MAX_UPLOAD_FILE_SIZE_MB}MB`,
    }
  }

  return { ok: true }
}

export const validateUploadBatch = (files = []) => {
  const list = Array.isArray(files) ? files : []
  if (list.length > MAX_UPLOAD_FILES_PER_BATCH) {
    return {
      ok: false,
      message: `单次最多上传 ${MAX_UPLOAD_FILES_PER_BATCH} 个文件，当前选择了 ${list.length} 个`,
      validFiles: [],
    }
  }

  const validFiles = []
  for (const file of list) {
    const result = validateUploadFile(file)
    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        validFiles: [],
      }
    }
    validFiles.push(file)
  }

  return { ok: true, validFiles }
}
