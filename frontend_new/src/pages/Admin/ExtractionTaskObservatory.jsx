import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Badge, Button, Descriptions, Divider, Drawer, Empty, Progress, Space,
  Spin, Table, Tabs, Tag, Tooltip, Typography, Tree, message,
} from 'antd'
import {
  AimOutlined, CloudServerOutlined, ExperimentOutlined, FileTextOutlined,
  SyncOutlined, WarningOutlined,
} from '@ant-design/icons'
import {
  getAdminExtractionTaskTrace, getAdminLlmCallDetail,
} from '../../api/admin'
import { appThemeToken } from '../../styles/themeTokens'
import { useExtractionProgressSSE } from '../../hooks'

const { Text } = Typography

const STAGE_META = {
  worker_started: { label: 'Worker 启动', color: 'processing' },
  queued: { label: '已进入队列', color: 'default' },
  load_context: { label: '加载上下文', color: 'blue' },
  load_document: { label: '读取文档', color: 'blue' },
  call_extractor: { label: 'LLM 抽取', color: 'geekblue' },
  validate_output: { label: '校验结果', color: 'purple' },
  persist_values: { label: '写入落库', color: 'purple' },
  completed: { label: '完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

const extractionStatusMeta = {
  pending: { color: 'default', label: '等待中' },
  running: { color: 'processing', label: '运行中' },
  completed: { color: 'success', label: '已完成' },
  succeeded: { color: 'success', label: '已完成' },
  failed: { color: 'error', label: '失败' },
  stale: { color: 'warning', label: '已停滞' },
}

const planStatusMeta = {
  planned: { color: 'processing', label: '已规划' },
  skipped: { color: 'warning', label: '未匹配' },
  already_extracted: { color: 'default', label: '已抽取' },
  not_planned: { color: 'default', label: '未规划' },
}

const formatTime = (v) => {
  if (!v) return '-'
  try {
    const d = new Date(v)
    return isNaN(d.getTime()) ? v : d.toLocaleString('zh-CN', { hour12: false })
  } catch { return v }
}

const renderJSON = (value) => {
  if (value == null) return <Text type="secondary">—</Text>
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return <pre style={{ margin: 0, maxHeight: 360, overflow: 'auto', fontSize: 12, background: '#fafafa', padding: 8 }}>{text}</pre>
}

const FieldSpecsTable = ({ specs = [] }) => (
  <Table
    size="small"
    rowKey={(r) => r.field_path}
    pagination={{ pageSize: 15, size: 'small' }}
    dataSource={specs}
    columns={[
      { title: '字段路径', dataIndex: 'field_path', ellipsis: true, width: 260 },
      { title: '标题', dataIndex: 'field_title', width: 160, ellipsis: true },
      { title: '类型', dataIndex: 'value_type', width: 90 },
      { title: '表单', dataIndex: 'record_form_key', width: 180, ellipsis: true },
    ]}
  />
)

const ExtractedFieldsTable = ({ fields = [] }) => {
  if (!fields.length) return <Alert type="info" showIcon message="暂无物化字段" />
  return (
    <Table
      size="small"
      rowKey="id"
      pagination={{ pageSize: 10, size: 'small' }}
      dataSource={fields}
      columns={[
        { title: '字段路径', dataIndex: 'field_path', width: 240, ellipsis: true },
        {
          title: '值', dataIndex: 'value', ellipsis: true,
          render: (v) => {
            const text = v == null ? '—' : (typeof v === 'string' ? v : JSON.stringify(v))
            return <Tooltip title={text}><Text>{text.length > 60 ? `${text.slice(0, 60)}…` : text}</Text></Tooltip>
          },
        },
        { title: '证据', dataIndex: 'source_text', ellipsis: true },
        { title: '页', dataIndex: 'source_page', width: 60 },
      ]}
    />
  )
}

const LlmCallPanel = ({ calls = [], onLoadFull }) => {
  const [activeId, setActiveId] = useState(null)
  const [fullCall, setFullCall] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadFull = async (callId) => {
    setActiveId(callId)
    setLoading(true)
    try {
      const res = await getAdminLlmCallDetail(callId)
      setFullCall(res?.data || null)
      onLoadFull?.(res?.data)
    } catch {
      message.error('加载 LLM 调用详情失败')
    } finally {
      setLoading(false)
    }
  }

  if (!calls.length) return <Alert type="info" showIcon message="无 LLM 调用记录（可能为规则抽取或未执行到模型）" />

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        {calls.map((c) => (
          <div key={c.call_id} style={{ border: `1px solid ${appThemeToken.colorBorderSecondary}`, borderRadius: 6, padding: 8 }}>
            <Space wrap>
              <Tag color={c.status === 'success' ? 'success' : 'error'}>{c.status}</Tag>
              <Text strong>retry {c.retry_no ?? 0}</Text>
              <Text type="secondary">{c.model_name}</Text>
              <Text type="secondary">{c.elapsed_ms != null ? `${c.elapsed_ms} ms` : ''}</Text>
              <Button size="small" type="link" onClick={() => loadFull(c.call_id)}>查看完整 I/O</Button>
            </Space>
          </div>
        ))}
      </Space>
      {activeId && (
        <div style={{ marginTop: 12 }}>
          {loading ? <Spin /> : (
            <Tabs
              size="small"
              items={[
                { key: 'sys', label: 'System', children: renderJSON(fullCall?.instruction) },
                { key: 'user', label: 'User', children: renderJSON(fullCall?.user_message) },
                { key: 'raw', label: 'Raw', children: renderJSON(fullCall?.extracted_raw) },
                { key: 'parsed', label: 'Parsed', children: renderJSON(fullCall?.parsed) },
              ]}
            />
          )}
        </div>
      )}
    </div>
  )
}

const EventTimeline = ({ events = [] }) => {
  if (!events.length) return <Alert type="info" showIcon message="暂无进度事件" />
  return (
    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
      {events.map((ev) => {
        const meta = STAGE_META[ev.node] || { label: ev.node || '-', color: 'default' }
        return (
          <div key={ev.id} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: `1px dashed ${appThemeToken.colorBorderSecondary}` }}>
            <Text type="secondary" style={{ fontSize: 11, minWidth: 72 }}>{formatTime(ev.ts).split(' ')[1] || formatTime(ev.ts)}</Text>
            <Tag color={meta.color}>{meta.label}</Tag>
            <Text style={{ fontSize: 12, flex: 1 }}>{ev.message || '—'}</Text>
          </div>
        )
      })}
    </div>
  )
}

