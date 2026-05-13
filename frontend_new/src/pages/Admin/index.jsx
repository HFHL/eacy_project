import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Card, Tabs, Table, Tag, Space, Typography, Statistic, Row, Col,
  Button, message, Tooltip, Badge, Avatar, Spin, Empty, Input,
  Progress, Segmented, Select, Modal, Descriptions, Alert, Divider
} from 'antd'
import {
  UserOutlined, ExperimentOutlined, FileTextOutlined, DatabaseOutlined,
  ReloadOutlined, TeamOutlined, CloudServerOutlined, SearchOutlined,
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  SyncOutlined, AimOutlined, FolderOpenOutlined, ProjectOutlined,
  WarningOutlined
} from '@ant-design/icons'
import {
  getAdminUsers, getAdminProjects, getAdminTemplates,
  getAdminDocuments, getAdminStats, getAdminExtractionTasks,
  getAdminExtractionTaskDetail
} from '../../api/admin'
import { appThemeToken } from '../../styles/themeTokens'
import { useExtractionProgressSSE } from '../../hooks'

// ─── 抽取流程节点展示（SSE 事件里 node 字段 → 中文 + 图标色） ────────────
const NODE_META = {
  start:                 { label: '任务开始', color: 'processing' },
  load_schema_and_docs:  { label: '加载 Schema & 文档', color: 'blue' },
  filter_units:          { label: '筛选可抽取单元', color: 'blue' },
  extract_units:         { label: 'LLM 抽取', color: 'geekblue' },
  materialize:           { label: '物化落库', color: 'purple' },
  done:                  { label: '完成', color: 'success' },
  error:                 { label: '异常', color: 'error' },
  timeout:               { label: '超时', color: 'error' },
  meta:                  { label: '订阅建立', color: 'default' },
  proxy_error:           { label: '通道异常', color: 'error' },
  init:                  { label: '当前状态', color: 'default' },
}

const nodeMeta = (node) => NODE_META[node] || { label: node || '-', color: 'default' }

const { Text } = Typography

const statusColors = {
  active: 'green', inactive: 'default', suspended: 'red',
  draft: 'orange', published: 'green',
  running: 'processing', completed: 'success', failed: 'error',
  pending: 'default', cancelled: 'warning'
}

const statusLabels = {
  active: '活跃', inactive: '未激活', suspended: '已停用',
  draft: '草稿', published: '已发布',
  running: '运行中', completed: '已完成', failed: '失败',
  pending: '等待中', cancelled: '已取消'
}

const formatTime = (v) => {
  if (!v) return '-'
  try {
    const d = new Date(v)
    return isNaN(d.getTime()) ? v : d.toLocaleString('zh-CN', { hour12: false })
  } catch { return v }
}

