import React from 'react'
import { Empty, Modal, Space } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'

import { TracePreviewContent } from './TracePreviewContent'

export const FullscreenTraceModal = ({
  documentImageUrl,
  latestHistory,
  onClose,
  open,
  sourceLocation,
  sourceName,
  traceIsImage,
  traceIsPdf,
}) => (
  <Modal
    title={(
      <Space>
        <FileTextOutlined />
        <span>
          {
            (Array.isArray(sourceLocation) ? sourceLocation.find((item) => item?.file_name)?.file_name : sourceLocation?.file_name)
            || latestHistory?.source_document_name
            || sourceName
            || '原始文档'
          }
        </span>
      </Space>
    )}
    open={open}
    onCancel={onClose}
    footer={null}
    width="85vw"
    style={{ top: 24, maxWidth: 1400 }}
    styles={{ body: { padding: 16, maxHeight: 'calc(95vh - 110px)', overflow: 'auto' } }}
    destroyOnHidden
  >
    {documentImageUrl ? (
      <TracePreviewContent
        documentImageUrl={documentImageUrl}
        sourceLocation={sourceLocation}
        traceIsImage={traceIsImage}
        traceIsPdf={traceIsPdf}
        unsupportedText="该文档类型暂不支持内嵌预览"
      />
    ) : (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无来源文档" />
    )}
  </Modal>
)
