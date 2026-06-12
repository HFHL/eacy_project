import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import {
  getDocumentPdfStreamUrl,
  getDocumentTempUrl,
  getFreshDocumentPdfStreamUrl,
  getFreshDocumentStreamUrl,
  isOcrPagePreviewResponse,
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

  const resetImageTransform = useCallback(() => {
    setImgScale(1)
    setImgRotate(0)
    setImgOffset({ x: 0, y: 0 })
  }, [])

  const resetPreview = useCallback(() => {
    setPreviewUrl(null)
    setPdfPreviewUrl('')
    setPreviewImageLoading(false)
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
        const previewSrc = isOcrPagePreviewResponse(data)
          ? await getFreshDocumentStreamUrl(documentId, { page: resolvedPageNo })
          : data.temp_url
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
        message.error('获取预览URL失败')
      }
    } finally {
      setPreviewLoading(false)
    }
  }, [document?.file_path, documentDetail?.file_path, documentDetail?.ocr_page_count])

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
