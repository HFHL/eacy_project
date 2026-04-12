/**
 * PdfPageWithHighlight
 * 用 PDF.js 渲染 PDF 单页并在其上绘制 bbox 高亮框。
 * 用于文档溯源面板：当有 source_location（page + bbox）时，显示指定页并高亮区域。
 *
 * bbox 坐标系约定：
 * - 若后端返回归一化坐标（0–1000），则传入 bboxScale={1000}（默认），按比例映射到渲染宽高。
 * - 若后端返回 PDF 点坐标（与 PDF 页宽高一致），则传入 bboxScale="page"，按 PDF 页尺寸映射。
 */
import React, { useEffect, useRef, useState } from 'react'
import { Spin } from 'antd'
import * as pdfjsLib from 'pdfjs-dist'
// Vite: 使用 ?url 使 worker 被正确打包并得到可用 URL
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker
}

const DEFAULT_BBOX_SCALE = 1000

export function PdfPageWithHighlight({
  pdfUrl,
  pageNumber = 1,
  bbox,
  locations,
  maxWidth = 480,
  loading: externalLoading = false,
  bboxScale = DEFAULT_BBOX_SCALE,
  onLoaded,
}) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [pagePoints, setPagePoints] = useState({ width: 0, height: 0 })

  // 支持单个 bbox 或 locations 数组（多个区块）
  const hasBbox = Array.isArray(bbox) && bbox.length >= 4
  const hasLocations = Array.isArray(locations) && locations.length > 0
  const list = hasLocations
    ? locations.filter((loc) => loc && Array.isArray(loc.bbox) && loc.bbox.length >= 4)
    : hasBbox
      ? [{ bbox, page: pageNumber }]
      : []

  const targetPage = pageNumber || (list[0] && list[0].page != null ? Number(list[0].page) : 1)
  const pageIndex = Math.max(1, Math.floor(targetPage))

  useEffect(() => {
    if (!pdfUrl) {
      setLoading(false)
      setError('未提供 PDF 地址')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    const load = async () => {
      try {
        // 先不依赖 canvasRef：getDocument 可能较慢，worker 在某些环境会失败，用 disableWorker 降级
        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          disableWorker: false,
          isEvalSupported: false,
        })
        const pdf = await loadingTask.promise
        if (cancelled) return
        if (typeof onLoaded === 'function') {
          try {
            onLoaded(pdf.numPages || 1)
          } catch {
            // ignore callback errors
          }
        }
        const page = await pdf.getPage(pageIndex)
        if (cancelled) return
        const viewport1 = page.getViewport({ scale: 1 })
        const scale = 1.5
        const viewport = page.getViewport({ scale })
        // 下一帧再取 canvas，确保已挂载
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        const ctx = canvas.getContext('2d')
        canvas.height = viewport.height
        canvas.width = viewport.width
        setViewportSize({ width: viewport.width, height: viewport.height })
        setPagePoints({ width: viewport1.width, height: viewport1.height })
        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise
        if (cancelled) return
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'PDF 加载失败')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [pdfUrl, pageIndex])

  if (error) {
    return (
      <div style={{ padding: 12, background: '#fff2f0', borderRadius: 4, color: '#cf1322', fontSize: 12 }}>
        {error}
      </div>
    )
  }

  const refW = viewportSize.width || 1
  const refH = viewportSize.height || 1
  const usePageScale = bboxScale === 'page'
  const pw = pagePoints.width || refW
  const ph = pagePoints.height || refH
  const showSpinner = externalLoading || loading

  const toRect = (item) => {
    const [x1, y1, x2, y2] = item.bbox
    const w = x2 - x1
    const h = y2 - y1
    if (usePageScale && pw > 0 && ph > 0) {
      return {
        left: (x1 / pw) * refW,
        top: (y1 / ph) * refH,
        width: (w / pw) * refW,
        height: (h / ph) * refH,
      }
    }
    const scale = refW / Number(bboxScale)
    const scaleY = refH / Number(bboxScale)
    return {
      left: x1 * scale,
      top: y1 * scaleY,
      width: w * scale,
      height: h * scaleY,
    }
  }

  // 始终只渲染一个 canvas（同一 ref），避免 loading 时未挂载导致 effect 拿不到 ref 而卡死
  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', maxWidth: maxWidth || '100%' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          maxWidth: '100%',
          height: 'auto',
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          opacity: showSpinner ? 0 : 1,
        }}
      />
      {showSpinner && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', borderRadius: 4 }}>
          <Spin tip="加载 PDF 页..." />
        </div>
      )}
      {!showSpinner && viewportSize.width > 0 && list.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            boxSizing: 'border-box',
          }}
        >
          {list.map((item, idx) => {
            const rect = toRect(item)
            const leftPct = (rect.left / refW) * 100
            const topPct = (rect.top / refH) * 100
            const widthPct = (Math.max(rect.width, 2) / refW) * 100
            const heightPct = (Math.max(rect.height, 2) / refH) * 100
            return (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  border: '1px solid #ff0000',
                  backgroundColor: 'transparent',
                  borderRadius: 0,
                  boxSizing: 'border-box',
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PdfPageWithHighlight
