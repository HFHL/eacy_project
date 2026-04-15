/**
 * 文档卡片组件
 * 显示文档的核心信息：缩略图、类型、机构、时间等
 */
import React from 'react'
import { Card, Typography, Space, Tooltip, Tag } from 'antd'
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

  // 渲染 EHR 抽取状态标签
  const renderEhrExtractStatus = (status) => {
    switch (status) {
      case 'completed':
        return <Tag color="success" style={{ margin: 0 }}>已抽取</Tag>
      case 'running':
        return <Tag color="processing" style={{ margin: 0 }}>抽取中</Tag>
      case 'failed':
        return <Tag color="error" style={{ margin: 0 }}>抽取失败</Tag>
      case 'pending':
      default:
        return <Tag color="default" style={{ margin: 0 }}>未抽取</Tag>
    }
  }

  // 提取各个字段的值，兼容多种后端返回格式(驼峰式、下划线式及嵌套的metadata.result)
  const fileName = document.fileName || document.file_name || document.name || '未知文件';
  
  const docType = document.document_type || 
                 document.metadata?.documentType || 
                 document.metadata?.result?.['文档类型'] || 
                 document.category;
                 
  const docSubType = document.document_sub_type || 
                    document.metadata?.documentSubtype || 
                    document.metadata?.result?.['文档子类型'];

  const orgName = document.metadata?.organizationName || 
                  document.metadata?.result?.['机构名称'] || 
                  '未知机构';

  const effDate = document.effective_at || 
                  document.metadata?.effectiveDate || 
                  document.metadata?.result?.['文档生效日期'];

  const upTime = document.upload_time || document.uploadTime || document.uploaded_at;

  const rawFileSize = document.fileSize || document.file_size;
  const getFileSize = (size) => {
    if (!size) return '未知大小';
    if (typeof size === 'string') return size;
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    return (size / (1024 * 1024)).toFixed(1) + ' MB';
  };
  const formattedFileSize = getFileSize(rawFileSize);

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
          {getDocumentIcon(docType, docSubType)}
        </div>

        {/* 中间：主要信息 */}
        <div className="document-main-info">
          <div className="document-title">
            <Title level={5} className="document-type-text">
              {getTypeDisplay(docType, docSubType)}
            </Title>
            <Text className="document-filename" ellipsis={{ tooltip: fileName }}>
              {fileName}
            </Text>
          </div>
          
          <div className="document-details">
            <Space split={<span style={{ color: '#d9d9d9' }}>|</span>} size="small">
              <Text type="secondary" className="document-detail-item">
                {orgName}
              </Text>
              <Text type="secondary" className="document-detail-item">
                {formatDate(effDate)}
              </Text>
              <Text type="secondary" className="document-detail-item">
                {formattedFileSize}
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
               {renderEhrExtractStatus(document.extract_status || document.extractStatus)}
             </Space>
           </div>
           <Text type="secondary" style={{ fontSize: '12px', marginTop: '8px' }}>
             上传：{formatDate(upTime)}
           </Text>
         </div>
      </div>
    </Card>
  )
}

export default DocumentCard