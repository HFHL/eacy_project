import React from 'react'
import { Tag } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import { UploadStatus } from '../../hooks/useUploadManager'
import { appThemeToken } from '../../styles/themeTokens'

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export const getFileIcon = (fileType) => {
  if (fileType?.startsWith('image/')) {
    return <FileImageOutlined style={{ color: appThemeToken.colorSuccess }} />
  }
  if (fileType === 'application/pdf') {
    return <FilePdfOutlined style={{ color: appThemeToken.colorError }} />
  }
  return <FileOutlined style={{ color: appThemeToken.colorPrimary }} />
}

export const getStatusTag = (status) => {
  const config = {
    [UploadStatus.PENDING]: { color: 'default', icon: <ClockCircleOutlined />, text: '待上传' },
    [UploadStatus.UPLOADING]: { color: 'processing', icon: <LoadingOutlined />, text: '上传中' },
    [UploadStatus.SUCCESS]: { color: 'success', icon: <CheckCircleOutlined />, text: '已完成' },
    [UploadStatus.FAILED]: { color: 'error', icon: <CloseCircleOutlined />, text: '失败' },
    [UploadStatus.CANCELLED]: { color: 'warning', icon: <CloseOutlined />, text: '已取消' },
  }
  const { color, icon, text } = config[status] || config[UploadStatus.PENDING]
  return <Tag color={color} icon={icon}>{text}</Tag>
}
