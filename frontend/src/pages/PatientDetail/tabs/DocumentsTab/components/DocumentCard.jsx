/**
 * 文档卡片组件
 * 显示文档的核心信息：缩略图、类型、机构、时间等
 */
import React from 'react'
import { Card, Typography, Space, Tooltip } from 'antd'
import { 
  FileTextOutlined, 
  FilePdfOutlined, 
  FileImageOutlined,
  FileOutlined 
} from '@ant-design/icons'
import ConfidenceIndicator from './ConfidenceIndicator'
import StatusIndicator from './StatusIndicator'
import './DocumentCard.css'

const { Text, Title } = Typography

const DocumentCard = ({ 
  document, 
  onClick,
  onMenuClick 
}) => {
  // 获取文档图标
  const getDocumentIcon = (type, subtype) => {
    const iconProps = { size: 40, style: { color: '#6366f1' } }
    
    switch (type) {
      case '病理报告':
        return <FilePdfOutlined {...iconProps} style={{ color: '#ef4444' }} />
      case '实验室检查':
        return <FileTextOutlined {...iconProps} style={{ color: '#10b981' }} />
      case '影像检查':
        return <FileImageOutlined {...iconProps} style={{ color: '#f59e0b' }} />
      case '基因检测':
        return <FileTextOutlined {...iconProps} style={{ color: '#8b5cf6' }} />
      default:
        return <FileOutlined {...iconProps} />
    }
  }

  // 格式化日期显示
  const formatDate = (dateString) => {
    if (!dateString) return '未知时间'
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  // 获取文档类型显示文本
  const getTypeDisplay = (type, subtype) => {
    if (subtype && subtype !== type) {
      return `${type} | ${subtype}`
    }
    return type || '未知类型'
  }

  return (
    <Card
      className="document-card"
      hoverable
      onClick={() => onClick?.(document)}
      bodyStyle={{ padding: '16px' }}
    >
      <div className="document-card-horizontal">
        {/* 左侧：缩略图 */}
        <div className="document-thumbnail">
          {getDocumentIcon(document.metadata?.documentType, document.metadata?.documentSubtype)}
        </div>

        {/* 中间：主要信息 */}
        <div className="document-main-info">
          <div className="document-title">
            <Title level={5} className="document-type-text">
              {getTypeDisplay(
                document.metadata?.documentType, 
                document.metadata?.documentSubtype
              )}
            </Title>
            <Text className="document-filename" ellipsis={{ tooltip: document.fileName }}>
              {document.fileName || '未知文件'}
            </Text>
          </div>
          
          <div className="document-details">
            <Space split={<span style={{ color: '#d9d9d9' }}>|</span>} size="small">
              <Text type="secondary" className="document-detail-item">
                {document.metadata?.organizationName || '未知机构'}
              </Text>
              <Text type="secondary" className="document-detail-item">
                {formatDate(document.metadata?.effectiveDate)}
              </Text>
              <Text type="secondary" className="document-detail-item">
                {document.fileSize || '未知大小'}
              </Text>
            </Space>
          </div>
        </div>

        {/* 右侧：状态和操作 */}
         <div className="document-actions">
           <div className="document-indicators">
             <Space direction="vertical" size="small" align="end">
               <ConfidenceIndicator confidence={document.confidence} />
               <StatusIndicator 
                 status={document.status} 
                 extractedFieldsCount={document.extractedFields?.length || 0}
               />
             </Space>
           </div>
           <Text type="secondary" style={{ fontSize: '12px', marginTop: '8px' }}>
             上传：{formatDate(document.uploadTime)}
           </Text>
         </div>
      </div>
    </Card>
  )
}

export default DocumentCard