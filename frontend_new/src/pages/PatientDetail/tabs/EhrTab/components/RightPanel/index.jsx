/**
 * 右侧面板组件 - 文档溯源预览
 * 显示选中字段的来源文档信息和内容预览
 * 支持显示文档图片并高亮来源区域
 */
import React, { useState } from 'react'
import { Card, Space } from 'antd'
import { EyeOutlined, HistoryOutlined } from '@ant-design/icons'

import { DocumentPreviewMode } from './DocumentPreviewMode'
import { FieldSourceMode } from './FieldSourceMode'
import { FullscreenTraceModal } from './FullscreenTraceModal'
import {
  getPreviewType,
  getTraceDocumentId,
  getTracePreviewType,
} from './previewUtils'

const RightPanel = ({
  selectedField,
  selectedDocument,
  fieldHistory,
  historyLoading,
  documentImageUrl,
  imageLoading,
  documentPreviewUrl,
  documentPreviewLoading = false,
  sourceLocation,
  fallbackDocument = null,
  onViewFullDocument,
  onViewDocument,
}) => {
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const latestHistory = fieldHistory && fieldHistory.length > 0 ? fieldHistory[0] : null
  const isFallbackMode = selectedField && !latestHistory?.source_document_id && !!fallbackDocument
  const isDocumentMode = !selectedField && !!selectedDocument

  const previewType = getPreviewType(
    documentPreviewUrl,
    selectedDocument?.fileName || selectedDocument?.name,
  )
  const tracePreviewType = getTracePreviewType({
    documentImageUrl,
    fallbackDocument,
    latestHistory,
    sourceLocation,
  })
  const traceDocId = getTraceDocumentId({
    fallbackDocument,
    latestHistory,
    selectedField,
    sourceLocation,
  })

  return (
    <Card
      title={(
        <Space>
          {isDocumentMode ? <EyeOutlined /> : <HistoryOutlined />}
          <span>{isDocumentMode ? '文档预览' : '文档溯源'}</span>
        </Space>
      )}
      size="small"
      style={{
        border: 'none',
        borderRadius: 0,
        height: '100%',
      }}
      styles={{ body: { padding: '12px', height: 'calc(100% - 46px)', overflow: 'auto' } }}
    >
      {isDocumentMode ? (
        <DocumentPreviewMode
          documentPreviewLoading={documentPreviewLoading}
          documentPreviewUrl={documentPreviewUrl}
          isImage={previewType.isImage}
          isPdf={previewType.isPdf}
          onViewDocument={onViewDocument}
          selectedDocument={selectedDocument}
        />
      ) : (
        <FieldSourceMode
          documentImageUrl={documentImageUrl}
          fallbackDocument={fallbackDocument}
          fieldHistory={fieldHistory}
          historyLoading={historyLoading}
          imageLoading={imageLoading}
          isFallbackMode={isFallbackMode}
          latestHistory={latestHistory}
          onOpenFullscreen={() => setFullscreenOpen(true)}
          onViewFullDocument={onViewFullDocument}
          selectedField={selectedField}
          sourceLocation={sourceLocation}
          traceDocId={traceDocId}
          traceIsImage={tracePreviewType.isImage}
          traceIsPdf={tracePreviewType.isPdf}
        />
      )}

      <FullscreenTraceModal
        documentImageUrl={documentImageUrl}
        latestHistory={latestHistory}
        onClose={() => setFullscreenOpen(false)}
        open={fullscreenOpen}
        sourceLocation={sourceLocation}
        sourceName={tracePreviewType.sourceName}
        traceIsImage={tracePreviewType.isImage}
        traceIsPdf={tracePreviewType.isPdf}
      />
    </Card>
  )
}

export default RightPanel
