import React, { useEffect, useState } from 'react'
import { Empty, Spin, Tag } from 'antd'
import { ExportOutlined, FileTextOutlined } from '@ant-design/icons'

import { hasRenderablePolygon } from '../../../api/_evidence'
import { resolveTraceDocumentPreviewUrl } from '../../../api/document'
import { appThemeToken } from '../../../styles/themeTokens'
import TraceDocumentPreview from '../../TraceDocumentPreview'

export const EvidenceDocumentViewer = ({ evidences, loading }) => {
  const [docInfo, setDocInfo] = useState(null)
  const [docError, setDocError] = useState(null)
  const [docLoading, setDocLoading] = useState(false)

  const validEvidences = Array.isArray(evidences) ? evidences.filter(Boolean) : []
  const primary = validEvidences[0] || null
  const documentId = primary?.document_id || primary?.source_location?.document_id || null
  const sourceLocations = validEvidences.map((item) => item.source_location).filter(Boolean)
  const pageNo = sourceLocations[0]?.page || sourceLocations[0]?.page_no || 1

  useEffect(() => {
    if (!documentId) {
      setDocInfo(null)
      setDocError(null)
      return undefined
    }

    let cancelled = false
    const loadDocument = async () => {
      setDocLoading(true)
      setDocError(null)
      try {
        const preview = await resolveTraceDocumentPreviewUrl(documentId, { pageNo })
        if (cancelled) return
        if (!preview?.url) {
          setDocError('无法获取文档')
          return
        }
        if (preview.mode === 'unsupported') {
          setDocError('该文档类型暂不支持内嵌预览')
          return
        }
        setDocInfo({
          url: preview.url,
          fileName: preview.fileName,
          fileType: preview.fileType,
          mimeType: preview.mimeType,
          isPdf: preview.mode === 'pdf',
          previewSource: preview.previewSource,
          ocrPageCount: preview.ocrPageCount,
          pageNo: preview.pageNo || pageNo,
        })
      } catch (error) {
        if (!cancelled) {
          console.error('加载文档失败:', error)
          setDocError(error.message || '加载文档失败')
        }
      } finally {
        if (!cancelled) setDocLoading(false)
      }
    }

    loadDocument()
    return () => { cancelled = true }
  }, [documentId, pageNo])

  if (loading || docLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spin tip="加载文档中..." size="large" />
      </div>
    )
  }

  if (!documentId) {
    return (
      <Empty
        description="暂无定位坐标信息（该字段的抽取记录中未保存坐标证据）"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )
  }

  if (docError || !docInfo?.url) {
    return <Empty description={docError || '无法加载文档'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  const displayPageNo = docInfo?.pageNo || pageNo

  return (
    <div
      style={{
        background: appThemeToken.colorFillTertiary,
        borderRadius: 8,
        padding: 16,
        height: 'calc(85vh - 180px)',
        minHeight: 480,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: appThemeToken.colorTextSecondary, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <FileTextOutlined />
          <span>{docInfo.fileName || '原始文档'}</span>
          <Tag color="blue">第 {displayPageNo} 页</Tag>
          {validEvidences.length > 1 && <Tag color="purple">{validEvidences.length} 个溯源片段</Tag>}
        </div>
        <a href={docInfo.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
          <ExportOutlined /> 新标签页打开
        </a>
      </div>

      <div style={{ flex: 1, minHeight: 0, minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column' }}>
        <TraceDocumentPreview
          pdfUrl={docInfo.isPdf ? docInfo.url : null}
          imageUrl={docInfo.url}
          isPdf={docInfo.isPdf}
          sourceLocation={sourceLocations.filter((loc) => hasRenderablePolygon(loc))}
          pageNumber={sourceLocations.length > 0 ? displayPageNo : null}
          loading={false}
          previewStyle={{ width: '100%', minWidth: 0 }}
        />
      </div>
    </div>
  )
}
