import React from 'react'
import {
  Button,
  List,
  Progress,
  Space,
  Tooltip,
  Typography,
} from 'antd'
import {
  CloseOutlined,
  DeleteOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { UploadStatus } from '../../hooks/useUploadManager'
import { appThemeToken } from '../../styles/themeTokens'
import {
  formatFileSize,
  getFileIcon,
  getStatusTag,
} from './uploadPanelUtils'

const { Text } = Typography

const UploadTaskItem = ({ task, onRetry, onCancel, onRemove }) => {
  const isActive = task.status === UploadStatus.UPLOADING
  const canRetry = task.status === UploadStatus.FAILED || task.status === UploadStatus.CANCELLED
  const canCancel = task.status === UploadStatus.UPLOADING || task.status === UploadStatus.PENDING

  return (
    <List.Item
      style={{
        padding: '12px 16px',
        backgroundColor: task.status === UploadStatus.FAILED ? 'rgba(255, 77, 79, 0.08)' : 'transparent',
        borderRadius: '8px',
        marginBottom: '8px',
        border: `1px solid ${appThemeToken.colorBorder}`,
      }}
      actions={[
        canRetry && (
          <Tooltip title="重试">
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={() => onRetry(task.id)} />
          </Tooltip>
        ),
        canCancel && (
          <Tooltip title="取消">
            <Button type="text" size="small" danger icon={<CloseOutlined />} onClick={() => onCancel(task.id)} />
          </Tooltip>
        ),
        !isActive && (
          <Tooltip title="移除">
            <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => onRemove(task.id)} />
          </Tooltip>
        ),
      ].filter(Boolean)}
    >
      <List.Item.Meta
        avatar={getFileIcon(task.fileType)}
        title={
          <Space size="small">
            <Text style={{ maxWidth: 200 }} ellipsis={{ tooltip: task.fileName }}>
              {task.fileName}
            </Text>
            {getStatusTag(task.status)}
          </Space>
        }
        description={
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {formatFileSize(task.fileSize)}
              {task.retryCount > 0 && ` · 已重试 ${task.retryCount} 次`}
            </Text>
            {isActive && (
              <Progress
                percent={task.progress}
                size="small"
                style={{ marginTop: 4, marginBottom: 0 }}
                strokeColor={{
                  '0%': appThemeToken.colorPrimary,
                  '100%': appThemeToken.colorSuccess,
                }}
              />
            )}
            {task.error && (
              <div style={{ marginTop: 4 }}>
                <Text type="danger" style={{ fontSize: 12 }}>
                  <WarningOutlined /> {task.error}
                </Text>
              </div>
            )}
            {task.needsFile && (
              <div style={{ marginTop: 4 }}>
                <Text type="warning" style={{ fontSize: 12 }}>
                  <WarningOutlined /> 需要重新选择文件
                </Text>
              </div>
            )}
          </div>
        }
      />
    </List.Item>
  )
}

export default UploadTaskItem
