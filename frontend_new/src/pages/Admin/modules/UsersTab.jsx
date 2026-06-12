import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Avatar, Button, Input, Popconfirm, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { ReloadOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons'

import { getAdminUsers, updateAdminUserRole, updateAdminUserStatus } from '../../../api/admin'
import { appThemeToken } from '../../../styles/themeTokens'
import { formatTime, getCurrentUserId, statusColors, statusLabels } from './adminShared'

const { Text } = Typography

export const UsersTab = () => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [pendingId, setPendingId] = useState(null)
  const currentUserId = useMemo(() => getCurrentUserId(), [])

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminUsers()
      const list = res?.data?.users || res?.data?.items || res?.data || []
      setData(Array.isArray(list) ? list : [])
    } catch {
      /* handled by interceptor */
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const handleToggleStatus = useCallback(async (row) => {
    const nextActive = row.status !== 'active'
    setPendingId(row.id)
    try {
      const res = await updateAdminUserStatus(row.id, nextActive)
      const updated = res?.data
      setData((prev) => prev.map((user) => (user.id === row.id ? { ...user, ...updated } : user)))
      message.success(nextActive ? '已启用该用户' : '已禁用该用户')
    } catch (error) {
      message.error(error?.message || '更新用户状态失败')
    } finally {
      setPendingId(null)
    }
  }, [])

  const handleToggleRole = useCallback(async (row) => {
    const nextRole = row.role === 'admin' ? 'user' : 'admin'
    setPendingId(row.id)
    try {
      const res = await updateAdminUserRole(row.id, nextRole)
      const updated = res?.data
      setData((prev) => prev.map((user) => (user.id === row.id ? { ...user, ...updated } : user)))
      message.success(nextRole === 'admin' ? '已设为管理员' : '已取消管理员')
    } catch (error) {
      message.error(error?.message || '更新用户角色失败')
    } finally {
      setPendingId(null)
    }
  }, [])

  const filtered = search
    ? data.filter((user) => [user.name, user.email, user.phone, user.organization, user.department]
        .filter(Boolean).some((value) => value.toLowerCase().includes(search.toLowerCase())))
    : data

  const columns = [
    {
      title: '用户',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      fixed: 'left',
      render: (name, row) => (
        <Space>
          <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: appThemeToken.colorPrimary }} />
          <div>
            <div style={{ fontWeight: 500 }}>{name || '-'}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{row.email || '-'}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      filters: [{ text: '管理员', value: 'admin' }, { text: '普通用户', value: 'user' }],
      onFilter: (value, row) => (row.role || 'user') === value,
      render: (value) => (value === 'admin' ? <Tag color="gold">管理员</Tag> : <Tag>普通用户</Tag>),
    },
    { title: '手机', dataIndex: 'phone', key: 'phone', width: 140, render: (value) => value || '-' },
    { title: '职称', dataIndex: 'job_title', key: 'job_title', width: 120, render: (value) => value || '-' },
    { title: '机构', dataIndex: 'organization', key: 'organization', width: 180, ellipsis: true, render: (value) => value || '-' },
    { title: '科室', dataIndex: 'department', key: 'department', width: 120, render: (value) => value || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      filters: [{ text: '活跃', value: 'active' }, { text: '已禁用', value: 'inactive' }],
      onFilter: (value, row) => row.status === value,
      render: (value) => <Tag color={statusColors[value] || 'default'}>{statusLabels[value] || value || '-'}</Tag>,
    },
    { title: '最后登录', dataIndex: 'login_at', key: 'login_at', width: 170, render: formatTime },
    { title: '注册时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: formatTime },
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      ellipsis: true,
      render: (value) => <Text copyable={{ text: value }} type="secondary" style={{ fontSize: 12 }}>{value?.slice(0, 8)}…</Text>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, row) => {
        const isSelf = currentUserId && row.id === currentUserId
        const isActive = row.status === 'active'
        const isAdmin = row.role === 'admin'
        const loadingRow = pendingId === row.id
        const disableReason = isSelf ? '不能修改当前登录账号' : ''
        return (
          <Space size={4}>
            <Tooltip title={disableReason}>
              <Popconfirm
                title={isActive ? '禁用该用户？' : '启用该用户？'}
                description={isActive ? '禁用后该用户将无法登录系统。' : '启用后该用户可以重新登录系统。'}
                onConfirm={() => handleToggleStatus(row)}
                okText="确认"
                cancelText="取消"
                disabled={isSelf}
              >
                <Button size="small" type="link" danger={isActive} disabled={isSelf} loading={loadingRow}>
                  {isActive ? '禁用' : '启用'}
                </Button>
              </Popconfirm>
            </Tooltip>
            <Tooltip title={disableReason}>
              <Popconfirm
                title={isAdmin ? '取消管理员？' : '设为管理员？'}
                description={isAdmin ? '取消后该用户将失去后台管理权限。' : '设为管理员后，该用户将拥有后台所有管理权限。'}
                onConfirm={() => handleToggleRole(row)}
                okText="确认"
                cancelText="取消"
                disabled={isSelf}
              >
                <Button size="small" type="link" disabled={isSelf} loading={loadingRow}>
                  {isAdmin ? '取消管理员' : '设为管理员'}
                </Button>
              </Popconfirm>
            </Tooltip>
          </Space>
        )
      },
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <Input prefix={<SearchOutlined />} placeholder="搜索用户名、邮箱、机构…" allowClear value={search} onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 320 }} />
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
        <Text type="secondary" style={{ lineHeight: '32px' }}>共 {filtered.length} 个用户</Text>
      </div>
      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1600 }}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
      />
    </>
  )
}