const JobInspector = ({ job, taskId, isRunning }) => {
  const match = job?.match || {}
  const run = job?.extraction_run || job?.runs?.[job.runs.length - 1]
  const snapshot = run?.input_snapshot_json
  const { events } = useExtractionProgressSSE(taskId, {
    enabled: isRunning && !!job?.item_id,
    itemId: job?.item_id,
  })

  const displayEvents = events.length ? events : (job?.events || [])

  const tabItems = [
    {
      key: 'match',
      label: '匹配',
      children: (
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="目标表单"><Text code>{match.target_form_key || job?.target_form_key || '-'}</Text></Descriptions.Item>
          <Descriptions.Item label="匹配角色"><Tag>{match.match_role || '-'}</Tag></Descriptions.Item>
          <Descriptions.Item label="匹配原因">{match.planned_reason || '-'}</Descriptions.Item>
          <Descriptions.Item label="来源">{match.source || '-'}</Descriptions.Item>
          <Descriptions.Item label="input_json">{renderJSON(job?.input_json)}</Descriptions.Item>
        </Descriptions>
      ),
    },
    {
      key: 'progress',
      label: '进度',
      children: <EventTimeline events={displayEvents} />,
    },
    {
      key: 'snapshot',
      label: `快照 (${(snapshot?.field_specs || []).length})`,
      children: snapshot ? (
        <>
          <Descriptions size="small" column={2} bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label="抽取器">{snapshot.extractor}</Descriptions.Item>
            <Descriptions.Item label="字段数">{snapshot.field_filter?.matched_count ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="文档类型">{snapshot.document?.doc_type || '-'}</Descriptions.Item>
            <Descriptions.Item label="文本长度">{snapshot.document?.text_length ?? '-'}</Descriptions.Item>
          </Descriptions>
          <FieldSpecsTable specs={snapshot.field_specs || []} />
        </>
      ) : <Alert type="info" showIcon message="尚无 input_snapshot（任务可能尚未执行到抽取阶段）" />,
    },
    {
      key: 'llm',
      label: `LLM (${(job?.llm_calls || []).length})`,
      children: <LlmCallPanel calls={job?.llm_calls || []} />,
    },
    {
      key: 'validation',
      label: '校验',
      children: renderJSON(run?.validation_log),
    },
    {
      key: 'result',
      label: '落库',
      children: <ExtractedFieldsTable fields={run?.extracted_fields || []} />,
    },
  ]

  return <Tabs items={tabItems} />
}

const ExtractionTaskObservatory = ({ open, taskId, onClose }) => {
  const [trace, setTrace] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [selectedJobId, setSelectedJobId] = useState(null)

  const fetchTrace = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    try {
      const res = await getAdminExtractionTaskTrace(taskId, { include_prompts: false })
      setTrace(res?.data || null)
    } catch {
      message.error('加载追踪数据失败')
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    if (!open || !taskId) return
    setTrace(null)
    setSelectedDocId(null)
    setSelectedJobId(null)
    fetchTrace()
  }, [open, taskId, fetchTrace])

  const summary = trace?.summary
  const plan = trace?.plan
  const documents = trace?.documents || []
  const isRunning = summary?.status === 'running' || summary?.status === 'pending'

  const treeData = useMemo(() => documents.map((doc) => {
    const planMeta = planStatusMeta[doc.status] || { label: doc.status, color: 'default' }
    return {
      key: doc.document_id,
      title: (
        <Space size={4}>
          <Text ellipsis style={{ maxWidth: 200 }}>{doc.file_name || doc.document_id?.slice(0, 8)}</Text>
          <Tag color={planMeta.color} style={{ margin: 0 }}>{planMeta.label}</Tag>
        </Space>
      ),
      children: (doc.jobs || []).map((job) => {
        const st = extractionStatusMeta[job.status] || { label: job.status, color: 'default' }
        return {
          key: `${doc.document_id}:${job.extraction_job_id}`,
          title: (
            <Space size={4}>
              <AimOutlined />
              <Text ellipsis style={{ maxWidth: 180 }}>{job.target_form_key || job.match?.target_form_key || 'job'}</Text>
              <Tag color={st.color} style={{ margin: 0 }}>{st.label}</Tag>
            </Space>
          ),
          isLeaf: true,
          job,
          documentId: doc.document_id,
        }
      }),
    }
  }), [documents, plan])

  const selectedJob = useMemo(() => {
    for (const doc of documents) {
      for (const job of doc.jobs || []) {
        if (job.extraction_job_id === selectedJobId) return job
      }
    }
    return null
  }, [documents, selectedJobId])

  const onTreeSelect = (_, info) => {
    if (info.node.job) {
      setSelectedDocId(info.node.documentId)
      setSelectedJobId(info.node.job.extraction_job_id)
    } else {
      setSelectedDocId(info.node.key)
      const doc = documents.find((d) => d.document_id === info.node.key)
      const firstJob = doc?.jobs?.[0]
      setSelectedJobId(firstJob?.extraction_job_id || null)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="92%"
      title={(
        <Space>
          <CloudServerOutlined />
          <span>抽取任务观测台</span>
          {summary && <Tag>{summary.task_type}</Tag>}
          {isRunning && <Badge status="processing" text="运行中" />}
        </Space>
      )}
      extra={<Button icon={<SyncOutlined />} onClick={fetchTrace} loading={loading}>刷新</Button>}
      destroyOnClose
    >
      {loading && !trace ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : !summary ? (
        <Empty description="无追踪数据" />
      ) : (
        <>
          <Descriptions size="small" column={3} bordered>
            <Descriptions.Item label="任务 ID" span={3}><Text copyable code>{summary.id}</Text></Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={extractionStatusMeta[summary.status]?.color}>{extractionStatusMeta[summary.status]?.label || summary.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="进度"><Progress percent={summary.progress} size="small" /></Descriptions.Item>
            <Descriptions.Item label="完成/失败">{summary.completed_count}/{summary.failed_count}</Descriptions.Item>
            {plan?.stats && (
              <Descriptions.Item label="规划" span={3}>
                <Space wrap>
                  <Text>计划 jobs: {plan.stats.planned_jobs ?? '-'}</Text>
                  <Text>跳过文档: {plan.stats.skipped_documents ?? '-'}</Text>
                  <Text>待处理文档: {plan.stats.pending_documents ?? '-'}</Text>
                </Space>
              </Descriptions.Item>
            )}
          </Descriptions>

          <Divider />

          <div style={{ display: 'flex', gap: 16, minHeight: 520 }}>
            <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${appThemeToken.colorBorderSecondary}`, paddingRight: 12 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                <FileTextOutlined /> 文档 / Job 树 ({documents.length})
              </Text>
              {documents.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Tree
                  treeData={treeData}
                  defaultExpandAll
                  selectedKeys={selectedJobId ? [`${selectedDocId}:${selectedJobId}`] : (selectedDocId ? [selectedDocId] : [])}
                  onSelect={onTreeSelect}
                  height={480}
                />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {selectedJob ? (
                <JobInspector job={selectedJob} taskId={taskId} isRunning={isRunning} />
              ) : (
                <Alert type="info" showIcon message="请在左侧选择文档下的 Job 查看匹配、LLM I/O 与落库详情" />
              )}
            </div>
          </div>
        </>
      )}
    </Drawer>
  )
}

export default ExtractionTaskObservatory
