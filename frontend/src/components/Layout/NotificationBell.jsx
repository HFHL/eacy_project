import React, { useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Badge, Button, Divider, Empty, List, Popover, Space, Tabs, Tag, Typography, theme } from 'antd'
import { BellOutlined, CheckOutlined, ClearOutlined, CloseOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  clearNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  removeNotification
} from '../../store/slices/uiSlice'

const { Text } = Typography

const typeToTag = (type) => {
  switch (type) {
    case 'success':
      return { color: 'success', label: '成功' }
    case 'error':
      return { color: 'error', label: '错误' }
    case 'warning':
      return { color: 'warning', label: '警告' }
    case 'info':
      return { color: 'processing', label: '信息' }
    case 'status':
      return { color: 'default', label: '状态' }
    default:
      return { color: 'default', label: type || '通知' }
  }
}

const formatTime = (iso) => {
  if (!iso) return ''
  try {
    const d = dayjs(iso)
    if (!d.isValid()) return ''
    const today = dayjs()
    if (d.isSame(today, 'day')) return d.format('HH:mm')
    if (d.isSame(today, 'year')) return d.format('MM-DD HH:mm')
    return d.format('YYYY-MM-DD HH:mm')
  } catch {
    return ''
  }
}

export default function NotificationBell() {
  const dispatch = useDispatch()
  const { token } = theme.useToken()
  const { list, unreadCount } = useSelector((s) => s.ui.notifications)

  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('all')

  const filtered = useMemo(() => {
    if (!Array.isArray(list)) return []
    if (activeTab === 'unread') return list.filter((n) => !n.read)
    if (activeTab === 'error') return list.filter((n) => n.type === 'error')
    return list
  }, [list, activeTab])

  const items = [
    { key: 'all', label: `全部 (${list.length})` },
    { key: 'unread', label: `未读 (${unreadCount})` },
    { key: 'error', label: `错误 (${list.filter((n) => n.type === 'error').length})` }
  ]

  const content = (
    <div style={{ width: 380 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text strong>通知</Text>
        <Space size={8}>
          <Button
            size="small"
            icon={<CheckOutlined />}
            disabled={unreadCount === 0}
            onClick={() => dispatch(markAllNotificationsAsRead())}
          >
            全部已读
          </Button>
          <Button
            size="small"
            danger
            icon={<ClearOutlined />}
            disabled={list.length === 0}
            onClick={() => dispatch(clearNotifications())}
          >
            清空
          </Button>
        </Space>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      <Tabs
        size="small"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={items}
        style={{ marginBottom: 8 }}
      />

      {filtered.length === 0 ? (
        <div style={{ padding: '18px 0' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知" />
        </div>
      ) : (
        <div style={{ maxHeight: 420, overflow: 'auto', paddingRight: 4 }}>
          <List
            itemLayout="vertical"
            dataSource={filtered}
            renderItem={(n) => {
              const tag = typeToTag(n.type)
              const title = n.title || n.message || '通知'
              const desc = n.description || ''
              const time = formatTime(n.timestamp)

              return (
                <List.Item
                  key={n.id}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 8,
                    background: n.read ? 'transparent' : token.colorFillQuaternary,
                    cursor: 'pointer'
                  }}
                  onClick={() => dispatch(markNotificationAsRead(n.id))}
                  actions={[
                    <Button
                      key="remove"
                      size="small"
                      type="text"
                      icon={<CloseOutlined />}
                      onClick={(e) => {
                        e.stopPropagation()
                        dispatch(removeNotification(n.id))
                      }}
                    />
                  ]}
                >
                  <Space size={8} align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Space size={8} wrap>
                        <Tag color={tag.color} style={{ marginInlineEnd: 0 }}>{tag.label}</Tag>
                        {!n.read && <Badge status="processing" text={<Text type="secondary">未读</Text>} />}
                      </Space>
                      <div style={{ marginTop: 6 }}>
                        <Text strong style={{ display: 'block' }}>{String(title)}</Text>
                        {desc ? (
                          <Text type="secondary" style={{ display: 'block', marginTop: 2 }}>
                            {String(desc)}
                          </Text>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{time}</Text>
                    </div>
                  </Space>
                </List.Item>
              )
            }}
          />
        </div>
      )}
    </div>
  )

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      content={content}
      overlayStyle={{ zIndex: 2000 }}
    >
      <Badge count={unreadCount} size="small">
        <BellOutlined style={{ fontSize: 18, cursor: 'pointer', color: token.colorTextSecondary }} />
      </Badge>
    </Popover>
  )
}

