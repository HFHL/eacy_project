import React from 'react'
import { Empty } from 'antd'

import TraceDocumentPreview from '@/components/TraceDocumentPreview'
import { getTracePageNumber } from './previewUtils'

export const TracePreviewContent = ({
  documentImageUrl,
  sourceLocation,
  traceIsImage,
  traceIsPdf,
  unsupportedText = '该文档类型暂不支持内嵌预览，请点击「查看完整文档」',
}) => {
  if (!documentImageUrl) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无来源文档" />
  }

  if (!traceIsPdf && !traceIsImage) {
    return (
      <Empty
        description={unsupportedText}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )
  }

  return (
    <TraceDocumentPreview
      pdfUrl={documentImageUrl}
      imageUrl={documentImageUrl}
      isPdf={traceIsPdf}
      sourceLocation={sourceLocation}
      pageNumber={getTracePageNumber(sourceLocation)}
      loading={false}
    />
  )
}
