import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Input, Progress, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import {
  AimOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  FolderOpenOutlined,
  ProjectOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
  WarningOutlined,
} from '@ant-design/icons'

import { getAdminExtractionTasks } from '../../../api/admin'
import { appThemeToken } from '../../../styles/themeTokens'
import ExtractionTaskObservatory from '../ExtractionTaskObservatory'
import { extractionStatusMeta, formatTime, taskTypeMeta } from './adminShared'

const { Text } = Typography

const taskStatusIcon = (status) => {
  switch (status) {
    case 'running': return <SyncOutlined spin style={{ color: appThemeToken.colorPrimary }} />
    case 'completed': return <CheckCircleOutlined style={{ color: appThemeToken.colorSuccess }} />
    case 'completed_with_errors': return <WarningOutlined style={{ color: appThemeToken.colorWarning }} />
    case 'failed': return <CloseCircleOutlined style={{ color: appThemeToken.colorError }} />
    case 'cancelled': return <CloseCircleOutlined style={{ color: appThemeToken.colorTextTertiary }} />
    case 'stale': return <WarningOutlined style={{ color: appThemeToken.colorWarning }} />
    default: return <ClockCircleOutlined style={{ color: appThemeToken.colorTextTertiary }} />
  }
}

const renderTaskTypeTag = (type) => {
  const meta = taskTypeMeta[type] || { label: type, color: 'default', icon: null }
  return <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>
}

const taskMatchesSearch = (row, keyword) => [
  row.id,
  row.patient_name,
  row.patient_id,
  row.project_name,
  row.project_id,
  row.schema_name,
  row.schema_code,
  row.target_section,
  row.primary_job_id,
].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword))

const buildTypeOptions = (typeCounts = {}) => [
  { label: `全部 (${typeCounts.all ?? 0})`, value: 'all' },
  { label: <Space size={4}><ProjectOutlined />{`科研 CRF (${typeCounts.project_crf ?? 0})`}</Space>, value: 'project_crf' },
  { label: <Space size={4}><FolderOpenOutlined />{`病历夹 (${typeCounts.patient_ehr ?? 0})`}</Space>, value: 'patient_ehr' },
  { label: <Space size={4}><AimOutlined />{`靶向 (${typeCounts.targeted ?? 0})`}</Space>, value: 'targeted' },
]

const statusOptions = (statusCounts = {}) => [
  { label: '全部状态', value: 'all' },
  { label: `运行中 (${statusCounts.running ?? 0})`, value: 'running' },
  { label: `等待中 (${statusCounts.pending ?? 0})`, value: 'pending' },
  { label: `已完成 (${statusCounts.completed ?? 0})`, value: 'completed' },
  { label: `失败 (${statusCounts.failed ?? 0})`, value: 'failed' },
  { label: `已停滞 (${statusCounts.stale ?? 0})`, value: 'stale' },
  { label: `已取消 (${statusCounts.cancelled ?? 0})`, value: 'cancelled' },
]

