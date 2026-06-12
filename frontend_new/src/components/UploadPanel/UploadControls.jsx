import React from 'react'
import { Button, Popconfirm, Space } from 'antd'
import {
  DeleteOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons'

const UploadControls = ({
  isPaused,
  isUploading,
  onClearAll,
  onPauseUpload,
  onResumeUpload,
  onStartUpload,
  stats,
}) => (
  <div style={{ marginBottom: 16 }}>
    <Space>
      {!isUploading && stats.pending > 0 && (
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={onStartUpload}>
          开始上传 ({stats.pending})
        </Button>
      )}
      {isUploading && !isPaused && (
        <Button icon={<PauseCircleOutlined />} onClick={onPauseUpload}>
          暂停
        </Button>
      )}
      {isPaused && (
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={onResumeUpload}>
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
        <Button danger icon={<DeleteOutlined />} disabled={stats.total === 0}>
          清空全部
        </Button>
      </Popconfirm>
    </Space>
  </div>
)

export default UploadControls
