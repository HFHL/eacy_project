import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useMatches, useNavigate, Navigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import {
  Layout,
  Avatar,
  Badge,
  Button,
  Divider,
  Dropdown,
  Empty,
  Form,
  Input,
  Menu,
  Modal,
  message,
  Popover,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DashboardOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  FileOutlined,
  FileTextOutlined,
  FlagOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ManOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  SortAscendingOutlined,
  TeamOutlined,
  UploadOutlined,
  UserOutlined,
  WomanOutlined,
} from '@ant-design/icons'
import { toggleSider, setActiveMenuKey, setBreadcrumbs, setSiderCollapsed } from '../../store/slices/uiSlice'
import { logout } from '../../store/slices/userSlice'
import { logout as logoutApi } from '../../api/auth'
import { batchDeletePatients, getPatientList } from '../../api/patient'
import { getDocumentList, getFileListV2Tree } from '../../api/document'
import { deleteProject, getProjects } from '../../api/project'
import { getCRFTemplate, getCRFTemplates, deleteCrfTemplate } from '../../api/crfTemplate'
import NotificationBell from './NotificationBell'
import {
  PAGE_SEARCH_ENTRIES,
  PRIMARY_NAV_CONFIG,
  PRIMARY_NAV_ORDER,
  isResearchDesignerRoute,
  resolveActiveMenuKey,
  resolveFallbackBreadcrumbs,
  resolvePrimaryNavKey,
} from './layoutShellConfig'
import {
  getDefaultResearchPaneHeight,
  isResearchPaneHeightRestorable,
  shouldAcceptResearchContainerHeight,
} from './researchRailLayout'
import { getPatientRailDisplayName } from './patientRailDisplay'
import { pickMostRecentlyUpdatedItem } from '../../utils/researchProjectSelection'
import PatientCreateModal from '../Patient/PatientCreateModal'
import ProjectCreateWizardModal from '../Research/ProjectCreateWizardModal'
import TemplateMetaModal from '../Research/TemplateMetaModal'
import {
  researchHome,
  researchProjectDetail,
  researchProjectTemplateEdit,
  templateCreate,
  templateView,
} from '../../utils/researchPaths'
import {
  REQUEST_PATIENT_CREATE_EVENT,
  REQUEST_PROJECT_CREATE_EVENT,
  dispatchRequestProjectEdit,
  REQUEST_TEMPLATE_CREATE_EVENT,
} from '../../utils/createIntentEvents'
import { storePendingTemplateCreateFlow } from '../../utils/templateCreateFlow'
import {
  PROJECT_STATUS_KEYS,
  getProjectStatusMeta as getProjectStatusDisplayMeta,
} from '../../constants/projectStatusMeta'

const { Header, Content, Sider } = Layout
const { Text } = Typography

const searchIconMap = {
  admin: <SettingOutlined />,
  dashboard: <DashboardOutlined />,
  document: <FileTextOutlined />,
  patient: <TeamOutlined />,
  research: <ExperimentOutlined />,
  settings: <SettingOutlined />,
  upload: <UploadOutlined />,
  user: <UserOutlined />,
}

const projectStatusIconMap = {
  [PROJECT_STATUS_KEYS.planning]: <ClockCircleOutlined />,
  [PROJECT_STATUS_KEYS.active]: <CheckCircleOutlined />,
  [PROJECT_STATUS_KEYS.paused]: <PauseCircleOutlined />,
  [PROJECT_STATUS_KEYS.completed]: <FlagOutlined />,
}

const CONTEXT_RAIL_WIDTH = 248
const CONTEXT_RAIL_COLLAPSED_WIDTH = 56
const RESEARCH_SPLITTER_STORAGE_KEY = 'research:rail:project-pane-height'
const RESEARCH_SPLITTER_USER_ADJUSTED_STORAGE_KEY = 'research:rail:project-pane-height:user-adjusted'
const RESEARCH_SPLITTER_HANDLE_HEIGHT = 10
const RESEARCH_PANE_MIN_HEIGHT = 56
const RESEARCH_PANE_DEFAULT_HEIGHT = 220
const RESEARCH_PANE_STORED_MAX_HEIGHT = 2000
const RESEARCH_RETURN_FROM_TEMPLATE_KEY = 'research:return-from-template-once'
const RESEARCH_OPEN_TEMPLATE_META_KEY = 'research:open-template-meta'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * 将数值限制在给定区间内。
 *
 * @param {number} value 待限制的值
 * @param {number} min 最小值
 * @param {number} max 最大值
 * @returns {number} 限制后的值
 */
const clampNumber = (value, min, max) => {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * 判断给定值是否为 UUID 字符串。
 *
 * @param {unknown} value 待判断值
 * @returns {boolean} 是否为 UUID
 */
const isUuidString = (value) => {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim())
}

/**
 * 获取性别图标与文案。
 *
 * @param {string} gender 性别文本
 * @returns {{label: string, icon: React.ReactNode}}
 */
const getGenderMeta = (gender) => {
  const normalized = String(gender || '').trim()
  if (normalized === '男') return { label: '男', icon: <ManOutlined /> }
  if (normalized === '女') return { label: '女', icon: <WomanOutlined /> }
  return { label: normalized || '未知', icon: <QuestionCircleOutlined /> }
}

/**
 * 获取项目状态图标、文案与色值。
 *
 * @param {string} status 项目状态
 * @returns {{label: string, icon: React.ReactNode, color: string}}
 */
const getProjectStatusMeta = (status) => {
  const displayMeta = getProjectStatusDisplayMeta(status)
  return {
    ...displayMeta,
    icon: projectStatusIconMap[displayMeta.key] || <QuestionCircleOutlined />,
  }
}

/**
 * 将科研项目接口结果映射为 rail 可消费的轻量结构。
 *
 * @param {Array} items 原始项目列表
 * @param {string} keyword 搜索词
 * @param {string} sortMode 排序模式
 * @returns {Array} 简化后的展示项
 */
const mapProjectRailItems = (items = [], keyword = '', sortMode = 'updated_desc') => {
  const normalizedKeyword = keyword.trim().toLowerCase()
  return items
    .map((item) => ({
      id: item.id,
      name: item.project_name || '未命名项目',
      status: item.status || '',
      statusLabel: item.status_label || '',
      statusColor: item.status_color || '',
      patientCount: Number(item.actual_patient_count || 0),
      avgCompleteness: Number(item.avg_completeness || 0),
      updatedAt: item.updated_at || '',
    }))
    .filter((item) => {
      if (!normalizedKeyword) return true
      return item.name.toLowerCase().includes(normalizedKeyword)
    })
    .sort((left, right) => {
      if (sortMode === 'name_asc') {
        return left.name.localeCompare(right.name, 'zh-Hans-CN')
      }
      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    })
}

/**
 * 将 CRF 模板接口结果映射为 rail 可消费的轻量结构。
 *
 * @param {Array} items 原始模板列表
 * @param {string} keyword 搜索词
 * @param {string} sortMode 排序模式
 * @returns {Array} 简化后的展示项
 */
const mapTemplateRailItems = (items = [], keyword = '', sortMode = 'updated_desc') => {
  const normalizedKeyword = keyword.trim().toLowerCase()
  return items
    .map((item) => {
      const routeIdRaw = item.id || item.template_id || item.template_code
      const routeId = routeIdRaw != null ? String(routeIdRaw) : ''
      const backendIdRaw = item.id || item.template_id || null
      const backendId = isUuidString(backendIdRaw) ? String(backendIdRaw).trim() : null
      const isDatabaseTemplate = item.source === 'database'
      return ({
        id: routeId,
        backendId,
        name: item.template_name || item.name || '未命名模板',
        category: item.category || '',
        source: item.source || '',
        isSystem: Boolean(item.is_system),
        deletable: isDatabaseTemplate && !Boolean(item.is_system) && Boolean(routeId),
        isPublished: typeof item.is_published === 'boolean' ? item.is_published : null,
        fieldGroupsCount: Array.isArray(item.field_groups)
          ? item.field_groups.length
          : (item.field_count != null ? Number(item.field_count) : null),
        updatedAt: item.updated_at || item.updatedAt || '',
      })
    })
    .filter((item) => item.id)
    .filter((item) => !normalizedKeyword || item.name.toLowerCase().includes(normalizedKeyword))
    .sort((left, right) => {
      if (sortMode === 'name_asc') {
        return left.name.localeCompare(right.name, 'zh-Hans-CN')
      }
      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    })
}