// ─── Overview Cards ─────────────────────────────────────────────
const OverviewCards = ({ stats, loading }) => {
  const overview = stats?.overview || {}
  const items = [
    { title: '用户总数', value: overview.total_users ?? '-', icon: <TeamOutlined />, color: appThemeToken.colorPrimary },
    { title: '患者总数', value: overview.total_patients ?? '-', icon: <UserOutlined />, color: appThemeToken.colorSuccess },
    { title: '文档总数', value: overview.total_documents ?? '-', icon: <FileTextOutlined />, color: appThemeToken.colorWarning },
    { title: '项目总数', value: overview.total_projects ?? '-', icon: <ExperimentOutlined />, color: 'rgb(114, 46, 209)' },
    { title: '模板总数', value: overview.total_templates ?? '-', icon: <DatabaseOutlined />, color: 'rgb(19, 194, 194)' },
    { title: '活跃任务', value: overview.active_tasks ?? '-', icon: <CloudServerOutlined />, color: 'rgb(235, 47, 150)' },
  ]

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      {items.map(item => (
        <Col xs={12} sm={8} md={4} key={item.title}>
          <Card size="small" loading={loading} style={{ borderRadius: 8 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>{item.title}</span>}
              value={item.value}
              prefix={React.cloneElement(item.icon, { style: { color: item.color, fontSize: 16 } })}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  )
}

// ─── Users Tab ──────────────────────────────────────────────────
const UsersTab = () => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminUsers()
      const list = res?.data?.users || res?.data?.items || res?.data || []
      setData(Array.isArray(list) ? list : [])
    } catch { /* handled by interceptor */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const filtered = search
    ? data.filter(u => [u.name, u.email, u.phone, u.organization, u.department]
        .filter(Boolean).some(v => v.toLowerCase().includes(search.toLowerCase())))
    : data

  const columns = [
    {
      title: '用户', dataIndex: 'name', key: 'name', width: 180, fixed: 'left',
      render: (name, r) => (
        <Space>
          <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: appThemeToken.colorPrimary }} />
          <div>
            <div style={{ fontWeight: 500 }}>{name || '-'}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{r.email || '-'}</Text>
          </div>
        </Space>
      )
    },
    { title: '手机', dataIndex: 'phone', key: 'phone', width: 140, render: v => v || '-' },
    { title: '职称', dataIndex: 'job_title', key: 'job_title', width: 120, render: v => v || '-' },
    { title: '机构', dataIndex: 'organization', key: 'organization', width: 180, ellipsis: true, render: v => v || '-' },
    { title: '科室', dataIndex: 'department', key: 'department', width: 120, render: v => v || '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: v => <Tag color={statusColors[v] || 'default'}>{statusLabels[v] || v || '-'}</Tag>
    },
    { title: '积分', dataIndex: 'points', key: 'points', width: 80, render: v => v ?? 0 },
    { title: '最后登录', dataIndex: 'login_at', key: 'login_at', width: 170, render: formatTime },
    { title: '注册时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: formatTime },
    { title: 'ID', dataIndex: 'id', key: 'id', width: 120, ellipsis: true, render: v => <Text copyable={{ text: v }} type="secondary" style={{ fontSize: 12 }}>{v?.slice(0, 8)}…</Text> },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <Input prefix={<SearchOutlined />} placeholder="搜索用户名、邮箱、机构…" allowClear value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
        <Text type="secondary" style={{ lineHeight: '32px' }}>共 {filtered.length} 个用户</Text>
      </div>
      <Table
        columns={columns} dataSource={filtered} rowKey="id" loading={loading}
        scroll={{ x: 1400 }} size="small" pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      />
    </>
  )
}

// ─── Projects Tab ───────────────────────────────────────────────
const ProjectsTab = () => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminProjects()
      const list = res?.data?.projects || res?.data?.items || res?.data || []
      setData(Array.isArray(list) ? list : [])
    } catch { /* handled */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const columns = [
    { title: '项目名称', dataIndex: 'project_name', key: 'project_name', width: 200, ellipsis: true, render: (v, r) => <Text strong>{v || r.name || '-'}</Text> },
    { title: '描述', dataIndex: 'description', key: 'description', width: 250, ellipsis: true, render: v => v || '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: v => <Tag color={statusColors[v] || 'blue'}>{v || '-'}</Tag>
    },
    { title: '患者数', dataIndex: 'patient_count', key: 'patient_count', width: 80, render: v => v ?? '-' },
    { title: '模板', dataIndex: 'template_name', key: 'template_name', width: 150, ellipsis: true, render: v => v || '-' },
    { title: '负责人', dataIndex: 'pi_name', key: 'pi_name', width: 120, render: (v, r) => v || r.created_by_name || '-' },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: formatTime },
    { title: 'ID', dataIndex: 'id', key: 'id', width: 120, ellipsis: true, render: v => <Text copyable={{ text: v }} type="secondary" style={{ fontSize: 12 }}>{v?.slice(0, 8)}…</Text> },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
        <Text type="secondary" style={{ lineHeight: '32px' }}>共 {data.length} 个项目</Text>
      </div>
      <Table
        columns={columns} dataSource={data} rowKey="id" loading={loading}
        scroll={{ x: 1200 }} size="small" pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      />
    </>
  )
}

// ─── Extraction Tasks Tab ───────────────────────────────────────

const extractionStatusMeta = {
  pending:                 { color: 'default',    label: '等待中',  progressStatus: 'normal'  },
  running:                 { color: 'processing', label: '运行中',  progressStatus: 'active'  },
  completed:               { color: 'success',    label: '已完成',  progressStatus: 'success' },
  completed_with_errors:   { color: 'warning',    label: '部分成功', progressStatus: 'exception'},
  failed:                  { color: 'error',      label: '失败',    progressStatus: 'exception'},
  cancelled:               { color: 'warning',    label: '已取消',  progressStatus: 'normal'  },
  stale:                   { color: 'warning',    label: '已停滞',  progressStatus: 'exception'},
  idle:                    { color: 'default',    label: '空闲',    progressStatus: 'normal'  },
}

const taskTypeMeta = {
  all:         { label: '全部',     icon: null,                      color: '',        },
  project_crf: { label: '科研 CRF', icon: <ProjectOutlined />,       color: 'geekblue' },
  patient_ehr: { label: '电子病历夹', icon: <FolderOpenOutlined />,   color: 'cyan'     },
  targeted:    { label: '靶向抽取', icon: <AimOutlined />,           color: 'purple'   },
}