export const ExtractionTasksTab = () => {
  const [rawData, setRawData] = useState({ items: [], total: 0, type_counts: {}, status_counts: {} })
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [detailId, setDetailId] = useState(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const params = { limit: 200, offset: 0 }
      if (typeFilter !== 'all') params.task_type = typeFilter
      if (statusFilter !== 'all') params.status = statusFilter
      const res = await getAdminExtractionTasks(params)
      const data = res?.data || {}
      setRawData({
        items: Array.isArray(data.items) ? data.items : [],
        total: data.total || 0,
        type_counts: data.type_counts || {},
        status_counts: data.status_counts || {},
      })
    } catch {
      /* handled by interceptor */
    }
    setLoading(false)
  }, [typeFilter, statusFilter])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const hasLiveTask = useMemo(
    () => (rawData.items || []).some((row) => row.status === 'running' || row.status === 'pending'),
    [rawData.items],
  )
  useEffect(() => {
    if (!hasLiveTask) return undefined
    const timer = setInterval(() => { fetchTasks() }, 5000)
    return () => clearInterval(timer)
  }, [hasLiveTask, fetchTasks])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return rawData.items
    return rawData.items.filter((row) => taskMatchesSearch(row, keyword))
  }, [rawData.items, search])

  const columns = [
    {
      title: '类型',
      dataIndex: 'task_type',
      key: 'task_type',
      width: 120,
      filters: [{ text: '科研 CRF', value: 'project_crf' }, { text: '电子病历夹', value: 'patient_ehr' }, { text: '靶向抽取', value: 'targeted' }],
      onFilter: (value, row) => row.task_type === value,
      render: (type, row) => (
        <Space size={4} direction="vertical" style={{ lineHeight: 1.4 }}>
          {renderTaskTypeTag(type)}
          {row.target_section && (
            <Tooltip title={`靶向路径：${row.target_section}`}>
              <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
                {row.target_section.length > 18 ? `${row.target_section.slice(0, 18)}…` : row.target_section}
              </Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '目标',
      key: 'subject',
      width: 220,
      ellipsis: true,
      render: (_, row) => row.task_type === 'project_crf' ? (
        <Space direction="vertical" size={0} style={{ lineHeight: 1.3 }}>
          <Text strong>{row.project_name || row.project_id?.slice(0, 8) || '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>患者 {row.document_count} · 模板 {row.schema_code || row.schema_name?.slice(0, 16) || '-'}</Text>
        </Space>
      ) : (
        <Space direction="vertical" size={0} style={{ lineHeight: 1.3 }}>
          <Text strong>{row.patient_name || row.patient_id?.slice(0, 8) || '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis>{row.schema_name?.slice(0, 20) || row.schema_code || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (value) => {
        const meta = extractionStatusMeta[value] || { color: 'default', label: value }
        return <Space size={4}>{taskStatusIcon(value)}<Tag color={meta.color}>{meta.label}</Tag></Space>
      },
    },
    {
      title: '进度',
      key: 'progress',
      width: 200,
      render: (_, row) => {
        const meta = extractionStatusMeta[row.status] || {}
        const total = row.document_count || row.job_ids?.length || 0
        const done = row.completed_count + row.failed_count
        const tooltip = total > 0 ? `完成 ${row.completed_count} · 失败 ${row.failed_count} · 运行 ${row.running_count} · 等待 ${row.pending_count}` : ''
        return (
          <Tooltip title={tooltip}>
            <div style={{ minWidth: 160 }}>
              <Progress
                percent={row.progress}
                size="small"
                status={meta.progressStatus || 'normal'}
                strokeColor={row.failed_count > 0 && row.status !== 'failed' ? appThemeToken.colorWarning : undefined}
                format={() => (total > 0 ? `${done}/${total}` : '-')}
              />
            </div>
          </Tooltip>
        )
      },
    },
    { title: '开始时间', dataIndex: 'started_at', key: 'started_at', width: 160, render: (value, row) => formatTime(value || row.created_at) },
    { title: '完成时间', dataIndex: 'finished_at', key: 'finished_at', width: 160, render: formatTime },
    { title: '错误信息', dataIndex: 'error_message', key: 'error_message', width: 220, ellipsis: { showTitle: false }, render: (value) => (value ? <Tooltip title={value}><Text type="danger" style={{ fontSize: 12 }}>{value}</Text></Tooltip> : '-') },
    { title: '任务 ID', dataIndex: 'id', key: 'id', width: 140, render: (value) => <Text copyable={{ text: value }} type="secondary" style={{ fontSize: 12 }}>{value?.slice(0, 12)}…</Text> },
    { title: '操作', key: 'actions', width: 90, fixed: 'right', render: (_, row) => <Button size="small" type="link" onClick={() => setDetailId(row.id)}>详情</Button> },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Segmented options={buildTypeOptions(rawData.type_counts)} value={typeFilter} onChange={setTypeFilter} />
        <Select value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 160 }} options={statusOptions(rawData.status_counts)} />
        <Input prefix={<SearchOutlined />} placeholder="搜索患者 / 项目 / 模板 / 任务ID…" allowClear value={search} onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 280 }} />
        <Button icon={<ReloadOutlined />} onClick={fetchTasks} loading={loading}>刷新</Button>
        <Text type="secondary" style={{ lineHeight: '32px' }}>筛选后 {filtered.length} 条 / 全部 {rawData.total}</Text>
      </div>
      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1400 }}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
      />
      <ExtractionTaskObservatory open={!!detailId} taskId={detailId} onClose={() => setDetailId(null)} />
    </>
  )
}
