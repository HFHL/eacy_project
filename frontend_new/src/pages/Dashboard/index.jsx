import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
  Space,
  Tag,
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
import { STATUS_COLORS } from '../../styles/colors'
import { getActiveTasks, getDashboardStats } from '../../api/stats'
import {
  dispatchRequestPatientCreate,
  dispatchRequestProjectCreate,
  dispatchRequestTemplateCreate,
} from '../../utils/createIntentEvents'
import { researchHome, researchProjectDetail } from '../../utils/researchPaths'
import {
  FlowFunnelChart,
  KpiCard,
  MiniDonutChart,
  NotificationStream,
  SectionCard,
  SegmentedBar,
} from './components'
import { DASHBOARD_COLORS, DASHBOARD_SIZES, FLOW_STAGE_COLORS } from './styleTokens'
import { clampPercent, formatTimeAgo, isToday, sortByStatusAndTime, toNumber } from './utils'
import { getProjectStatusMeta as getProjectStatusDisplayMeta } from '../../constants/projectStatusMeta'
import './dashboard.css'

const { Text } = Typography

const statusOrder = {
  processing: 0,
  initializing: 0,
  pending: 1,
  failed: 2,
  completed_with_errors: 3,
  completed: 4,
  cancelled: 5,
}

const SHOW_DASHBOARD_HINTS = false

