import React from 'react'
import { Button, Drawer, Empty, List, Progress, Space, Tag, Typography } from 'antd'
import { removeTask } from '@/utils/taskStore'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'

const { Text } = Typography

const DONE_STATUSES = ['completed', 'completed_with_errors', 'failed', 'timeout', 'cancelled']

const getTaskTitle = (task) => {
  if (task.type === 'upload_archive') return '上传归档'
  if (task.type === 'field_extract' || task.type === 'patient_extract') return '批量抽取'
  return '任务'
}

const getTaskColor = (status) => {
  if (status === 'failed' || status === 'timeout') return 'red'
  if (status === 'completed') return 'green'
  return 'blue'
}

const TaskCenterDrawer = ({
  loadTaskItems,
  onClose,
  open,
  taskItems,
  taskPolling,
  token,
}) => (
  <Drawer
    title="任务中心（本患者）"
    open={open}
    onClose={onClose}
    width={modalWidthPreset.standard}
    styles={modalBodyPreset}
  >
    {taskItems.length === 0 ? (
      <Empty description="暂无任务" />
    ) : (
      <List
        dataSource={taskItems}
        renderItem={(task) => {
          const isDone = DONE_STATUSES.includes(task.status)
          const percent = typeof task.percentage === 'number' ? task.percentage : 0

          return (
            <List.Item
              actions={[
                isDone ? (
                  <Button
                    key="remove"
                    size="small"
                    onClick={() => {
                      removeTask(task.task_id)
                      loadTaskItems()
                    }}
                  >
                    移除
                  </Button>
                ) : null,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={(
                  <Space>
                    <Text strong>{getTaskTitle(task)}</Text>
                    <Tag color={getTaskColor(task.status)}>
                      {task.status || 'pending'}
                    </Tag>
                  </Space>
                )}
                description={(
                  <div style={{ width: '100%' }}>
                    {task.file_name && <div style={{ fontSize: 12, color: token.colorTextSecondary }}>文件：{task.file_name}</div>}
                    {task.field_path && <div style={{ fontSize: 12, color: token.colorTextSecondary }}>字段：{task.field_path}</div>}
                    <div style={{ fontSize: 12, color: token.colorTextTertiary }}>{task.message || '处理中...'}</div>
                    <div style={{ marginTop: 8 }}>
                      <Progress
                        percent={Math.max(0, Math.min(100, percent))}
                        size="small"
                        status={task.status === 'failed' || task.status === 'timeout' ? 'exception' : isDone ? 'success' : 'active'}
                      />
                    </div>
                  </div>
                )}
              />
            </List.Item>
          )
        }}
      />
    )}
    {taskPolling && <div style={{ marginTop: 12, color: token.colorTextTertiary }}>正在刷新任务状态...</div>}
  </Drawer>
)

export default TaskCenterDrawer
