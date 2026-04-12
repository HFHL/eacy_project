import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  ExperimentOutlined,
  FileTextOutlined,
  FormOutlined,
  ProjectOutlined,
  ReloadOutlined,
  TeamOutlined,
  UploadOutlined,
} from '@ant-design/icons'

import { getActiveTasks, getDashboardStats } from '../../api/stats'

const { Text } = Typography

const PROJECT_STATUS_META = {
  planning: { label: '规划中', color: '#1677ff' },
  recruiting: { label: '进行中', color: '#1677ff' },
  active: { label: '进行中', color: '#52c41a' },
  completed: { label: '已完成', color: '#8c8c8c' },
  paused: { label: '暂停中', color: '#faad14' },
}

const statusOrder = {
  processing: 0,
  initializing: 0,
  pending: 1,
  failed: 2,
  completed_with_errors: 3,
  completed: 4,
  cancelled: 5,
}

const FLOW_STAGE_COLORS = {
  upload: '#1677ff',
  parse: '#fa8c16',
  todo: '#722ed1',
  archived: '#52c41a',
}

const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(toNumber(value))))

const isToday = (value) => {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
}

const formatTimeAgo = (iso) => {
  if (!iso) return '刚刚'
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return '刚刚'
  const diff = Date.now() - ts
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
  return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`
}

const sortByStatusAndTime = (tasks) => [...tasks].sort((a, b) => {
  const aWeight = statusOrder[a.status] ?? 9
  const bWeight = statusOrder[b.status] ?? 9
  if (aWeight !== bWeight) return aWeight - bWeight
  return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
})

const KpiCard = ({ title, value, delta, icon, color, onClick }) => (
  <Card
    hoverable
    onClick={onClick}
    style={{
      borderRadius: 16,
      border: '1px solid #f0f0f0',
      height: '100%',
      cursor: 'pointer',
      background: `linear-gradient(135deg, ${color}10 0%, #fff 100%)`,
    }}
    bodyStyle={{ padding: 20 }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <Text type="secondary">{title}</Text>
        <div style={{ marginTop: 8, fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>
          {typeof value === 'number' ? value.toLocaleString() : (value ?? '—')}
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          今日变化：{delta}
        </Text>
      </div>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: color,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
    </div>
  </Card>
)

const SectionCard = ({ title, subtitle, extra, children }) => (
  <Card
    bordered={false}
    style={{ borderRadius: 18, marginBottom: 24 }}
    title={(
      <Space direction="vertical" size={0}>
        <Text strong style={{ fontSize: 16 }}>{title}</Text>
        {subtitle ? <Text type="secondary" style={{ fontSize: 12 }}>{subtitle}</Text> : null}
      </Space>
    )}
    extra={extra}
  >
    {children}
  </Card>
)

const MiniDonutChart = ({ items, emptyText = '暂无数据', showDetails = true }) => {
  const total = items.reduce((sum, item) => sum + toNumber(item.value), 0)
  if (!items.length || total === 0) {
    return <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  const chartSize = 120
  const strokeWidth = 16
  const radius = (chartSize - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  let currentRatio = 0
  const chartItems = items
    .filter((item) => toNumber(item.value) > 0)
    .map((item) => {
      const value = toNumber(item.value)
      const ratio = value / total
      const length = ratio * circumference
      const dashOffset = circumference * (1 - currentRatio)
      currentRatio += ratio
      return {
        ...item,
        value,
        percent: clampPercent(ratio * 100),
        length,
        dashOffset,
      }
    })

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: showDetails ? '120px minmax(0, 1fr)' : '1fr',
        gap: 16,
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: chartSize,
          height: chartSize,
          position: 'relative',
          margin: '0 auto',
        }}
      >
        <svg
          width={chartSize}
          height={chartSize}
          viewBox={`0 0 ${chartSize} ${chartSize}`}
          style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
        >
          <circle
            cx={chartSize / 2}
            cy={chartSize / 2}
            r={radius}
            fill="none"
            stroke="#f0f0f0"
            strokeWidth={strokeWidth}
          />
          {chartItems.map((item) => (
            <Tooltip
              key={item.key}
              title={`${item.label}: ${item.value.toLocaleString()} (${item.percent}%)`}
            >
              <circle
                cx={chartSize / 2}
                cy={chartSize / 2}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${item.length} ${circumference - item.length}`}
                strokeDashoffset={item.dashOffset}
                style={{ cursor: 'pointer', transition: 'opacity 0.2s ease' }}
              />
            </Tooltip>
          ))}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 20,
            borderRadius: '50%',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.04)',
            pointerEvents: 'none',
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>总量</Text>
          <Text strong style={{ fontSize: 22, lineHeight: 1.1 }}>
            {total.toLocaleString()}
          </Text>
        </div>
      </div>
      {showDetails ? (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {items.map((item) => {
            const percent = clampPercent((toNumber(item.value) / Math.max(total, 1)) * 100)
            return (
              <div key={item.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                  <Space size={8}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: item.color,
                      }}
                    />
                    <Text>{item.label}</Text>
                  </Space>
                  <Text type="secondary">
                    {toNumber(item.value).toLocaleString()} / {percent}%
                  </Text>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: '#f5f5f5',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${percent}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: item.color,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </Space>
      ) : (
        <Space wrap size={[12, 8]} style={{ width: '100%', justifyContent: 'center' }}>
          {items.map((item) => {
            const value = toNumber(item.value)
            const percent = clampPercent((value / Math.max(total, 1)) * 100)
            return (
              <Space
                key={item.key}
                size={6}
                style={{
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: `${item.color}10`,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: item.color,
                  }}
                />
                <Text style={{ fontSize: 12 }}>
                  {item.label}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {value.toLocaleString()} / {percent}%
                </Text>
              </Space>
            )
          })}
        </Space>
      )}
    </div>
  )
}

const SegmentedBar = ({ segments, emptyText = '暂无数据', showLegend = true, height = 12 }) => {
  const total = segments.reduce((sum, item) => sum + toNumber(item.value), 0)
  if (!segments.length || total === 0) {
    return <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <Space direction="vertical" size={showLegend ? 10 : 0} style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height,
          overflow: 'hidden',
          borderRadius: 999,
          background: '#f5f5f5',
        }}
      >
        {segments.map((segment) => {
          const value = toNumber(segment.value)
          const percent = (value / Math.max(total, 1)) * 100
          if (value <= 0) return null
          return (
            <div
              key={segment.key}
              onClick={segment.onClick}
              role={segment.onClick ? 'button' : undefined}
              style={{
                width: `${percent}%`,
                minWidth: percent > 0 ? 6 : 0,
                background: segment.color,
                cursor: segment.onClick ? 'pointer' : 'default',
              }}
            />
          )
        })}
      </div>
      {showLegend ? (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {segments.map((segment) => (
            <div
              key={segment.key}
              onClick={segment.onClick}
              role={segment.onClick ? 'button' : undefined}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '8px 10px',
                borderRadius: 10,
                background: `${segment.color}10`,
                cursor: segment.onClick ? 'pointer' : 'default',
              }}
            >
              <Space size={8}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: segment.color,
                  }}
                />
                <Text>{segment.label}</Text>
              </Space>
              <Text strong>{toNumber(segment.value).toLocaleString()}</Text>
            </div>
          ))}
        </Space>
      ) : null}
    </Space>
  )
}

const NotificationStream = ({ items, onClick }) => {
  if (!items.length) {
    return <Empty description="暂无任务通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <List
      dataSource={items}
      renderItem={(item) => (
        <List.Item
          style={{ padding: '12px 0', cursor: 'pointer' }}
          onClick={() => onClick(item)}
        >
          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: item.color || '#1677ff',
                marginTop: 6,
                flexShrink: 0,
                boxShadow: `0 0 0 4px ${(item.color || '#1677ff')}18`,
              }}
            />
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <Space size={8} wrap>
                  <Text strong>{item.title}</Text>
                  <Tag color={item.tagColor || 'default'}>{item.tagLabel || '任务消息'}</Tag>
                </Space>
                <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {formatTimeAgo(item.created_at)}
                </Text>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {item.description}
              </Text>
            </div>
          </div>
        </List.Item>
      )}
    />
  )
}

const Dashboard = () => {
  const navigate = useNavigate()
  const dashboardTimerRef = useRef(null)
  const taskTimerRef = useRef(null)

  const [dashboard, setDashboard] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskPayload, setTaskPayload] = useState({
    tasks: [],
    total: 0,
    active_count: 0,
    summary_by_status: {},
    summary_by_category: {},
  })
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)

  const fetchDashboard = useCallback(async () => {
    setDashboardLoading(true)
    try {
      const statsRes = await getDashboardStats()
      setDashboard(statsRes?.success ? statsRes.data : null)
      setLastRefreshedAt(new Date())
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error)
      setDashboard(null)
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  const fetchActiveTasks = useCallback(async () => {
    setTaskLoading(true)
    try {
      const res = await getActiveTasks()
      if (res?.success && res?.data) {
        setTaskPayload({
          tasks: res.data.tasks || [],
          total: res.data.total || 0,
          active_count: res.data.active_count || 0,
          summary_by_status: res.data.summary_by_status || {},
          summary_by_category: res.data.summary_by_category || {},
        })
      } else {
        setTaskPayload({
          tasks: [],
          total: 0,
          active_count: 0,
          summary_by_status: {},
          summary_by_category: {},
        })
      }
    } catch (error) {
      console.error('Failed to fetch active tasks:', error)
      setTaskPayload({
        tasks: [],
        total: 0,
        active_count: 0,
        summary_by_status: {},
        summary_by_category: {},
      })
    } finally {
      setTaskLoading(false)
    }
  }, [])

  const refreshAll = useCallback(() => {
    fetchDashboard()
    fetchActiveTasks()
  }, [fetchDashboard, fetchActiveTasks])

  useEffect(() => {
    refreshAll()
    if (dashboardTimerRef.current) clearInterval(dashboardTimerRef.current)
    if (taskTimerRef.current) clearInterval(taskTimerRef.current)
    dashboardTimerRef.current = setInterval(fetchDashboard, 60000)
    taskTimerRef.current = setInterval(fetchActiveTasks, 15000)
    return () => {
      if (dashboardTimerRef.current) clearInterval(dashboardTimerRef.current)
      if (taskTimerRef.current) clearInterval(taskTimerRef.current)
    }
  }, [fetchDashboard, fetchActiveTasks, refreshAll])

  const navigateToFileList = useCallback((options = {}) => {
    const params = new URLSearchParams()
    params.set('tab', options.tab || 'all')
    if (options.taskStatus?.length) params.set('taskStatus', options.taskStatus.join(','))
    if (options.statusInfo?.length) params.set('statusInfo', options.statusInfo.join(','))
    if (options.q) params.set('q', options.q)
    if (options.openUpload) params.set('openUpload', '1')
    navigate(`/document/upload?${params.toString()}`)
  }, [navigate])

  const handleActivityClick = useCallback((activity) => {
    if (activity?.entity?.project_id) {
      navigate(`/research/projects/${activity.entity.project_id}`)
      return
    }
    if (activity?.entity?.patient_id) {
      navigate(`/patient/detail/${activity.entity.patient_id}`)
      return
    }
    if (activity?.entity?.document_id) {
      navigateToFileList({ tab: 'all' })
      return
    }
    if (activity?.type === 'crf') {
      navigate('/research/projects?tab=templates')
      return
    }
    navigate('/dashboard')
  }, [navigate, navigateToFileList])

  const overview = dashboard?.overview || {}
  const activities = (dashboard?.activities?.recent || []).slice(0, 6)
  const queueTasks = dashboard?.tasks?.queue || []
  const taskStatusCounts = dashboard?.documents?.task_status_counts || {}
  const activeTasks = taskPayload.tasks || []
  const parseTasks = useMemo(
    () => sortByStatusAndTime(activeTasks.filter((task) => task.task_category === 'parse')),
    [activeTasks]
  )

  const patientProjectDistribution = useMemo(() => {
    return dashboard?.patients?.project_distribution || []
  }, [dashboard?.patients?.project_distribution])

  const patientCompletenessDistribution = useMemo(() => {
    return dashboard?.patients?.completeness_distribution || []
  }, [dashboard?.patients?.completeness_distribution])

  const patientConflictDistribution = useMemo(() => {
    return dashboard?.patients?.conflict_distribution || []
  }, [dashboard?.patients?.conflict_distribution])

  const projectStatusDistribution = useMemo(() => {
    return dashboard?.projects?.status_distribution || []
  }, [dashboard?.projects?.status_distribution])

  const projectEnrollmentProgress = useMemo(() => {
    return dashboard?.projects?.enrollment_progress || []
  }, [dashboard?.projects?.enrollment_progress])

  const projectExtractionProgress = useMemo(() => {
    return dashboard?.projects?.extraction_progress || []
  }, [dashboard?.projects?.extraction_progress])

  const flowStages = useMemo(() => {
    const uploading = 0
    const uploadFailed = 0
    const parseProcessing = ['uploaded', 'parsing', 'parsed', 'extracted', 'ai_matching']
      .reduce((sum, key) => sum + toNumber(taskStatusCounts[key]), 0)
    const parseFailed = toNumber(taskStatusCounts.parse_failed)
    const todoSegments = [
      {
        key: 'pending_confirm_new',
        label: '需新建患者',
        value: toNumber(taskStatusCounts.pending_confirm_new),
        color: '#9254de',
        onClick: () => navigateToFileList({ tab: 'todo', statusInfo: ['pending_new'] }),
      },
      {
        key: 'pending_confirm_review',
        label: '自动推荐匹配',
        value: toNumber(taskStatusCounts.pending_confirm_review),
        color: '#fa8c16',
        onClick: () => navigateToFileList({ tab: 'todo', statusInfo: ['has_recommendation'] }),
      },
      {
        key: 'pending_confirm_uncertain',
        label: '多候选待确认',
        value: toNumber(taskStatusCounts.pending_confirm_uncertain),
        color: '#faad14',
        onClick: () => navigateToFileList({ tab: 'todo', statusInfo: ['has_recommendation'] }),
      },
      {
        key: 'auto_archived',
        label: '高置信推荐',
        value: toNumber(taskStatusCounts.auto_archived),
        color: '#13c2c2',
        onClick: () => navigateToFileList({ tab: 'todo', statusInfo: ['has_recommendation'] }),
      },
    ]
    const todoTotal = todoSegments.reduce((sum, item) => sum + item.value, 0)
    const archived = toNumber(taskStatusCounts.archived)

    return [
      {
        key: 'upload',
        label: '上传',
        total: uploading + uploadFailed,
        color: FLOW_STAGE_COLORS.upload,
        helper: '文件上传 / 失败重试',
        onClick: () => navigateToFileList({ tab: 'all', openUpload: true }),
        segments: [
          {
            key: 'uploading',
            label: '上传中',
            value: uploading,
            color: '#1677ff',
            onClick: () => navigateToFileList({ tab: 'all', statusInfo: ['uploading'] }),
          },
          {
            key: 'upload_failed',
            label: '上传失败',
            value: uploadFailed,
            color: '#ff4d4f',
            onClick: () => navigateToFileList({ tab: 'all', openUpload: true }),
          },
        ],
      },
      {
        key: 'parse',
        label: '解析 / 抽取',
        total: parseProcessing + parseFailed,
        color: FLOW_STAGE_COLORS.parse,
        helper: '解析失败 / 处理中',
        onClick: () => navigateToFileList({ tab: 'parse' }),
        segments: [
          {
            key: 'parse_processing',
            label: '解析中',
            value: parseProcessing,
            color: '#fa8c16',
            onClick: () => navigateToFileList({ tab: 'parse', taskStatus: ['processing'] }),
          },
          {
            key: 'parse_failed',
            label: '解析失败',
            value: parseFailed,
            color: '#ff4d4f',
            onClick: () => navigateToFileList({ tab: 'parse', statusInfo: ['parse_failed'] }),
          },
        ],
      },
      {
        key: 'todo',
        label: '匹配待确认',
        total: todoTotal,
        color: FLOW_STAGE_COLORS.todo,
        helper: '待归档 / 待确认',
        onClick: () => navigateToFileList({ tab: 'todo' }),
        segments: todoSegments,
      },
      {
        key: 'archived',
        label: '已归档',
        total: archived,
        color: FLOW_STAGE_COLORS.archived,
        helper: '已完成归档',
        onClick: () => navigateToFileList({ tab: 'archived' }),
        segments: [
          {
            key: 'archived_total',
            label: '已归档',
            value: archived,
            color: '#52c41a',
            onClick: () => navigateToFileList({ tab: 'archived' }),
          },
        ],
      },
    ]
  }, [navigateToFileList, taskStatusCounts])

  const flowStageDistribution = useMemo(() => (
    flowStages.map((stage) => ({
      key: stage.key,
      label: stage.label,
      value: stage.total,
      color: stage.color,
      onClick: stage.onClick,
    }))
  ), [flowStages])

  const notifications = useMemo(() => {
    const items = []

    queueTasks.forEach((item) => {
      const status = item.task_status
      if (status === 'parse_failed') {
        items.push({
          key: `doc-failed-${item.document_id}`,
          title: '文档解析失败',
          description: item.file_name || '未命名文档',
          created_at: item.created_at,
          kind: 'document_failed',
          tagLabel: '解析失败',
          tagColor: 'error',
          color: '#ff4d4f',
        })
      } else if (['pending_confirm_new', 'pending_confirm_review', 'pending_confirm_uncertain', 'auto_archived'].includes(status)) {
        items.push({
          key: `doc-todo-${item.document_id}`,
          title: '文档待归档确认',
          description: item.file_name || '未命名文档',
          created_at: item.created_at,
          kind: 'document_todo',
          tagLabel: '待归档',
          tagColor: 'processing',
          color: '#722ed1',
        })
      }
    })

    if (toNumber(overview.pending_field_conflicts) > 0) {
      items.push({
        key: 'patient-conflict',
        title: '患者字段冲突待处理',
        description: `${toNumber(overview.pending_field_conflicts)} 条冲突待解决`,
        created_at: lastRefreshedAt?.toISOString(),
        kind: 'patient_conflict',
        tagLabel: '字段冲突',
        tagColor: 'warning',
        color: '#faad14',
      })
    }

    parseTasks.forEach((task) => {
      items.push({
        key: `project-task-${task.task_id}`,
        title: task.status === 'failed' ? '项目抽取任务失败' : '项目抽取任务更新',
        description: task.file_name || task.current_step || task.message || 'CRF 抽取任务',
        created_at: task.updated_at || task.created_at,
        kind: 'project_task',
        projectId: task.project_id,
        tagLabel: task.status === 'failed' ? '抽取失败' : '抽取更新',
        tagColor: task.status === 'failed' ? 'error' : 'processing',
        color: task.status === 'failed' ? '#ff4d4f' : '#1677ff',
      })
    })

    return items
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 6)
  }, [lastRefreshedAt, overview.pending_field_conflicts, parseTasks, queueTasks])

  const handleNotificationClick = useCallback((item) => {
    if (item.kind === 'document_failed') {
      navigateToFileList({ tab: 'parse', taskStatus: ['parse_failed'] })
      return
    }
    if (item.kind === 'document_todo') {
      navigateToFileList({ tab: 'todo' })
      return
    }
    if (item.kind === 'patient_conflict') {
      navigate('/patient/pool')
      return
    }
    if (item.kind === 'project_task' && item.projectId) {
      navigate(`/research/projects/${item.projectId}`)
      return
    }
    navigate('/research/projects')
  }, [navigate, navigateToFileList])

  const quickActions = [
    {
      key: 'upload',
      title: '文件上传',
      description: '进入文件列表并直接打开上传',
      icon: <UploadOutlined style={{ color: '#10b981' }} />,
      onClick: () => navigateToFileList({ tab: 'all', openUpload: true }),
    },
    {
      key: 'patient',
      title: '新建患者',
      description: '进入患者池并直接打开新建弹窗',
      icon: <TeamOutlined style={{ color: '#6366f1' }} />,
      onClick: () => navigate('/patient/pool?openCreate=1'),
    },
    {
      key: 'project',
      title: '新建项目',
      description: '进入科研项目并直接打开新建向导',
      icon: <ExperimentOutlined style={{ color: '#f59e0b' }} />,
      onClick: () => navigate('/research/projects?openCreate=1'),
    },
    {
      key: 'crf',
      title: 'CRF 新建',
      description: '直达 CRF 表设计器新建模式',
      icon: <FormOutlined style={{ color: '#8b5cf6' }} />,
      onClick: () => navigate('/research/templates/create'),
    },
  ]

  const extractionSummary = dashboard?.tasks?.project_extraction_summary || {}
  const taskTodayCount = toNumber(extractionSummary.today) || parseTasks.filter((task) => isToday(task.created_at || task.updated_at)).length

  return (
    <div className="dashboard-workplace">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Space size={8} align="center">
          <Text type="secondary" style={{ fontSize: 12 }}>
            最近刷新：{lastRefreshedAt ? lastRefreshedAt.toLocaleString() : '—'}
          </Text>
          <Button icon={<ReloadOutlined />} loading={dashboardLoading} onClick={refreshAll}>
            刷新
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title="患者"
            value={toNumber(overview.patients_total)}
            delta={`${toNumber(dashboard?.patients?.recently_added_today)} 人`}
            icon={<TeamOutlined />}
            color="#6366f1"
            onClick={() => navigate('/patient/pool')}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title="文档"
            value={toNumber(overview.documents_total)}
            delta={`${toNumber(dashboard?.documents?.today_added)} 份`}
            icon={<FileTextOutlined />}
            color="#10b981"
            onClick={() => navigateToFileList({ tab: 'all' })}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title="项目"
            value={toNumber(overview.total_projects)}
            delta={`${toNumber(dashboard?.projects?.today_added)} 个`}
            icon={<ExperimentOutlined />}
            color="#f59e0b"
            onClick={() => navigate('/research/projects')}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title="任务"
            value={toNumber(extractionSummary.total) || parseTasks.length}
            delta={`${taskTodayCount} 批`}
            icon={<ProjectOutlined />}
            color="#1677ff"
            onClick={() => navigate('/research/projects')}
          />
        </Col>
      </Row>

      <Row gutter={[24, 24]}>
        <Col xl={16} lg={24} xs={24}>
          <SectionCard
            title="我的文档"
            subtitle="上传、解析、待归档与归档状态一屏查看"
          >
            <Card
              size="small"
              style={{ borderRadius: 14, marginBottom: 16, background: 'linear-gradient(180deg, #fafcff 0%, #fff 100%)' }}
              bodyStyle={{ padding: 16 }}
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <Text strong>流转总览</Text>
                  <Text type="secondary">按文档阶段分布，点击即可跳转</Text>
                </div>
                <SegmentedBar segments={flowStageDistribution} showLegend={false} height={14} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                  {flowStageDistribution.map((stage) => (
                    <div
                      key={stage.key}
                      onClick={stage.onClick}
                      role="button"
                      style={{
                        minWidth: 0,
                        cursor: 'pointer',
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 12 }}>{stage.label}</Text>
                      <div style={{ fontSize: 20, fontWeight: 700, color: stage.color }}>
                        {toNumber(stage.value).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </Space>
            </Card>
          </SectionCard>

          <SectionCard
            title="我的患者"
            subtitle="按项目关联、完整度和冲突状态查看患者分布"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => navigate('/patient/pool')}
                  style={{ borderRadius: 14, height: '100%' }}
                  title="关联项目患者分布"
                >
                  <MiniDonutChart items={patientProjectDistribution} showDetails={false} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => navigate('/patient/pool')}
                  style={{ borderRadius: 14, height: '100%' }}
                  title="信息完整度分布"
                >
                  <MiniDonutChart items={patientCompletenessDistribution} showDetails={false} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => navigate('/patient/pool')}
                  style={{ borderRadius: 14, height: '100%' }}
                  title="字段冲突"
                >
                  <MiniDonutChart items={patientConflictDistribution} emptyText="暂无冲突数据" showDetails={false} />
                </Card>
              </Col>
            </Row>
          </SectionCard>

          <SectionCard
            title="我的项目"
            subtitle="查看项目状态、入组进展和抽取任务分布"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={8}>
                <Card size="small" title="项目状态分布" style={{ borderRadius: 14, height: '100%' }}>
                  <MiniDonutChart items={projectStatusDistribution} emptyText="暂无项目数据" showDetails={false} />
                </Card>
              </Col>
              <Col xs={24} lg={8}>
                <Card size="small" title="项目入组进展" style={{ borderRadius: 14, height: '100%' }}>
                  {projectEnrollmentProgress.length ? (
                    <Space direction="vertical" size={14} style={{ width: '100%' }}>
                      {projectEnrollmentProgress.map((project) => {
                        const actual = toNumber(project.actual_patient_count)
                        const expected = project.expected_patient_count == null ? null : toNumber(project.expected_patient_count)
                        const percent = expected == null
                          ? 0
                          : clampPercent((actual / Math.max(expected, 1)) * 100)
                        return (
                          <div key={project.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/research/projects/${project.id}`)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                              <Text strong ellipsis style={{ maxWidth: '70%' }}>{project.name}</Text>
                              <Tag color={project.status_color || PROJECT_STATUS_META[project.status]?.color || 'default'}>
                                {project.status_label || PROJECT_STATUS_META[project.status]?.label || project.status}
                              </Tag>
                            </div>
                            <SegmentedBar
                              showLegend={false}
                              height={10}
                              segments={expected == null
                                ? [
                                  { key: 'actual', label: '已入组', value: actual, color: '#1677ff' },
                                ]
                                : [
                                  { key: 'actual', label: '已入组', value: actual, color: '#1677ff' },
                                  { key: 'remaining', label: '待入组', value: Math.max(expected - actual, 0), color: '#d9e8ff' },
                                ]}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {expected == null ? '未设置目标入组人数' : `进度 ${percent}%`}
                              </Text>
                              <Text strong style={{ fontSize: 12 }}>
                                {expected == null ? `${actual} 人` : `${actual}/${expected}`}
                              </Text>
                            </div>
                          </div>
                        )
                      })}
                    </Space>
                  ) : (
                    <Empty description="暂无项目数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={8}>
                <Card size="small" title="数据抽取统计" style={{ borderRadius: 14, height: '100%' }}>
                  {projectExtractionProgress.length ? (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      {projectExtractionProgress.map((project) => {
                        const remaining = Math.max(
                          toNumber(project.total) - toNumber(project.processing) - toNumber(project.completed) - toNumber(project.failed),
                          0
                        )
                        return (
                        <div key={project.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/research/projects/${project.id}`)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                            <Text strong ellipsis style={{ maxWidth: '70%' }}>{project.name}</Text>
                            <Text type="secondary">{project.total} 批</Text>
                          </div>
                          <SegmentedBar
                            showLegend={false}
                            height={10}
                            segments={[
                              { key: 'processing', label: '运行中', value: project.processing, color: '#1677ff' },
                              { key: 'completed', label: '已完成', value: project.completed, color: '#52c41a' },
                              { key: 'failed', label: '失败', value: project.failed, color: '#ff4d4f' },
                              { key: 'remaining', label: '未开始', value: remaining, color: '#f0f0f0' },
                            ]}
                          />
                          <Space wrap size={[6, 6]} style={{ marginTop: 8 }}>
                            <Tag color="processing">运行中 {project.processing}</Tag>
                            <Tag color="success">已完成 {project.completed}</Tag>
                            <Tag color="error">失败 {project.failed}</Tag>
                            {remaining > 0 ? <Tag>未开始 {remaining}</Tag> : null}
                          </Space>
                        </div>
                        )
                      })}
                    </Space>
                  ) : (
                    <Empty description="暂无抽取任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </Card>
              </Col>
            </Row>
          </SectionCard>
        </Col>

        <Col xl={8} lg={24} xs={24}>
          <SectionCard title="快捷入口" subtitle="直接进入下一步动作">
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {quickActions.map((action) => (
                <Card
                  key={action.key}
                  hoverable
                  onClick={action.onClick}
                  style={{ borderRadius: 14 }}
                  bodyStyle={{ padding: 14 }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ fontSize: 18 }}>{action.icon}</div>
                    <div style={{ minWidth: 0 }}>
                      <Text strong>{action.title}</Text>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>{action.description}</Text>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </Space>
          </SectionCard>

          <SectionCard
            title="最新任务通知"
            subtitle="解析失败、待归档确认、字段冲突和项目抽取任务"
            extra={<Button type="link" loading={taskLoading} onClick={fetchActiveTasks}>刷新</Button>}
          >
            <NotificationStream items={notifications} onClick={handleNotificationClick} />
          </SectionCard>

          <SectionCard
            title="最近活动"
            subtitle="保留当前记录能力与展示逻辑"
            extra={<Button type="link" onClick={fetchDashboard} loading={dashboardLoading}>刷新</Button>}
          >
            {activities.length ? (
              <List
                dataSource={activities}
                renderItem={(activity) => (
                  <List.Item
                    style={{ padding: '12px 0', cursor: 'pointer' }}
                    onClick={() => handleActivityClick(activity)}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <Text strong style={{ flex: 1 }}>{activity.title}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{formatTimeAgo(activity.created_at)}</Text>
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{activity.description || '—'}</Text>
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无活动" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </SectionCard>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
