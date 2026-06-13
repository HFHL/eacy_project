import React from 'react'
import { Button, Space, Spin, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import PdfPageWithHighlight from '../../../../../components/PdfPageWithHighlight'
import { isOcrPagePreviewResponse, isOfficeDocumentLike } from '../../../../../api/document'
import { appThemeToken } from '../../../../../styles/themeTokens'
import { isPdfFileType } from './documentDetailStatus'
import ImagePreviewPane from './ImagePreviewPane'

const { Text, Title } = Typography

const isImageFile = (type, name, url) => {
  const normalizedType = String(type || '').toLowerCase()
  const normalizedName = String(name || '').toLowerCase()
  const normalizedUrl = String(url || '').toLowerCase()
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']
  return normalizedType.startsWith('image/') ||
    imageExtensions.includes(normalizedType) ||
    imageExtensions.includes(normalizedType.replace('.', '')) ||
    imageExtensions.some(ext => normalizedName.endsWith(`.${ext}`)) ||
    imageExtensions.some(ext => normalizedUrl.split('?')[0].endsWith(`.${ext}`))
}

const DocumentPreviewArea = ({
  detailLoading,
  document,
  documentDetail,
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
  setImgOffset,
  setImgRotate,
  setImgScale,
  setIsDragging,
  setPreviewError,
  setPreviewImageLoading,
  setStart,
}) => {
  const rawFileType = documentDetail?.file_type || document?.fileType || 'unknown'
  const fileName = documentDetail?.file_name || document?.fileName || ''
  const fileTypeDisplay = rawFileType.startsWith('.') ? rawFileType.substring(1).toUpperCase() : rawFileType.toUpperCase()
  const usesOcrPagePreview = previewSource === 'ocr_page'
    || documentDetail?.preview_source === 'ocr_page'
    || isOcrPagePreviewResponse({ preview_source: previewSource })
  const resolvedOcrPageCount = ocrPageCount || Number(documentDetail?.ocr_page_count || 0)
  const isPdf = isPdfFileType(rawFileType, fileName, previewUrl)
  const canRenderPreview = isPdf ? Boolean(pdfPreviewUrl) : Boolean(previewUrl)
  const waitingForAutomaticPreview = Boolean(document?.id && documentDetail && !canRenderPreview && !previewError)

  const renderUnsupportedPreview = (message) => (
    <div className="preview-placeholder">
      <div className="preview-icon">📄</div>
      <div className="preview-info">
        <Text strong>{fileName || '未知文档'}</Text>
        <br />
        <Text type="secondary">文件类型: {fileTypeDisplay}</Text>
        <br />
        <Text type="secondary">
          {documentDetail?.document_type || ''} | {documentDetail?.document_sub_type || ''}
        </Text>
      </div>
      <div className="preview-note" style={{ marginTop: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {message}
        </Text>
        <br />
        <Button
          type="link"
          size="small"
          onClick={() => {
            if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer')
          }}
        >
          在新窗口打开
        </Button>
      </div>
    </div>
  )

  return (
    <div className="document-preview-area">
      <div className="preview-header">
        <Space align="center">
          <Title level={5} style={{ margin: 0 }}>文档预览</Title>
          <Text type="secondary" ellipsis style={{ maxWidth: 200, fontSize: 12 }}>
            {fileName}
          </Text>
        </Space>
      </div>

      <div className="preview-content">
        {previewLoading || detailLoading || waitingForAutomaticPreview ? (
          <div className="preview-placeholder">
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">正在加载文档预览...</Text>
            </div>
          </div>
        ) : canRenderPreview ? (
          <div style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', overflow: 'auto', padding: 16 }}>
            {isPdf ? (
              <div style={{ width: '100%', minWidth: 0, flex: '1 1 auto', minHeight: 500, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: 12, border: `1px solid ${appThemeToken.colorBorder}`, borderRadius: 8, background: appThemeToken.colorBgLayout }}>
                <PdfPageWithHighlight pdfUrl={pdfPreviewUrl} renderAllPages />
              </div>
            ) : isImageFile(rawFileType, fileName, previewUrl) || usesOcrPagePreview ? (
              <ImagePreviewPane
                detailLoading={detailLoading}
                documentId={document.id}
                dragStart={dragStart}
                imgOffset={imgOffset}
                imgRotate={imgRotate}
                imgScale={imgScale}
                isDragging={isDragging}
                ocrPageNo={ocrPageNo}
                onFetchPreview={fetchPreviewUrl}
                previewError={previewError}
                previewImageLoading={previewImageLoading}
                previewLoading={previewLoading}
                previewUrl={previewUrl}
                resolvedOcrPageCount={resolvedOcrPageCount}
                setImgOffset={setImgOffset}
                setImgRotate={setImgRotate}
                setImgScale={setImgScale}
                setIsDragging={setIsDragging}
                setPreviewError={setPreviewError}
                setPreviewImageLoading={setPreviewImageLoading}
                setStart={setStart}
                usesOcrPagePreview={usesOcrPagePreview}
              />
            ) : renderUnsupportedPreview(
              isOfficeDocumentLike({ fileType: rawFileType, fileName, mimeType: documentDetail?.mime_type })
                ? 'Word 文档需完成 OCR 解析后才能预览页面内容'
                : '不支持预览此文件类型'
            )}
          </div>
        ) : (
          <div className="preview-placeholder">
            <div className="preview-icon">📄</div>
            <div className="preview-info">
              <Text strong>{fileName || '未知文档'}</Text>
              <br />
              <Text type="secondary">文件类型: {fileTypeDisplay}</Text>
              <br />
              <Text type="secondary">
                {documentDetail?.document_type || ''} | {documentDetail?.document_sub_type || ''}
              </Text>
            </div>
            <div className="preview-note">
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                无法获取文档预览URL
              </Text>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchPreviewUrl(document.id)} loading={previewLoading}>
                重新获取
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DocumentPreviewArea
