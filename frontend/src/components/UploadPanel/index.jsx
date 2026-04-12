/**
 * 上传面板组件
 * 显示上传任务列表、进度、状态，支持暂停/继续/重试/取消操作
 */
import React, { useState, useMemo } from 'react'
import { 
  Drawer, 
  List, 
  Progress, 
  Button, 
  Space, 
  Typography, 
  Tag, 
  Tooltip, 
  Badge,
  Tabs,
  Empty,
  Popconfirm,
  Statistic,
  Row,
  Col,
  message
} from 'antd'
import {
  CloudUploadOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  CloseOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileOutlined,
  ClearOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { UploadStatus } from '../../hooks/useUploadManager'

const { Text } = Typography

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 获取文件图标
const getFileIcon = (fileType) => {
  if (fileType?.startsWith('image/')) {
    return <FileImageOutlined style={{ color: '#52c41a' }} />
  }
  if (fileType === 'application/pdf') {
    return <FilePdfOutlined style={{ color: '#ff4d4f' }} />
  }
  return <FileOutlined style={{ color: '#1890ff' }} />
}

// 获取状态标签
const getStatusTag = (status) => {
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

// 单个上传任务项
const UploadTaskItem = ({ task, onRetry, onCancel, onRemove }) => {
  const isActive = task.status === UploadStatus.UPLOADING
  const canRetry = task.status === UploadStatus.FAILED || task.status === UploadStatus.CANCELLED
  const canCancel = task.status === UploadStatus.UPLOADING || task.status === UploadStatus.PENDING

  return (
    <List.Item
      style={{ 
        padding: '12px 16px',
        backgroundColor: task.status === UploadStatus.FAILED ? '#fff2f0' : 'transparent',
        borderRadius: '8px',
        marginBottom: '8px',
        border: '1px solid #f0f0f0'
      }}
      actions={[
        canRetry && (
          <Tooltip title="重试">
            <Button 
              type="text" 
              size="small" 
              icon={<ReloadOutlined />} 
              onClick={() => onRetry(task.id)}
            />
          </Tooltip>
        ),
        canCancel && (
          <Tooltip title="取消">
            <Button 
              type="text" 
              size="small" 
              danger
              icon={<CloseOutlined />} 
              onClick={() => onCancel(task.id)}
            />
          </Tooltip>
        ),
        !isActive && (
          <Tooltip title="移除">
            <Button 
              type="text" 
              size="small" 
              icon={<DeleteOutlined />} 
              onClick={() => onRemove(task.id)}
            />
          </Tooltip>
        ),
      ].filter(Boolean)}
    >
      <List.Item.Meta
        avatar={getFileIcon(task.fileType)}
        title={
          <Space size="small">
            <Text 
              style={{ maxWidth: 200 }} 
              ellipsis={{ tooltip: task.fileName }}
            >
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
                  '0%': '#108ee9',
                  '100%': '#87d068',
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

// 上传面板主组件
const UploadPanel = ({
  visible,
  onClose,
  tasks,
  stats,
  isUploading,
  isPaused,
  onStartUpload,
  onPauseUpload,
  onResumeUpload,
  onRetryTask,
  onCancelTask,
  onRemoveTask,
  onRetryAllFailed,
  onClearCompleted,
  onClearAll,
}) => {
  const [activeTab, setActiveTab] = useState('all')

  // 按状态过滤任务
  const filteredTasks = useMemo(() => {
    switch (activeTab) {
      case 'uploading':
        return tasks.filter(t => t.status === UploadStatus.UPLOADING || t.status === UploadStatus.PENDING)
      case 'success':
        return tasks.filter(t => t.status === UploadStatus.SUCCESS)
      case 'failed':
        return tasks.filter(t => t.status === UploadStatus.FAILED || t.status === UploadStatus.CANCELLED)
      default:
        return tasks
    }
  }, [tasks, activeTab])

  // 计算总进度
  const totalProgress = useMemo(() => {
    if (stats.total === 0) return 0
    const completed = stats.success + stats.failed + stats.cancelled
    return Math.round((completed / stats.total) * 100)
  }, [stats])

  const tabItems = [
    {
      key: 'all',
      label: (
        <Badge count={stats.total} size="small" offset={[8, 0]}>
          全部
        </Badge>
      ),
    },
    {
      key: 'uploading',
      label: (
        <Badge count={stats.pending + stats.uploading} size="small" offset={[8, 0]} color="blue">
          上传中
        </Badge>
      ),
    },
    {
      key: 'success',
      label: (
        <Badge count={stats.success} size="small" offset={[8, 0]} color="green">
          已完成
        </Badge>
      ),
    },
    {
      key: 'failed',
      label: (
        <Badge count={stats.failed + stats.cancelled} size="small" offset={[8, 0]} color="red">
          失败
        </Badge>
      ),
    },
  ]

  return (
    <Drawer
      title={
        <Space>
          <CloudUploadOutlined />
          <span>上传任务</span>
          {isUploading && !isPaused && (
            <Tag color="processing" icon={<LoadingOutlined />}>上传中</Tag>
          )}
          {isPaused && (
            <Tag color="warning" icon={<PauseCircleOutlined />}>已暂停</Tag>
          )}
        </Space>
      }
      placement="right"
      width={480}
      open={visible}
      onClose={onClose}
      extra={
        <Space>
          {stats.failed > 0 && (
            <Button 
              size="small"
              icon={<ReloadOutlined />}
              onClick={onRetryAllFailed}
            >
              全部重试
            </Button>
          )}
          {stats.success > 0 && (
            <Button 
              size="small"
              icon={<ClearOutlined />}
              onClick={onClearCompleted}
            >
              清除已完成
            </Button>
          )}
        </Space>
      }
    >
      {/* 统计信息 */}
      <div style={{ 
        padding: '16px', 
        backgroundColor: '#fafafa', 
        borderRadius: '8px',
        marginBottom: '16px'
      }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic 
              title="总计" 
              value={stats.total} 
              valueStyle={{ fontSize: 20 }}
            />
          </Col>
          <Col span={6}>
            <Statistic 
              title="成功" 
              value={stats.success} 
              valueStyle={{ fontSize: 20, color: '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <Statistic 
              title="失败" 
              value={stats.failed} 
              valueStyle={{ fontSize: 20, color: '#ff4d4f' }}
            />
          </Col>
          <Col span={6}>
            <Statistic 
              title="进度" 
              value={totalProgress} 
              suffix="%" 
              valueStyle={{ fontSize: 20 }}
            />
          </Col>
        </Row>
        
        {/* 总进度条 */}
        <Progress 
          percent={totalProgress} 
          status={stats.failed > 0 ? 'exception' : (totalProgress === 100 ? 'success' : 'active')}
          style={{ marginTop: 12, marginBottom: 0 }}
        />
      </div>

      {/* 控制按钮 */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          {!isUploading && stats.pending > 0 && (
            <Button 
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={onStartUpload}
            >
              开始上传 ({stats.pending})
            </Button>
          )}
          {isUploading && !isPaused && (
            <Button 
              icon={<PauseCircleOutlined />}
              onClick={onPauseUpload}
            >
              暂停
            </Button>
          )}
          {isPaused && (
            <Button 
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={onResumeUpload}
            >
              继续
            </Button>
          )}
          <Popconfirm
            title="确定清空所有任务吗？"
            description="这将取消所有正在进行的上传并清空任务列表"
            onConfirm={onClearAll}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              danger
              icon={<DeleteOutlined />}
              disabled={stats.total === 0}
            >
              清空全部
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {/* 任务列表 */}
      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        items={tabItems}
        size="small"
      />

      {filteredTasks.length === 0 ? (
        <Empty 
          description="暂无上传任务" 
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 40 }}
        />
      ) : (
        <List
          dataSource={filteredTasks}
          renderItem={(task) => (
            <UploadTaskItem
              key={task.id}
              task={task}
              onRetry={onRetryTask}
              onCancel={onCancelTask}
              onRemove={onRemoveTask}
            />
          )}
          style={{ 
            maxHeight: 'calc(100vh - 400px)', 
            overflow: 'auto' 
          }}
        />
      )}
    </Drawer>
  )
}

export default UploadPanel
