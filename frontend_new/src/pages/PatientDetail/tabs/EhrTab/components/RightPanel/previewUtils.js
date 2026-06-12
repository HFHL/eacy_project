const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']

export const getFileExt = (nameOrUrl) => {
  if (!nameOrUrl) return ''

  const value = String(nameOrUrl).toLowerCase()
  if (value.includes('image/jpeg') || value.includes('image/jpg')) return 'jpg'
  if (value.includes('image/png')) return 'png'
  if (value.includes('image/webp')) return 'webp'
  if (value.includes('image/gif')) return 'gif'
  if (value.includes('application/pdf')) return 'pdf'

  const raw = String(nameOrUrl).split('?')[0].split('#')[0]
  const idx = raw.lastIndexOf('.')
  if (idx === -1) return ''
  return raw.slice(idx + 1).toLowerCase()
}

const isOcrPageImage = (url, isPdf) => (
  Boolean(url && !isPdf && /ocr-pages\/|page-\d+\.(jpg|jpeg|png)/i.test(url))
)

export const getPreviewType = (url, nameOrMime) => {
  const ext = getFileExt(url) || getFileExt(nameOrMime)
  const isPdf = ext === 'pdf'
  const isImage = IMAGE_EXTENSIONS.includes(ext) || isOcrPageImage(url, isPdf)
  return { ext, isPdf, isImage }
}

export const getSourceMeta = (sourceLocation) => {
  if (Array.isArray(sourceLocation)) {
    const namedSource = sourceLocation.find((item) => item?.file_name || item?.source_document_name)
    return {
      sourceName: namedSource?.file_name || namedSource?.source_document_name,
      sourceMime: sourceLocation.find((item) => item?.mime_type)?.mime_type,
      documentId: sourceLocation.find((item) => item?.document_id)?.document_id,
    }
  }

  return {
    sourceName: sourceLocation?.file_name || sourceLocation?.source_document_name,
    sourceMime: sourceLocation?.mime_type,
    documentId: sourceLocation?.document_id,
  }
}

export const getTracePreviewType = ({
  documentImageUrl,
  fallbackDocument,
  latestHistory,
  sourceLocation,
}) => {
  const { sourceName, sourceMime } = getSourceMeta(sourceLocation)
  const ext = (
    getFileExt(documentImageUrl)
    || getFileExt(sourceName)
    || getFileExt(sourceMime)
    || getFileExt(latestHistory?.source_document_name)
    || getFileExt(fallbackDocument?.name)
  )
  const isPdf = ext === 'pdf'
  const isImage = IMAGE_EXTENSIONS.includes(ext) || isOcrPageImage(documentImageUrl, isPdf)
  return { ext, isPdf, isImage, sourceName }
}

export const getTraceDocumentId = ({
  fallbackDocument,
  latestHistory,
  selectedField,
  sourceLocation,
}) => {
  const { documentId } = getSourceMeta(sourceLocation)
  return (
    documentId
    || latestHistory?.source_document_id
    || selectedField?.document_id
    || selectedField?.documentId
    || selectedField?.source_document_id
    || fallbackDocument?.id
  )
}

export const getTracePageNumber = (sourceLocation) => (
  Array.isArray(sourceLocation) ? null : (sourceLocation?.page ?? null)
)
