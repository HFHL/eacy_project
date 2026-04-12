/**
 * 患者详情页面工具函数
 */
import React from 'react'
import { Tag, Button, Tooltip } from 'antd'
import {
  FileTextOutlined,
  PictureOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons'
import { CONFIDENCE_CONFIG } from './constants'

// 文档类型图标映射
export const getDocumentIcon = (type) => {
  switch (type) {
    case 'PDF':
      return <FileTextOutlined style={{ color: '#ff4d4f' }} />
    case 'Image':
      return <PictureOutlined style={{ color: '#52c41a' }} />
    case 'Excel':
      return <FileTextOutlined style={{ color: '#1677ff' }} />
    default:
      return <FileTextOutlined />
  }
}

// 置信度标签
export const getConfidenceTag = (confidence) => {
  if (!confidence) return null
  const { color, text } = CONFIDENCE_CONFIG[confidence]
  return <Tag color={color} size="small">{text}</Tag>
}

// 获取状态图标
export const getEhrStatusIcon = (status) => {
  switch (status) {
    case 'completed': return <CheckCircleOutlined style={{ color: '#52c41a' }} />
    case 'partial': return <ExclamationCircleOutlined style={{ color: '#faad14' }} />
    case 'incomplete': return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
    default: return null
  }
}

// 获取置信度颜色
export const getEhrConfidenceColor = (confidence) => {
  switch (confidence) {
    case 'high': return '#52c41a'
    case 'medium': return '#faad14'
    case 'low': return '#ff4d4f'
    default: return '#d9d9d9'
  }
}

export default {
  getDocumentIcon,
  getConfidenceTag,
  getEhrStatusIcon,
  getEhrConfidenceColor
}