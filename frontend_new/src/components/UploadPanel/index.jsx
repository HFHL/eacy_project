/**
 * 上传面板组件
 * 显示上传任务列表、进度、状态，支持暂停/继续/重试/取消操作
 */
import React, { useState, useMemo } from 'react'
import {
  Drawer,
  List,
  Button,
  Space,
  Tag,
  Badge,
  Tabs,
  Empty,
} from 'antd'
import {
  CloudUploadOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  LoadingOutlined,
  ClearOutlined,
} from '@ant-design/icons'
import { UploadStatus } from '../../hooks/useUploadManager'
import UploadTaskItem from './UploadTaskItem'
import UploadStats from './UploadStats'
import UploadControls from './UploadControls'

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
      <UploadStats stats={stats} totalProgress={totalProgress} />

      <UploadControls
        isPaused={isPaused}
        isUploading={isUploading}
        onClearAll={onClearAll}
        onPauseUpload={onPauseUpload}
        onResumeUpload={onResumeUpload}
        onStartUpload={onStartUpload}
        stats={stats}
      />

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