const Dashboard = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const dashboardTimerRef = useRef(null)
  const taskTimerRef = useRef(null)
  const projectSectionRef = useRef(null)

  const [dashboard, setDashboard] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [taskLoading, setTaskLoading] = useState(false)
  const [projectSectionHeight, setProjectSectionHeight] = useState(null)
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
    dashboardTimerRef.current = setInterval(fetchDashboard, 60000)
    return () => {
      if (dashboardTimerRef.current) clearInterval(dashboardTimerRef.current)
    }
  }, [fetchDashboard, fetchActiveTasks, refreshAll])

  useEffect(() => {
    if (taskTimerRef.current) clearInterval(taskTimerRef.current)
    const pollInterval = toNumber(taskPayload.active_count) > 0 ? 15000 : 45000
    taskTimerRef.current = setInterval(fetchActiveTasks, pollInterval)
    return () => {
      if (taskTimerRef.current) clearInterval(taskTimerRef.current)
    }
  }, [fetchActiveTasks, taskPayload.active_count])

  useEffect(() => {
    if (!projectSectionRef.current || typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const nextHeight = Math.round(entry.contentRect.height)
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return
      setProjectSectionHeight((prev) => (prev === nextHeight ? prev : nextHeight))
    })
    observer.observe(projectSectionRef.current)
    return () => observer.disconnect()
  }, [])

  const navigateToFileList = useCallback((options = {}) => {
    if (options.openUpload) {
      navigate('/document/upload')
      return
    }
    const params = new URLSearchParams()
    params.set('tab', options.tab || 'all')
    if (options.taskStatus?.length) params.set('taskStatus', options.taskStatus.join(','))
    if (options.statusInfo?.length) params.set('statusInfo', options.statusInfo.join(','))
    if (options.q) params.set('q', options.q)
    navigate(`/document/file-list?${params.toString()}`)
  }, [navigate])

  const handleActivityClick = useCallback((activity) => {
    if (activity?.entity?.project_id) {
      navigate(researchProjectDetail(activity.entity.project_id))
      return
    }
    if (activity?.entity?.patient_id) {
      navigate(`/patient/detail/${activity.entity.patient_id}`, {
        state: { from: `${location.pathname}${location.search || ''}` }
      })
      return
    }
    if (activity?.entity?.document_id) {
      navigateToFileList({ tab: 'all' })
      return
    }
    if (activity?.type === 'crf') {
      dispatchRequestTemplateCreate()
      return
    }
    navigate('/dashboard')
  }, [location.pathname, location.search, navigate, navigateToFileList])

  const overview = dashboard?.overview || {}
  const activities = (dashboard?.activities?.recent || []).slice(0, 6)
  const queueTasks = dashboard?.tasks?.queue || []
  const taskStatusCounts = dashboard?.documents?.task_status_counts || {}
  const activeTasks = taskPayload.tasks || []
  const parseTasks = useMemo(
    () => sortByStatusAndTime(activeTasks.filter((task) => task.task_category === 'parse'), statusOrder),
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
        color: FLOW_STAGE_COLORS.todo,
        onClick: () => navigateToFileList({ tab: 'todo', statusInfo: ['pending_new'] }),
      },
      {
        key: 'pending_confirm_review',
        label: '自动推荐匹配',
        value: toNumber(taskStatusCounts.pending_confirm_review),
        color: DASHBOARD_COLORS.warning,
        onClick: () => navigateToFileList({ tab: 'todo', statusInfo: ['has_recommendation'] }),
      },
      {
        key: 'pending_confirm_uncertain',
        label: '多候选待确认',
        value: toNumber(taskStatusCounts.pending_confirm_uncertain),
        color: DASHBOARD_COLORS.warning,
        onClick: () => navigateToFileList({ tab: 'todo', statusInfo: ['has_recommendation'] }),
      },
      {
        key: 'auto_archived',
        label: '高置信推荐',
        value: toNumber(taskStatusCounts.auto_archived),
        color: DASHBOARD_COLORS.success,
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
            color: DASHBOARD_COLORS.primary,
            onClick: () => navigateToFileList({ tab: 'all', statusInfo: ['uploading'] }),
          },
          {
            key: 'upload_failed',
            label: '上传失败',
            value: uploadFailed,
            color: DASHBOARD_COLORS.error,
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
            color: FLOW_STAGE_COLORS.parse,
            onClick: () => navigateToFileList({ tab: 'parse', taskStatus: ['processing'] }),
          },
          {
            key: 'parse_failed',
            label: '解析失败',
            value: parseFailed,
            color: DASHBOARD_COLORS.error,
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
            color: DASHBOARD_COLORS.success,
            onClick: () => navigateToFileList({ tab: 'archived' }),
          },
        ],
      },
    ]
  }, [navigateToFileList, taskStatusCounts])

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
          color: DASHBOARD_COLORS.error,
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
          color: FLOW_STAGE_COLORS.todo,
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
        color: DASHBOARD_COLORS.warning,
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
        color: task.status === 'failed' ? DASHBOARD_COLORS.error : DASHBOARD_COLORS.primary,
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
      navigate(researchProjectDetail(item.projectId))
      return
    }
    navigate(researchHome())
  }, [navigate, navigateToFileList])

  const quickActions = [
    {
      key: 'upload',
      title: '文件上传',
      description: '进入文档上传中心',
      icon: <UploadOutlined />,
      onClick: () => navigate('/document/upload'),
    },
    {
      key: 'patient',
      title: '新建患者',
      description: '进入患者池并直接打开新建弹窗',
      icon: <TeamOutlined />,
      onClick: () => dispatchRequestPatientCreate(),
    },
    {
      key: 'project',
      title: '新建项目',
      description: '进入科研项目并直接打开新建向导',
      icon: <ExperimentOutlined />,
      onClick: () => dispatchRequestProjectCreate(),
    },
    {
      key: 'crf',
      title: 'CRF 新建',
      description: '直达 CRF 表设计器新建模式',
      icon: <FormOutlined />,
      onClick: () => dispatchRequestTemplateCreate(),
    },
  ]

  const extractionSummary = dashboard?.tasks?.project_extraction_summary || {}
  const taskTodayCount = toNumber(extractionSummary.today) || parseTasks.filter((task) => isToday(task.created_at || task.updated_at)).length

  return (
    <div className="dashboard-workplace">
      <div className="dashboard-toolbar">
        <Space size={8} align="center">
          <Text type="secondary" style={{ fontSize: 12 }}>
            最近刷新：{lastRefreshedAt ? lastRefreshedAt.toLocaleString() : '—'}
          </Text>
          <Button icon={<ReloadOutlined />} loading={dashboardLoading} onClick={refreshAll}>
            刷新
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} className="dashboard-kpi-row">
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title="患者"
            value={toNumber(overview.patients_total)}
            delta={`${toNumber(dashboard?.patients?.recently_added_today)} 人`}
            icon={<TeamOutlined />}
            color={DASHBOARD_COLORS.patient}
            onClick={() => navigate('/patient/pool')}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title="文档"
            value={toNumber(overview.documents_total)}
            delta={`${toNumber(dashboard?.documents?.today_added)} 份`}
            icon={<FileTextOutlined />}
            color={DASHBOARD_COLORS.document}
            onClick={() => navigateToFileList({ tab: 'all' })}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title="项目"
            value={toNumber(overview.total_projects)}
            delta={`${toNumber(dashboard?.projects?.today_added)} 个`}
            icon={<ExperimentOutlined />}
            color={DASHBOARD_COLORS.project}
            onClick={() => navigate(researchHome())}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title="任务"
            value={toNumber(extractionSummary.total) || parseTasks.length}
            delta={`${taskTodayCount} 批`}
            icon={<ProjectOutlined />}
            color={DASHBOARD_COLORS.task}
            onClick={() => navigate(researchHome())}
          />
        </Col>
      </Row>

      <Row gutter={[24, 24]}>
        <Col xl={18} lg={24} xs={24} className="dashboard-main-column">
          <SectionCard
            title="我的文档"
            className="dashboard-doc-section-card"
            subtitle={SHOW_DASHBOARD_HINTS ? '上传、解析、待归档与归档状态一屏查看' : undefined}
          >
            <Card
              size="small"
              className="dashboard-doc-overview-card"
              style={{ borderRadius: DASHBOARD_SIZES.cardRadius }}
              styles={{ body: { padding: 16 } }}
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <Text strong>流转总览</Text>
                  {SHOW_DASHBOARD_HINTS ? <Text type="secondary">按文档阶段分布，点击即可跳转</Text> : null}
                </div>
                <FlowFunnelChart stages={flowStages} />
              </Space>
            </Card>
          </SectionCard>

          <SectionCard
            title="我的患者"
            className="dashboard-patient-section-card"
            subtitle={SHOW_DASHBOARD_HINTS ? '按项目关联、完整度和冲突状态查看患者分布' : undefined}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => navigate('/patient/pool')}
                  className="dashboard-patient-card"
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
                  className="dashboard-patient-card"
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
                  className="dashboard-patient-card"
                  title="字段冲突"
                >
                  <MiniDonutChart items={patientConflictDistribution} emptyText="暂无冲突数据" showDetails={false} />
                </Card>
              </Col>
            </Row>
          </SectionCard>

          <div ref={projectSectionRef}>
            <SectionCard
              title="我的项目"
              subtitle={SHOW_DASHBOARD_HINTS ? '查看项目状态、入组进展和抽取任务分布' : undefined}
            >
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={8}>
                  <Card
                    size="small"
                    title="项目状态分布"
                    hoverable
                    onClick={() => navigate(researchHome())}
                    className="dashboard-project-card"
                  >
                    <MiniDonutChart items={projectStatusDistribution} emptyText="暂无项目数据" showDetails={false} />
                  </Card>
                </Col>
                <Col xs={24} lg={8}>
                  <Card size="small" title="项目入组进展" className="dashboard-project-card">
                    {projectEnrollmentProgress.length ? (
                      <Space direction="vertical" size={14} style={{ width: '100%' }}>
                        {projectEnrollmentProgress.map((project) => {
                          const statusMeta = getProjectStatusDisplayMeta(project.status)
                          const actual = toNumber(project.actual_patient_count)
                          const expected = project.expected_patient_count == null ? null : toNumber(project.expected_patient_count)
                          const percent = expected == null
                            ? 0
                            : clampPercent((actual / Math.max(expected, 1)) * 100)
                          return (
                            <div key={project.id} style={{ cursor: 'pointer' }} onClick={() => navigate(researchProjectDetail(project.id))}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                                <Text strong ellipsis style={{ maxWidth: '70%' }}>{project.name}</Text>
                                <Tag color={project.status_color || statusMeta.color}>
                                  {project.status_label || statusMeta.label}
                                </Tag>
                              </div>
                              <SegmentedBar
                                showLegend={false}
                                height={10}
                                segments={expected == null
                                  ? [
                                    { key: 'actual', label: '已入组', value: actual, color: DASHBOARD_COLORS.primary },
                                  ]
                                  : [
                                    { key: 'actual', label: '已入组', value: actual, color: DASHBOARD_COLORS.primary },
                                    { key: 'remaining', label: '待入组', value: Math.max(expected - actual, 0), color: STATUS_COLORS.warning.border },
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
                  <Card size="small" title="数据抽取统计" className="dashboard-project-card">
                    {projectExtractionProgress.length ? (
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        {projectExtractionProgress.map((project) => {
                          const remaining = Math.max(
                            toNumber(project.total) - toNumber(project.processing) - toNumber(project.completed) - toNumber(project.failed),
                            0
                          )
                          return (
                          <div key={project.id} style={{ cursor: 'pointer' }} onClick={() => navigate(researchProjectDetail(project.id))}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                              <Text strong ellipsis style={{ maxWidth: '70%' }}>{project.name}</Text>
                              <Text type="secondary">{project.total} 批</Text>
                            </div>
                            <SegmentedBar
                              showLegend={false}
                              height={10}
                              segments={[
                                { key: 'processing', label: '运行中', value: project.processing, color: DASHBOARD_COLORS.primary },
                                { key: 'completed', label: '已完成', value: project.completed, color: DASHBOARD_COLORS.success },
                                { key: 'failed', label: '失败', value: project.failed, color: DASHBOARD_COLORS.error },
                                { key: 'remaining', label: '未开始', value: remaining, color: DASHBOARD_COLORS.border },
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
          </div>
        </Col>

        <Col xl={6} lg={24} xs={24} className="dashboard-side-column">
          <SectionCard
            title="快捷入口"
            className="dashboard-quick-actions-section-card"
            subtitle={SHOW_DASHBOARD_HINTS ? '直接进入下一步动作' : undefined}
          >
            <div className="dashboard-action-grid">
              {quickActions.map((action) => (
                <Card
                  key={action.key}
                  hoverable
                  onClick={action.onClick}
                  className="dashboard-action-card"
                  styles={{ body: { padding: 12 } }}
                >
                  <div className="dashboard-action-content">
                    <div className="dashboard-action-icon">{action.icon}</div>
                    <Text strong className="dashboard-action-title">{action.title}</Text>
                  </div>
                </Card>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="审核通知"
            className="dashboard-review-section-card"
            subtitle={SHOW_DASHBOARD_HINTS ? '解析失败、待归档确认、字段冲突和项目抽取任务' : undefined}
            extra={<Button type="link" loading={taskLoading} onClick={fetchActiveTasks}>刷新</Button>}
          >
            <NotificationStream items={notifications} onClick={handleNotificationClick} />
          </SectionCard>

          <SectionCard
            title="最近活动"
            className="dashboard-activity-section-card"
            subtitle={SHOW_DASHBOARD_HINTS ? '保留当前记录能力与展示逻辑' : undefined}
            extra={<Button type="link" onClick={fetchDashboard} loading={dashboardLoading}>刷新</Button>}
            style={projectSectionHeight ? { height: projectSectionHeight } : undefined}
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
