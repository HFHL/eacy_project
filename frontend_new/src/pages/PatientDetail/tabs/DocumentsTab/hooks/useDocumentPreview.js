import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import {
  getDocumentPdfStreamUrl,
  getDocumentTempUrl,
  getFreshDocumentPdfStreamUrl,
  resolveDocumentInlinePreviewUrl,
} from '../../../../../api/document'
import { isPdfFileType } from '../components/documentDetailStatus'

export const useDocumentPreview = ({ document, documentDetail, visible }) => {
  const [imgScale, setImgScale] = useState(1)
  const [imgRotate, setImgRotate] = useState(0)
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setStart] = useState({ x: 0, y: 0 })
  const [previewUrl, setPreviewUrl] = useState(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('')
  const [previewSource, setPreviewSource] = useState('native')
  const [ocrPageNo, setOcrPageNo] = useState(1)
  const [ocrPageCount, setOcrPageCount] = useState(0)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewImageLoading, setPreviewImageLoading] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const autoPreviewKeyRef = useRef('')

  const resetImageTransform = useCallback(() => {
    setImgScale(1)
    setImgRotate(0)
    setImgOffset({ x: 0, y: 0 })
  }, [])

  const resetPreview = useCallback(() => {
    setPreviewUrl(null)
    setPdfPreviewUrl('')
    setPreviewImageLoading(false)
    setPreviewError(false)
    setPreviewSource('native')
    setOcrPageNo(1)
    setOcrPageCount(0)
  }, [])

  const fetchPreviewUrl = useCallback(async (documentId, pageNo = 1) => {
    if (!documentId) return

    setPreviewLoading(true)
    setPreviewError(false)
    try {
      const urlResponse = await getDocumentTempUrl(documentId, 3600, { page: pageNo })
      if (urlResponse.success && urlResponse.data?.temp_url) {
        const data = urlResponse.data
        const resolvedPageNo = Number(data.page_no || pageNo)
        const previewSrc = await resolveDocumentInlinePreviewUrl(documentId, data, { pageNo: resolvedPageNo })
        setPreviewUrl(previewSrc)
        setPreviewSource(data.preview_source || 'native')
        setOcrPageCount(Number(data.ocr_page_count || documentDetail?.ocr_page_count || 0))
        setOcrPageNo(resolvedPageNo)
        setPreviewImageLoading(true)
      } else {
        const filePath = documentDetail?.file_path || document?.file_path
        if (filePath) {
          setPreviewUrl(filePath)
          setPreviewImageLoading(true)
        } else {
          setPreviewError(true)
          message.error('无法获取预览URL')
        }
      }
    } catch (error) {
      console.error('获取预览URL失败:', error)
      const filePath = documentDetail?.file_path || document?.file_path
      if (filePath) {
        setPreviewUrl(filePath)
        setPreviewImageLoading(true)
      } else {
        setPreviewError(true)
        message.error('获取预览URL失败')
      }
    } finally {
      setPreviewLoading(false)
    }
  }, [document?.file_path, documentDetail?.file_path, documentDetail?.ocr_page_count])

  useEffect(() => {
    autoPreviewKeyRef.current = ''
    resetPreview()
  }, [document?.id, resetPreview])

  useEffect(() => {
    if (!visible) {
      autoPreviewKeyRef.current = ''
      resetPreview()
    }
  }, [resetPreview, visible])

  useEffect(() => {
    if (!visible || !document?.id || !documentDetail) return

    const rawFileType = documentDetail?.file_type || document?.fileType || document?.file_type || ''
    const fileName = documentDetail?.file_name || document?.fileName || document?.file_name || ''
    if (isPdfFileType(rawFileType, fileName)) return

    const autoPreviewKey = [
      document.id,
      rawFileType,
      fileName,
      documentDetail?.mime_type || '',
      documentDetail?.preview_source || '',
      documentDetail?.ocr_page_count ?? '',
    ].join('|')

    if (autoPreviewKeyRef.current === autoPreviewKey) return
    autoPreviewKeyRef.current = autoPreviewKey
    fetchPreviewUrl(document.id)
  }, [
    document?.fileName,
    document?.fileType,
    document?.file_name,
    document?.file_type,
    document?.id,
    documentDetail,
    fetchPreviewUrl,
    visible,
  ])

  useEffect(() => {
    let cancelled = false
    async function loadPdfUrl() {
      if (!visible || !document?.id) {
        setPdfPreviewUrl('')
        return
      }
      const rawFileType = documentDetail?.file_type || document?.fileType || document?.file_type || ''
      const fileName = documentDetail?.file_name || document?.fileName || document?.file_name || ''
      if (!isPdfFileType(rawFileType, fileName)) {
        setPdfPreviewUrl('')
        return
      }
      try {
        const url = await getFreshDocumentPdfStreamUrl(document.id)
        if (!cancelled) setPdfPreviewUrl(url)
      } catch (_) {
        if (!cancelled) setPdfPreviewUrl(getDocumentPdfStreamUrl(document.id))
      }
    }
    loadPdfUrl()
    return () => {
      cancelled = true
    }
  }, [
    visible,
    document?.id,
    document?.fileType,
    document?.file_type,
    document?.fileName,
    document?.file_name,
    documentDetail?.file_type,
    documentDetail?.file_name,
  ])

  return {
    dragStart,
    fetchPreviewUrl,
    imgOffset,
    imgRotate,
    imgScale,
    isDragging,
    ocrPageCount,
    ocrPageNo,
    pdfPreviewUrl,
    previewError,
    previewImageLoading,
    previewLoading,
    previewSource,
    previewUrl,
    resetImageTransform,
    resetPreview,
    setImgOffset,
    setImgRotate,
    setImgScale,
    setIsDragging,
    setPreviewError,
    setPreviewImageLoading,
    setStart,
  }
}
