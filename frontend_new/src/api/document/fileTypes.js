const OFFICE_FILE_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx'])
const IMAGE_FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'])

export const isPdfFileLike = ({ fileType, fileName, fileUrl, mimeType } = {}) => {
  const type = String(fileType || mimeType || '').toLowerCase()
  const name = String(fileName || '').toLowerCase()
  const url = String(fileUrl || '').toLowerCase()
  const cleanUrl = url.split('?')[0].split('#')[0]
  return (
    type === 'pdf'
    || type === '.pdf'
    || type.includes('application/pdf')
    || name.endsWith('.pdf')
    || cleanUrl.endsWith('.pdf')
  )
}

export const isImageFileLike = ({ fileType, fileName, fileUrl, mimeType } = {}) => {
  const type = String(fileType || mimeType || '').toLowerCase()
  const name = String(fileName || '').toLowerCase()
  const url = String(fileUrl || '').toLowerCase()
  const cleanUrl = url.split('?')[0].split('#')[0]
  if (type.startsWith('image/')) return true
  const normalizedType = type.replace(/^\./, '')
  if (IMAGE_FILE_EXTENSIONS.has(normalizedType)) return true
  return IMAGE_FILE_EXTENSIONS.some((ext) => name.endsWith(`.${ext}`) || cleanUrl.endsWith(`.${ext}`))
}

export const isOfficeDocumentLike = ({ fileType, fileName, mimeType } = {}) => {
  const type = String(fileType || mimeType || '').toLowerCase()
  const name = String(fileName || '').toLowerCase()
  if (
    type.includes('wordprocessingml')
    || type.includes('msword')
    || type.includes('presentationml')
    || type.includes('ms-powerpoint')
  ) {
    return true
  }
  const ext = name.includes('.') ? name.split('.').pop() : String(fileType || '').replace(/^\./, '').toLowerCase()
  return OFFICE_FILE_EXTENSIONS.has(ext)
}

export const isOcrPagePreviewResponse = (data = {}) => data?.preview_source === 'ocr_page'
