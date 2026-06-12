import React from 'react'
import { Button, Empty, Space, Spin, Typography } from 'antd'
import { EyeOutlined } from '@ant-design/icons'

import PdfPageWithHighlight from '@/components/PdfPageWithHighlight'
import { appThemeToken } from '@/styles/themeTokens'

const { Text } = Typography

export const DocumentPreviewMode = ({
  documentPreviewLoading,
  documentPreviewUrl,
  isImage,
  isPdf,
  onViewDocument,
  selectedDocument,
}) => (
  <div>
    <div style={{
      marginBottom: 12,
      padding: 12,
      background: 'rgba(82, 196, 26, 0.1)',
      borderRadius: 6,
      border: `1px solid ${appThemeToken.colorSuccess}`,
    }}>
      <Text strong style={{ fontSize: 14 }}>
        {selectedDocument?.fileName || selectedDocument?.name || '未命名文档'}
      </Text>
      <br />
      <Text type="secondary" style={{ fontSize: 12 }}>
        文档ID: {selectedDocument?.id || '-'}
      </Text>
    </div>

    <div style={{ marginBottom: 12, textAlign: 'center' }}>
      <Space>
        <Button
          size="small"
          icon={<EyeOutlined />}
          disabled={!selectedDocument?.id}
          onClick={() => onViewDocument && onViewDocument(selectedDocument)}
        >
          查看完整文档
        </Button>
      </Space>
    </div>

    {documentPreviewLoading ? (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin tip="加载文档..." />
      </div>
    ) : documentPreviewUrl ? (
      <div style={{ border: `1px solid ${appThemeToken.colorBorder}`, borderRadius: 6, overflow: 'hidden' }}>
        {isPdf ? (
          <div style={{ width: '100%', minWidth: 0, maxHeight: '70vh', overflow: 'auto', padding: 8 }}>
            <PdfPageWithHighlight
              pdfUrl={documentPreviewUrl}
              renderAllPages
              loading={false}
            />
          </div>
        ) : isImage ? (
          <img
            src={documentPreviewUrl}
            alt="document-preview"
            style={{ width: '100%', display: 'block' }}
          />
        ) : (
          <Empty
            description="该文档类型暂不支持内嵌预览，请点击「查看完整文档」"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </div>
    ) : (
      <Empty
        description="暂无可预览链接"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )}
  </div>
)
