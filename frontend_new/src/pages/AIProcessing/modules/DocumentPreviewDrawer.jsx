import React from 'react'
import { Alert, Button, Drawer, Empty, Space, Spin, Tabs, Typography } from 'antd'
import { EyeOutlined } from '@ant-design/icons'
import PdfPageWithHighlight from '../../../components/PdfPageWithHighlight'

const { Text } = Typography

const IMAGE_TYPES = ['image', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']

const JsonPreview = ({ extractionRecord }) => {
  if (!extractionRecord?.extracted_ehr_data) return <Empty description="暂无抽取数据" />

  return (
    <div style={{
      background: '#1e1e1e',
      borderRadius: 8,
      padding: 16,
      maxHeight: '70vh',
      overflow: 'auto',
      fontFamily: 'Consolas, Monaco, "Courier New", monospace'
    }}>
      <pre style={{
        margin: 0,
        color: '#d4d4d4',
        fontSize: 13,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all'
      }}>
        {JSON.stringify(extractionRecord.extracted_ehr_data, null, 2)}
      </pre>
    </div>
  )
}

const OriginalDocumentPreview = ({ tempUrl, documentId, fileType, onOpenOcr }) => {
  if (!tempUrl) {
    return (
      <Alert
        type="warning"
        showIcon
        message="无法获取文档临时访问链接"
        description="可能是文档未上传到对象存储或缺少 object_key。你仍可尝试 OCR 溯源页查看解析内容。"
        action={documentId ? (
          <Button size="small" onClick={() => onOpenOcr(documentId)}>
            打开 OCR 溯源
          </Button>
        ) : null}
      />
    )
  }

  const lowerFileType = String(fileType).toLowerCase()
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Space>
          <Button type="primary" onClick={() => window.open(tempUrl, '_blank', 'noopener,noreferrer')}>
            新窗口打开
          </Button>
          {documentId && (
            <Button onClick={() => onOpenOcr(documentId)}>
              OCR 溯源
            </Button>
          )}
        </Space>
      </div>

      {lowerFileType === 'pdf' ? (
        <div style={{ height: '70vh', overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, background: '#f5f5f5' }}>
          <PdfPageWithHighlight pdfUrl={tempUrl} maxWidth="100%" renderAllPages />
        </div>
      ) : IMAGE_TYPES.includes(lowerFileType) ? (
        <img
          alt="document-preview"
          src={tempUrl}
          style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', border: '1px solid #f0f0f0', borderRadius: 8 }}
        />
      ) : (
        <Alert
          type="info"
          showIcon
          message="该文件类型不支持内嵌预览"
          description={<span>请点击上方「新窗口打开」查看/下载原文件。</span>}
        />
      )}
    </div>
  )
}

const DocumentPreviewDrawer = ({
  open,
  loading,
  documentId,
  name,
  tempUrl,
  fileType,
  extractionRecord,
  activeTab,
  onTabChange,
  onClose,
  onOpenOcr,
}) => (
  <Drawer
    title={
      <Space>
        <EyeOutlined />
        <Text>查看原文档 - {name}</Text>
      </Space>
    }
    open={open}
    onClose={onClose}
    width={900}
    destroyOnHidden
    zIndex={2100}
  >
    {loading ? (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin tip="加载预览..." />
      </div>
    ) : (
      <Tabs
        activeKey={activeTab}
        onChange={onTabChange}
        items={[
          {
            key: 'original',
            label: '原文档',
            children: (
              <OriginalDocumentPreview
                tempUrl={tempUrl}
                documentId={documentId}
                fileType={fileType}
                onOpenOcr={onOpenOcr}
              />
            )
          },
          {
            key: 'extracted',
            label: '提取数据',
            children: <JsonPreview extractionRecord={extractionRecord} />
          }
        ]}
      />
    )}
  </Drawer>
)

export default DocumentPreviewDrawer
