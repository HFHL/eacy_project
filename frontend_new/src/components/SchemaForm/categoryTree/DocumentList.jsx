import React from 'react'
import { Button, Empty, Tooltip, Typography } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
} from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

const DocumentList = ({
  documents = [],
  selectedDocumentId,
  onDocumentSelect,
  onUploadDocument,
  onPickExistingDocument,
  onViewDocumentDetail,
}) => {
  // eslint-disable-next-line no-console
  console.log('[CategoryTree.DocumentList] 渲染:', {
    count: documents.length,
    sample: documents.length > 0
      ? { id: documents[0].id, name: documents[0].name, status: documents[0].status }
      : null,
  })

  if (documents.length === 0) {
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文档" style={{ padding: '20px 0' }}>
        {onUploadDocument && (
          <Button type="dashed" size="small" icon={<CloudUploadOutlined />} onClick={onUploadDocument}>
            上传文档
          </Button>
        )}
      </Empty>
    )
  }

  const extractedDocs = documents.filter((doc) => doc.status === 'extracted')
  const pendingDocs = documents.filter((doc) => doc.status !== 'extracted')

  const renderDocItem = (doc) => {
    const isSelected = doc.id === selectedDocumentId
    const isPdf = doc.name.toLowerCase().includes('.pdf')

    return (
      <div
        key={doc.id}
        onClick={() => onDocumentSelect?.(doc)}
        style={{
          padding: '8px 10px',
          marginBottom: 4,
          borderRadius: 6,
          cursor: 'pointer',
          background: isSelected ? appThemeToken.colorPrimaryBg : appThemeToken.colorBgContainer,
          border: `1px solid ${isSelected ? appThemeToken.colorPrimary : appThemeToken.colorBorder}`,
          transition: 'all 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isPdf ? (
            <FilePdfOutlined style={{ color: appThemeToken.colorError, fontSize: 14 }} />
          ) : (
            <FileImageOutlined style={{ color: appThemeToken.colorPrimary, fontSize: 14 }} />
          )}
          <Text ellipsis={{ tooltip: doc.name }} style={{ flex: 1, fontSize: 12, fontWeight: isSelected ? 500 : 400 }}>
            {doc.name}
          </Text>
          {onViewDocumentDetail && (
            <Tooltip title="查看文档详情">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined style={{ fontSize: 12 }} />}
                onClick={(e) => {
                  e.stopPropagation()
                  onViewDocumentDetail(doc)
                }}
                style={{ padding: '0 4px', height: 18, minWidth: 18, color: appThemeToken.colorPrimary }}
              />
            </Tooltip>
          )}
          {doc.status === 'extracted' ? (
            <CheckCircleOutlined style={{ color: appThemeToken.colorSuccess, fontSize: 12 }} />
          ) : (
            <ClockCircleOutlined style={{ color: appThemeToken.colorWarning, fontSize: 12 }} />
          )}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: appThemeToken.colorTextTertiary, display: 'flex', gap: 8 }}>
          <span>{doc.type}</span>
          <span>{doc.pages}页</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 4px' }}>
      {extractedDocs.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            已抽取 ({extractedDocs.length})
          </Text>
          {extractedDocs.map(renderDocItem)}
        </div>
      )}
      {pendingDocs.length > 0 && (
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            待处理 ({pendingDocs.length})
          </Text>
          {pendingDocs.map(renderDocItem)}
        </div>
      )}
      {onUploadDocument && (
        <Button type="dashed" size="small" icon={<CloudUploadOutlined />} onClick={onUploadDocument} block style={{ marginTop: 8 }}>
          上传文档
        </Button>
      )}
      {onPickExistingDocument && (
        <Button type="link" size="small" onClick={onPickExistingDocument} block style={{ marginTop: 4, padding: 0, height: 'auto' }}>
          从已有文档抽取
        </Button>
      )}
    </div>
  )
}

export default DocumentList
