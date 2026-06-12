import React from 'react'
import { Badge, Button, List, Typography } from 'antd'
import { CheckCircleOutlined, FileTextOutlined, UploadOutlined } from '@ant-design/icons'

import { appThemeToken } from '@/styles/themeTokens'

const { Text } = Typography

export const ProjectDocumentsTab = ({
  onDocumentSelect,
  onUploadDocument,
  projectDocuments,
  selectedDocument,
}) => (
  <div>
    <List
      dataSource={projectDocuments}
      renderItem={(doc) => (
        <List.Item style={{ padding: '0', marginBottom: '4px' }}>
          <div
            style={{
              width: '100%',
              padding: '8px 12px',
              cursor: 'pointer',
              background: selectedDocument?.id === doc.id ? appThemeToken.colorPrimaryBg : 'transparent',
              borderRadius: 4,
              border: selectedDocument?.id === doc.id ? `1px solid ${appThemeToken.colorPrimary}` : '1px solid transparent',
              transition: 'all 0.2s ease',
            }}
            onClick={() => onDocumentSelect && onDocumentSelect(doc)}
            onMouseEnter={(event) => {
              if (selectedDocument?.id !== doc.id) {
                event.target.style.background = appThemeToken.colorFillTertiary
              }
            }}
            onMouseLeave={(event) => {
              if (selectedDocument?.id !== doc.id) {
                event.target.style.background = 'transparent'
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileTextOutlined style={{ fontSize: 14, color: appThemeToken.colorPrimary }} />
                <div>
                  <Text strong style={{ fontSize: 12 }}>
                    {doc.document_sub_type || doc.metadata?.documentSubType || doc.metadata?.documentType || doc.category || doc.fileName || doc.name || '未知类型'}
                  </Text>
                  {doc.status === 'extracted' && <CheckCircleOutlined style={{ color: appThemeToken.colorSuccess, marginLeft: 4, fontSize: 12 }} />}
                  {doc.status === 'new' && <Badge count="新" size="small" style={{ marginLeft: 4 }} />}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {doc.document_type || doc.metadata?.documentType || doc.category || ''}
              </Text>
              {(doc.document_type || doc.metadata?.documentType) && (
                <Text type="secondary" style={{ fontSize: 12 }}> · </Text>
              )}
              <Text type="secondary" style={{ fontSize: 12 }}>
                {doc.uploadTime?.split(' ')[0] || doc.upload_time?.split('T')[0] || doc.uploadDate || ''}
              </Text>
              {doc.extractedFields && doc.extractedFields.length > 0 && (
                <div style={{ marginTop: 2 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    已抽取{doc.extractedFields.length}个字段
                  </Text>
                </div>
              )}
            </div>
          </div>
        </List.Item>
      )}
    />

    <div style={{ marginTop: 12, textAlign: 'center' }}>
      <Button
        block
        size="small"
        icon={<UploadOutlined />}
        onClick={onUploadDocument}
      >
        + 上传项目文档
      </Button>
    </div>
  </div>
)