// LLM 调用列表：每条可折叠展开，显示 instruction / parsed / validation_log / error
const LLMCallList = ({ calls }) => {
  const [openKey, setOpenKey] = useState(null)

  const renderCompactJSON = (value) => {
    if (value == null) return <Text type="secondary">—</Text>
    try {
      const s = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      return (
        <pre
          style={{
            background: '#fafafa',
            padding: 8,
            maxHeight: 280,
            overflow: 'auto',
            fontSize: 12,
            margin: 0,
            borderRadius: 4,
          }}
        >
          {s}
        </pre>
      )
    } catch {
      return <Text type="secondary">无法序列化</Text>
    }
  }

  return (
    <div>
      {calls.map((c) => {
        const active = openKey === c.call_id
        const statusColor =
          c.status === 'success' ? 'success'
          : c.status === 'error' ? 'error'
          : 'default'
        return (
          <Card
            key={c.call_id}
            size="small"
            style={{ marginBottom: 8 }}
            bodyStyle={{ padding: '8px 12px' }}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
              onClick={() => setOpenKey(active ? null : c.call_id)}
            >
              <Tag color={statusColor}>{c.status}</Tag>
              <Text strong style={{ flex: 1 }} ellipsis>
                {c.task_name || '(未命名任务)'}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {c.elapsed_ms != null ? `${c.elapsed_ms} ms` : '-'}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatTime(c.started_at)}
              </Text>
              <Button
                size="small"
                type="link"
                onClick={(e) => { e.stopPropagation(); setOpenKey(active ? null : c.call_id) }}
              >
                {active ? '收起' : '展开'}
              </Button>
            </div>
            {active && (
              <div style={{ marginTop: 12 }}>
                <Descriptions size="small" column={2} bordered style={{ marginBottom: 12 }}>
                  <Descriptions.Item label="call_id" span={2}>
                    <Text code style={{ fontSize: 12 }}>{c.call_id}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="文档 id">
                    <Text code style={{ fontSize: 12 }}>{c.document_id || '-'}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="任务路径">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {Array.isArray(c.task_path) ? c.task_path.join(' / ') : (c.task_path || '-')}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="开始">{formatTime(c.started_at)}</Descriptions.Item>
                  <Descriptions.Item label="结束">{formatTime(c.finished_at)}</Descriptions.Item>
                </Descriptions>

                <Tabs
                  size="small"
                  items={[
                    {
                      key: 'prompt',
                      label: `提示词 (${(c.instruction || '').length} chars)`,
                      children: renderCompactJSON(c.instruction),
                    },
                    {
                      key: 'user',
                      label: `用户消息 (${(c.user_message || '').length} chars)`,
                      children: renderCompactJSON(c.user_message),
                    },
                    {
                      key: 'parsed',
                      label: '解析结果 (parsed)',
                      children: renderCompactJSON(c.parsed),
                    },
                    {
                      key: 'raw',
                      label: '原始响应 (extracted_raw)',
                      children: renderCompactJSON(c.extracted_raw),
                    },
                    {
                      key: 'validation',
                      label: '校验日志 (validation_log)',
                      children: renderCompactJSON(c.validation_log),
                    },
                    ...(c.error ? [{
                      key: 'error',
                      label: '错误',
                      children: (
                        <Alert
                          type="error"
                          showIcon
                          message="LLM 调用异常"
                          description={<pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{c.error}</pre>}
                        />
                      ),
                    }] : []),
                  ]}
                />
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

// 任务详情弹窗：展示 summary、jobs 列表（含 extraction_run）、LLM 调用
// 小组件：running 状态下展示 SSE 实时进度流（时间线）
// terminal=true 时上层 Modal 会 refetch 详情把 status 翻到最终态。
const ExtractionProgressStream = ({ events, status, terminal, error }) => {
  const hasEvents = events && events.length > 0

  const streamBadge = (() => {
    if (error) return { status: 'error', text: '连接中断' }
    if (terminal) return { status: 'success', text: '已完成' }
    if (status === 'open') return { status: 'processing', text: '实时接收中' }
    if (status === 'connecting') return { status: 'processing', text: '连接中' }
    if (status === 'closed') return { status: 'default', text: '已断开' }
    return { status: 'default', text: '未连接' }
  })()

  return (
    <div>
      <Space style={{ marginBottom: 8 }}>
        <Badge status={streamBadge.status} text={<Text type="secondary">{streamBadge.text}</Text>} />
        <Text type="secondary" style={{ fontSize: 12 }}>共 {events.length} 条事件</Text>
      </Space>
      {!hasEvents ? (
        <Alert
          type="info"
          showIcon
          message="正在等待进度事件"
          description="抽取服务每完成一个节点会推送一条事件；若长时间未收到，可能任务尚未开始或进度通道不可达。"
        />
      ) : (
        <div
          style={{
            maxHeight: 240,
            overflowY: 'auto',
            border: `1px solid ${appThemeToken.colorBorderSecondary}`,
            borderRadius: 6,
            padding: 8,
            background: appThemeToken.colorBgLayout,
          }}
        >
          {events.map((ev, idx) => {
            const meta = nodeMeta(ev.node)
            const ts = new Date(ev.ts).toLocaleTimeString('zh-CN', { hour12: false })
            const highlight = ev.type === 'error' || ev.status === 'failed'
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  padding: '4px 0',
                  borderBottom: idx === events.length - 1 ? 'none' : `1px dashed ${appThemeToken.colorBorderSecondary}`,
                }}
              >
                <Text type="secondary" style={{ fontSize: 11, minWidth: 72, fontFamily: 'monospace' }}>{ts}</Text>
                <Tag color={meta.color} style={{ margin: 0, minWidth: 96, textAlign: 'center' }}>
                  {meta.label}
                </Tag>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {ev.status && (
                    <Tag
                      color={extractionStatusMeta[ev.status]?.color || 'default'}
                      style={{ marginRight: 6 }}
                    >
                      {extractionStatusMeta[ev.status]?.label || ev.status}
                    </Tag>
                  )}
                  <Text
                    type={highlight ? 'danger' : undefined}
                    style={{ fontSize: 12, wordBreak: 'break-all' }}
                  >
                    {ev.message || ev.reason || '—'}
                  </Text>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const formatExtractedValue = (value) => {
  if (value == null || value === '') return '—'
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

const ExtractedFieldsTable = ({ fields = [] }) => {
  if (!fields.length) {
    return (
      <Alert
        type="info"
        showIcon
        message="该 Job 暂无可展示的抽取字段"
        description="可能尚未物化成功，或该文档没有命中可抽取字段。"
      />
    )
  }
  return (
    <Table
      size="small"
      rowKey="id"
      pagination={{ pageSize: 10, size: 'small' }}
      dataSource={fields}
      columns={[
        {
          title: '字段路径',
          dataIndex: 'field_path',
          key: 'field_path',
          width: 260,
          ellipsis: { showTitle: false },
          render: (v) => <Tooltip title={v}><Text code style={{ fontSize: 12 }}>{v || '-'}</Text></Tooltip>,
        },
        {
          title: '抽取值',
          dataIndex: 'value',
          key: 'value',
          width: 260,
          render: (v) => {
            const text = formatExtractedValue(v)
            return <Tooltip title={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{text}</pre>}><Text>{text.length > 80 ? `${text.slice(0, 80)}…` : text}</Text></Tooltip>
          },
        },
        {
          title: '证据原文',
          dataIndex: 'source_text',
          key: 'source_text',
          ellipsis: { showTitle: false },
          render: (v) => v ? <Tooltip title={v}><Text type="secondary">{v}</Text></Tooltip> : <Text type="secondary">—</Text>,
        },
        {
          title: '来源',
          key: 'source',
          width: 180,
          render: (_, r) => (
            <Space direction="vertical" size={0} style={{ lineHeight: 1.3 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{r.source_document_name || r.source_document_id || '-'}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>页 {r.source_page ?? '-'}</Text>
            </Space>
          ),
        },
      ]}
    />
  )
}

const ExtractionTaskDetailModal = ({ open, taskId, onClose }) => {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!open || !taskId) return
    let aborted = false
    setLoading(true)
    setDetail(null)
    getAdminExtractionTaskDetail(taskId)
      .then((res) => { if (!aborted) setDetail(res?.data || null) })
      .catch(() => { if (!aborted) message.error('加载任务详情失败') })
      .finally(() => { if (!aborted) setLoading(false) })
    return () => { aborted = true }
  }, [open, taskId, refreshKey])

  // 只有 running 的任务才订阅 SSE；其它状态没有进度事件
  const isRunning = detail?.summary?.status === 'running' || detail?.summary?.status === 'pending'
  const {
    events: progressEvents,
    status: sseStatus,
    terminal: sseTerminal,
    error: sseError,
  } = useExtractionProgressSSE(taskId, { enabled: open && !!taskId && isRunning })

  // 终态到达 → 触发一次 detail 刷新，把 status、llm_calls、jobs 都换到最终态
  useEffect(() => {
    if (sseTerminal) {
      setRefreshKey((k) => k + 1)
    }
  }, [sseTerminal])

  const summary = detail?.summary
  const llmSource = detail?.llm_source || null
  const jobs = detail?.jobs || []
  const llmCalls = detail?.llm_calls || []

  const jobColumns = [
    {
      title: '文档',
      key: 'document',
      width: 240,
      ellipsis: true,
      render: (_, r) => (
        <Space direction="vertical" size={0} style={{ lineHeight: 1.3 }}>
          <Tooltip title={r.document_id || ''}>
            <Text ellipsis>{r.document_name || r.document_id?.slice(0, 8) || '-'}</Text>
          </Tooltip>
          {r.patient_name && (
            <Text type="secondary" style={{ fontSize: 12 }}>患者：{r.patient_name}</Text>
          )}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v) => {
        const meta = extractionStatusMeta[v] || { color: 'default', label: v }
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '重试',
      key: 'attempt',
      width: 70,
      render: (_, r) => `${r.attempt_count}/${r.max_attempts}`,
    },
    {
      title: '抽取运行',
      key: 'run',
      render: (_, r) => {
        const run = r.extraction_run
        if (!run) return <Text type="secondary">—</Text>
        return (
          <Space direction="vertical" size={2} style={{ lineHeight: 1.3 }}>
            <Space size={6} wrap>
              <Tag color={run.target_mode === 'targeted_section' ? 'purple' : 'blue'}>
                {run.target_mode === 'targeted_section' ? '靶向' : '全量'}
              </Tag>
              {run.target_path && (
                <Tooltip title={run.target_path}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {run.target_path.slice(0, 24)}{run.target_path.length > 24 ? '…' : ''}
                  </Text>
                </Tooltip>
              )}
              <Tag color={run.status === 'succeeded' ? 'success' : run.status === 'failed' ? 'error' : 'default'}>
                {run.status || '-'}
              </Tag>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              模型 {run.model_name || '-'} · 提示词 {run.prompt_version || '-'}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              字段 {run.field_candidate_count}（含证据 {run.field_with_evidence_count}）
            </Text>
          </Space>
        )
      },
    },
    {
      title: '时间',
      key: 'time',
      width: 160,
      render: (_, r) => (
        <Space direction="vertical" size={0} style={{ lineHeight: 1.3 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            开始 {formatTime(r.started_at)}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            结束 {formatTime(r.completed_at)}
          </Text>
        </Space>
      ),
    },
    {
      title: '错误',
      dataIndex: 'last_error',
      key: 'last_error',
      ellipsis: { showTitle: false },
      render: (v) => v ? (
        <Tooltip title={v}>
          <Text type="danger" style={{ fontSize: 12 }}>{v}</Text>
        </Tooltip>
      ) : '-',
    },
  ]

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={onClose}
      cancelText="关闭"
      okButtonProps={{ style: { display: 'none' } }}
      width={1100}
      title={
        <Space>
          <CloudServerOutlined />
          <span>抽取任务详情</span>
          {summary && (
            <Tag color={taskTypeMeta[summary.task_type]?.color || 'default'}>
              {taskTypeMeta[summary.task_type]?.label || summary.task_type}
            </Tag>
          )}
        </Space>
      }
      destroyOnClose
    >
      {loading || !summary ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : (
        <>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="任务 ID" span={2}>
              <Text copyable={{ text: summary.id }} code style={{ fontSize: 12 }}>{summary.id}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={extractionStatusMeta[summary.status]?.color || 'default'}>
                {extractionStatusMeta[summary.status]?.label || summary.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="进度">
              <Progress percent={summary.progress} size="small" status={extractionStatusMeta[summary.status]?.progressStatus || 'normal'} />
            </Descriptions.Item>
            {summary.task_type === 'project_crf' ? (
              <>
                <Descriptions.Item label="项目">{summary.project_name || summary.project_id || '-'}</Descriptions.Item>
                <Descriptions.Item label="模板">{summary.schema_name || '-'}</Descriptions.Item>
              </>
            ) : (
              <>
                <Descriptions.Item label="患者">{summary.patient_name || summary.patient_id || '-'}</Descriptions.Item>
                <Descriptions.Item label="模板">{summary.schema_name || '-'}</Descriptions.Item>
              </>
            )}
            {summary.target_section && (
              <Descriptions.Item label="靶向路径" span={2}>
                <Text code style={{ fontSize: 12 }}>{summary.target_section}</Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="开始">{formatTime(summary.started_at)}</Descriptions.Item>
            <Descriptions.Item label="完成">{formatTime(summary.finished_at)}</Descriptions.Item>
            <Descriptions.Item label="完成/失败/运行/等待" span={2}>
              <Space size={12}>
                <Badge status="success" text={`完成 ${summary.completed_count}`} />
                <Badge status="error" text={`失败 ${summary.failed_count}`} />
                <Badge status="processing" text={`运行 ${summary.running_count}`} />
                <Badge status="default" text={`等待 ${summary.pending_count}`} />
              </Space>
            </Descriptions.Item>
            {summary.error_message && (
              <Descriptions.Item label="错误信息" span={2}>
                <Alert type="error" message={summary.error_message} showIcon />
              </Descriptions.Item>
            )}
          </Descriptions>

          {isRunning && (
            <>
              <Divider orientation="left" style={{ marginTop: 24 }}>
                <Space>
                  <SyncOutlined spin={sseStatus === 'open' || sseStatus === 'connecting'} />
                  <span>实时进度</span>
                </Space>
              </Divider>
              <ExtractionProgressStream
                events={progressEvents}
                status={sseStatus}
                terminal={sseTerminal}
                error={sseError}
              />
            </>
          )}

          <Divider orientation="left" style={{ marginTop: 24 }}>
            <Space>
              <FileTextOutlined />
              <span>文档级 Jobs（{jobs.length}）</span>
            </Space>
          </Divider>
          <Table
            columns={jobColumns}
            dataSource={jobs}
            rowKey="id"
            size="small"
            pagination={false}
            expandable={{
              expandedRowRender: (r) => <ExtractedFieldsTable fields={r.extraction_run?.extracted_fields || []} />,
              rowExpandable: (r) => !!r.extraction_run,
            }}
            scroll={{ x: 1000, y: 360 }}
          />

          <Divider orientation="left" style={{ marginTop: 24 }}>
            <Space>
              <ExperimentOutlined />
              <span>LLM 调用明细（{llmCalls.length}）</span>
              {llmSource === 'db' && (
                <Tooltip title="来自 llm_call_logs 表，按 job_id 精确关联">
                  <Tag color="green" style={{ margin: 0 }}>DB 精准</Tag>
                </Tooltip>
              )}
            </Space>
          </Divider>
          {llmCalls.length === 0 ? (
            <Alert
              type="info"
              showIcon
              message="未检索到 LLM 调用日志"
              description="llm_call_logs 表里没有关联这个任务的记录（可能任务未真正发起 LLM 调用，或任务早于 DB 日志写入上线）。"
            />
          ) : (
            <LLMCallList calls={llmCalls} />
          )}
        </>
      )}
    </Modal>
  )
}

const ExtractionTasksTab = () => {
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
    } catch { /* 交给拦截器处理 */ }
    setLoading(false)
  }, [typeFilter, statusFilter])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // 如果当前有任何 running/pending 任务，开启 5s 轻量轮询，让列表里的进度列
  // 能跟着 SSE 推送的终态一起翻面。SSE 留给详情弹窗逐节点看；列表只需汇总。
  const hasLiveTask = useMemo(
    () => (rawData.items || []).some((r) => r.status === 'running' || r.status === 'pending'),
    [rawData.items],
  )
  useEffect(() => {
    if (!hasLiveTask) return undefined
    const timer = setInterval(() => { fetchTasks() }, 5000)
    return () => clearInterval(timer)
  }, [hasLiveTask, fetchTasks])

  // 前端搜索：按 patient_name / project_name / schema_name / id 做模糊匹配
  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    if (!kw) return rawData.items
    return rawData.items.filter((r) => [
      r.id, r.patient_name, r.patient_id, r.project_name, r.project_id,
      r.schema_name, r.schema_code, r.target_section, r.primary_job_id,
    ].filter(Boolean).some((v) => String(v).toLowerCase().includes(kw)))
  }, [rawData.items, search])

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
    return (
      <Tag color={meta.color} icon={meta.icon}>
        {meta.label}
      </Tag>
    )
  }

  const columns = [
    {
      title: '类型',
      dataIndex: 'task_type',
      key: 'task_type',
      width: 120,
      filters: [
        { text: '科研 CRF', value: 'project_crf' },
        { text: '电子病历夹', value: 'patient_ehr' },
        { text: '靶向抽取', value: 'targeted' },
      ],
      onFilter: (val, r) => r.task_type === val,
      render: (t, r) => (
        <Space size={4} direction="vertical" style={{ lineHeight: 1.4 }}>
          {renderTaskTypeTag(t)}
          {r.target_section && (
            <Tooltip title={`靶向路径：${r.target_section}`}>
              <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
                {r.target_section.length > 18 ? `${r.target_section.slice(0, 18)}…` : r.target_section}
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
      render: (_, r) => {
        if (r.task_type === 'project_crf') {
          return (
            <Space direction="vertical" size={0} style={{ lineHeight: 1.3 }}>
              <Text strong>{r.project_name || r.project_id?.slice(0, 8) || '-'}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                患者 {r.document_count} · 模板 {r.schema_code || r.schema_name?.slice(0, 16) || '-'}
              </Text>
            </Space>
          )
        }
        return (
          <Space direction="vertical" size={0} style={{ lineHeight: 1.3 }}>
            <Text strong>{r.patient_name || r.patient_id?.slice(0, 8) || '-'}</Text>
            <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
              {r.schema_name?.slice(0, 20) || r.schema_code || '-'}
            </Text>
          </Space>
        )
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (v) => {
        const meta = extractionStatusMeta[v] || { color: 'default', label: v }
        return (
          <Space size={4}>
            {taskStatusIcon(v)}
            <Tag color={meta.color}>{meta.label}</Tag>
          </Space>
        )
      },
    },
    {
      title: '进度',
      key: 'progress',
      width: 200,
      render: (_, r) => {
        const meta = extractionStatusMeta[r.status] || {}
        const total = r.document_count || r.job_ids?.length || 0
        const done = r.completed_count + r.failed_count
        const display = total > 0 ? `${done}/${total}` : '-'
        const tooltip = total > 0
          ? `完成 ${r.completed_count} · 失败 ${r.failed_count} · 运行 ${r.running_count} · 等待 ${r.pending_count}`
          : ''
        return (
          <Tooltip title={tooltip}>
            <div style={{ minWidth: 160 }}>
              <Progress
                percent={r.progress}
                size="small"
                status={meta.progressStatus || 'normal'}
                strokeColor={r.failed_count > 0 && r.status !== 'failed' ? appThemeToken.colorWarning : undefined}
                format={() => display}
              />
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: '开始时间',
      dataIndex: 'started_at',
      key: 'started_at',
      width: 160,
      render: (v, r) => formatTime(v || r.created_at),
    },
    {
      title: '完成时间',
      dataIndex: 'finished_at',
      key: 'finished_at',
      width: 160,
      render: formatTime,
    },
    {
      title: '错误信息',
      dataIndex: 'error_message',
      key: 'error_message',
      width: 220,
      ellipsis: { showTitle: false },
      render: (v) => v ? (
        <Tooltip title={v}>
          <Text type="danger" style={{ fontSize: 12 }}>{v}</Text>
        </Tooltip>
      ) : '-',
    },
    {
      title: '任务 ID',
      dataIndex: 'id',
      key: 'id',
      width: 140,
      render: (v) => (
        <Text copyable={{ text: v }} type="secondary" style={{ fontSize: 12 }}>
          {v?.slice(0, 12)}…
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      fixed: 'right',
      render: (_, r) => (
        <Button size="small" type="link" onClick={() => setDetailId(r.id)}>
          详情
        </Button>
      ),
    },
  ]

  const typeCounts = rawData.type_counts || {}
  const statusCounts = rawData.status_counts || {}

  const typeOptions = [
    { label: `全部 (${typeCounts.all ?? 0})`, value: 'all' },
    { label: <Space size={4}><ProjectOutlined />{`科研 CRF (${typeCounts.project_crf ?? 0})`}</Space>, value: 'project_crf' },
    { label: <Space size={4}><FolderOpenOutlined />{`病历夹 (${typeCounts.patient_ehr ?? 0})`}</Space>, value: 'patient_ehr' },
    { label: <Space size={4}><AimOutlined />{`靶向 (${typeCounts.targeted ?? 0})`}</Space>, value: 'targeted' },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Segmented
          options={typeOptions}
          value={typeFilter}
          onChange={setTypeFilter}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ minWidth: 160 }}
          options={[
            { label: '全部状态', value: 'all' },
            { label: `运行中 (${statusCounts.running ?? 0})`, value: 'running' },
            { label: `等待中 (${statusCounts.pending ?? 0})`, value: 'pending' },
            { label: `已完成 (${statusCounts.completed ?? 0})`, value: 'completed' },
            { label: `失败 (${statusCounts.failed ?? 0})`, value: 'failed' },
            { label: `已停滞 (${statusCounts.stale ?? 0})`, value: 'stale' },
            { label: `已取消 (${statusCounts.cancelled ?? 0})`, value: 'cancelled' },
          ]}
        />
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索患者 / 项目 / 模板 / 任务ID…"
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchTasks} loading={loading}>刷新</Button>
        <Text type="secondary" style={{ lineHeight: '32px' }}>
          筛选后 {filtered.length} 条 / 全部 {rawData.total}
        </Text>
      </div>
      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1400 }}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
      />
      <ExtractionTaskDetailModal
        open={!!detailId}
        taskId={detailId}
        onClose={() => setDetailId(null)}
      />
    </>
  )
}

// ─── Templates Tab ──────────────────────────────────────────────
const TemplatesTab = () => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminTemplates()
      const list = res?.data?.templates || res?.data || []
      setData(Array.isArray(list) ? list.flatMap(t => Array.isArray(t) ? t : [t]) : [])
    } catch { /* handled */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const columns = [
    { title: '模板名称', dataIndex: 'template_name', key: 'template_name', width: 200, ellipsis: true, render: v => <Text strong>{v || '-'}</Text> },
    { title: '模板代码', dataIndex: 'template_code', key: 'template_code', width: 160, ellipsis: true, render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: '分类', dataIndex: 'category', key: 'category', width: 100, render: v => v ? <Tag>{v}</Tag> : '-' },
    {
      title: '类型', dataIndex: 'is_system', key: 'is_system', width: 100,
      render: (v, r) => (v || r.source === 'file') ? <Tag color="purple">系统</Tag> : <Tag color="blue">自定义</Tag>
    },
    {
      title: '发布', dataIndex: 'is_published', key: 'is_published', width: 80,
      render: v => v ? <Badge status="success" text="已发布" /> : <Badge status="warning" text="草稿" />
    },
    { title: '字段数', dataIndex: 'field_count', key: 'field_count', width: 80, render: v => v ?? '-' },
    { title: '版本', dataIndex: 'version', key: 'version', width: 60, render: v => v ?? '-' },
    { title: '来源', dataIndex: 'source', key: 'source', width: 80, render: v => v === 'file' ? <Tag>文件</Tag> : <Tag color="cyan">数据库</Tag> },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: formatTime },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
        <Text type="secondary" style={{ lineHeight: '32px' }}>共 {data.length} 个模板</Text>
      </div>
      <Table
        columns={columns} dataSource={data} rowKey={r => r.id || r.template_code || Math.random()} loading={loading}
        scroll={{ x: 1100 }} size="small" pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      />
    </>
  )
}

// ─── Documents Tab ──────────────────────────────────────────────
const DocumentsTab = () => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })

  const fetch = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true)
    try {
      const res = await getAdminDocuments({ page, page_size: pageSize })
      const list = res?.data?.items || res?.data?.documents || res?.data || []
      setData(Array.isArray(list) ? list : [])
      const total = res?.data?.pagination?.total || res?.data?.total || list.length
      setPagination(prev => ({ ...prev, current: page, pageSize, total }))
    } catch { /* handled */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const columns = [
    { title: '文件名', dataIndex: 'file_name', key: 'file_name', width: 250, ellipsis: true, render: (v, r) => <Text>{v || r.original_filename || '-'}</Text> },
    { title: '类型', dataIndex: 'file_type', key: 'file_type', width: 80, render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: '文档类型', dataIndex: 'document_type', key: 'document_type', width: 120, render: v => v || '-' },
    {
      title: '解析', dataIndex: 'is_parsed', key: 'is_parsed', width: 80,
      render: v => v ? <Badge status="success" text="已解析" /> : <Badge status="default" text="未解析" />
    },
    {
      title: '大小', dataIndex: 'file_size', key: 'file_size', width: 90,
      render: v => {
        if (!v) return '-'
        if (v < 1024) return `${v} B`
        if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
        return `${(v / 1024 / 1024).toFixed(1)} MB`
      }
    },
    { title: '患者', dataIndex: 'document_patient_name', key: 'document_patient_name', width: 100, render: v => v || '-' },
    { title: '机构', dataIndex: 'document_organization_name', key: 'document_organization_name', width: 160, ellipsis: true, render: v => v || '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: v => <Tag color={statusColors[v] || 'default'}>{v || '-'}</Tag>
    },
    { title: '上传时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: formatTime },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => fetch(pagination.current, pagination.pageSize)} loading={loading}>刷新</Button>
        <Text type="secondary" style={{ lineHeight: '32px' }}>共 {pagination.total} 个文档</Text>
      </div>
      <Table
        columns={columns} dataSource={data} rowKey="id" loading={loading}
        scroll={{ x: 1200 }} size="small"
        pagination={{
          ...pagination, showSizeChanger: true, showTotal: t => `共 ${t} 条`,
          onChange: (page, pageSize) => fetch(page, pageSize)
        }}
      />
    </>
  )
}

// ─── Main Admin Page ────────────────────────────────────────────
const AdminPage = () => {
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true)
      try {
        const res = await getAdminStats()
        setStats(res?.data || null)
      } catch { /* handled */ }
      setStatsLoading(false)
    }
    fetchStats()
  }, [])

  const tabItems = [
    { key: 'users', label: <span><TeamOutlined /> 用户管理</span>, children: <UsersTab /> },
    { key: 'projects', label: <span><ExperimentOutlined /> 项目概览</span>, children: <ProjectsTab /> },
    { key: 'extraction', label: <span><CloudServerOutlined /> 抽取任务</span>, children: <ExtractionTasksTab /> },
    { key: 'templates', label: <span><DatabaseOutlined /> CRF模板</span>, children: <TemplatesTab /> },
    { key: 'documents', label: <span><FileTextOutlined /> 文档管理</span>, children: <DocumentsTab /> },
  ]

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <OverviewCards stats={stats} loading={statsLoading} />

      <Card style={{ borderRadius: 8 }}>
        <Tabs items={tabItems} destroyInactiveTabPane size="large" />
      </Card>
    </div>
  )
}

export default AdminPage