const MainLayout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const matches = useMatches()
  const dispatch = useDispatch()
  const { token } = theme.useToken()
  
  const { siderCollapsed } = useSelector((state) => state.ui.layout)
  const { userInfo, isAuthenticated } = useSelector((state) => state.user)
  const isAdminUser = userInfo?.role === 'admin' || (Array.isArray(userInfo?.permissions) && userInfo.permissions.includes('*'))
  
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState({ patients: [], documents: [], pages: [] })
  const [documentCounts, setDocumentCounts] = useState({ all: 0, parse: 0, todo: 0, archived: 0 })
  const [patientRailSearch, setPatientRailSearch] = useState('')
  const [patientRailSort, setPatientRailSort] = useState('updated_desc')
  const [patientRailLoading, setPatientRailLoading] = useState(false)
  const [patientRailItems, setPatientRailItems] = useState([])
  const [researchProjectSearch, setResearchProjectSearch] = useState('')
  const [researchProjectSort, setResearchProjectSort] = useState('updated_desc')
  const [researchProjectLoading, setResearchProjectLoading] = useState(false)
  const [researchProjectItems, setResearchProjectItems] = useState([])
  const [researchTemplateSearch, setResearchTemplateSearch] = useState('')
  const [researchTemplateSort, setResearchTemplateSort] = useState('updated_desc')
  const [researchTemplateLoading, setResearchTemplateLoading] = useState(false)
  const [researchTemplateItems, setResearchTemplateItems] = useState([])
  const [deletingTemplateId, setDeletingTemplateId] = useState('')
  const [researchProjectPaneHeight, setResearchProjectPaneHeight] = useState(null)
  const [researchRailContainerHeight, setResearchRailContainerHeight] = useState(0)
  const [isResearchSplitterDragging, setIsResearchSplitterDragging] = useState(false)
  const [hasUserAdjustedResearchPane, setHasUserAdjustedResearchPane] = useState(false)
  const [researchPanePreferenceHydrated, setResearchPanePreferenceHydrated] = useState(false)
  const [hoveredRailCardKey, setHoveredRailCardKey] = useState('')
  const [deletingProjectId, setDeletingProjectId] = useState('')
  const [activeToolbarPanel, setActiveToolbarPanel] = useState('')
  const [patientCreateVisible, setPatientCreateVisible] = useState(false)
  const [projectCreateVisible, setProjectCreateVisible] = useState(false)
  const [templateCreateVisible, setTemplateCreateVisible] = useState(false)
  const [templateCreateForm] = Form.useForm()
  const searchTimerRef = useRef(null)
  const searchInputRef = useRef(null)
  const researchRailContainerRef = useRef(null)
  const [deletingPatientId, setDeletingPatientId] = useState('')
  const activePatientId = useMemo(() => {
    const match = location.pathname.match(/^\/patient\/detail\/([^/]+)/)
    return match?.[1] || null
  }, [location.pathname])

  /**
   * 通知患者详情页刷新数据。
   *
   * @param {string|number} patientId 患者 ID
   * @returns {void}
   */
  const triggerPatientDetailRefresh = useCallback((patientId) => {
    if (typeof window === 'undefined' || !patientId) return
    window.dispatchEvent(new CustomEvent('patient-detail-refresh', { detail: { patientId: String(patientId) } }))
  }, [])

  /**
   * 刷新患者 rail 数据。
   *
   * @returns {Promise<void>}
   */
  const refreshPatientRail = useCallback(async () => {
    setPatientRailLoading(true)
    try {
      const params = { page: 1, page_size: 24 }
      if (patientRailSearch.trim()) params.search = patientRailSearch.trim()
      const response = await getPatientList(params)
      if (!response?.success) {
        setPatientRailItems([])
        return
      }
      const rawItems = Array.isArray(response?.data?.items) ? response.data.items : (Array.isArray(response?.data) ? response.data : [])
      const mapped = rawItems
        .map((item) => ({
          id: item.id,
          name: item.name || '未命名患者',
          gender: item.gender || '',
          age: item.age,
          diagnosis: Array.isArray(item.diagnosis) ? item.diagnosis.filter(Boolean).slice(0, 1).join('；') : (item.diagnosis || ''),
          documentCount: Number(item.document_count || 0),
          projectsCount: Array.isArray(item.projects) ? item.projects.length : 0,
          updatedAt: item.updated_at || '',
        }))
        .sort((left, right) => {
          if (patientRailSort === 'name_asc') {
            return left.name.localeCompare(right.name, 'zh-Hans-CN')
          }
          return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
        })
      setPatientRailItems(mapped)
    } catch {
      setPatientRailItems([])
    } finally {
      setPatientRailLoading(false)
    }
  }, [patientRailSearch, patientRailSort])

  /**
   * 删除患者（含关联项目检查与确认）。
   *
   * @param {{id: string, name: string}} patient 患者数据
   * @returns {Promise<void>}
   */
  const handleDeletePatientFromRail = useCallback((patient) => {
    if (!patient?.id) return

    Modal.confirm({
      title: '确认删除患者',
      content: (
        <div>
          <p>确定删除患者「{patient.name || '未命名患者'}」吗？此操作不可恢复。</p>
          <p style={{ color: token.colorWarning, marginBottom: 0 }}>关联文档会一并删除，关联科研项目会自动退组。</p>
        </div>
      ),
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingPatientId(String(patient.id))
        try {
          const response = await batchDeletePatients({ patient_ids: [patient.id] })
          if (!response?.success) {
            message.error(response?.message || '删除失败，请稍后重试')
            return
          }
          const successCount = Number(response?.data?.success_count || 0)
          if (successCount > 0) {
            message.success('患者删除成功')
          } else {
            message.warning(response?.message || '删除未生效，请刷新后重试')
          }
          await refreshPatientRail()
          if (String(activePatientId) === String(patient.id)) {
            navigate('/patient/pool')
          }
        } catch (error) {
          console.error('删除患者失败:', error)
          message.error(error?.message || '删除患者失败')
          throw error
        } finally {
          setDeletingPatientId('')
        }
      },
    })
  }, [activePatientId, navigate, refreshPatientRail, token.colorWarning])

  const pageEntries = useMemo(
    () => PAGE_SEARCH_ENTRIES.map((entry) => ({ ...entry, icon: searchIconMap[entry.iconKey] || <FileOutlined /> })),
    []
  )
  const activePrimaryNavKey = useMemo(() => resolvePrimaryNavKey(location.pathname), [location.pathname])
  const showContextRail = useMemo(() => {
    if (!['document', 'patient', 'research'].includes(activePrimaryNavKey)) return false
    if (activePrimaryNavKey === 'research' && isResearchDesignerRoute(location.pathname)) return false
    return true
  }, [activePrimaryNavKey, location.pathname])

  const activeResearchProjectId = useMemo(() => {
    const match = location.pathname.match(/^\/research\/projects\/([^/]+)/)
    if (!match?.[1] || match[1] === 'projects') return null
    return match[1]
  }, [location.pathname])

  /**
   * 刷新科研项目 rail 数据。
   *
   * @returns {Promise<void>}
   */
  const refreshResearchProjectRail = useCallback(async () => {
    setResearchProjectLoading(true)
    try {
      const projectResponse = await getProjects({ page: 1, page_size: 100 }).catch(() => null)
      const projectRaw = Array.isArray(projectResponse?.data)
        ? projectResponse.data
        : (Array.isArray(projectResponse?.data?.items) ? projectResponse.data.items : [])
      setResearchProjectItems(mapProjectRailItems(projectRaw, researchProjectSearch, researchProjectSort))
    } finally {
      setResearchProjectLoading(false)
    }
  }, [researchProjectSearch, researchProjectSort])

  /**
   * 刷新科研模板 rail 数据。
   *
   * @returns {Promise<void>}
   */
  const refreshResearchTemplateRail = useCallback(async () => {
    setResearchTemplateLoading(true)
    try {
      const templateResponse = await getCRFTemplates().catch(() => null)
      const templateRaw = Array.isArray(templateResponse?.data)
        ? templateResponse.data
        : (Array.isArray(templateResponse?.data?.items) ? templateResponse.data.items : [])
      setResearchTemplateItems(mapTemplateRailItems(templateRaw, researchTemplateSearch, researchTemplateSort))
    } finally {
      setResearchTemplateLoading(false)
    }
  }, [researchTemplateSearch, researchTemplateSort])

  /**
   * 跳转到首位患者详情；若无患者则进入患者空状态页。
   *
   * @returns {Promise<void>}
   */
  const goFirstPatientDetail = useCallback(async () => {
    try {
      const response = await getPatientList({ page: 1, page_size: 50 })
      const items = Array.isArray(response?.data?.items)
        ? response.data.items
        : (Array.isArray(response?.data) ? response.data : [])
      const first = [...items].sort((left, right) => {
        const leftTs = new Date(left?.updated_at || left?.created_at || 0).getTime()
        const rightTs = new Date(right?.updated_at || right?.created_at || 0).getTime()
        return rightTs - leftTs
      })[0]
      if (first?.id) {
        navigate(`/patient/detail/${first.id}`, { state: { from: '/patient/pool' } })
        return
      }
      navigate('/patient/pool?emptyState=patient')
    } catch {
      message.error('获取患者列表失败，请稍后重试')
      navigate('/patient/pool?emptyState=patient')
    }
  }, [navigate])

  /**
   * 跳转到首个科研项目详情；若无项目则进入项目空状态页。
   *
   * @returns {Promise<void>}
   */
  const goFirstProjectDetail = useCallback(async () => {
    try {
      const response = await getProjects({ page: 1, page_size: 50 })
      const items = Array.isArray(response?.data?.items)
        ? response.data.items
        : (Array.isArray(response?.data) ? response.data : [])
      const first = pickMostRecentlyUpdatedItem(items, [
        (item) => item.updated_at,
        (item) => item.created_at,
      ])
      if (first?.id) {
        navigate(researchProjectDetail(first.id))
        return
      }
      navigate(`${researchHome()}?emptyState=project`)
    } catch {
      message.error('获取科研项目失败，请稍后重试')
      navigate(`${researchHome()}?emptyState=project`)
    }
  }, [navigate])

  /**
   * 打开“新建患者”流程：
   * - 若已在患者域，保持当前背景页直接开窗；
   * - 否则先进入患者域默认加载态，再开窗。
   *
   * @returns {Promise<void>}
   */
  const openCreatePatientFlow = useCallback(async () => {
    const inPatientDomain = location.pathname.startsWith('/patient/')
    if (!inPatientDomain) {
      await goFirstPatientDetail()
    }
    setPatientCreateVisible(true)
  }, [goFirstPatientDetail, location.pathname])

  /**
   * 打开“新建项目”流程：
   * - 若已在科研域，保持当前背景页直接开窗；
   * - 否则先进入科研域默认加载态，再开窗。
   *
   * @returns {Promise<void>}
   */
  const openCreateProjectFlow = useCallback(async () => {
    const inResearchDomain = location.pathname.startsWith('/research/')
    if (!inResearchDomain) {
      await goFirstProjectDetail()
    }
    setProjectCreateVisible(true)
  }, [goFirstProjectDetail, location.pathname])

  /**
   * 打开“新建模板”流程：
   * - 保持当前背景页不变，仅弹出模板信息弹窗
   * - 确认后再进入模板设计页
   *
   * @returns {void}
   */
  const openCreateTemplateFlow = useCallback(() => {
    setTemplateCreateVisible(true)
  }, [])

  /**
   * 跳转到首个 CRF 模板；若无模板则进入模板空状态页。
   *
   * @returns {Promise<void>}
   */
  const goFirstTemplateView = useCallback(async () => {
    try {
      const response = await getCRFTemplates()
      const items = Array.isArray(response?.data)
        ? response.data
        : (Array.isArray(response?.data?.items) ? response.data.items : [])
      const first = [...items].sort((left, right) => {
        const leftTs = new Date(left?.updated_at || left?.created_at || left?.updatedAt || 0).getTime()
        const rightTs = new Date(right?.updated_at || right?.created_at || right?.updatedAt || 0).getTime()
        return rightTs - leftTs
      })[0]
      const firstId = first?.id || first?.template_id
      if (firstId) {
        navigate(templateView(firstId))
        return
      }
      openCreateTemplateFlow()
    } catch {
      message.error('获取模板列表失败，请稍后重试')
      openCreateTemplateFlow()
    }
  }, [navigate, openCreateTemplateFlow])

  const activeResearchTemplateId = useMemo(() => {
    const match = location.pathname.match(/^\/research\/templates\/([^/]+)/)
    return match?.[1] || null
  }, [location.pathname])

  /**
   * 计算科研侧栏上下区域可用高度边界。
   *
   * @returns {{min: number, max: number, total: number}}
   */
  const researchPaneBounds = useMemo(() => {
    if (!Number.isFinite(researchRailContainerHeight) || researchRailContainerHeight <= 0) {
      return { min: RESEARCH_PANE_MIN_HEIGHT, max: RESEARCH_PANE_DEFAULT_HEIGHT, total: 0 }
    }
    const min = RESEARCH_PANE_MIN_HEIGHT
    const max = Math.max(min, researchRailContainerHeight - RESEARCH_SPLITTER_HANDLE_HEIGHT - min)
    return { min, max, total: researchRailContainerHeight }
  }, [researchRailContainerHeight])

  /**
   * 开始拖拽科研侧栏分隔条。
   *
   * @param {React.MouseEvent<HTMLDivElement>} event 鼠标事件
   * @returns {void}
   */
  const handleResearchSplitterMouseDown = useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()
    setIsResearchSplitterDragging(true)
  }, [])

  const documentTab = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const tab = params.get('tab')
    return ['all', 'parse', 'todo', 'archived'].includes(tab) ? tab : 'all'
  }, [location.search])

  const documentView = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const view = params.get('view')
    return ['patient', 'table'].includes(view) ? view : 'patient'
  }, [location.search])

  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!value.trim()) {
      setSearchResults({ patients: [], documents: [], pages: [] })
      setSearchLoading(false)
      return
    }

    const normalizedQuery = value.trim().toLowerCase()
    const matchedPages = pageEntries.filter((page) =>
      page.label.toLowerCase().includes(normalizedQuery) || page.keywords.toLowerCase().includes(normalizedQuery)
    )
    setSearchResults((current) => ({ ...current, pages: matchedPages }))
    setSearchLoading(true)

    searchTimerRef.current = setTimeout(async () => {
      try {
        const [patientRes, documentRes] = await Promise.all([
          getPatientList({ search: value.trim(), page: 1, page_size: 5 }).catch(() => null),
          getDocumentList({ search: value.trim(), page: 1, page_size: 5 }).catch(() => null),
        ])
        setSearchResults((current) => ({
          ...current,
          patients: patientRes?.data?.items || patientRes?.data || [],
          documents: documentRes?.data?.items || documentRes?.data || [],
        }))
      } catch {
        setSearchResults((current) => ({ ...current, patients: [], documents: [] }))
      } finally {
        setSearchLoading(false)
      }
    }, 350)
  }, [pageEntries])

  const resetSearchOverlay = useCallback(() => {
    setSearchVisible(false)
    setSearchQuery('')
    setSearchResults({ patients: [], documents: [], pages: [] })
    setSearchLoading(false)
  }, [])

  const handleSearchResultClick = useCallback((type, item) => {
    const keyword = searchQuery.trim()
    resetSearchOverlay()

    if (type === 'page') {
      navigate(item.path)
      return
    }

    if (type === 'patient') {
      navigate(`/patient/detail/${item.id}`, {
        state: { from: `${location.pathname}${location.search || ''}` }
      })
      return
    }

    if (type === 'document') {
      const params = new URLSearchParams()
      params.set('tab', 'all')
      params.set('view', documentView)
      if (keyword) params.set('q', keyword)
      navigate(`/document/file-list?${params.toString()}`)
    }
  }, [documentView, location.pathname, location.search, navigate, resetSearchOverlay, searchQuery])

  const handleUserMenuClick = ({ key }) => {
    switch (key) {
      case 'user-profile':
        navigate('/user/profile')
        break
      case 'user-settings':
        navigate('/user/settings')
        break
      case 'logout':
        logoutApi().catch(() => {})
        dispatch(logout())
        window.location.href = '/login'
        break
      default:
        break
    }
  }

  useEffect(() => {
    if (searchVisible) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [searchVisible])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setSearchVisible((current) => !current)
      }
      if (event.key === 'Escape' && searchVisible) {
        resetSearchOverlay()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [resetSearchOverlay, searchVisible])

  useEffect(() => {
    const matchedCrumbs = matches
      .filter((match) => match.handle?.crumb)
      .map((match) => (typeof match.handle.crumb === 'function' ? match.handle.crumb(match.params) : match.handle.crumb))
      .filter(Boolean)

    const nextBreadcrumbs = matchedCrumbs.length > 0
      ? matchedCrumbs
      : resolveFallbackBreadcrumbs(location.pathname)

    dispatch(setActiveMenuKey(resolveActiveMenuKey(location.pathname)))
    dispatch(setBreadcrumbs(nextBreadcrumbs))
  }, [dispatch, location.pathname, matches])

  useEffect(() => {
    let cancelled = false
    if (activePrimaryNavKey !== 'document') return () => { cancelled = true }

    const loadDocumentCounts = async () => {
      try {
        const response = await getFileListV2Tree()
        if (!response?.success || cancelled) return
        const counts = response.data?.counts || {}
        setDocumentCounts({
          all: Number(response.data?.total || 0),
          parse: Number(counts.parse_total || 0),
          todo: Number(counts.todo_total || 0),
          archived: Number(counts.archived_total || 0),
        })
      } catch {
        if (!cancelled) {
          setDocumentCounts({ all: 0, parse: 0, todo: 0, archived: 0 })
        }
      }
    }

    loadDocumentCounts()
    return () => {
      cancelled = true
    }
  }, [activePrimaryNavKey, location.pathname, location.search])

  useEffect(() => {
    if (activePrimaryNavKey !== 'patient') return undefined
    refreshPatientRail()
    return undefined
  }, [activePrimaryNavKey, refreshPatientRail])

  /**
   * 监听患者侧栏刷新事件（由患者相关页面在新增/更新后触发）。
   * 仅在当前处于患者主导航时刷新，避免无关页面额外请求。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handlePatientRailRefresh = () => {
      if (activePrimaryNavKey !== 'patient') return
      refreshPatientRail()
    }
    window.addEventListener('patient-rail-refresh', handlePatientRailRefresh)
    return () => {
      window.removeEventListener('patient-rail-refresh', handlePatientRailRefresh)
    }
  }, [activePrimaryNavKey, refreshPatientRail])

  useEffect(() => {
    let cancelled = false
    if (activePrimaryNavKey !== 'research') return () => { cancelled = true }

    const loadResearchItems = async () => {
      setResearchProjectLoading(true)
      setResearchTemplateLoading(true)
      try {
        const [projectResponse, templateResponse] = await Promise.all([
          getProjects({ page: 1, page_size: 100 }).catch(() => null),
          getCRFTemplates().catch(() => null),
        ])
        if (cancelled) return
        const projectRaw = Array.isArray(projectResponse?.data) ? projectResponse.data : (Array.isArray(projectResponse?.data?.items) ? projectResponse.data.items : [])
        const templateRaw = Array.isArray(templateResponse?.data) ? templateResponse.data : (Array.isArray(templateResponse?.data?.items) ? templateResponse.data.items : [])

        setResearchProjectItems(mapProjectRailItems(projectRaw, researchProjectSearch, researchProjectSort))
        setResearchTemplateItems(mapTemplateRailItems(templateRaw, researchTemplateSearch, researchTemplateSort))
      } finally {
        if (!cancelled) {
          setResearchProjectLoading(false)
          setResearchTemplateLoading(false)
        }
      }
    }

    loadResearchItems()
    return () => {
      cancelled = true
    }
  }, [activePrimaryNavKey, location.pathname, researchProjectSearch, researchProjectSort, researchTemplateSearch, researchTemplateSort])

  /**
   * 从模板设计页返回科研页时，跳过一次“自动进入最新项目详情”。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!location.pathname.startsWith('/research/templates/')) return
    window.sessionStorage.setItem(RESEARCH_RETURN_FROM_TEMPLATE_KEY, '1')
  }, [location.pathname])

  /**
   * 初始化科研侧栏分隔高度（本地持久化恢复）。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hasUserAdjusted = window.localStorage.getItem(RESEARCH_SPLITTER_USER_ADJUSTED_STORAGE_KEY) === '1'
    const stored = Number(window.localStorage.getItem(RESEARCH_SPLITTER_STORAGE_KEY))
    if (isResearchPaneHeightRestorable({
      storedHeight: stored,
      hasUserAdjusted,
      minPaneHeight: RESEARCH_PANE_MIN_HEIGHT,
      maxStoredHeight: RESEARCH_PANE_STORED_MAX_HEIGHT,
    })) {
      setHasUserAdjustedResearchPane(true)
      setResearchProjectPaneHeight(stored)
    }
    setResearchPanePreferenceHydrated(true)
  }, [])

  /**
   * 监听科研侧栏容器高度变化，驱动上下区域高度约束。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (activePrimaryNavKey !== 'research' || siderCollapsed) return undefined

    const container = researchRailContainerRef.current
    if (!container) return undefined

    const updateHeight = () => {
      const rawHeight = Number(container.clientHeight || 0)
      const minContainerHeight = RESEARCH_PANE_MIN_HEIGHT * 2 + RESEARCH_SPLITTER_HANDLE_HEIGHT
      if (!shouldAcceptResearchContainerHeight({ rawHeight, minContainerHeight })) return
      const viewportCap = Math.max(400, Number(window.innerHeight || 0))
      const normalizedHeight = clampNumber(rawHeight, minContainerHeight, viewportCap)
      setResearchRailContainerHeight(normalizedHeight)
    }

    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight)
      return () => {
        window.removeEventListener('resize', updateHeight)
      }
    }

    const observer = new ResizeObserver(() => updateHeight())
    observer.observe(container)
    return () => observer.disconnect()
  }, [activePrimaryNavKey, location.pathname, siderCollapsed])

  /**
   * 当容器高度变化时，自动夹取上半区高度，避免越界。
   */
  useEffect(() => {
    if (!researchPaneBounds.total) return
    if (!hasUserAdjustedResearchPane) return
    setResearchProjectPaneHeight((current) => clampNumber(current, researchPaneBounds.min, researchPaneBounds.max))
  }, [hasUserAdjustedResearchPane, researchPaneBounds])

  /**
   * 科研侧栏分隔条拖拽生命周期：mousemove 计算高度，mouseup 结束拖拽。
   */
  useEffect(() => {
    if (!isResearchSplitterDragging) return undefined

    const handleMouseMove = (event) => {
      const container = researchRailContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const nextHeight = event.clientY - rect.top
      setHasUserAdjustedResearchPane(true)
      setResearchProjectPaneHeight(clampNumber(nextHeight, researchPaneBounds.min, researchPaneBounds.max))
    }

    const handleMouseUp = () => {
      setIsResearchSplitterDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResearchSplitterDragging, researchPaneBounds.max, researchPaneBounds.min])

  /**
   * 持久化科研侧栏分隔高度（刷新后恢复）。
   */
  useEffect(() => {
    if (!researchPanePreferenceHydrated) return
    if (typeof window === 'undefined') return
    if (!hasUserAdjustedResearchPane) {
      window.localStorage.removeItem(RESEARCH_SPLITTER_STORAGE_KEY)
      window.localStorage.removeItem(RESEARCH_SPLITTER_USER_ADJUSTED_STORAGE_KEY)
      return
    }
    if (!Number.isFinite(researchProjectPaneHeight)) return
    if (researchProjectPaneHeight < RESEARCH_PANE_MIN_HEIGHT || researchProjectPaneHeight > RESEARCH_PANE_STORED_MAX_HEIGHT) return
    window.localStorage.setItem(RESEARCH_SPLITTER_STORAGE_KEY, String(Math.round(researchProjectPaneHeight)))
    window.localStorage.setItem(RESEARCH_SPLITTER_USER_ADJUSTED_STORAGE_KEY, '1')
  }, [hasUserAdjustedResearchPane, researchPanePreferenceHydrated, researchProjectPaneHeight])

  /**
   * 监听科研项目侧栏刷新事件（由科研页面在新建/编辑/状态变更后触发）。
   * 仅在当前处于科研主导航时刷新，避免影响其他模块。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleResearchProjectRailRefresh = () => {
      if (activePrimaryNavKey !== 'research') return
      refreshResearchProjectRail()
    }
    window.addEventListener('research-project-rail-refresh', handleResearchProjectRailRefresh)
    return () => {
      window.removeEventListener('research-project-rail-refresh', handleResearchProjectRailRefresh)
    }
  }, [activePrimaryNavKey, refreshResearchProjectRail])

  /**
   * 监听科研模板侧栏刷新事件（模板创建/更新后触发）。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleResearchTemplateRailRefresh = () => {
      if (activePrimaryNavKey !== 'research') return
      refreshResearchTemplateRail()
    }
    window.addEventListener('research-template-rail-refresh', handleResearchTemplateRailRefresh)
    return () => {
      window.removeEventListener('research-template-rail-refresh', handleResearchTemplateRailRefresh)
    }
  }, [activePrimaryNavKey, refreshResearchTemplateRail])

  /**
   * 监听全局“请求新建患者/项目/模板”事件。
   *
   * 由 Dashboard、患者页、科研页等入口统一触发。
   *
   * @returns {void | (() => void)}
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handlePatientCreateRequest = () => {
      openCreatePatientFlow()
    }
    const handleProjectCreateRequest = () => {
      openCreateProjectFlow()
    }
    const handleTemplateCreateRequest = () => {
      openCreateTemplateFlow()
    }
    window.addEventListener(REQUEST_PATIENT_CREATE_EVENT, handlePatientCreateRequest)
    window.addEventListener(REQUEST_PROJECT_CREATE_EVENT, handleProjectCreateRequest)
    window.addEventListener(REQUEST_TEMPLATE_CREATE_EVENT, handleTemplateCreateRequest)
    return () => {
      window.removeEventListener(REQUEST_PATIENT_CREATE_EVENT, handlePatientCreateRequest)
      window.removeEventListener(REQUEST_PROJECT_CREATE_EVENT, handleProjectCreateRequest)
      window.removeEventListener(REQUEST_TEMPLATE_CREATE_EVENT, handleTemplateCreateRequest)
    }
  }, [openCreatePatientFlow, openCreateProjectFlow, openCreateTemplateFlow])

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (location.pathname.startsWith('/admin') && !isAdminUser) {
    return <Navigate to="/dashboard" replace />
  }

  const userMenuItems = [
    { key: 'user-profile', icon: <UserOutlined />, label: '个人中心' },
    { key: 'user-settings', icon: <SettingOutlined />, label: '系统设置' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ]

  const primaryNavItems = PRIMARY_NAV_ORDER
    .filter((key) => key !== 'admin' || isAdminUser)
    .map((key) => ({
      key,
      label: PRIMARY_NAV_CONFIG[key].label,
    }))

  /**
   * 渲染左侧 rail 的紧凑工具条（三按钮：新建/搜索/排序）。
   *
   * @param {object} config 配置项
   * @param {string} config.panelPrefix 面板唯一前缀
   * @param {() => void} config.onCreate 新建动作
   * @param {string} config.createTooltip 新建按钮提示
   * @param {string} config.searchValue 搜索值
   * @param {(event: React.ChangeEvent<HTMLInputElement>) => void} config.onSearchChange 搜索变更
   * @param {string} config.searchPlaceholder 搜索占位
   * @param {string} config.sortValue 排序值
   * @param {(value: string) => void} config.onSortChange 排序变更
   * @param {Array<{value: string, label: string}>} config.sortOptions 排序选项
   * @param {string} [config.defaultSortValue='updated_desc'] 默认排序值
   * @returns {React.ReactNode}
   */
  const renderCompactRailToolbar = ({
    panelPrefix,
    onCreate,
    createTooltip,
    searchValue,
    onSearchChange,
    searchPlaceholder,
    sortValue,
    onSortChange,
    sortOptions,
    defaultSortValue = 'updated_desc',
  }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Tooltip title={createTooltip}>
        <Button
          size="small"
          shape="circle"
          icon={<PlusOutlined />}
          onClick={onCreate}
          style={{ borderColor: token.colorBorder }}
        />
      </Tooltip>
      <Popover
        trigger="click"
        placement="bottomLeft"
        open={activeToolbarPanel === `${panelPrefix}:search`}
        onOpenChange={(open) => setActiveToolbarPanel(open ? `${panelPrefix}:search` : '')}
        content={(
          <div style={{ width: 220 }}>
            <Input
              size="small"
              placeholder={searchPlaceholder}
              prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
              value={searchValue}
              onChange={onSearchChange}
              allowClear
              autoFocus
            />
          </div>
        )}
      >
        <Tooltip title="搜索">
          <Button
            size="small"
            shape="circle"
            icon={<SearchOutlined />}
            type={searchValue ? 'primary' : 'default'}
            style={{ borderColor: searchValue ? undefined : token.colorBorder }}
          />
        </Tooltip>
      </Popover>
      <Popover
        trigger="click"
        placement="bottomLeft"
        open={activeToolbarPanel === `${panelPrefix}:sort`}
        onOpenChange={(open) => setActiveToolbarPanel(open ? `${panelPrefix}:sort` : '')}
        content={(
          <div style={{ width: 220 }}>
            <Select
              size="small"
              value={sortValue}
              onChange={onSortChange}
              options={sortOptions}
              style={{ width: '100%' }}
              suffixIcon={<SortAscendingOutlined />}
            />
          </div>
        )}
      >
        <Tooltip title="排序">
          <Button
            size="small"
            shape="circle"
            icon={<SortAscendingOutlined />}
            type={sortValue !== defaultSortValue ? 'primary' : 'default'}
            style={{ borderColor: sortValue !== defaultSortValue ? undefined : token.colorBorder }}
          />
        </Tooltip>
      </Popover>
    </div>
  )

  const renderDocumentRail = () => {
    const items = [
      { key: 'all', label: '全部', icon: <FileTextOutlined /> },
      { key: 'parse', label: '待解析', icon: <ClockCircleOutlined /> },
      { key: 'todo', label: '待归档', icon: <InboxOutlined /> },
      { key: 'archived', label: '已归档', icon: <CheckCircleOutlined /> },
    ]

    if (siderCollapsed) {
      return (
        <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {items.map((item) => (
            <Tooltip key={item.key} title={`${item.label}（${documentCounts[item.key] || 0}）`} placement="right">
              <Badge count={documentCounts[item.key] || 0} size="small" showZero>
                <Button
                  type={documentTab === item.key ? 'primary' : 'text'}
                  shape="circle"
                  icon={item.icon}
                  onClick={() => navigate(`/document/file-list?tab=${item.key}&view=${documentView}`)}
                />
              </Badge>
            </Tooltip>
          ))}
        </div>
      )
    }

    return (
      <div style={{ padding: 12 }}>
        {items.map((item) => (
          <Button
            key={item.key}
            type={documentTab === item.key ? 'primary' : 'text'}
            block
            onClick={() => navigate(`/document/file-list?tab=${item.key}&view=${documentView}`)}
            style={{ justifyContent: 'space-between', marginBottom: 6, height: 38 }}
          >
            <span>{item.label}</span>
            <Badge
              count={documentCounts[item.key] || 0}
              size="small"
              showZero
              style={{
                backgroundColor: documentTab === item.key ? token.colorBgContainer : token.colorFillTertiary,
                color: documentTab === item.key ? token.colorPrimary : token.colorTextTertiary,
              }}
            />
          </Button>
        ))}
      </div>
    )
  }

  const renderPatientRail = () => {
    const hasActivePatient = activePatientId
      ? patientRailItems.some((item) => String(item.id) === String(activePatientId))
      : false

    if (siderCollapsed) {
      return (
        <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Tooltip title="患者列表" placement="right">
            <Button
              shape="circle"
              type={activePrimaryNavKey === 'patient' ? 'primary' : 'text'}
              icon={<TeamOutlined />}
              onClick={async () => {
                dispatch(setSiderCollapsed(false))
                await goFirstPatientDetail()
              }}
            />
          </Tooltip>
          <Tooltip title="新建患者" placement="right">
            <Button shape="circle" icon={<PlusOutlined />} onClick={() => openCreatePatientFlow()} />
          </Tooltip>
        </div>
      )
    }

    return (
      <div style={{ padding: 12 }}>
        {renderCompactRailToolbar({
          panelPrefix: 'patient',
          onCreate: () => openCreatePatientFlow(),
          createTooltip: '新建患者',
          searchValue: patientRailSearch,
          onSearchChange: (event) => setPatientRailSearch(event.target.value),
          searchPlaceholder: '搜索患者',
          sortValue: patientRailSort,
          onSortChange: setPatientRailSort,
          sortOptions: [
            { value: 'updated_desc', label: '最近更新' },
            { value: 'name_asc', label: '按姓名排序' },
          ],
        })}
        <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', paddingRight: 2, marginTop: 8 }}>
          {patientRailLoading ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <Spin size="small" />
            </div>
          ) : null}
          {!patientRailLoading && !patientRailItems.length ? (
            <Text type="secondary" style={{ fontSize: 12 }}>暂无患者</Text>
          ) : null}
          {patientRailItems.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/patient/detail/${item.id}`, { state: { from: '/patient/pool' } })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate(`/patient/detail/${item.id}`, { state: { from: '/patient/pool' } })
                }
              }}
              onMouseEnter={() => setHoveredRailCardKey(`patient:${item.id}`)}
              onMouseLeave={() => setHoveredRailCardKey('')}
              style={{
                marginBottom: 8,
                borderRadius: 10,
                border: String(item.id) === String(activePatientId) ? `1px solid ${token.colorPrimaryBorder}` : `1px solid ${token.colorFillSecondary}`,
                background: String(item.id) === String(activePatientId) ? token.colorPrimaryBg : token.colorBgContainer,
                padding: '10px 10px 8px 10px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getPatientRailDisplayName(item.name)}</div>
                <Tooltip title="刷新患者信息">
                  <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (String(item.id) === String(activePatientId) && location.pathname.startsWith('/patient/detail/')) {
                        triggerPatientDetailRefresh(item.id)
                        message.success('已刷新患者信息')
                        return
                      }
                      navigate(`/patient/detail/${item.id}`, { state: { from: '/patient/pool' } })
                    }}
                  />
                </Tooltip>
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, color: token.colorTextSecondary, fontSize: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {getGenderMeta(item.gender).icon}
                  {getGenderMeta(item.gender).label}
                </span>
                <span>{item.age != null ? `${item.age}岁` : '--'}</span>
                <span style={{ color: token.colorTextSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.diagnosis || '暂无诊断'}
                </span>
              </div>
              {hoveredRailCardKey === `patient:${item.id}` ? (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: token.colorTextSecondary, fontSize: 12 }}>
                    <Tooltip title="已归档文档数量">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <FileTextOutlined />
                        {item.documentCount}
                      </span>
                    </Tooltip>
                    <Tooltip title="关联科研项目数量">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <AppstoreOutlined />
                        {item.projectsCount}
                      </span>
                    </Tooltip>
                  </div>
                  <Space
                    size={2}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <Tooltip title="修改患者">
                      <Button
                        type="text"
                        size="small"
                        shape="circle"
                        icon={<EditOutlined />}
                        onClick={(event) => {
                          event.stopPropagation()
                          navigate(`/patient/detail/${item.id}`, {
                            state: {
                              from: '/patient/pool',
                              openPatientEdit: true,
                            },
                          })
                        }}
                      />
                    </Tooltip>
                    <Tooltip title="删除患者">
                      <Button
                        type="text"
                        size="small"
                        shape="circle"
                        danger
                        loading={deletingPatientId === String(item.id)}
                        icon={<DeleteOutlined />}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleDeletePatientFromRail(item)
                        }}
                      />
                    </Tooltip>
                  </Space>
                </div>
              ) : null}
            </div>
          ))}
          {activePatientId && !hasActivePatient ? (
            <Tag color="blue" style={{ marginTop: 6, width: '100%', textAlign: 'center' }}>当前患者</Tag>
          ) : null}
        </div>
      </div>
    )
  }

  const renderResearchRail = () => {
    /**
     * 删除项目（含确认、刷新与详情页回退）。
     *
     * @param {{id: string, name: string}} item 项目数据
     * @returns {void}
     */
    const handleDeleteProjectFromRail = (item) => {
      if (!item?.id) return
      Modal.confirm({
        title: '确认删除项目',
        content: `确定删除项目「${item.name || '未命名项目'}」吗？删除后不可恢复。`,
        okText: '确认删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          setDeletingProjectId(String(item.id))
          try {
            const response = await deleteProject(item.id)
            if (!response?.success) {
              message.error(response?.message || '删除项目失败，请稍后重试')
              return
            }
            message.success('项目删除成功')
            await refreshResearchProjectRail()
            if (String(activeResearchProjectId) === String(item.id)) {
              navigate(researchHome())
            }
          } catch (error) {
            console.error('删除项目失败:', error)
            message.error(error?.message || '删除项目失败')
            throw error
          } finally {
            setDeletingProjectId('')
          }
        },
      })
    }

    /**
     * 打开模板信息编辑入口（当前页优先，不跳编辑页）。
     *
     * @param {string} templateId 模板 ID
     * @returns {void}
     */
    const handleOpenTemplateMeta = (templateId) => {
      if (!templateId || typeof window === 'undefined') return
      const targetId = String(templateId)
      const activeId = String(activeResearchTemplateId || '')
      if (targetId === activeId) {
        window.dispatchEvent(new CustomEvent('research-template-meta-open', { detail: { templateId: targetId } }))
        return
      }
      window.sessionStorage.setItem(RESEARCH_OPEN_TEMPLATE_META_KEY, targetId)
      navigate(templateView(targetId))
    }

    /**
     * 解析删除接口所需的数据库模板 UUID。
     *
     * 兼容场景：
     * - rail 数据已经携带后端 UUID
     * - rail 仅携带路由 ID（需要先查详情再提取数据库 UUID）
     *
     * @param {{id?: string, backendId?: string}} item 模板项
     * @returns {Promise<string>} 可用于删除接口的模板 UUID
     */
    const resolveTemplateDeleteId = async (item) => {
      const directId = item?.backendId
      if (isUuidString(directId)) {
        return String(directId).trim()
      }
      const routeId = item?.id
      if (!routeId) return ''

      const detail = await getCRFTemplate(String(routeId), { _silent: true })
      const detailId = detail?.data?.id
      if (isUuidString(detailId)) {
        return String(detailId).trim()
      }
      return ''
    }

    /**
     * 删除模板后跳转到下一个可展示模板，若为空则进入模板空态。
     *
     * @param {{id: string, name: string, deletable?: boolean}} item 模板项
     * @returns {void}
     */
    const handleDeleteTemplateFromRail = (item) => {
      if (!item?.id || !item.deletable) return
      const currentId = String(item.id)
      const currentIndex = researchTemplateItems.findIndex((row) => String(row.id) === currentId)
      const fallbackNext = currentIndex >= 0
        ? (researchTemplateItems[currentIndex + 1] || researchTemplateItems[currentIndex - 1] || null)
        : null

      Modal.confirm({
        title: '确认删除模板',
        content: `确定删除模板「${item.name || '未命名模板'}」吗？删除后将从前台隐藏，如需恢复可联系管理员处理。`,
        okText: '确认删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          setDeletingTemplateId(currentId)
          try {
            const deleteId = await resolveTemplateDeleteId(item)
            if (!deleteId) {
              message.error('无法解析可删除的数据库模板 ID，请刷新后重试')
              return
            }

            await deleteCrfTemplate(deleteId, { _silent: true })
            message.success('模板已删除，如需恢复可联系管理员')

            await refreshResearchTemplateRail()

            if (fallbackNext?.id) {
              navigate(templateView(fallbackNext.id))
              return
            }
            openCreateTemplateFlow()
          } catch (error) {
            const fallbackMessage = error instanceof Error && error.message
              ? error.message
              : '删除模板失败，请稍后重试'
            message.error(fallbackMessage)
          } finally {
            setDeletingTemplateId('')
          }
        },
      })
    }

    if (siderCollapsed) {
      return (
        <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Tooltip title="科研项目" placement="right">
            <Button
              shape="circle"
              type={activeResearchProjectId ? 'primary' : 'text'}
              icon={<AppstoreOutlined />}
              onClick={async () => {
                dispatch(setSiderCollapsed(false))
                await goFirstProjectDetail()
              }}
            />
          </Tooltip>
          <Tooltip title="CRF 模板" placement="right">
            <Button
              shape="circle"
              type={activeResearchTemplateId ? 'primary' : 'text'}
              icon={<FileTextOutlined />}
              onClick={async () => {
                dispatch(setSiderCollapsed(false))
                await goFirstTemplateView()
              }}
            />
          </Tooltip>
          <Tooltip title="新建项目" placement="right">
            <Button shape="circle" icon={<PlusOutlined />} onClick={() => openCreateProjectFlow()} />
          </Tooltip>
        </div>
      )
    }

    const projectPaneHeight = researchPaneBounds.total
      ? clampNumber(
          hasUserAdjustedResearchPane && Number.isFinite(researchProjectPaneHeight)
            ? researchProjectPaneHeight
            : getDefaultResearchPaneHeight({
                totalHeight: researchPaneBounds.total,
                minPaneHeight: researchPaneBounds.min,
                splitterHeight: RESEARCH_SPLITTER_HANDLE_HEIGHT,
              }),
          researchPaneBounds.min,
          researchPaneBounds.max
        )
      : null
    const templatePaneHeight = researchPaneBounds.total && Number.isFinite(projectPaneHeight)
      ? Math.max(
          RESEARCH_PANE_MIN_HEIGHT,
          researchPaneBounds.total - projectPaneHeight - RESEARCH_SPLITTER_HANDLE_HEIGHT
        )
      : null

    return (
      <div
        ref={researchRailContainerRef}
        style={{ padding: 12, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
      >
        <div style={{
          height: Number.isFinite(projectPaneHeight) ? projectPaneHeight : undefined,
          flex: Number.isFinite(projectPaneHeight) ? undefined : 1,
          minHeight: RESEARCH_PANE_MIN_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text strong style={{ fontSize: 14 }}>科研项目</Text>
            {renderCompactRailToolbar({
              panelPrefix: 'project',
              onCreate: () => openCreateProjectFlow(),
              createTooltip: '新建项目',
              searchValue: researchProjectSearch,
              onSearchChange: (event) => setResearchProjectSearch(event.target.value),
              searchPlaceholder: '搜索项目',
              sortValue: researchProjectSort,
              onSortChange: setResearchProjectSort,
              sortOptions: [
                { value: 'updated_desc', label: '最近更新' },
                { value: 'name_asc', label: '按名称排序' },
              ],
            })}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
            {researchProjectLoading ? <div style={{ textAlign: 'center', padding: '8px 0' }}><Spin size="small" /></div> : null}
            {!researchProjectLoading && researchProjectItems.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(researchProjectDetail(item.id))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    navigate(researchProjectDetail(item.id))
                  }
                }}
                onMouseEnter={() => setHoveredRailCardKey(`project:${item.id}`)}
                onMouseLeave={() => setHoveredRailCardKey('')}
                style={{
                  marginBottom: 8,
                  borderRadius: 10,
                  border: String(activeResearchProjectId) === String(item.id) ? `1px solid ${token.colorPrimaryBorder}` : `1px solid ${token.colorFillSecondary}`,
                  background: String(activeResearchProjectId) === String(item.id) ? token.colorPrimaryBg : token.colorBgContainer,
                  padding: '10px 10px 8px 10px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: '100%', lineHeight: 1.3 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: token.colorTextSecondary, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: item.statusColor || getProjectStatusMeta(item.status).color }}>
                      {getProjectStatusMeta(item.status).icon}
                      {item.statusLabel || getProjectStatusMeta(item.status).label}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <TeamOutlined />
                      {item.patientCount}
                    </span>
                  </div>
                </div>
                {hoveredRailCardKey === `project:${item.id}` ? (
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      完整度 {Number.isFinite(item.avgCompleteness) ? `${Math.round(item.avgCompleteness)}%` : '--'}
                    </Text>
                    <Space size={2}>
                      <Tooltip title="编辑项目">
                        <Button
                          type="text"
                          size="small"
                          shape="circle"
                          icon={<EditOutlined />}
                          onClick={(event) => {
                            event.stopPropagation()
                            const targetPath = researchProjectDetail(item.id)
                            if (location.pathname !== targetPath) {
                              navigate(targetPath, {
                                state: {
                                  openProjectEdit: true,
                                  projectId: item.id,
                                },
                              })
                              return
                            }
                            dispatchRequestProjectEdit(item.id)
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="编辑项目模板">
                        <Button
                          type="text"
                          size="small"
                          shape="circle"
                          icon={<FileTextOutlined />}
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(researchProjectTemplateEdit(item.id))
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="删除项目">
                        <Button
                          type="text"
                          size="small"
                          shape="circle"
                          danger
                          loading={deletingProjectId === String(item.id)}
                          icon={<DeleteOutlined />}
                          onMouseDown={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            handleDeleteProjectFromRail(item)
                          }}
                        />
                      </Tooltip>
                    </Space>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div
          role="separator"
          aria-label="调整科研项目与CRF模板高度"
          aria-orientation="horizontal"
          onMouseDown={handleResearchSplitterMouseDown}
          style={{
            height: RESEARCH_SPLITTER_HANDLE_HEIGHT,
            margin: '4px 0',
            borderRadius: 999,
            cursor: 'row-resize',
            background: isResearchSplitterDragging ? token.colorPrimaryBorder : token.colorBorderSecondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <div style={{ width: 42, height: 2, borderRadius: 999, background: isResearchSplitterDragging ? token.colorPrimary : token.colorTextTertiary }} />
        </div>

        <div style={{
          height: Number.isFinite(templatePaneHeight) ? templatePaneHeight : undefined,
          flex: Number.isFinite(templatePaneHeight) ? undefined : 1,
          minHeight: RESEARCH_PANE_MIN_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text strong style={{ fontSize: 14 }}>CRF 模板</Text>
            {renderCompactRailToolbar({
              panelPrefix: 'template',
              onCreate: openCreateTemplateFlow,
              createTooltip: '新建模板',
              searchValue: researchTemplateSearch,
              onSearchChange: (event) => setResearchTemplateSearch(event.target.value),
              searchPlaceholder: '搜索模板',
              sortValue: researchTemplateSort,
              onSortChange: setResearchTemplateSort,
              sortOptions: [
                { value: 'updated_desc', label: '最近更新' },
                { value: 'name_asc', label: '按名称排序' },
              ],
            })}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
            {researchTemplateLoading ? <div style={{ textAlign: 'center', padding: '8px 0' }}><Spin size="small" /></div> : null}
            {!researchTemplateLoading && researchTemplateItems.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(templateView(item.id))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    navigate(templateView(item.id))
                  }
                }}
                onMouseEnter={() => setHoveredRailCardKey(`template:${item.id}`)}
                onMouseLeave={() => setHoveredRailCardKey('')}
                style={{
                  marginBottom: 8,
                  borderRadius: 10,
                  border: String(activeResearchTemplateId) === String(item.id) ? `1px solid ${token.colorPrimaryBorder}` : `1px solid ${token.colorFillSecondary}`,
                  background: String(activeResearchTemplateId) === String(item.id) ? token.colorPrimaryBg : token.colorBgContainer,
                  padding: '10px 10px 8px 10px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: '100%', lineHeight: 1.3 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: token.colorTextSecondary, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>{item.category || '未分类'}</Tag>
                    {item.isPublished === true ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: token.colorSuccess }}>
                        <SafetyCertificateOutlined />
                        已发布
                      </span>
                    ) : item.isPublished === false ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: token.colorWarning }}>
                        <EditOutlined />
                        草稿
                      </span>
                    ) : null}
                  </div>
                </div>
                {hoveredRailCardKey === `template:${item.id}` ? (
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      字段组 {item.fieldGroupsCount != null ? item.fieldGroupsCount : '--'}
                    </Text>
                    <Space size={2}>
                      <Tooltip title="编辑模板信息">
                        <Button
                          type="text"
                          size="small"
                          shape="circle"
                          icon={<EditOutlined />}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleOpenTemplateMeta(item.id)
                          }}
                        />
                      </Tooltip>
                      {item.deletable ? (
                        <Tooltip title="删除模板">
                          <Button
                            type="text"
                            size="small"
                            shape="circle"
                            danger
                            loading={deletingTemplateId === String(item.id)}
                            icon={<DeleteOutlined />}
                            onClick={(event) => {
                              event.stopPropagation()
                              handleDeleteTemplateFromRail(item)
                            }}
                          />
                        </Tooltip>
                      ) : null}
                    </Space>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const renderContextRail = () => {
    if (activePrimaryNavKey === 'document') return renderDocumentRail()
    if (activePrimaryNavKey === 'patient') return renderPatientRail()
    if (activePrimaryNavKey === 'research') return renderResearchRail()
    return null
  }

  return (
    <Layout className="main-layout" style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Header
        style={{
          padding: '0 16px',
          background: token.colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          boxShadow: '0 1px 4px rgba(0,21,41,.08)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: 64,
        }}
      >
        <div onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 180 }}>
          <img src="/logo/eacy_logo.png" alt="EACY" style={{ height: 36, width: 'auto', objectFit: 'contain', display: 'block' }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: 'rgba(0,0,0,0.85)', whiteSpace: 'nowrap' }}>
            EACY Data
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <Menu
            mode="horizontal"
            style={{ justifyContent: 'center' }}
            selectedKeys={[activePrimaryNavKey]}
            items={primaryNavItems}
            onClick={async ({ key }) => {
              if (key === 'patient') {
                await goFirstPatientDetail()
                return
              }
              if (key === 'research') {
                await goFirstProjectDetail()
                return
              }
              navigate(PRIMARY_NAV_CONFIG[key].path)
            }}
            />
          </div>

        <Space size={20}>
            <SearchOutlined 
              style={{ fontSize: 16, cursor: 'pointer', color: token.colorTextSecondary }} 
            onClick={() => setSearchVisible((current) => !current)}
            />
            <NotificationBell />
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
              <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} src="https://gw.alipayobjects.com/zos/rmsportal/BiazfanxmamNRoxxVxka.png" style={{ marginRight: 8 }} />
                <Text>{userInfo?.name || '管理员'}</Text>
              </div>
            </Dropdown>
          </Space>
        </Header>

      <Layout style={{ height: 'calc(100vh - 64px)', minHeight: 0, overflow: 'hidden' }}>
        {showContextRail ? (
          <Sider
            trigger={null}
            collapsible
            collapsed={siderCollapsed}
            width={CONTEXT_RAIL_WIDTH}
            collapsedWidth={CONTEXT_RAIL_COLLAPSED_WIDTH}
            theme="light"
            style={{
              borderRight: `1px solid ${token.colorBorder}`,
              background: token.colorBgContainer,
              position: 'relative',
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div className="context-rail-shell">
              <div className="context-rail-content">
                {renderContextRail()}
              </div>
              <div className="context-rail-footer">
                <Tooltip title={siderCollapsed ? '展开侧栏' : '收起侧栏'} placement="top">
                  <Button
                    type="text"
                    onClick={() => dispatch(toggleSider())}
                    title={siderCollapsed ? '展开侧栏' : '收起侧栏'}
                    aria-label={siderCollapsed ? '展开侧栏' : '收起侧栏'}
                    className="context-rail-footer-toggle"
                    icon={siderCollapsed ? <MenuUnfoldOutlined style={{ fontSize: 14 }} /> : <MenuFoldOutlined style={{ fontSize: 14 }} />}
                  />
                </Tooltip>
              </div>
            </div>
          </Sider>
        ) : null}

        <Layout style={{ minHeight: 0, height: '100%', overflow: 'hidden', position: 'relative' }}>
          <Content
            style={{
              margin: 10,
              minHeight: 0,
              background: 'transparent',
              overflowY: 'auto',
              overflowX: 'hidden',
              paddingBottom: 28,
            }}
          >
            <Outlet />
          </Content>

          <div
            className="main-layout-footer-watermark"
            style={{
            position: 'absolute',
            left: '50%',
            bottom: 6,
            transform: 'translateX(-50%)',
            color: 'rgba(0,0,0,0.45)',
            fontSize: 12,
            lineHeight: 1.4,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 2,
            whiteSpace: 'nowrap',
            }}
          >
            EACY Data Platform ©2024 Created by Xidong Tech
          </div>
        </Layout>
      </Layout>

        {searchVisible && (
          <>
            <div
            onClick={resetSearchOverlay}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 999 }}
            />
          <div
            style={{
              position: 'fixed',
              top: '12%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 560,
              maxHeight: '68vh',
              background: token.colorBgContainer,
              borderRadius: 12,
              boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
              <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <SearchOutlined style={{ fontSize: 16, color: token.colorTextTertiary }} />
                <Input
                  ref={searchInputRef}
                  placeholder="搜索患者、文档、页面…  (Esc 关闭)"
                  variant="borderless"
                  size="large"
                  value={searchQuery}
                onChange={(event) => handleSearchChange(event.target.value)}
                  style={{ flex: 1, fontSize: 16 }}
                />
              {searchQuery ? (
                <CloseOutlined
                  style={{ cursor: 'pointer', color: token.colorTextTertiary }}
                  onClick={() => {
                    setSearchQuery('')
                    handleSearchChange('')
                  }}
                />
              ) : null}
                <Tag style={{ fontSize: 12, lineHeight: '20px' }}>ESC</Tag>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {searchLoading ? (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <Spin size="small" />
                  <span style={{ marginLeft: 8, color: token.colorTextTertiary }}>搜索中…</span>
                </div>
              ) : null}

              {!searchQuery.trim() && !searchLoading ? (
                  <div style={{ padding: '12px 20px', color: token.colorTextTertiary, fontSize: 14 }}>
                    <div style={{ marginBottom: 8, fontWeight: 500, color: token.colorTextSecondary }}>快速导航</div>
                  {pageEntries.map((item) => (
                      <div
                      key={item.path}
                      onClick={() => handleSearchResultClick('page', item)}
                        style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: token.colorText }}
                      onMouseEnter={(event) => { event.currentTarget.style.background = token.colorFillTertiary }}
                      onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent' }}
                      >
                      <span style={{ color: token.colorPrimary }}>{item.icon}</span>
                      <span>{item.label}</span>
                      </div>
                    ))}
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ fontSize: 12, color: token.colorTextTertiary, textAlign: 'center' }}>
                      提示：<Tag style={{ fontSize: 12 }}>Ctrl+K</Tag> 随时打开搜索
                    </div>
                  </div>
              ) : null}

              {searchQuery.trim() && !searchLoading ? (
                  <>
                  {searchResults.pages.length > 0 ? (
                      <div style={{ padding: '4px 20px' }}>
                        <div style={{ fontSize: 12, color: token.colorTextTertiary, fontWeight: 500, marginBottom: 4 }}>页面</div>
                      {searchResults.pages.map((item) => (
                          <div
                          key={item.path}
                          onClick={() => handleSearchResultClick('page', item)}
                            style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                          onMouseEnter={(event) => { event.currentTarget.style.background = token.colorFillTertiary }}
                          onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent' }}
                        >
                          <span style={{ color: token.colorPrimary }}>{item.icon}</span>
                          <span>{item.label}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 12, color: token.colorTextTertiary }}>{item.path}</span>
                          </div>
                        ))}
                      </div>
                  ) : null}

                  {searchResults.patients.length > 0 ? (
                      <div style={{ padding: '4px 20px' }}>
                        <div style={{ fontSize: 12, color: token.colorTextTertiary, fontWeight: 500, marginBottom: 4 }}>患者</div>
                      {searchResults.patients.slice(0, 5).map((item) => (
                          <div
                          key={item.id}
                          onClick={() => handleSearchResultClick('patient', item)}
                            style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                          onMouseEnter={(event) => { event.currentTarget.style.background = token.colorFillTertiary }}
                          onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent' }}
                          >
                            <TeamOutlined style={{ color: token.colorSuccess }} />
                          <span style={{ fontWeight: 500 }}>{item.name || '未命名'}</span>
                          {item.patient_code ? <Tag style={{ fontSize: 12 }}>{item.patient_code}</Tag> : null}
                          {item.gender ? <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{item.gender}</span> : null}
                          {item.age ? <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{item.age}岁</span> : null}
                          </div>
                        ))}
                      </div>
                  ) : null}

                  {searchResults.documents.length > 0 ? (
                      <div style={{ padding: '4px 20px' }}>
                        <div style={{ fontSize: 12, color: token.colorTextTertiary, fontWeight: 500, marginBottom: 4 }}>文档</div>
                      {searchResults.documents.slice(0, 5).map((item) => (
                          <div
                          key={item.id}
                          onClick={() => handleSearchResultClick('document', item)}
                            style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                          onMouseEnter={(event) => { event.currentTarget.style.background = token.colorFillTertiary }}
                          onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent' }}
                          >
                            <FileOutlined style={{ color: token.colorWarning }} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.file_name || item.original_filename || '未命名文档'}
                          </span>
                          {item.doc_type ? <Tag color="blue" style={{ fontSize: 12 }}>{item.doc_type}</Tag> : null}
                          </div>
                        ))}
                      </div>
                  ) : null}

                  {!searchResults.pages.length && !searchResults.patients.length && !searchResults.documents.length ? (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: token.colorTextTertiary }}>未找到 "{searchQuery}" 的相关结果</span>} style={{ padding: 32 }} />
                  ) : null}
                  </>
              ) : null}
              </div>
            </div>
          </>
        )}
      <PatientCreateModal
        open={patientCreateVisible}
        onCancel={() => setPatientCreateVisible(false)}
        onSuccess={(patientId) => {
          setPatientCreateVisible(false)
          navigate(`/patient/detail/${patientId}`, { state: { from: '/patient/pool' } })
        }}
      />
      <ProjectCreateWizardModal
        open={projectCreateVisible}
        onCancel={() => setProjectCreateVisible(false)}
        onSuccess={(projectId) => {
          setProjectCreateVisible(false)
          navigate(researchProjectDetail(projectId))
        }}
      />
      <TemplateMetaModal
        open={templateCreateVisible}
        form={templateCreateForm}
        title="新建模板"
        confirmText="开始设计"
        initialValues={{ name: '', category: '通用', description: '' }}
        onCancel={() => setTemplateCreateVisible(false)}
        onOk={async () => {
          const values = await templateCreateForm.validateFields()
          const returnTo = `${location.pathname}${location.search || ''}`
          storePendingTemplateCreateFlow(
            {
              name: values.name,
              category: values.category,
              description: values.description,
            },
            returnTo
          )
          setTemplateCreateVisible(false)
          navigate(templateCreate(), {
            state: { pendingTemplateCreateTs: Date.now() },
          })
        }}
      />
    </Layout>
  )
}

export default MainLayout
