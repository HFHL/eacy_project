import React from 'react'
import { Tag, Tooltip } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'

const getTagColor = (source) => {
  if (source === 'from_document' || source === 'document') return 'green'
  if (source === 'llm_multi_agent' || source === 'llm') return 'purple'
  if (source === 'ehr') return 'blue'
  return 'default'
}

const getTagText = (source) => {
  if (source === 'from_document' || source === 'document') return '文档抽取'
  if (source === 'llm_multi_agent' || source === 'llm') return 'LLM 抽取'
  if (source === 'ehr') return 'EHR 数据'
  return source || '未知来源'
}

export const SourceTag = ({ source, documentType, onClick }) => (
  <Tooltip title={documentType ? `来源文档: ${documentType}` : '点击查看来源详情'}>
    <Tag
      color={getTagColor(source)}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      icon={<FileTextOutlined />}
    >
      {getTagText(source)}
      {documentType && <span style={{ marginLeft: 4, opacity: 0.8 }}>({documentType})</span>}
    </Tag>
  </Tooltip>
)
