import { useCallback, useEffect, useState } from 'react'
import { getDocumentDetail } from '../../../../../api/document'
import { extractMarkdownFromParsedContent } from '../components/ocrContentUtils'

export const useOcrContentDisplay = ({ document, visible }) => {
  const [ocrImageLoading, setOcrImageLoading] = useState(new Map())
  const [ocrDisplayMode, setOcrDisplayMode] = useState('blocks')
  const [ocrMarkdown, setOcrMarkdown] = useState('')
  const [ocrMarkdownLoading, setOcrMarkdownLoading] = useState(false)
  const [ocrMarkdownLoaded, setOcrMarkdownLoaded] = useState(false)

  const resetOcrDisplay = useCallback(() => {
    setOcrImageLoading(new Map())
    setOcrDisplayMode('blocks')
    setOcrMarkdown('')
    setOcrMarkdownLoading(false)
    setOcrMarkdownLoaded(false)
  }, [])

  useEffect(() => {
    resetOcrDisplay()
  }, [resetOcrDisplay, visible, document?.id])

  const ensureOcrMarkdownLoaded = useCallback(async () => {
    if (!document?.id || ocrMarkdownLoading || ocrMarkdownLoaded) return

    setOcrMarkdownLoading(true)
    try {
      const response = await getDocumentDetail(document.id, {
        include_content: true,
        include_versions: false,
        include_patients: false,
        include_extracted: false,
      })
      if (response.success && response.data) {
        setOcrMarkdown(extractMarkdownFromParsedContent(response.data.parsed_content) || '')
      } else {
        setOcrMarkdown('')
      }
      setOcrMarkdownLoaded(true)
    } catch (error) {
      console.error('加载 OCR Markdown 失败:', error)
      setOcrMarkdown('')
      setOcrMarkdownLoaded(true)
    } finally {
      setOcrMarkdownLoading(false)
    }
  }, [document?.id, ocrMarkdownLoaded, ocrMarkdownLoading])

  const updateOcrImageLoading = useCallback((imageUrl, isLoading) => {
    if (!imageUrl) return
    setOcrImageLoading(prev => {
      const newMap = new Map(prev)
      newMap.set(imageUrl, isLoading)
      return newMap
    })
  }, [])

  const handleOcrDisplayModeChange = useCallback(async (mode) => {
    setOcrDisplayMode(mode)
    if (mode === 'markdown') {
      await ensureOcrMarkdownLoaded()
    }
  }, [ensureOcrMarkdownLoaded])

  return {
    ocrDisplayMode,
    ocrImageLoading,
    ocrMarkdown,
    ocrMarkdownLoading,
    onOcrDisplayModeChange: handleOcrDisplayModeChange,
    resetOcrDisplay,
    updateOcrImageLoading,
  }
}
