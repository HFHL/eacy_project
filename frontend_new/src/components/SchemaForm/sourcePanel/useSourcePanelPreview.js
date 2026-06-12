import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getDocumentDetail,
  getDocumentPdfStreamUrl,
  getFreshDocumentPdfStreamUrl,
  resolveTraceDocumentPreviewUrl,
} from '../../../api/document'
import { getDocumentDisplayName } from '../utils/documentCandidateUtils'
import { isPdfFileLike } from '../utils/sourceLocationUtils'

export function useSourcePanelPreview({
  collapsed,
  displaySource,
  fallbackDoc,
  sourceDocId,
  sourcePageIdx,
}) {
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewFileType, setPreviewFileType] = useState(null)
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewRequested, setPreviewRequested] = useState(false)
  const [ocrPageAngles, setOcrPageAngles] = useState([])
  const prevCollapsedRef = useRef(collapsed)

  useEffect(() => {
    const wasCollapsed = prevCollapsedRef.current
    prevCollapsedRef.current = collapsed
    if (wasCollapsed && !collapsed && sourceDocId) {
      setPreviewRequested(true)
    }
  }, [collapsed, sourceDocId])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setPreviewUrl(null)
      setPreviewFileType(null)
      setPreviewPdfUrl(null)
      setOcrPageAngles([])
      if (!sourceDocId || !previewRequested || collapsed) return
      setPreviewLoading(true)
      try {
        const detailRes = await getDocumentDetail(sourceDocId, {
          include_content: false,
          include_versions: false,
          include_patients: false,
          include_extracted: false,
        })
        if (cancelled) return
        const fileType = (detailRes?.data?.file_type || '').toLowerCase()
        setPreviewFileType(fileType || null)
        const pages = detailRes?.data?.ocr_payload_json?.pages
        if (Array.isArray(pages)) {
          setOcrPageAngles(
            pages.map((page) => {
              const angle = Number(page?.angle)
              return Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0
            })
          )
        }
        if (fileType === 'pdf') {
          setPreviewUrl(null)
          setPreviewPdfUrl(await getFreshDocumentPdfStreamUrl(sourceDocId))
        } else {
          const preview = await resolveTraceDocumentPreviewUrl(sourceDocId, {
            pageNo: Math.max(0, sourcePageIdx) + 1,
          })
          if (cancelled) return
          if (preview?.mode === 'pdf') {
            setPreviewUrl(null)
            setPreviewPdfUrl(preview.url)
            setPreviewFileType('pdf')
          } else {
            setPreviewUrl(preview?.url || null)
            setPreviewPdfUrl(null)
          }
        }
      } catch {
        if (!cancelled) {
          setPreviewFileType(null)
          setPreviewUrl(null)
        }
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [collapsed, previewRequested, sourceDocId, sourcePageIdx])

  const previewIsPdf = isPdfFileLike({
    fileType: previewFileType,
    fileName: displaySource?.source_document_name || displaySource?.file_name || fallbackDoc?.name || fallbackDoc?.fileName,
    fileUrl: previewUrl,
  })
  const previewFileUrl = previewUrl && previewIsPdf
    ? `${previewUrl}${previewUrl.includes('#') ? '&' : '#'}page=${Math.max(0, sourcePageIdx) + 1}`
    : previewUrl
  const usePdfStream = previewIsPdf && sourceDocId

  const previewDocument = useMemo(() => ({
    fileName:
      displaySource?.document_type ??
      displaySource?.source_document_name ??
      (sourceDocId
        ? `文档 ${String(sourceDocId).slice(0, 8)}`
        : fallbackDoc
          ? getDocumentDisplayName(fallbackDoc)
          : '文档预览'),
    fileType: previewFileType || (usePdfStream ? 'pdf' : 'image'),
    fileUrl: usePdfStream
      ? (previewPdfUrl || getDocumentPdfStreamUrl(sourceDocId))
      : (previewFileUrl || null),
  }), [displaySource, fallbackDoc, previewFileType, previewFileUrl, previewPdfUrl, sourceDocId, usePdfStream])

  return {
    ocrPageAngles,
    previewDocument,
    previewLoading,
    previewRequested,
    setPreviewRequested,
  }
}
