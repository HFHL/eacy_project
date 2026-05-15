import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getProject, getProjectPatients, enrollPatient, removeProjectPatient, updateProjectCrfFolderBatch, getCrfExtractionProgress, getProjectExtractionTasks, getActiveExtractionTask, cancelCrfExtraction, resetCrfExtraction, exportProjectCrfFile, getProjectTemplateDesigner, updateProject } from '../../api/project'
import { getProjectTemplate } from '../../api/crfTemplate'
import { getPatientList } from '../../api/patient'
import { maskName } from '../../utils/sensitiveUtils'
import {
  Card,
  Typography,
  Table,
  Button,
  Space,
  Tag,
  Progress,
  Row,
  Col,
  Statistic,
  Radio,
  Select,
  Checkbox,
  Tooltip,
  Popover,
  Modal,
  Form,
  Input,
  InputNumber,
  Dropdown,
  Divider,
  Alert,
  Badge,
  Spin,
  Empty,
  DatePicker,
  message,
  theme
} from 'antd'
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ExportOutlined,
  SettingOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  UserOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  DownloadOutlined,
  DeleteOutlined,
  UserDeleteOutlined,
  CloseOutlined,
  DownOutlined,
  ExperimentOutlined,
  TeamOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { ClickableFieldValue, FieldSourceModal } from '../../components/FieldSourceViewer'
import StructuredDataView from '../../components/Common/StructuredDataView'
import DocumentDetailModal from '../PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal'
import {
  findBestFieldAuditScored,
  buildProjectFieldSourceContext,
} from '../../utils/auditResolver'
import { resolveTemplateAssets } from '../../utils/templateAssetResolver'
import { researchProjectPatientDetail } from '../../utils/researchPaths'
import { REQUEST_PROJECT_EDIT_EVENT } from '../../utils/createIntentEvents'
import {
  buildProjectMetaFormValues,
  buildProjectMetaUpdatePayload,
} from '../../utils/projectMetaForm'
import { PAGE_LAYOUT_HEIGHTS, toViewportHeight } from '../../constants/pageLayout'
import { getProjectStatusOptions } from '../../constants/projectStatusMeta'
import { formatIsoDateDisplay } from '../../utils/dateDisplay'
import { modalBodyPreset, modalWidthPreset } from '../../styles/themeTokens'
import { adaptProjectPatients, adaptTemplateMeta } from './adapters/datasetAdapter'
import { useProjectDatasetViewModel } from './hooks/useProjectDatasetViewModel'
import ProjectDatasetV2 from './components/ProjectDatasetV2'

const { Title, Text } = Typography

const ProjectDatasetView = () => {
  const { token } = theme.useToken()
  const { projectId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const rendererModeFromQuery = useMemo(() => {
    const search = new URLSearchParams(location.search)
    // 默认自动进入 V2；仅当显式传 renderer=v1 时切回 V1。
    return search.get('renderer') === 'v1' ? 'v1' : 'v2'
  }, [location.search])
  const showRendererSwitchFromQuery = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return search.get('rendererSwitch') === '1'
  }, [location.search])
  const [rendererMode, setRendererMode] = useState(rendererModeFromQuery)
  const [viewMode, setViewMode] = useState('penetration') // 'penetration' | 'overview'
  const [activeGroupKey, setActiveGroupKey] = useState(null)
  const [isOverviewCollapsed, setIsOverviewCollapsed] = useState(false)
  // 这里存 patient_id（不是 ProjectPatient.id），以便直接用于后端移除/抽取等接口
  const [selectedPatients, setSelectedPatients] = useState([])
  const [extractionModalVisible, setExtractionModalVisible] = useState(false)
  const [extractionModalGroups, setExtractionModalGroups] = useState([])
  const [extractionModalMode, setExtractionModalMode] = useState('incremental')
  const [exportModalVisible, setExportModalVisible] = useState(false)
  const [patientSelectionVisible, setPatientSelectionVisible] = useState(false)
  const [selectedNewPatients, setSelectedNewPatients] = useState([])
  const [fieldGroupDetailVisible, setFieldGroupDetailVisible] = useState(false)
  const [currentFieldGroup, setCurrentFieldGroup] = useState(null)
  const [currentPatient, setCurrentPatient] = useState(null)
  // 项目入组患者总数（用于患者统计，优于 expected_patient_count）
  const [enrolledPatientCount, setEnrolledPatientCount] = useState(0)
  const [editProjectVisible, setEditProjectVisible] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const projectStatusOptions = getProjectStatusOptions()
  
  // 字段来源弹窗状态
  const [fieldSourceModalVisible, setFieldSourceModalVisible] = useState(false)
  const [currentFieldSource, setCurrentFieldSource] = useState(null)
  
  // 文档详情弹窗状态
  const [docDetailVisible, setDocDetailVisible] = useState(false)
  const [docDetailDoc, setDocDetailDoc] = useState(null)
  
  // CRF 抽取任务状态
  const [extractionTaskId, setExtractionTaskId] = useState(null)
  const [extractionProgress, setExtractionProgress] = useState(null)
  const [isExtractionProgressCardDismissed, setIsExtractionProgressCardDismissed] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionTasks, setExtractionTasks] = useState([])
  const [extractionErrorModalVisible, setExtractionErrorModalVisible] = useState(false)
  
  // CRF 模板字段组（用于动态生成表格列）
  const [templateFieldGroups, setTemplateFieldGroups] = useState([])
  const [templateFieldMapping, setTemplateFieldMapping] = useState({})
  const [templateSchemaJson, setTemplateSchemaJson] = useState(null)
  
  // API 数据状态
  const [loading, setLoading] = useState(false)
  const [projectData, setProjectData] = useState(null)
  const [patientDataset, setPatientDataset] = useState([])
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  })

  // 当前页所有 patient_id（用于表头“全选”）
  const currentPagePatientIds = useMemo(() => {
    return (patientDataset || []).map(p => p?.patient_id).filter(Boolean)
  }, [patientDataset])

  const isAllCurrentPageSelected = useMemo(() => {
    return currentPagePatientIds.length > 0 && currentPagePatientIds.every(id => selectedPatients.includes(id))
  }, [currentPagePatientIds, selectedPatients])

  const isSomeCurrentPageSelected = useMemo(() => {
    return currentPagePatientIds.some(id => selectedPatients.includes(id)) && !isAllCurrentPageSelected
  }, [currentPagePatientIds, selectedPatients, isAllCurrentPageSelected])

  const toggleSelectAllCurrentPage = useCallback((checked) => {
    if (!currentPagePatientIds.length) return
    if (checked) {
      // 追加当前页所有 patient_id（保留其他页已选）
      const merged = Array.from(new Set([...(selectedPatients || []), ...currentPagePatientIds]))
      setSelectedPatients(merged)
    } else {
      // 取消当前页 patient_id（保留其他页已选）
      const rest = (selectedPatients || []).filter(id => !currentPagePatientIds.includes(id))
      setSelectedPatients(rest)
    }
  }, [currentPagePatientIds, selectedPatients])

  /**
   * 切换单个患者勾选状态。
   *
   * @param {string} patientId 患者 ID。
   * @param {boolean} checked 是否选中。
   * @returns {void}
   */
  const toggleSelectPatient = useCallback((patientId, checked) => {
    if (!patientId) return
    setSelectedPatients((prev) => {
      if (checked) return Array.from(new Set([...(prev || []), patientId]))
      return (prev || []).filter((id) => id !== patientId)
    })
  }, [])

  /**
   * 切换表格渲染器模式（V1/V2）。
   *
   * @param {{target:{value:string}}} event 事件对象。
   * @returns {void}
   */
  const handleRendererModeChange = useCallback((event) => {
    const nextMode = event?.target?.value === 'v2' ? 'v2' : 'v1'
    setRendererMode(nextMode)
    const nextSearch = new URLSearchParams(location.search)
    // 统一写入 renderer 参数，便于后端/链接显式控制版本。
    nextSearch.set('renderer', nextMode)
    const nextSearchText = nextSearch.toString()
    navigate({
      pathname: location.pathname,
      search: nextSearchText ? `?${nextSearchText}` : '',
    }, { replace: true })
  }, [location.pathname, location.search, navigate])
  
  // 患者选择弹框状态
  const [availablePatients, setAvailablePatients] = useState([])
  const [patientPoolLoading, setPatientPoolLoading] = useState(false)
  const [patientPoolPagination, setPatientPoolPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [patientPoolSearch, setPatientPoolSearch] = useState('')

  useEffect(() => {
    setRendererMode(rendererModeFromQuery)
  }, [rendererModeFromQuery])

  /**
   * 打开项目编辑弹窗。
   *
   * @returns {void}
   */
  const openProjectEditModal = useCallback(() => {
    setEditProjectVisible(true)
  }, [])

  // 加载项目受试者列表
  const fetchProjectPatients = useCallback(async (page = 1, pageSize = 20) => {
    if (!projectId) return
    
    setLoading(true)
    try {
      const response = await getProjectPatients(projectId, { page, page_size: pageSize })
      if (response.success) {
        const patients = adaptProjectPatients(response.data)
        setPatientDataset(patients)
        setPagination({
          current: response.pagination.page,
          pageSize: response.pagination.page_size,
          total: response.pagination.total
        })
        // 更新入组患者总数（用于患者统计卡片）
        if (typeof response.pagination.total === 'number') {
          setEnrolledPatientCount(response.pagination.total)
        }
      } else {
        message.error(response.message || '获取受试者列表失败')
      }
    } catch (error) {
      console.error('获取受试者列表失败:', error)
      message.error('获取受试者列表失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // 加载项目详情
  const fetchProjectDetail = useCallback(async () => {
    if (!projectId) return
    
    try {
      const response = await getProject(projectId)
      if (response.success) {
        setProjectData(response.data)
        
        // 保存模板字段组信息（用于动态生成表格列）
        if (response.data.template_info) {
          const { fieldGroups, fieldMapping } = adaptTemplateMeta(
            response.data.template_info.field_groups || [],
            response.data.template_info.db_field_mapping || {},
            response.data.template_info.schema || response.data.template_info.schema_json || null,
          )
          setTemplateFieldGroups(fieldGroups)
          setTemplateFieldMapping(fieldMapping)
        }
      }
    } catch (error) {
      console.error('获取项目详情失败:', error)
    }
  }, [projectId])

  /**
   * 保存项目元数据编辑。
   *
   * @returns {Promise<void>}
   */
  const handleSaveProjectMeta = useCallback(async () => {
    try {
      const values = await editForm.validateFields()
      const payload = buildProjectMetaUpdatePayload(values)
      const response = await updateProject(projectId, payload)

      if (!response?.success) {
        message.error(response?.message || '项目更新失败')
        return
      }

      message.success('项目更新成功')
      setEditProjectVisible(false)
      await fetchProjectDetail()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('research-project-rail-refresh'))
      }
    } catch (error) {
      console.error('项目更新失败:', error)
      message.error('项目更新失败')
    }
  }, [editForm, fetchProjectDetail, projectId])

  const fetchProjectTemplateSchema = useCallback(async () => {
    if (!projectId) return
    try {
      // 优先使用项目模板接口，确保 schema/field_groups/db_field_mapping 来自同一快照。
      const response = await getProjectTemplate(projectId)
      if (response?.success && response?.data && typeof response.data === 'object') {
        const template = response.data
        const { schema } = resolveTemplateAssets(template)
        if (schema && typeof schema === 'object') {
          setTemplateSchemaJson(schema)
          const { fieldGroups, fieldMapping } = adaptTemplateMeta(
            Array.isArray(template.field_groups) ? template.field_groups : [],
            template.db_field_mapping || {},
            schema,
          )
          if (fieldGroups.length > 0) {
            setTemplateFieldGroups(fieldGroups)
          }
          setTemplateFieldMapping(fieldMapping)
          return
        }
      }

      // 兼容回退：当项目模板接口缺失 schema 时，回退到 designer 接口读取 schema_json。
      const fallbackResponse = await getProjectTemplateDesigner(projectId)
      if (fallbackResponse?.success && fallbackResponse?.data?.schema_json && typeof fallbackResponse.data.schema_json === 'object') {
        setTemplateSchemaJson(fallbackResponse.data.schema_json)
        return
      }
      setTemplateSchemaJson(null)
    } catch (error) {
      console.error('获取项目模板 schema 失败:', error)
      setTemplateSchemaJson(null)
    }
  }, [projectId])

  /**
   * 手动刷新当前项目页数据。
   *
   * @returns {Promise<void>}
   */
  const handleManualRefresh = useCallback(async () => {
    await Promise.all([
      fetchProjectDetail(),
      fetchProjectTemplateSchema(),
      fetchProjectPatients(pagination.current, pagination.pageSize),
    ])
  }, [fetchProjectDetail, fetchProjectPatients, fetchProjectTemplateSchema, pagination.current, pagination.pageSize])

  /**
   * 跳转到项目内患者详情页。
   *
   * @param {string} patientId 患者 ID。
   * @returns {void}
   */
  const handleNavigatePatientDetail = useCallback((patientId) => {
    if (!patientId) return
    navigate(researchProjectPatientDetail(projectId, patientId))
  }, [navigate, projectId])

  // 加载患者数据池（用于添加患者弹框）
  const fetchPatientPool = useCallback(async (page = 1, pageSize = 10, search = '') => {
    setPatientPoolLoading(true)
    try {
      const response = await getPatientList({
        page,
        page_size: pageSize,
        search: search || undefined
      })
      if (response.success) {
        // 转换数据格式
        const patients = response.data.map(patient => ({
          key: patient.id,
          id: patient.id,
          patient_code: patient.patient_code,
          name: patient.name,
          gender: patient.gender,
          age: patient.age,
          diagnosis: patient.diagnosis || [],
          completeness: parseFloat(patient.data_completeness) || 0,
          projects: patient.projects || []  // 关联的项目列表
        }))
        setAvailablePatients(patients)
        setPatientPoolPagination({
          current: response.pagination.page,
          pageSize: response.pagination.page_size,
          total: response.pagination.total
        })
      } else {
        message.error(response.message || '获取患者列表失败')
      }
    } catch (error) {
      console.error('获取患者列表失败:', error)
      message.error('获取患者列表失败')
    } finally {
      setPatientPoolLoading(false)
    }
  }, [])

  // 用于追踪轮询是否需要继续
  const pollingRef = useRef(false)

  // 初始加载
  useEffect(() => {
    fetchProjectDetail()
    fetchProjectTemplateSchema()
    fetchProjectPatients()
  }, [fetchProjectDetail, fetchProjectTemplateSchema, fetchProjectPatients, location?.search])

  // 从“科研项目列表”的导出入口跳转过来时，自动打开导出弹窗
  useEffect(() => {
    if (location?.state?.openExport) {
      setExportModalVisible(true)
      // 清理 state，避免刷新/返回时重复触发
      navigate(`${location.pathname}${location.search || ''}`, { replace: true, state: {} })
    }
  }, [location?.state, location?.pathname, navigate])

  // 从侧边科研项目栏跳转过来时，统一在详情页打开“编辑项目信息”弹窗
  useEffect(() => {
    if (!location?.state?.openProjectEdit) return
    if (String(location?.state?.projectId || projectId) !== String(projectId)) return
    openProjectEditModal()
    navigate(`${location.pathname}${location.search || ''}`, { replace: true, state: {} })
  }, [location?.pathname, location?.search, location?.state, navigate, openProjectEditModal, projectId])

  useEffect(() => {
    if (!editProjectVisible || !projectData) return
    editForm.setFieldsValue(buildProjectMetaFormValues(projectData))
  }, [editForm, editProjectVisible, projectData])

  // 允许同页内的科研项目 rail 直接复用详情页的编辑弹窗逻辑
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    /**
     * 处理跨组件的项目编辑请求。
     *
     * @param {CustomEvent<{projectId?: string}>} event 编辑请求事件
     * @returns {void}
     */
    const handleProjectEditRequest = (event) => {
      if (String(event?.detail?.projectId) !== String(projectId)) return
      openProjectEditModal()
    }

    window.addEventListener(REQUEST_PROJECT_EDIT_EVENT, handleProjectEditRequest)
    return () => {
      window.removeEventListener(REQUEST_PROJECT_EDIT_EVENT, handleProjectEditRequest)
    }
  }, [openProjectEditModal, projectId])

  // ============ CRF 抽取任务管理 ============
  
  // 检查活跃任务（页面加载时调用）
  const checkActiveTask = useCallback(async () => {
    try {
      const response = await getActiveExtractionTask(projectId)
      
      if (response.success && response.data.has_active_task) {
        const activeTask = response.data.active_task
        setExtractionTaskId(activeTask.task_id)
        setExtractionProgress(activeTask)
        setIsExtractionProgressCardDismissed(false)
        setIsExtracting(true)
        
        // 恢复轮询
        pollExtractionProgress(activeTask.task_id)
        message.info('检测到正在进行的抽取任务，已恢复进度显示')
      }
    } catch (error) {
      console.error('检查活跃任务失败:', error)
    }
  }, [projectId])
  
  // 页面加载时检查活跃任务
  useEffect(() => {
    checkActiveTask()
    
    // 组件卸载时停止轮询
    return () => {
      pollingRef.current = false
    }
  }, [checkActiveTask])
  
  // 启动抽取任务（项目级一次性批量入队）
  const handleStartExtraction = async (patientIds = null, mode = 'incremental', targetGroups = null) => {
    try {
      setIsExtracting(true)
      const normalizedIds = Array.isArray(patientIds) && patientIds.length > 0 ? patientIds.filter(Boolean) : null
      // 将选中的 patient_id 映射为 project_patient_id；为空（全部）时不传，由后端解析项目内所有患者
      const projectPatientIds = normalizedIds
        ? patientDataset
            .filter((patient) => normalizedIds.includes(patient.patient_id) || normalizedIds.includes(patient.id))
            .map((patient) => patient.id || patient.project_patient_id)
            .filter(Boolean)
        : null

      const response = await updateProjectCrfFolderBatch(projectId, projectPatientIds)

      if (response.success) {
        const data = response.data || {}
        const createdJobs = Number(data.submitted_jobs || data.created_jobs || 0)
        const taskId = data.task_id || data.batch_id || data.job_ids?.[0] || ''
        setExtractionTaskId(taskId)
        setIsExtractionProgressCardDismissed(false)
        setSelectedPatients([])
        message.success(createdJobs > 0 ? `已提交 ${createdJobs} 个项目 CRF 抽取任务` : '暂无可提交的项目 CRF 抽取任务')

        // 开始轮询进度
        if (taskId) pollExtractionProgress(taskId)
        if (!taskId) setIsExtracting(false)
      } else {
        // 检查是否是因为已有活跃任务
        if (response.code === 40901 && response.data?.active_task) {
          const activeTask = response.data.active_task
          setExtractionTaskId(activeTask.task_id)
          setExtractionProgress(activeTask)
          setIsExtractionProgressCardDismissed(false)
          setSelectedPatients([])
          message.warning(response.message || '该项目已有正在进行的抽取任务')

          // 恢复轮询
          pollExtractionProgress(activeTask.task_id)
        } else {
          message.error(response.message || '启动抽取任务失败')
          setIsExtracting(false)
        }
      }
    } catch (error) {
      console.error('启动抽取任务失败:', error)
      message.error('启动抽取任务失败')
      setIsExtracting(false)
    }
  }

  const confirmAndStartExtraction = useCallback((patientIds = null, mode = 'incremental', targetGroups = null) => {
    const normalizedIds = Array.isArray(patientIds) && patientIds.length > 0 ? patientIds.filter(Boolean) : null
    const targetPatients = normalizedIds
      ? patientDataset.filter((patient) => normalizedIds.includes(patient.patient_id))
      : patientDataset
    const patientsWithHistory = targetPatients.filter((patient) => patient.hasExtractionHistory)

    if (patientsWithHistory.length === 0 && normalizedIds) {
      handleStartExtraction(normalizedIds, mode, targetGroups)
      return
    }

    const previewNames = patientsWithHistory
      .slice(0, 5)
      .map((patient) => patient.name || patient.patientId || patient.patient_id)
      .join('、')
    const extraCount = Math.max(0, patientsWithHistory.length - 5)

    Modal.confirm({
      title: '确认重新抽取？',
      content: (
        <div>
          <div>
            {normalizedIds
              ? `该科研项目中有 ${patientsWithHistory.length} 位患者已有抽取记录。`
              : '本次将对项目内患者发起抽取，可能包含已有抽取记录的患者。'}
          </div>
          <div style={{ marginTop: 8 }}>重新抽取会清空历史记录并重新抽取，请确认是否继续。</div>
          {previewNames ? (
            <div style={{ marginTop: 8, color: token.colorTextSecondary }}>
              涉及患者：{previewNames}{extraCount > 0 ? ` 等 ${patientsWithHistory.length} 位` : ''}
            </div>
          ) : null}
        </div>
      ),
      okText: '确认重新抽取',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => handleStartExtraction(normalizedIds, mode, targetGroups),
    })
  }, [handleStartExtraction, patientDataset, token.colorTextSecondary])
  
  // 轮询抽取进度
  const pollExtractionProgress = useCallback(async (taskId) => {
    pollingRef.current = true
    
    const poll = async () => {
      // 如果停止轮询，直接返回
      if (!pollingRef.current) return
      
      try {
        const response = await getCrfExtractionProgress(projectId, taskId)
        
        if (response.success) {
          const progress = response.data
          setExtractionProgress(progress)
          
          // 检查任务是否完成或取消
          if (progress.status === 'completed' || progress.status === 'completed_with_errors' || progress.status === 'failed' || progress.status === 'cancelled') {
            setIsExtracting(false)
            setExtractionTaskId(null)
            pollingRef.current = false
            
            if (progress.status === 'completed') {
              message.success(`抽取完成！成功处理 ${progress.success_count} 位患者`)
            } else if (progress.status === 'completed_with_errors') {
              message.warning(`抽取完成，但有 ${progress.error_count} 个错误`)
            } else if (progress.status === 'cancelled') {
              message.info('抽取任务已取消')
            } else {
              message.error('抽取任务失败')
            }
            
            // 刷新患者数据
            fetchProjectPatients()
            return
          }
          
          // 继续轮询
          if (pollingRef.current) {
            setTimeout(() => poll(), 2000)
          }
        }
      } catch (error) {
        console.error('查询进度失败:', error)
        // 出错时也继续轮询
        if (pollingRef.current) {
          setTimeout(() => poll(), 3000)
        }
      }
    }
    
    poll()
  }, [projectId, fetchProjectPatients])
  
  // 获取历史抽取任务
  const fetchExtractionTasks = useCallback(async () => {
    try {
      const response = await getProjectExtractionTasks(projectId, 5)
      if (response.success) {
        setExtractionTasks(response.data.tasks || [])
      }
    } catch (error) {
      console.error('获取抽取任务列表失败:', error)
    }
  }, [projectId])
  
  // 取消/暂停抽取任务
  const handleCancelExtraction = async () => {
    try {
      const response = await cancelCrfExtraction(projectId)
      
      if (response.success) {
        message.success('抽取任务已取消')
        pollingRef.current = false
        setIsExtracting(false)
        setExtractionTaskId(null)
        setExtractionProgress(prev => prev ? { ...prev, status: 'cancelled' } : null)
      } else {
        message.error(response.message || '取消任务失败')
      }
    } catch (error) {
      console.error('取消任务失败:', error)
      message.error('取消任务失败')
    }
  }
  
  // 重新抽取：先 reset 解锁，再立即 start（合并为一步）
  const handleReextract = async (mode = 'incremental', patientIds = null) => {
    try {
      const resetResp = await resetCrfExtraction(projectId)
      if (!resetResp.success) {
        message.error(resetResp.message || '重置任务状态失败')
        return
      }
      pollingRef.current = false
      setIsExtracting(false)
      setExtractionTaskId(null)
      setExtractionProgress(null)
      // 紧接着启动新一轮抽取
      await handleStartExtraction(patientIds, mode)
    } catch (error) {
      console.error('重新抽取失败:', error)
      message.error('重新抽取失败')
    }
  }

  
  // 加载历史任务
  useEffect(() => {
    if (projectId) {
      fetchExtractionTasks()
    }
  }, [projectId, fetchExtractionTasks])

  // 根据URL参数获取项目信息（优先使用 API 数据）
  // 从已加载的患者数据中实时计算平均完整度（更精确）
  const computedAvgCompleteness = useMemo(() => {
    if (patientDataset && patientDataset.length > 0) {
      const total = patientDataset.reduce((sum, p) => sum + (p.overallCompleteness || 0), 0)
      return Math.round(total / patientDataset.length)
    }
    // 如果患者数据未加载，使用后端返回的 avg_completeness
    if (projectData?.avg_completeness != null) {
      return Math.round(projectData.avg_completeness)
    }
    return 0
  }, [patientDataset, projectData])

  const actualPatientTotal = enrolledPatientCount || projectData?.actual_patient_count || 0
  const expectedPatientTotal = projectData?.expected_patient_count || null
  const projectInfo = projectData ? {
    id: projectData.id,
    name: projectData.project_name,
    description: projectData.description,
    status: projectData.status,
    totalPatients: actualPatientTotal,
    expectedPatients: expectedPatientTotal,
    extractedPatients: actualPatientTotal,
    completeness: computedAvgCompleteness,
    crfTemplate: projectData?.template_info?.template_name
      || projectData?.template_scope_config?.template_name
      || projectData?.template_scope_config?.template_id
      || (projectData?.crf_template_id ? '已关联模板' : '未关联模板'),
    lastUpdate: projectData.updated_at
  } : {
    id: projectId,
    name: '加载中...',
    description: '项目信息加载中...',
    status: 'unknown',
    totalPatients: 0,
    expectedPatients: null,
    extractedPatients: 0,
    completeness: 0,
    crfTemplate: '未关联模板',
    lastUpdate: '-'
  }

  const projectUpdateDisplay = formatIsoDateDisplay(projectInfo.lastUpdate)

  // 当前项目绑定的 CRF 模板 ID（用于跳转只读预览）
  const currentTemplateId = projectData?.template_info?.template_id
    || projectData?.template_scope_config?.template_id
    || projectData?.crf_template_id

  const projectDatasetViewModel = useProjectDatasetViewModel({
    projectData,
    patientDataset,
    templateFieldGroups,
    templateFieldMapping,
    templateSchemaJson,
    selectedPatients,
    activeGroupKey,
  })

  useEffect(() => {
    if (!activeGroupKey && projectDatasetViewModel.activeGroupKey) {
      setActiveGroupKey(projectDatasetViewModel.activeGroupKey)
    }
  }, [activeGroupKey, projectDatasetViewModel.activeGroupKey])

  // 检查患者是否已关联当前项目
  // 已入组本项目（非退出状态）才视为“在本项目中”，不可重复选择；曾退出的可重新选择入组
  const isPatientInCurrentProject = useCallback((patient) => {
    if (!patient.projects || !projectId) return false
    return patient.projects.some(
      p => p.id === projectId && p.enrollment_status !== 'withdrawn'
    )
  }, [projectId])

  // 患者选择表格列定义
  const patientColumns = [
    {
      title: '患者编号',
      dataIndex: 'patient_code',
      key: 'patient_code',
      width: 120
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 80,
      render: (name) => name ? maskName(name) : '-'
    },
    {
      title: '性别',
      dataIndex: 'gender',
      key: 'gender',
      width: 60
    },
    {
      title: '年龄',
      dataIndex: 'age',
      key: 'age',
      width: 60,
      render: (age) => age ? `${age}岁` : '-'
    },
    {
      title: '诊断',
      dataIndex: 'diagnosis',
      key: 'diagnosis',
      render: (diagnosis) => (
        <Space wrap size={4}>
          {diagnosis && diagnosis.length > 0 ? diagnosis.map((d, idx) => (
            <Tag key={idx} size="small">{d}</Tag>
          )) : <Text type="secondary">-</Text>}
        </Space>
      )
    },
    {
      title: '完整度',
      dataIndex: 'completeness',
      key: 'completeness',
      width: 80,
      render: (completeness) => (
        <Text style={{ 
          color: completeness >= 90 ? token.colorSuccess : completeness >= 70 ? token.colorWarning : token.colorError
        }}>
          {completeness}%
        </Text>
      )
    },
    {
      title: '项目状态',
      dataIndex: 'projects',
      key: 'projects',
      width: 200,
      render: (projects, record) => {
        if (!projects || projects.length === 0) {
          return <Tag color="green">未关联</Tag>
        }
        
        // 检查是否关联了当前项目
        const isInCurrentProject = isPatientInCurrentProject(record)
        
        return (
          <Space wrap size={4}>
            {projects.map((project) => {
              const isCurrentProject = project.id === projectId
              const isWithdrawn = isCurrentProject && project.enrollment_status === 'withdrawn'
              return (
                <Tooltip key={project.id} title={project.project_name + (isWithdrawn ? '（已退出，可重新选择入组）' : '')}>
                  <Tag 
                    color={isCurrentProject ? (isWithdrawn ? 'orange' : 'red') : 'blue'}
                    style={isCurrentProject ? { fontWeight: 'bold' } : {}}
                  >
                    {isCurrentProject ? (isWithdrawn ? '本项目(已退出)' : '本项目') : (
                      project.project_name.length > 8 
                        ? `${project.project_name.substring(0, 8)}...` 
                        : project.project_name
                    )}
                  </Tag>
                </Tooltip>
              )
            })}
          </Space>
        )
      }
    }
  ]

  // 从模板字段组和患者实际数据计算各字段组的完整度
  const crfFieldGroups = useMemo(() => {
    if (!templateFieldGroups || templateFieldGroups.length === 0) return []
    return templateFieldGroups.map(group => {
      const fieldCount = (group.db_fields || []).length
      // 从已加载的患者数据中统计该组的平均完整度
      let avgPercent = 0
      if (patientDataset && patientDataset.length > 0 && fieldCount > 0) {
        let totalFilled = 0
        let totalPatientFields = 0
        patientDataset.forEach(p => {
          const gData = p.crfGroups?.[group.group_id]
          if (gData) {
            totalFilled += (gData.filled_count || 0)
            totalPatientFields += (gData.total_count || fieldCount)
          } else {
            totalPatientFields += fieldCount
          }
        })
        avgPercent = totalPatientFields > 0 ? Math.round((totalFilled / totalPatientFields) * 100) : 0
      }
      const status = avgPercent >= 90 ? 'completed' : avgPercent > 0 ? 'partial' : 'incomplete'
      return {
        group_id: group.group_id,
        name: group.group_name,
        fields: (group.db_fields || []).map(f => f.split('/').pop()),
        status,
        completeness: avgPercent
    }
    })
  }, [templateFieldGroups, patientDataset])

  // 获取置信度颜色
  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'high': return token.colorSuccess
      case 'medium': return token.colorWarning
      case 'low': return token.colorError
      default: return token.colorBorder
    }
  }

  // 获取完整度颜色
  const getCompletenessColor = (completeness) => {
    if (completeness >= 90) return token.colorSuccess
    if (completeness >= 70) return token.colorWarning
    return token.colorError
  }

  // 渲染字段单元格
  const renderFieldCell = (fieldData, fieldName, record) => {
    // 处理空值或无数据的情况
    if (!fieldData || fieldData.value === null || fieldData.value === undefined || fieldData.value === '') {
      return (
        <div style={{ textAlign: 'center', height: 22, lineHeight: '22px' }}>
          <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>-</span>
        </div>
      )
    }

    // 获取来源和置信度，设置默认值
    const source = fieldData.source || '病历系统'
    const confidence = fieldData.confidence !== undefined && fieldData.confidence !== null ? fieldData.confidence : 1.0
    const bgColor = getConfidenceColor(confidence)
    
    // 格式化显示值
    const formatDisplayValue = (value) => {
      const leafFromFieldName = (name) => {
        if (!name) return null
        const s = String(name)
        if (s.includes('/')) return s.split('/').slice(-1)[0].trim()
        if (s.includes('.')) return s.split('.').slice(-1)[0].trim()
        return s.trim()
      }

      const toShortString = (v, max = 80) => {
        if (v === null || v === undefined) return ''
        const s = String(v).replace(/\s+/g, ' ').trim()
        return s.length > max ? s.slice(0, max) + '...' : s
      }

      const summarizeObject = (obj) => {
        if (!obj || typeof obj !== 'object') return ''
        // 1) 常见：{value: xxx}
        if (Object.prototype.hasOwnProperty.call(obj, 'value') && (typeof obj.value !== 'object')) {
          return toShortString(obj.value, 80)
        }
        // 2) 优先用 field_name 或 fieldName 的叶子做 key 命中
        const preferKeys = [
          fieldData?.field_name,
          leafFromFieldName(fieldName),
          'name',
          'type',
          'label',
          'id',
        ].filter(Boolean)
        for (const k of preferKeys) {
          if (Object.prototype.hasOwnProperty.call(obj, k) && (typeof obj[k] !== 'object')) {
            return toShortString(obj[k], 80)
          }
        }
        // 3) 退化：拼接若干标量键值对
        const parts = []
        for (const [k, v] of Object.entries(obj)) {
          if (v === null || v === undefined) continue
          if (typeof v === 'object') continue
          parts.push(`${k}:${toShortString(v, 36)}`)
          if (parts.length >= 3) break
        }
        if (parts.length) return parts.join(' | ')
        // 4) 最后：JSON 截断
        try {
          return toShortString(JSON.stringify(obj), 80)
        } catch (e) {
          return '...'
        }
      }

      if (Array.isArray(value)) {
        // 数组：显示记录数（0 条也要明确展示，避免误解为“没结果”）
        if (value.length === 0) return '0条'
        const first = value[0]
        const firstStr = typeof first === 'object' ? summarizeObject(first) : toShortString(first, 40)
        return value.length > 1 ? `${firstStr} +${value.length - 1}` : firstStr
      }
      if (typeof value === 'object') {
        return summarizeObject(value) || '...'
      }
      // 字符串：适度截断，避免超长文本撑爆单元格
      return toShortString(value, 80)
    }
    
    // 完整值用于 tooltip
    const fullValue = (() => {
      const v = fieldData.value
      if (v === null || v === undefined) return ''
      if (Array.isArray(v)) {
        return v.map(x => {
          if (x === null || x === undefined) return ''
          if (typeof x === 'object') {
            try { return JSON.stringify(x) } catch (e) { return String(x) }
          }
          return String(x)
        }).join(', ')
      }
      if (typeof v === 'object') {
        try { return JSON.stringify(v) } catch (e) { return String(v) }
      }
      return String(v)
    })()
    
    return (
      <Tooltip 
        title={
          <div style={{ maxWidth: 300, wordBreak: 'break-word' }}>
            <div style={{ marginBottom: 4 }}>{fullValue}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>来源: {source} | 置信度: {(confidence * 100).toFixed(0)}%</div>
          </div>
        }
        placement="topLeft"
      >
        <div 
          style={{ 
            background: `${bgColor}15`,
            border: `1px solid ${bgColor}40`,
            borderRadius: 4,
            padding: '4px 8px',
            cursor: 'pointer',
            minHeight: 28,
            lineHeight: '20px',
            wordBreak: 'break-word'
          }}
          onClick={() => handleViewFieldSource(record.patientId, fieldName, fieldData, record, { fieldPath: fieldName })}
        >
          <span style={{ fontSize: 14 }}>
            {formatDisplayValue(fieldData.value)}
          </span>
        </div>
      </Tooltip>
    )
  }

  // 把任意值安全格式化成可渲染文本，避免 React 直接渲染 object 导致白屏
  const formatAnyValueForText = (value, maxLen = 200) => {
    if (value === null || value === undefined || value === '') return '-'
    let s = ''
    if (Array.isArray(value)) {
      // 数组：递归格式化每一项
      s = value.map(v => formatAnyValueForText(v, maxLen)).join(', ')
    } else if (typeof value === 'object') {
      try {
        s = JSON.stringify(value)
      } catch (e) {
        s = String(value)
      }
    } else {
      s = String(value)
    }
    // 控制 tooltip 内容体积，避免超长渲染卡顿
    if (maxLen && s.length > maxLen) return s.slice(0, maxLen) + '...'
    return s
  }

  const isEmptyFieldValue = (value) => {
    if (value === null || value === undefined || value === '') return true
    if (Array.isArray(value)) return value.length === 0
    if (typeof value === 'object') return Object.keys(value || {}).length === 0
    return false
  }

  const getLeafFieldName = (fieldPath) => {
    if (!fieldPath) return ''
    const parts = String(fieldPath)
      .split('/')
      .map(p => p.trim())
      .filter(Boolean)
      .filter(p => !/^\[\d+\]$/.test(p))
    return parts.length ? parts[parts.length - 1] : String(fieldPath)
  }

  const stripIndexFromPath = (fieldPath) => String(fieldPath || '').replace(/\/\[\d+\]/g, '')

  const splitPathSegments = (fieldPath) => String(fieldPath || '')
    .split('/')
    .map(p => p.trim())
    .filter(Boolean)
    .filter(p => !/^\[\d+\]$/.test(p))

  const parseExtendedConfig = (schemaNode) => {
    if (!schemaNode || typeof schemaNode !== 'object') return null
    const raw = schemaNode['x-extended-config']
    if (!raw) return null
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : null
      } catch (_error) {
        return null
      }
    }
    return typeof raw === 'object' ? raw : null
  }

  const isMultiRowTableSchema = (schemaNode) => {
    if (!schemaNode || typeof schemaNode !== 'object') return false
    const ext = parseExtendedConfig(schemaNode)
    if (schemaNode?.['x-display'] === 'table') {
      if (schemaNode?.['x-row-constraint'] === 'multi_row') return true
      if (schemaNode?.['x-table-config']?.multiRow === true) return true
      if (ext?.tableRows === 'multiRow') return true
    }
    if (schemaNode?.type === 'array' && schemaNode?.items?.type === 'object') return true
    return false
  }

  const resolveSchemaNodeByPath = (schema, fieldPath) => {
    if (!schema || typeof schema !== 'object' || !fieldPath) return null
    const segs = splitPathSegments(fieldPath)
    let node = schema
    for (const seg of segs) {
      if (!node || typeof node !== 'object') return null
      if (node.type === 'array' && node.items) {
        node = node.items
      }
      if (node.type === 'object' && node.properties && Object.prototype.hasOwnProperty.call(node.properties, seg)) {
        node = node.properties[seg]
      } else {
        return null
      }
    }
    return node
  }

  const inferFieldDisplayMeta = (fieldPath, value) => {
    const schemaNode = resolveSchemaNodeByPath(templateSchemaJson, stripIndexFromPath(fieldPath))
    const schemaDisplay = schemaNode?.['x-display']
    const schemaRowConstraint = schemaNode?.['x-row-constraint']
    const schemaType = schemaNode?.type
    const isNestedTableBySchema = isMultiRowTableSchema(schemaNode)
    const isObjectArrayValue = Array.isArray(value) && value.every(item => item && typeof item === 'object' && !Array.isArray(item))

    return {
      schemaNode,
      schemaDisplay,
      schemaRowConstraint,
      schemaType,
      isNestedTable: isNestedTableBySchema || (schemaType === 'array' && isObjectArrayValue)
    }
  }

  const createFieldOrderIndex = (groupConfig) => {
    const dbFields = Array.isArray(groupConfig?.db_fields) ? groupConfig.db_fields : []
    const orderIndex = new Map()
    dbFields.forEach((fieldPath, idx) => {
      if (typeof fieldPath !== 'string') return
      const normalized = stripIndexFromPath(fieldPath)
      const leaf = getLeafFieldName(normalized)
      if (!orderIndex.has(normalized)) orderIndex.set(normalized, idx)
      if (leaf && !orderIndex.has(leaf)) orderIndex.set(leaf, idx)
    })
    return orderIndex
  }

  const getFieldOrderValue = (fieldPath, orderIndex) => {
    const normalized = stripIndexFromPath(fieldPath)
    const leaf = getLeafFieldName(normalized)
    if (orderIndex.has(normalized)) return orderIndex.get(normalized)
    if (leaf && orderIndex.has(leaf)) return orderIndex.get(leaf)
    return Number.MAX_SAFE_INTEGER
  }

  const isObjectArray = (value) => {
    return Array.isArray(value) && value.every((item) => item && typeof item === 'object' && !Array.isArray(item))
  }

  const getTemplateGroupConfig = (groupData, groupName) => {
    const gid = groupData?.group_id
    if (gid) {
      const byId = (templateFieldGroups || []).find(g => g.group_id === gid)
      if (byId) return byId
    }
    if (groupName) {
      const byName = (templateFieldGroups || []).find(g => g.group_name === groupName)
      if (byName) return byName
    }
    return null
  }

  const normalizeGroupForDisplay = (groupData, groupConfig = null) => {
    const fields = groupData?.fields || {}
    const orderIndex = createFieldOrderIndex(groupConfig)
    const fieldEntries = Object.entries(fields)
      .filter(([, data]) => data && typeof data === 'object')
      .sort(([pathA], [pathB]) => {
        const a = getFieldOrderValue(pathA, orderIndex)
        const b = getFieldOrderValue(pathB, orderIndex)
        if (a !== b) return a - b
        return String(pathA).localeCompare(String(pathB), 'zh-CN')
      })

    const indexedRowMap = new Map() // rowIndex -> { cells, nestedTables }
    const scalarCells = []
    const groupRepeatableByTemplate = Boolean(groupConfig?.is_repeatable)

    fieldEntries.forEach(([fieldPath, fieldData]) => {
      const value = fieldData?.value
      const leafName = getLeafFieldName(fieldPath)
      const pathText = String(fieldPath)
      const indices = [...pathText.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]))
      const meta = inferFieldDisplayMeta(fieldPath, value)

      // 兼容形态：可重复组字段本身即数组记录（无 [0] 索引路径）
      // 例如：fields.treatment_records.value = [{...}, {...}]
      if (groupRepeatableByTemplate && indices.length === 0 && isObjectArray(value)) {
        value.forEach((rowItem, rowIndex) => {
          const rowObj = indexedRowMap.get(rowIndex) || { rowIndex, cells: [], nestedTables: {} }
          Object.entries(rowItem || {}).forEach(([subFieldName, subValue]) => {
            if (isObjectArray(subValue)) {
              rowObj.nestedTables[subFieldName] = subValue
              return
            }
            rowObj.cells.push({
              fieldPath: `${fieldPath}/[${rowIndex}]/${subFieldName}`,
              fieldName: subFieldName,
              fieldData: {
                ...fieldData,
                value: subValue,
              },
              value: subValue,
              meta: inferFieldDisplayMeta(`${fieldPath}/${subFieldName}`, subValue),
            })
          })
          indexedRowMap.set(rowIndex, rowObj)
        })
        return
      }

      if (groupRepeatableByTemplate && indices.length > 0) {
        const rowIndex = indices[0]
        const rowObj = indexedRowMap.get(rowIndex) || { rowIndex, cells: [], nestedTables: {} }

        // group repeatable + nested table value: 按字段名挂到该行的 nested table
        if (meta.isNestedTable && Array.isArray(value)) {
          const tableKey = leafName || '明细'
          rowObj.nestedTables[tableKey] = value
        } else if (indices.length > 1) {
          // 深层索引：如 /[0]/检验结果/[3]/检测值，归并到 nestedTables
          const tableKey = splitPathSegments(fieldPath).slice(-2, -1)[0] || '明细'
          const innerIndex = indices[1]
          if (!Array.isArray(rowObj.nestedTables[tableKey])) rowObj.nestedTables[tableKey] = []
          if (!rowObj.nestedTables[tableKey][innerIndex]) rowObj.nestedTables[tableKey][innerIndex] = {}
          rowObj.nestedTables[tableKey][innerIndex][leafName] = value
        } else {
          rowObj.cells.push({
            fieldPath,
            fieldName: leafName,
            fieldData,
            value,
            meta
          })
        }
        indexedRowMap.set(rowIndex, rowObj)
        return
      }

      if (meta.isNestedTable && Array.isArray(value)) {
        scalarCells.push({
          fieldPath,
          fieldName: leafName,
          fieldData,
          value,
          meta
        })
        return
      }

      if (!groupRepeatableByTemplate && indices.length > 0) {
        const rowIndex = indices[0]
        const rowObj = indexedRowMap.get(rowIndex) || { rowIndex, cells: [], nestedTables: {} }
        rowObj.cells.push({
          fieldPath,
          fieldName: leafName,
          fieldData,
          value,
          meta
        })
        indexedRowMap.set(rowIndex, rowObj)
        return
      }

      scalarCells.push({
        fieldPath,
        fieldName: leafName,
        fieldData,
        value,
        meta
      })
    })

    const rows = Array.from(indexedRowMap.values())
      .sort((a, b) => a.rowIndex - b.rowIndex)
      .map((row) => ({
        rowIndex: row.rowIndex,
        cells: (row.cells || [])
          .filter(cell => cell && cell.fieldName)
          .sort((a, b) => {
            const oa = getFieldOrderValue(a.fieldPath, orderIndex)
            const ob = getFieldOrderValue(b.fieldPath, orderIndex)
            if (oa !== ob) return oa - ob
            return String(a.fieldName).localeCompare(String(b.fieldName), 'zh-CN')
          }),
        nestedTables: row.nestedTables || {}
      }))
      .filter(row => row.cells.length > 0 || Object.keys(row.nestedTables || {}).length > 0)

    const orderedScalarCells = scalarCells
      .filter(cell => cell && cell.fieldName)
      .sort((a, b) => {
        const oa = getFieldOrderValue(a.fieldPath, orderIndex)
        const ob = getFieldOrderValue(b.fieldPath, orderIndex)
        if (oa !== ob) return oa - ob
        return String(a.fieldName).localeCompare(String(b.fieldName), 'zh-CN')
      })

    const tableFieldOrder = []
    const nestedTableOrder = []
    rows.forEach((row) => {
      row.cells.forEach((cell) => {
        if (!tableFieldOrder.includes(cell.fieldName)) {
          tableFieldOrder.push(cell.fieldName)
        }
      })
      Object.keys(row.nestedTables || {}).forEach((tableName) => {
        if (!nestedTableOrder.includes(tableName)) {
          nestedTableOrder.push(tableName)
        }
      })
    })

    const rowsForTable = rows.map((row) => {
      const cellMap = {}
      row.cells.forEach((cell) => {
        cellMap[cell.fieldName] = cell
      })
      return {
        ...cellMap,
        _rowIndex: row.rowIndex,
        _cellMap: cellMap,
        _nestedTables: row.nestedTables || {},
      }
    })

    const filledCount = fieldEntries.filter(([, data]) => !isEmptyFieldValue(data?.value)).length
    const totalCount = fieldEntries.length

    const previewText = rows.length > 0
      ? rows
          .slice(0, 2)
          .map(row => row.cells.slice(0, 2).map(cell => formatAnyValueForText(cell.value, 20)).filter(Boolean).join('；'))
          .filter(Boolean)
          .join(' ｜ ')
      : scalarCells
          .filter(cell => !isEmptyFieldValue(cell.value))
          .slice(0, 3)
          .map(cell => formatAnyValueForText(cell.value, 20))
          .join('；')

    return {
      rows,
      rowsForTable,
      tableFieldOrder,
      nestedTableOrder,
      scalarCells: orderedScalarCells,
      rowCount: rows.length,
      filledCount,
      totalCount,
      hasData: rows.length > 0 || orderedScalarCells.some(cell => !isEmptyFieldValue(cell.value)),
      previewText: previewText || '暂无数据'
    }
  }

  // 渲染可重复组单元格 - 简化版：只显示📋和记录数，详细信息在悬停提示中
  const renderRepeatableGroupCell = (groupData, groupName, record) => {
    if (!groupData || !groupData.records || groupData.records.length === 0) {
      return (
        <div style={{ textAlign: 'center' }}>
          <Tooltip title="暂无数据，点击开始抽取">
            <Button 
              type="link" 
              size="small" 
              style={{ color: token.colorTextSecondary }}
              onClick={() => handleExtractGroup(record.patientId, groupName)}
            >
              未抽取
            </Button>
          </Tooltip>
        </div>
      )
    }

    const color = getCompletenessColor(groupData.completeness)
    return (
      <div style={{ textAlign: 'center' }}>
        <Tooltip 
          title={
            <div>
              <div>完成度: {groupData.completeness}%</div>
              <div>记录数: {groupData.records.length}条</div>
              <div>状态: {groupData.status === 'completed' ? '已完成' : groupData.status === 'partial' ? '部分完成' : '待处理'}</div>
            </div>
          }
        >
          <Button 
            type="link" 
            size="small"
            onClick={() => handleViewFieldGroupDetail(record, groupName, groupData)}
            style={{ padding: 0 }}
          >
            <Space size={4}>
              📋
              <Text style={{ color }}>
                {groupData.records.length}条
              </Text>
            </Space>
          </Button>
        </Tooltip>
      </div>
    )
  }

  const openDocDetail = useCallback((docId) => {
    setDocDetailDoc({ id: docId })
    setDocDetailVisible(true)
  }, [])

  // 根据模板字段组动态生成表格列
  const generateDynamicColumns = useMemo(() => {
    // 聚合当前页所有受试者的文档，按 document_sub_type / document_type 分组
    // 同时保留每个文档的 id 和 file_name 用于点击跳转
    const docTypeGroups = {}
    const seenDocIds = new Set()
    for (const p of patientDataset) {
      const docs = p.crf_data?._documents || {}
      for (const d of Object.values(docs)) {
        if (seenDocIds.has(d.id)) continue
        seenDocIds.add(d.id)
        const label = d.document_sub_type || d.document_type || d.file_name || '未知'
        if (!docTypeGroups[label]) docTypeGroups[label] = []
        docTypeGroups[label].push({
          id: d.id,
          file_name: d.file_name || d.id,
          patient_name: p.name || p.subject_id || ''
        })
      }
    }

    const matchesSource = (docLabel, sourceName) => {
      if (!docLabel || !sourceName) return false
      const a = docLabel.replace(/[\s/\\-]/g, '').toLowerCase()
      const b = sourceName.replace(/[\s/\\-]/g, '').toLowerCase()
      return a.includes(b) || b.includes(a)
    }

    const buildSourcesPopoverContent = (fieldLabel, groupLabel, sources) => {
      const primary = (sources?.primary || []).filter(Boolean)
      const secondary = (sources?.secondary || []).filter(Boolean)
      const allSourceNames = [...primary, ...secondary]

      const primaryMatched = []
      const secondaryMatched = []
      const unmatched = []
      for (const [label, docs] of Object.entries(docTypeGroups)) {
        let hit = false
        for (const s of primary) {
          if (matchesSource(label, s)) { primaryMatched.push({ label, docs }); hit = true; break }
        }
        if (!hit) {
          for (const s of secondary) {
            if (matchesSource(label, s)) { secondaryMatched.push({ label, docs }); hit = true; break }
          }
        }
        if (!hit) unmatched.push({ label, docs })
      }

      const hasDocInfo = patientDataset.length > 0 && Object.keys(docTypeGroups).length > 0

      const renderDocList = (docs) => (
        <div style={{ marginLeft: 16, marginTop: 2, marginBottom: 4 }}>
          {docs.map((d, i) => (
            <div key={d.id || i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
              <FileTextOutlined style={{ fontSize: 12, color: token.colorTextSecondary, flexShrink: 0 }} />
              <a
                style={{ fontSize: 12, color: token.colorPrimary, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}
                title={d.file_name}
                onClick={(e) => { e.stopPropagation(); openDocDetail(d.id) }}
              >
                {d.file_name}
              </a>
              {d.patient_name && (
                <span style={{ fontSize: 12, color: token.colorTextSecondary, flexShrink: 0 }}>({d.patient_name})</span>
              )}
            </div>
          ))}
        </div>
      )

      return (
        <div style={{ maxWidth: 440, maxHeight: 420, overflow: 'auto' }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
            {fieldLabel}
            {groupLabel ? <span style={{ fontWeight: 400, color: token.colorTextSecondary }}>（{groupLabel}）</span> : null}
          </div>
          <div style={{ marginBottom: 4 }}>
            <Text strong>首要来源：</Text>
            <span>{primary.length ? primary.join('、') : '（空）'}</span>
          </div>
          <div style={{ marginBottom: hasDocInfo ? 8 : 0 }}>
            <Text strong>次要来源：</Text>
            <span>{secondary.length ? secondary.join('、') : '（空）'}</span>
          </div>
          {hasDocInfo && (
            <div style={{ borderTop: `1px solid ${token.colorBorder}`, paddingTop: 8, marginTop: 2 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: token.colorPrimary, fontSize: 12 }}>
                实际文档匹配（本页 {patientDataset.length} 位受试者）
              </div>
              <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>
                抽取策略：优先使用全部首要文档；若首要覆盖不足则回退次要文档
              </div>
              {primaryMatched.map((m, i) => (
                <div key={`p${i}`} style={{ marginBottom: 4 }}>
                  <span style={{ color: token.colorSuccess, fontWeight: 500, fontSize: 12 }}>● 首要</span>{' '}
                  <span style={{ fontSize: 12 }}>{m.label}</span>
                  <span style={{ color: token.colorTextSecondary, marginLeft: 4, fontSize: 12 }}>× {m.docs.length}</span>
                  {renderDocList(m.docs)}
                </div>
              ))}
              {secondaryMatched.map((m, i) => (
                <div key={`s${i}`} style={{ marginBottom: 4 }}>
                  <span style={{ color: token.colorWarning, fontWeight: 500, fontSize: 12 }}>● 次要</span>{' '}
                  <span style={{ fontSize: 12 }}>{m.label}</span>
                  <span style={{ color: token.colorTextSecondary, marginLeft: 4, fontSize: 12 }}>× {m.docs.length}</span>
                  {renderDocList(m.docs)}
                </div>
              ))}
              {primaryMatched.length === 0 && secondaryMatched.length === 0 && allSourceNames.length > 0 && (
                <div style={{ color: token.colorError, fontSize: 12 }}>⚠ 无匹配文档</div>
              )}
              {unmatched.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>其他文档：</span>
                  {unmatched.map((u, i) => (
                    <span key={i} style={{ fontSize: 12 }}>
                      {i > 0 ? '、' : ''}{u.label}
                      <span style={{ color: token.colorTextTertiary }}>({u.docs.length})</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    // 基础列：选择框和编号
    const baseColumns = [
      {
        title: (
          <Checkbox
            checked={isAllCurrentPageSelected}
            indeterminate={isSomeCurrentPageSelected}
            onChange={(e) => toggleSelectAllCurrentPage(e.target.checked)}
          />
        ),
        dataIndex: 'selection',
        key: 'selection',
        width: 50,
        render: (_, record) => (
          <Checkbox
            checked={selectedPatients.includes(record.patient_id)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedPatients([...selectedPatients, record.patient_id])
              } else {
                setSelectedPatients(selectedPatients.filter(id => id !== record.patient_id))
              }
            }}
          />
        )
      },
      {
        title: '编号',
        dataIndex: 'subject_id',
        key: 'subject_id',
        width: 120,
        fixed: 'left',
        render: (subject_id, record) => {
          const statusMap = {
            done: { color: token.colorSuccess, dot: '●', tip: `已抽取（${record.extractedAt ? new Date(record.extractedAt).toLocaleDateString('zh-CN') : ''}）` },
            partial: { color: token.colorWarning, dot: '●', tip: '已抽取（含错误）' },
            empty: { color: token.colorBorder, dot: '○', tip: '已运行但无数据' },
            pending: { color: token.colorBorder, dot: '○', tip: '未抽取' },
          }
          const s = statusMap[record.extractionStatus] || statusMap.pending
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tooltip title={s.tip}>
                <span style={{ color: s.color, fontSize: 12, lineHeight: 1, flexShrink: 0 }}>{s.dot}</span>
              </Tooltip>
              <Button
                type="link"
                size="small"
                onClick={() => handleNavigatePatientDetail(record.patient_id)}
                style={{ padding: 0, height: 'auto', fontWeight: 'bold' }}
              >
                {subject_id || '-'}
              </Button>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    {
                      key: 'incremental',
                      label: '增量续抽',
                      icon: <PlayCircleOutlined />,
                      onClick: () => confirmAndStartExtraction([record.patient_id], 'incremental'),
                    },
                    {
                      key: 'full',
                      label: '全量重抽',
                      icon: <ReloadOutlined />,
                      danger: true,
                      onClick: () => {
                        Modal.confirm({
                          title: `确认对患者 ${record.subject_id || record.name} 全量重抽？`,
                          content: '如果该患者已有抽取记录，重新抽取会清空历史记录并重新抽取。',
                          okText: '确认重抽',
                          okButtonProps: { danger: true },
                          cancelText: '取消',
                          onOk: () => confirmAndStartExtraction([record.patient_id], 'full'),
                        })
                      },
                    },
                  ],
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  style={{ color: token.colorTextTertiary, padding: '0 2px', fontSize: 12 }}
                  onClick={e => e.stopPropagation()}
                />
              </Dropdown>
            </div>
          )
        }
      }
    ]
    
    // 动态生成字段组列
    const dynamicGroupColumns = []
    
    if (templateFieldGroups.length > 0) {
      // 使用模板定义的字段组
      templateFieldGroups.forEach((group, groupIndex) => {
        const dbFields = group.db_fields || []
        const groupSources = group.sources || group['x-sources'] || { primary: [], secondary: [] }
        
        if (dbFields.length > 0 && !group.is_repeatable) {
          // 非重复组：展开为子列（全量显示）
          const children = dbFields.map((fieldId, idx) => {
            // Schema 模板 field_id 往往是 full-path（例如：医嘱/医嘱/输血情况）
            // 兜底展示用叶子字段名更友好
            const fieldLabel = templateFieldMapping[fieldId] || (typeof fieldId === 'string' ? fieldId.split('/').slice(-1)[0] : String(fieldId))
            return {
              title: (
                <Popover
                  placement="bottom"
                  content={buildSourcesPopoverContent(fieldLabel, group.group_name, groupSources)}
                  overlayStyle={{ maxWidth: 460 }}
                  trigger="hover"
                >
                  <span style={{ cursor: 'pointer' }}>{fieldLabel}</span>
                </Popover>
              ),
            dataIndex: ['crfGroups', group.group_id, 'fields', fieldId],
            key: `${group.group_id}_${fieldId}`,
            width: 220,
            ellipsis: false,
            render: (fieldData, record) => renderFieldCell(fieldData, fieldId, record)
            }
          })
          
          dynamicGroupColumns.push({
            title: (
              <Popover
                placement="bottom"
                content={buildSourcesPopoverContent(group.group_name, null, groupSources)}
                overlayStyle={{ maxWidth: 460 }}
                trigger="hover"
              >
                <span style={{ cursor: 'pointer' }}>{group.group_name}</span>
              </Popover>
            ),
            key: `group_${group.group_id}`,
            children
          })
        } else if (group.is_repeatable) {
          // 可重复组：显示为汇总，悬浮显示详细数据
          dynamicGroupColumns.push({
            title: (
              <Popover
                placement="bottom"
                content={buildSourcesPopoverContent(group.group_name, null, groupSources)}
                overlayStyle={{ maxWidth: 460 }}
                trigger="hover"
              >
                <span style={{ cursor: 'pointer' }}>{group.group_name}</span>
              </Popover>
            ),
            dataIndex: ['crfGroups', group.group_id],
            key: `group_${group.group_id}`,
            width: 320,
            render: (groupData, record) => {
              if (!groupData || !groupData.fields) {
                return <span style={{ color: token.colorTextSecondary }}>-</span>
              }

              const displayModel = normalizeGroupForDisplay(groupData, group)
              const tooltipContent = displayModel.rowCount > 0 ? (
                <div style={{ maxWidth: 350, maxHeight: 300, overflow: 'auto' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.3)', paddingBottom: 4 }}>
                    {group.group_name} ({displayModel.rowCount} 条记录)
                  </div>
                  {displayModel.rows.map((rowItem, idx) => (
                    <div key={idx} style={{ 
                      marginBottom: idx < displayModel.rows.length - 1 ? 8 : 0,
                      paddingBottom: idx < displayModel.rows.length - 1 ? 8 : 0,
                      borderBottom: idx < displayModel.rows.length - 1 ? '1px dashed rgba(255,255,255,0.2)' : 'none'
                    }}>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
                        记录 #{idx + 1}
                      </div>
                      {rowItem.cells.map((cell) => (
                        <div key={cell.fieldPath} style={{ fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: 'rgba(255,255,255,0.7)' }}>{cell.fieldName}:</span>{' '}
                          <span style={{ color: 'rgb(255, 255, 255)' }}>{formatAnyValueForText(cell.value)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : displayModel.scalarCells.some(cell => !isEmptyFieldValue(cell.value)) ? (
                <div style={{ maxWidth: 350, maxHeight: 300, overflow: 'auto' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.3)', paddingBottom: 4 }}>
                    {group.group_name}（标量字段）
                  </div>
                  {displayModel.scalarCells
                    .filter(cell => !isEmptyFieldValue(cell.value))
                    .slice(0, 12)
                    .map((cell) => (
                    <div key={cell.fieldPath} style={{ fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'rgba(255,255,255,0.7)' }}>{cell.fieldName}:</span>{' '}
                      <span style={{ color: 'rgb(255, 255, 255)' }}>{formatAnyValueForText(cell.value)}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                    点击标签可查看该字段组详情
                  </div>
                </div>
              ) : `${group.group_name}: 暂无数据`

              const previewText = displayModel.previewText || '暂无数据'
              
              return (
                <Tooltip 
                  title={tooltipContent}
                  overlayStyle={{ maxWidth: 400 }}
                  placement="left"
                >
                  <Tag 
                    color={displayModel.hasData ? 'blue' : 'default'}
                    style={{ 
                      cursor: 'pointer',
                      display: 'inline-block',
                      maxWidth: 300,
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      lineHeight: '18px'
                    }}
                    onClick={() => handleViewFieldGroupDetail(record, group.group_name, groupData)}
                  >
                    {previewText}
                  </Tag>
                </Tooltip>
              )
            }
          })
        }
      })
    }
    // 没有模板时不再添加默认的基本信息列，所有字段列完全由 CRF 模板定义
    
    // 完整度列
    const completenessColumn = {
      title: '完整度',
      dataIndex: 'overallCompleteness',
      key: 'completeness',
      width: 160,
      fixed: 'right',
      render: (completeness) => (
        <Progress
          percent={completeness}
          size="small"
          strokeColor={getCompletenessColor(completeness)}
          format={percent => `${percent}%`}
        />
      )
    }
    
    return [...baseColumns, ...dynamicGroupColumns, completenessColumn]
  }, [templateFieldGroups, templateFieldMapping, templateSchemaJson, selectedPatients, projectId, navigate, isAllCurrentPageSelected, isSomeCurrentPageSelected, toggleSelectAllCurrentPage, patientDataset, openDocDetail])

  // 穿透视图表格列定义 - 现在使用动态生成的列
  const penetrationColumns = generateDynamicColumns

  // 概览视图：按“字段组”维度展示完成度（适配不同 CRF 模板）
  const overviewColumns = useMemo(() => {
    const selectionCol = {
      title: (
        <Checkbox
          checked={isAllCurrentPageSelected}
          indeterminate={isSomeCurrentPageSelected}
          onChange={(e) => toggleSelectAllCurrentPage(e.target.checked)}
        />
      ),
      dataIndex: 'selection',
      key: 'selection',
      width: 50,
      fixed: 'left',
      render: (_, record) => (
        <Checkbox
          checked={selectedPatients.includes(record.patient_id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedPatients([...selectedPatients, record.patient_id])
            } else {
              setSelectedPatients(selectedPatients.filter(id => id !== record.patient_id))
            }
          }}
        />
      )
    }

    const subjectCol = {
      title: '编号 / 姓名',
      dataIndex: 'subject_id',
      key: 'subject_id',
      width: 160,
      fixed: 'left',
      render: (subject_id, record) => {
        const statusMap = {
          done: { color: token.colorSuccess, dot: '●', tip: `已抽取（${record.extractedAt ? new Date(record.extractedAt).toLocaleDateString('zh-CN') : ''}）` },
          partial: { color: token.colorWarning, dot: '●', tip: '已抽取（含错误）' },
          empty: { color: token.colorBorder, dot: '○', tip: '已运行但无数据' },
          pending: { color: token.colorBorder, dot: '○', tip: '未抽取' },
        }
        const s = statusMap[record.extractionStatus] || statusMap.pending
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tooltip title={s.tip}>
                <span style={{ color: s.color, fontSize: 12, lineHeight: 1, flexShrink: 0 }}>{s.dot}</span>
              </Tooltip>
              <Button
                type="link"
                size="small"
                onClick={() => handleNavigatePatientDetail(record.patient_id)}
                style={{ padding: 0, height: 'auto', fontWeight: 600 }}
              >
                {subject_id || '-'}
              </Button>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    {
                      key: 'incremental',
                      label: '增量续抽',
                      icon: <PlayCircleOutlined />,
                      onClick: () => confirmAndStartExtraction([record.patient_id], 'incremental'),
                    },
                    {
                      key: 'full',
                      label: '全量重抽',
                      icon: <ReloadOutlined />,
                      danger: true,
                      onClick: () => {
                        Modal.confirm({
                          title: `确认对患者 ${record.subject_id || record.name} 全量重抽？`,
                          content: '如果该患者已有抽取记录，重新抽取会清空历史记录并重新抽取。',
                          okText: '确认重抽',
                          okButtonProps: { danger: true },
                          cancelText: '取消',
                          onOk: () => confirmAndStartExtraction([record.patient_id], 'full'),
                        })
                      },
                    },
                  ],
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  style={{ color: token.colorTextTertiary, padding: '0 2px', fontSize: 12 }}
                  onClick={e => e.stopPropagation()}
                />
              </Dropdown>
            </div>
            {record.name && (
              <div style={{ fontSize: 12, color: token.colorTextSecondary, paddingLeft: 14, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {maskName(record.name)}
              </div>
            )}
          </div>
        )
      }
    }

    const statusCol = {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status) => {
        const map = {
          screening: { color: 'default', text: '筛选中' },
          enrolled: { color: 'processing', text: '已入组' },
          completed: { color: 'success', text: '已完成' },
          withdrawn: { color: 'error', text: '退出' }
        }
        const cfg = map[status] || { color: 'default', text: status || '-' }
        return <Tag color={cfg.color}>{cfg.text}</Tag>
      }
    }

    const overallCol = {
      title: '总体完整度',
      dataIndex: 'overallCompleteness',
      key: 'overallCompleteness',
      width: 160,
      render: (completeness) => (
        <Progress
          percent={Number(completeness || 0)}
          size="small"
          strokeColor={getCompletenessColor(Number(completeness || 0))}
          format={p => `${p}%`}
        />
      )
    }

    const ovDocTypeGroups = {}
    const ovSeenDocIds = new Set()
    for (const p of patientDataset) {
      const docs = p.crf_data?._documents || {}
      for (const d of Object.values(docs)) {
        if (ovSeenDocIds.has(d.id)) continue
        ovSeenDocIds.add(d.id)
        const label = d.document_sub_type || d.document_type || d.file_name || '未知'
        if (!ovDocTypeGroups[label]) ovDocTypeGroups[label] = []
        ovDocTypeGroups[label].push({
          id: d.id,
          file_name: d.file_name || d.id,
          patient_name: p.name || p.subject_id || ''
        })
      }
    }
    const ovMatchesSource = (docLabel, sourceName) => {
      if (!docLabel || !sourceName) return false
      const a = docLabel.replace(/[\s/\\-]/g, '').toLowerCase()
      const b = sourceName.replace(/[\s/\\-]/g, '').toLowerCase()
      return a.includes(b) || b.includes(a)
    }
    const buildOverviewPopoverContent = (gname, sources) => {
      const primary = (sources?.primary || []).filter(Boolean)
      const secondary = (sources?.secondary || []).filter(Boolean)
      const pMatched = []
      const sMatched = []
      for (const [label, docs] of Object.entries(ovDocTypeGroups)) {
        let hit = false
        for (const s of primary) { if (ovMatchesSource(label, s)) { pMatched.push({ label, docs }); hit = true; break } }
        if (!hit) { for (const s of secondary) { if (ovMatchesSource(label, s)) { sMatched.push({ label, docs }); hit = true; break } } }
      }
      const hasDocInfo = patientDataset.length > 0 && Object.keys(ovDocTypeGroups).length > 0

      const renderDocLinks = (docs) => (
        <div style={{ marginLeft: 16, marginTop: 2, marginBottom: 4 }}>
          {docs.map((d, i) => (
            <div key={d.id || i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
              <FileTextOutlined style={{ fontSize: 12, color: token.colorTextSecondary, flexShrink: 0 }} />
              <a
                style={{ fontSize: 12, color: token.colorPrimary, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}
                title={d.file_name}
                onClick={(e) => { e.stopPropagation(); openDocDetail(d.id) }}
              >
                {d.file_name}
              </a>
              {d.patient_name && <span style={{ fontSize: 12, color: token.colorTextSecondary, flexShrink: 0 }}>({d.patient_name})</span>}
            </div>
          ))}
        </div>
      )

      return (
        <div style={{ maxWidth: 440, maxHeight: 420, overflow: 'auto' }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>{gname}</div>
          <div style={{ fontSize: 12 }}>
            <Text strong>首要来源：</Text>
            {primary.length ? primary.join('、') : '（空）'}
          </div>
          <div style={{ fontSize: 12 }}>
            <Text strong>次要来源：</Text>
            {secondary.length ? secondary.join('、') : '（空）'}
          </div>
          {hasDocInfo && (
            <div style={{ borderTop: `1px solid ${token.colorBorder}`, paddingTop: 8, marginTop: 6 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: token.colorPrimary, fontSize: 12 }}>
                实际文档（本页 {patientDataset.length} 位受试者）
              </div>
              <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>
                抽取策略：优先使用全部首要文档；若首要覆盖不足则回退次要文档
              </div>
              {pMatched.map((m, i) => (
                <div key={`p${i}`} style={{ marginBottom: 4 }}>
                  <span style={{ color: token.colorSuccess, fontWeight: 500, fontSize: 12 }}>● 首要</span>{' '}
                  <span style={{ fontSize: 12 }}>{m.label}</span>
                  <span style={{ color: token.colorTextSecondary, marginLeft: 4, fontSize: 12 }}>× {m.docs.length}</span>
                  {renderDocLinks(m.docs)}
                </div>
              ))}
              {sMatched.map((m, i) => (
                <div key={`s${i}`} style={{ marginBottom: 4 }}>
                  <span style={{ color: token.colorWarning, fontWeight: 500, fontSize: 12 }}>● 次要</span>{' '}
                  <span style={{ fontSize: 12 }}>{m.label}</span>
                  <span style={{ color: token.colorTextSecondary, marginLeft: 4, fontSize: 12 }}>× {m.docs.length}</span>
                  {renderDocLinks(m.docs)}
                </div>
              ))}
              {pMatched.length === 0 && sMatched.length === 0 && (primary.length > 0 || secondary.length > 0) && (
                <div style={{ color: token.colorError, fontSize: 12 }}>⚠ 无匹配文档</div>
              )}
            </div>
          )}
        </div>
      )
    }

    // 字段组列（来自项目绑定的 CRF 模板 field_groups）
    const groupCols = (templateFieldGroups || []).map((g) => {
      const gid = g.group_id
      const gname = g.group_name || gid
      const sources = g.sources || g['x-sources'] || { primary: [], secondary: [] }
      return {
        title: (
          <Popover
            placement="bottom"
            overlayStyle={{ maxWidth: 460 }}
            content={buildOverviewPopoverContent(gname, sources)}
            trigger="hover"
          >
            <span style={{ cursor: 'pointer' }}>{gname}</span>
          </Popover>
        ),
        dataIndex: ['crfGroups', gid, 'completeness'],
        key: `group_${gid}`,
        width: 120,
        render: (percent, record) => {
          const p = Number(percent || 0)
          const group = record?.crfGroups?.[gid]
          const filled = group?.filled_count
          const total = group?.total_count
          return (
            <div style={{ textAlign: 'center' }}>
              <Tooltip
                title={
                  <div>
                    <div>{gname}</div>
                    <div>完成度：{p}%</div>
                    {typeof filled === 'number' && typeof total === 'number' ? (
                      <div>填写：{filled}/{total}</div>
                    ) : null}
                  </div>
                }
              >
                <Progress
                  type="circle"
                  percent={p}
                  size={42}
                  strokeColor={getCompletenessColor(p)}
                  format={v => <span style={{ fontSize: 12 }}>{v}%</span>}
                />
              </Tooltip>
            </div>
          )
        }
      }
    })

    return [selectionCol, subjectCol, statusCol, overallCol, ...groupCols]
  }, [navigate, projectId, selectedPatients, templateFieldGroups, setSelectedPatients, isAllCurrentPageSelected, isSomeCurrentPageSelected, toggleSelectAllCurrentPage, patientDataset, openDocDetail, handleStartExtraction])

  // 事件处理函数
  const handleExtractField = (patientId, fieldName) => {
    console.log('抽取字段:', patientId, fieldName)
  }

  const handleExtractPatient = (patientId) => {
    console.log('抽取患者数据:', patientId)
  }

  const handleExtractGroup = (patientId, groupKey) => {
    if (!groupKey) return
    confirmAndStartExtraction([patientId], 'incremental', [groupKey])
  }



  const handleViewFieldSource = (patientId, fieldName, fieldData, patient, options = {}) => {
    // 找到对应的患者数据
    const patientRecord = patient || patientDataset.find(p => p.patientId === patientId || p.id === patientId)
    if (!patientRecord) {
      console.warn('未找到患者数据:', patientId)
      return
    }

    const sourceContext = buildProjectFieldSourceContext(patientRecord, fieldData, {
      fieldName,
      fieldPath: options.fieldPath || fieldName,
      rowIndex: Number.isInteger(options.rowIndex) ? options.rowIndex : null,
      groupName: options.groupName || null
    })

    const crfData = patientRecord?.crf_data || {}
    const allChangeLogs = Array.isArray(crfData._change_logs) ? crfData._change_logs : []
    const fieldPath = options.fieldPath || fieldName
    const fieldChangeLogs = allChangeLogs.filter(log => {
      if (!log || !log.field_path) return false
      return log.field_path === fieldPath
        || log.field_path.startsWith(fieldPath + '.')
        || fieldPath.startsWith(log.field_path + '.')
    }).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

    setCurrentFieldSource({
      fieldName,
      fieldValue: fieldData?.value,
      fieldData,
      audit: sourceContext.audit,
      documents: sourceContext.documents,
      changeLogs: fieldChangeLogs,
      // 透传给 FieldSourceModal，用来按 EhrTab 同链路拉取 CRF evidence 渲染坐标
      projectPatientId: patientRecord?.id || null,
      fieldPath,
    })
    setFieldSourceModalVisible(true)
  }

  const handleViewGroupRecord = (patientId, groupName, recordIndex) => {
    console.log('查看组记录:', patientId, groupName, recordIndex)
  }

  const handleBatchExtraction = () => {
    setExtractionModalGroups([])
    setExtractionModalMode('incremental')
    setExtractionModalVisible(true)
  }

  const handleSubmitTargetedExtraction = async () => {
    if (extractionModalGroups.length === 0) {
      message.warning('请至少选择一个字段组')
      return
    }
    setExtractionModalVisible(false)
    const patientIds = selectedPatients.length > 0 ? selectedPatients : null
    await confirmAndStartExtraction(patientIds, extractionModalMode, extractionModalGroups)
  }

  const handleExportData = () => {
    setExportModalVisible(true)
  }

  const handleViewProjectTemplate = () => {
    if (!currentTemplateId) {
      message.warning('项目未关联 CRF 模板')
      return
    }
    navigate(`/research/projects/${projectId}/template/edit`)
  }

  // 当前项目锁定的 schema 版本
  const currentSchemaVersion = projectData?.template_scope_config?.schema_version

  const handleConfirmExport = async () => {
    if (!projectId) return
    try {
      const values = await exportForm.validateFields()
      const scope = values.scope || 'all'
      const expandRepeatableRows = values.expand_repeatable_rows !== false

      // 仅支持：all / selected
      if (!['all', 'selected'].includes(scope)) {
        message.error('不支持的导出范围')
        return
      }

      if (scope === 'selected' && (!selectedPatients || selectedPatients.length === 0)) {
        message.warning('当前未选择患者，无法导出"选中的患者"')
        return
      }

      setExportLoading(true)

      const payload = {
        format: 'excel',
        scope,
        patient_ids: scope === 'selected' ? selectedPatients : undefined,
        expand_repeatable_rows: expandRepeatableRows,
      }

      const response = await exportProjectCrfFile(projectId, payload)

      // 检查返回的 blob 是否是 JSON 错误响应
      if (response instanceof Blob && response.type && response.type.includes('application/json')) {
        const text = await response.text()
        try {
          const errObj = JSON.parse(text)
          message.error(errObj?.message || '导出失败')
        } catch {
          message.error('导出失败')
        }
        return
      }

      const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const blob = new Blob([response], { type: mime })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const safeName = (projectInfo?.name || '项目').replace(/[\\/:*?"<>|]+/g, '_')
      link.download = `${safeName}_CRF导出_${timestamp}.xlsx`

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      message.success('导出成功')
      setExportModalVisible(false)
    } catch (e) {
      if (e?.errorFields) return
      console.error('导出失败:', e)
      message.error(e?.message || '导出失败，请稍后重试')
    } finally {
      setExportLoading(false)
    }
  }

  const handleAddPatients = () => {
    setPatientSelectionVisible(true)
    setPatientPoolSearch('')
    setSelectedNewPatients([])
    fetchPatientPool(1, 10, '')
  }

  const handleConfirmAddPatients = async () => {
    if (selectedNewPatients.length === 0) {
      message.warning('请先选择要添加的患者')
      return
    }
    
    setPatientPoolLoading(true)
    try {
      let successCount = 0
      let failedCount = 0
      const failedPatients = []
      
      // 逐个入组患者
      for (const patientId of selectedNewPatients) {
        try {
          const response = await enrollPatient(projectId, { patient_id: patientId })
          if (response.success) {
            successCount++
          } else {
            failedCount++
            failedPatients.push(patientId)
          }
        } catch (err) {
          failedCount++
          failedPatients.push(patientId)
        }
      }
      
      if (successCount > 0) {
        message.success(`成功添加 ${successCount} 名患者到项目`)
        // 刷新项目患者列表
        fetchProjectPatients()
        fetchProjectDetail()
      }
      
      if (failedCount > 0) {
        message.warning(`${failedCount} 名患者添加失败`)
      }
      
      setPatientSelectionVisible(false)
      setSelectedNewPatients([])
    } catch (error) {
      console.error('添加患者失败:', error)
      message.error('添加患者失败')
    } finally {
      setPatientPoolLoading(false)
    }
  }

  const handleRemovePatients = () => {
    if (selectedPatients.length > 0) {
      Modal.confirm({
        title: '确认移出患者',
        content: `确定要将 ${selectedPatients.length} 名患者从项目中移出吗？移出后患者数据将保留在患者池中。`,
        okText: '确认移出',
        cancelText: '取消',
        okType: 'danger',
        onOk: async () => {
          if (!projectId) return
          const patientIds = [...selectedPatients]
          let successCount = 0
          let failedCount = 0

          for (const pid of patientIds) {
            try {
              const res = await removeProjectPatient(projectId, pid)
              if (res?.success) {
                successCount += 1
              } else {
                failedCount += 1
              }
            } catch (e) {
              failedCount += 1
            }
          }

          if (successCount > 0) {
            message.success(`成功移出 ${successCount} 名患者`)
            setSelectedPatients([])
            // 刷新项目患者列表 & 项目信息（人数/统计）
            fetchProjectPatients(pagination.current, pagination.pageSize)
            fetchProjectDetail()
          }
          if (failedCount > 0) {
            message.warning(`${failedCount} 名患者移出失败`)
          }
        },
      })
    } else {
      message.warning('请先选择要移出的患者')
    }
  }

  const handleViewFieldGroupDetail = (patient, groupName, groupData) => {
    setCurrentPatient(patient)
    const groupConfig = getTemplateGroupConfig(groupData, groupName)
    const displayModel = normalizeGroupForDisplay(groupData, groupConfig)
    const completeness = groupData?.completeness ?? (
      displayModel.totalCount > 0 ? Math.round((displayModel.filledCount / displayModel.totalCount) * 100) : 0
    )

    setCurrentFieldGroup({ 
      name: groupName, 
      data: {
        ...groupData,
        groupConfig,
        records: displayModel.rows,
        displayModel,
        completeness,
      }
    })
    setFieldGroupDetailVisible(true)
  }

  /**
   * 科研项目主页主卡片固定高度，确保背景区域稳定覆盖页面主体。
   */
  const PROJECT_DATASET_CARD_HEIGHT = toViewportHeight(PAGE_LAYOUT_HEIGHTS.researchDataset.cardOffset)

  /**
   * 表格可滚动主体高度，给顶部统计区与底部分页预留空间。
   */
  const PROJECT_DATASET_TABLE_SCROLL_Y = toViewportHeight(PAGE_LAYOUT_HEIGHTS.researchDataset.tableScrollOffset)
  /**
   * 小于该行数时不启用纵向固定滚动区，避免仅少量数据时出现常驻滚动条轨道。
   */
  const PROJECT_DATASET_MIN_ROWS_FOR_VERTICAL_SCROLL = 6
  /**
   * 仅在数据量较大时启用纵向滚动，减少单行/少量数据场景的视觉噪声。
   */
  const projectDatasetTableScrollY = patientDataset.length > PROJECT_DATASET_MIN_ROWS_FOR_VERTICAL_SCROLL
    ? PROJECT_DATASET_TABLE_SCROLL_Y
    : undefined
  const PROJECT_DATASET_V2_LAYOUT_TOKENS = {
    leftRailWidth: 320,
    headerHeight: 46,
    rowHeight: 40,
    panelGap: 1,
    cellPaddingY: 6,
    cellPaddingX: 6,
  }

  return (
    <div className="page-container fade-in">
      {/* 表格样式优化 */}
      <style>{`
        .ant-table-row-disabled {
          background-color: ${token.colorBgLayout} !important;
          opacity: 0.7;
        }
        .ant-table-row-disabled td {
          color: ${token.colorTextSecondary} !important;
        }
        .ant-table-row-disabled:hover > td {
          background-color: ${token.colorBgLayout} !important;
        }
        /* 表格紧凑样式 - 保证文字完整显示 */
        .compact-table .ant-table-tbody > tr {
          min-height: 44px;
        }
        .compact-table .ant-table-cell {
          padding: 8px 10px !important;
          vertical-align: middle !important;
        }
        .compact-table .ant-table-thead > tr > th {
          padding: 10px 10px !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          min-height: 44px;
          white-space: normal !important;
          word-break: break-word !important;
          line-height: 1.4 !important;
        }
        .compact-table .ant-table-tbody > tr > td {
          font-size: 13px !important;
          line-height: 1.5 !important;
        }
        /* 单元格内容样式 - 允许适当换行 */
        .compact-table .ant-table-cell > div {
          word-break: break-word;
        }
        /* 嵌套表头（分组）样式 */
        .compact-table .ant-table-thead th.ant-table-cell {
          text-align: center !important;
          background: ${token.colorBgLayout} !important;
        }
        .project-dataset-table-region {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .project-dataset-table.ant-table-wrapper,
        .project-dataset-table.ant-table-wrapper .ant-spin-nested-loading,
        .project-dataset-table.ant-table-wrapper .ant-spin-container {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .project-dataset-table.ant-table-wrapper .ant-table {
          flex: 1;
          min-height: 0;
        }
        .project-dataset-table.ant-table-wrapper .ant-table-pagination {
          position: sticky;
          bottom: 0;
          z-index: 3;
          margin: 0 !important;
          padding: 8px 0 0;
          background: ${token.colorBgContainer};
          border-top: 1px solid ${token.colorBorder};
        }
        .project-dataset-v2-layout {
          --project-v2-left-rail-width: ${PROJECT_DATASET_V2_LAYOUT_TOKENS.leftRailWidth}px;
          --project-v2-header-height: ${PROJECT_DATASET_V2_LAYOUT_TOKENS.headerHeight}px;
          --project-v2-row-height: ${PROJECT_DATASET_V2_LAYOUT_TOKENS.rowHeight}px;
          --project-v2-panel-gap: ${PROJECT_DATASET_V2_LAYOUT_TOKENS.panelGap}px;
          --project-v2-cell-padding-y: ${PROJECT_DATASET_V2_LAYOUT_TOKENS.cellPaddingY}px;
          --project-v2-cell-padding-x: ${PROJECT_DATASET_V2_LAYOUT_TOKENS.cellPaddingX}px;
          display: grid;
          grid-template-columns: var(--project-v2-left-rail-width) minmax(0, 1fr);
          gap: var(--project-v2-panel-gap);
          min-height: 0;
          flex: 1;
          overflow: hidden;
          background: ${token.colorBorderSecondary};
          border-radius: 8px;
        }
        .project-dataset-v2-panel {
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          background: ${token.colorBgContainer};
        }
        .project-dataset-v2-left-header,
        .project-dataset-v2-right-header {
          height: 72px;
          min-height: 72px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 8px 10px;
          border-bottom: 1px solid ${token.colorBorderSecondary};
          background: ${token.colorBgContainer};
          box-sizing: border-box;
        }
        .project-dataset-v2-left-header .ant-input-search {
          margin-bottom: 8px;
        }
        .project-dataset-v2-right-shell {
          display: flex;
          flex-direction: column;
          min-height: 0;
          height: 100%;
        }
        .project-dataset-v2-right-table {
          min-height: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .project-dataset-v2-right-table > .ant-spin-nested-loading,
        .project-dataset-v2-right-table > .ant-spin-nested-loading > .ant-spin-container {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .project-dataset-v2-right-table
          > .ant-spin-nested-loading
          > .ant-spin-container
          > .project-dataset-v2-single-cards {
          flex: 1;
          min-height: 0;
        }
        .project-dataset-v2-folder-tabs .ant-tabs-nav {
          margin-bottom: 6px;
        }
        .project-dataset-v2-folder-tabs .ant-tabs-tab {
          padding: 4px 0;
        }
        .project-dataset-v2-group-pills {
          min-height: 26px;
          overflow: hidden;
        }
        .project-dataset-v2-group-pills .ant-segmented {
          max-width: 100%;
        }
        .project-dataset-v2-group-pills .ant-segmented-item-label {
          padding: 0 8px;
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .project-dataset-v2-row > td {
          height: var(--project-v2-row-height) !important;
          min-height: var(--project-v2-row-height) !important;
          max-height: var(--project-v2-row-height) !important;
          line-height: 20px !important;
          padding-top: var(--project-v2-cell-padding-y) !important;
          padding-bottom: var(--project-v2-cell-padding-y) !important;
          box-sizing: border-box !important;
        }
        .project-dataset-v2-left-panel .ant-table-tbody > tr.ant-table-measure-row,
        .project-dataset-v2-right-panel .ant-table-tbody > tr.ant-table-measure-row {
          height: 0 !important;
          min-height: 0 !important;
          max-height: 0 !important;
          visibility: hidden !important;
          overflow: hidden !important;
        }
        .project-dataset-v2-left-panel .ant-table-thead > tr > th,
        .project-dataset-v2-right-panel .ant-table-thead > tr > th {
          height: var(--project-v2-header-height) !important;
          min-height: var(--project-v2-header-height) !important;
          padding-top: 8px !important;
          padding-bottom: 8px !important;
          white-space: nowrap !important;
        }
        .project-dataset-v2-patient-cell {
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
          min-height: 20px;
          line-height: 1.1;
          gap: 0;
        }
        .project-dataset-v2-patient-main-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
        }
        .project-dataset-v2-patient-main-line .ant-btn-link {
          max-width: 70px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .project-dataset-v2-patient-main-line .ant-typography {
          white-space: nowrap;
        }
        .project-dataset-v2-left-panel .project-dataset-table .ant-table-container {
          border-inline-end-width: 0 !important;
        }
        .project-dataset-v2-left-panel .project-dataset-table .ant-table-cell {
          padding-left: var(--project-v2-cell-padding-x) !important;
          padding-right: var(--project-v2-cell-padding-x) !important;
          padding-top: var(--project-v2-cell-padding-y) !important;
          padding-bottom: var(--project-v2-cell-padding-y) !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .project-dataset-v2-left-panel .project-dataset-table .ant-table-thead > tr > th:first-child,
        .project-dataset-v2-left-panel .project-dataset-table .ant-table-tbody > tr > td:first-child {
          padding-left: 4px !important;
          padding-right: 4px !important;
          text-align: center !important;
        }
        .project-dataset-v2-left-panel .project-dataset-table .ant-checkbox-wrapper,
        .project-dataset-v2-left-panel .project-dataset-table .ant-checkbox {
          transform: scale(0.92);
        }
        .project-dataset-v2-left-panel .project-dataset-table .project-dataset-v2-row-anchor-col {
          width: 1px !important;
          min-width: 1px !important;
          max-width: 1px !important;
          padding: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
          background: transparent !important;
        }
        .project-dataset-v2-left-panel .project-dataset-table .project-dataset-v2-row-anchor {
          display: block;
          width: 0;
          height: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .project-dataset-v2-table .ant-btn.ant-btn-sm {
          height: 22px !important;
          min-width: 22px !important;
          line-height: 20px !important;
        }
        .project-dataset-v2-table .ant-progress {
          margin: 0 !important;
        }
        .project-dataset-v2-right-panel .project-dataset-table .ant-table-container {
          border-inline-start-width: 0 !important;
        }
        .project-dataset-v2-right-panel .project-dataset-table .ant-table-cell {
          padding-left: var(--project-v2-cell-padding-x) !important;
          padding-right: var(--project-v2-cell-padding-x) !important;
          padding-top: var(--project-v2-cell-padding-y) !important;
          padding-bottom: var(--project-v2-cell-padding-y) !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .project-dataset-v2-panel .project-dataset-v2-table .ant-table-tbody > tr > td {
          font-size: 13px !important;
          line-height: 20px !important;
          vertical-align: middle !important;
        }
        .project-dataset-v2-left-panel .ant-table-thead > tr,
        .project-dataset-v2-right-panel .ant-table-thead > tr {
          height: var(--project-v2-header-height) !important;
          min-height: var(--project-v2-header-height) !important;
          max-height: var(--project-v2-header-height) !important;
        }
        .project-dataset-v2-left-panel .ant-table-thead > tr > th .ant-table-cell-content,
        .project-dataset-v2-right-panel .ant-table-thead > tr > th .ant-table-cell-content {
          display: flex;
          align-items: center;
          min-height: calc(var(--project-v2-header-height) - (var(--project-v2-cell-padding-y) * 2));
        }
        @media (max-width: 1360px) {
          .project-dataset-v2-layout {
            grid-template-columns: 320px minmax(0, 1fr);
          }
        }
        @media (max-width: 1180px) {
          .project-dataset-v2-layout {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: auto auto;
          }
        }
      `}</style>
      
      <Card
        size="small"
        className="project-dataset-main-card"
        style={{ marginBottom: 16 }}
        styles={{
          header: { padding: '12px 16px' },
          body: {
            padding: 16,
            height: PROJECT_DATASET_CARD_HEIGHT,
            minHeight: PAGE_LAYOUT_HEIGHTS.researchDataset.cardMinHeight,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        }}
        title={
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
              alignItems: 'center',
              columnGap: 12,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '0 1 auto' }}>
                <Tooltip title={projectInfo.name}>
                  <Text
                    strong
                    style={{
                      fontSize: 16,
                      color: token.colorText,
                      display: 'inline-block',
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      verticalAlign: 'bottom',
                      flexShrink: 1,
                    }}
                  >
                    {projectInfo.name}
                  </Text>
                </Tooltip>
                <Tooltip title={projectInfo.crfTemplate}>
                  <Button
                    size="small"
                    icon={<FileTextOutlined />}
                    disabled={!currentTemplateId}
                    onClick={handleViewProjectTemplate}
                    style={{
                      maxWidth: 190,
                      height: 26,
                      borderRadius: 999,
                      borderColor: currentTemplateId ? token.colorPrimaryBorder : token.colorBorder,
                      background: currentTemplateId ? token.colorPrimaryBg : token.colorBgLayout,
                      color: currentTemplateId ? token.colorPrimary : token.colorTextSecondary,
                      boxShadow: 'none',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', maxWidth: 112, overflow: 'hidden', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                      <span style={{ flexShrink: 0, fontWeight: 500 }}>模板 ·&nbsp;</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
                        {projectInfo.crfTemplate || '-'}
                      </span>
                    </span>
                  </Button>
                </Tooltip>
              </div>
              <Space size={4} style={{ flexShrink: 0 }}>
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {`更新于 ${projectUpdateDisplay.shortText}`}
                </Text>
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={handleManualRefresh}
                  style={{ paddingInline: 4, color: token.colorTextSecondary }}
                />
              </Space>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
              <Space
                direction="vertical"
                size={6}
                align="center"
                style={{ display: showRendererSwitchFromQuery ? 'flex' : 'none' }}
              >
                <Radio.Group
                  value={rendererMode}
                  onChange={handleRendererModeChange}
                  size="small"
                >
                  <Radio.Button value="v1">V1 表格</Radio.Button>
                  <Radio.Button value="v2">V2 分组 Tabs</Radio.Button>
                </Radio.Group>
                {rendererMode === 'v1' && (
                  <Radio.Group
                    value={viewMode}
                    onChange={(e) => setViewMode(e.target.value)}
                    size="small"
                  >
                    <Radio.Button value="penetration">穿透视图</Radio.Button>
                    <Radio.Button value="overview">概览视图</Radio.Button>
                  </Radio.Group>
                )}
              </Space>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
              <Button size="small" icon={<PlusOutlined />} onClick={handleAddPatients}>
                添加患者
              </Button>
              {isExtracting ? (
                <Button
                  size="small"
                  danger
                  icon={<PauseCircleOutlined />}
                  onClick={handleCancelExtraction}
                >
                  暂停
                </Button>
              ) : null}
              {extractionProgress && (extractionProgress.status === 'cancelled' || extractionProgress.status === 'failed') && (
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'incremental',
                        label: (
                          <div>
                            <div style={{ fontWeight: 500 }}>增量续抽</div>
                            <div style={{ fontSize: 12, color: token.colorTextSecondary }}>继续抽取尚未处理的患者</div>
                          </div>
                        ),
                        icon: <PlayCircleOutlined />,
                        onClick: () => handleReextract('incremental'),
                      },
                      {
                        key: 'full',
                        label: (
                          <div>
                            <div style={{ fontWeight: 500 }}>全量抽取</div>
                            <div style={{ fontSize: 12, color: token.colorTextSecondary }}>对所有患者重新抽取，覆盖历史数据</div>
                          </div>
                        ),
                        icon: <ReloadOutlined />,
                        danger: true,
                        onClick: () => {
                          Modal.confirm({
                            title: '确认全量抽取？',
                            content: '将重新抽取所有患者的全部字段，已有数据将被覆盖。',
                            okText: '确认抽取',
                            okButtonProps: { danger: true },
                            cancelText: '取消',
                            onOk: () => handleReextract('full'),
                          })
                        },
                      },
                    ],
                  }}
                  trigger={['click']}
                >
                  <Button
                    size="small"
                    type="primary"
                    icon={<ReloadOutlined />}
                  >
                    重新抽取 <DownOutlined style={{ fontSize: 12 }} />
                  </Button>
                </Dropdown>
              )}
              <Button size="small" icon={<ExportOutlined />} onClick={handleExportData}>
                导出数据
              </Button>
              <Button size="small" icon={<SettingOutlined />} onClick={openProjectEditModal}>
                项目设置
              </Button>
              <Tooltip title={isOverviewCollapsed ? '展开统计概览' : '收起统计概览'}>
                <Button
                  type="text"
                  size="small"
                  onClick={() => setIsOverviewCollapsed(prev => !prev)}
                  icon={isOverviewCollapsed ? <DownOutlined /> : <DownOutlined style={{ transform: 'rotate(180deg)' }} />}
                  style={{ paddingInline: 6 }}
                />
              </Tooltip>
            </div>
          </div>
        }
      >
        {!isOverviewCollapsed && (
          <div style={{ marginBottom: 16 }}>
            <Row gutter={[10, 10]}>
              <Col xs={24} sm={8}>
                <div style={{
                  background: token.colorPrimaryBg,
                  borderRadius: 8,
                  padding: '10px 12px',
                  minHeight: 72
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                    <TeamOutlined style={{ fontSize: 16, marginRight: 6, color: token.colorPrimary }} />
                    <Text style={{ color: token.colorTextSecondary, fontSize: 12 }}>患者统计</Text>
                    <Tooltip title={projectInfo.expectedPatients ? `实际入组人数 / 当前入组总数；预期患者 ${projectInfo.expectedPatients}` : '实际入组人数 / 当前入组总数'}>
                      <InfoCircleOutlined style={{ fontSize: 12, color: token.colorTextSecondary, marginLeft: 6 }} />
                    </Tooltip>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: token.colorText, lineHeight: 1.2 }}>
                    {projectInfo.extractedPatients}/{projectInfo.totalPatients}
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={8}>
                <div style={{
                  background: token.colorSuccessBg,
                  borderRadius: 8,
                  padding: '10px 12px',
                  minHeight: 72
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                    <CheckCircleOutlined style={{ fontSize: 16, marginRight: 6, color: token.colorSuccess }} />
                    <Text style={{ color: token.colorTextSecondary, fontSize: 12 }}>数据完整度</Text>
                    <Tooltip title="目标: 90% 以上">
                      <InfoCircleOutlined style={{ fontSize: 12, color: token.colorTextSecondary, marginLeft: 6 }} />
                    </Tooltip>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: token.colorText, lineHeight: 1.2 }}>
                    {projectInfo.completeness}%
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={8}>
                <div style={{
                  background: token.colorWarningBg,
                  borderRadius: 8,
                  padding: '10px 12px',
                  minHeight: 72
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                    <ExperimentOutlined style={{ fontSize: 16, marginRight: 6, color: token.colorWarning }} />
                    <Text style={{ color: token.colorTextSecondary, fontSize: 12 }}>已抽取患者</Text>
                    <Tooltip title="有抽取数据的患者数">
                      <InfoCircleOutlined style={{ fontSize: 12, color: token.colorTextSecondary, marginLeft: 6 }} />
                    </Tooltip>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: token.colorText, lineHeight: 1.2 }}>
                    {patientDataset ? patientDataset.filter(p => p.overallCompleteness > 0).length : 0}
                    <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>/ {projectInfo.extractedPatients}</span>
                  </div>
                </div>
              </Col>
            </Row>
          </div>
        )}

        {extractionProgress && !isExtractionProgressCardDismissed && (
          <div style={{
            marginBottom: 16,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: 12,
            padding: '14px 16px',
            paddingRight: 44,
            background: token.colorBgContainer,
            position: 'relative',
          }}>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              aria-label="关闭抽取进度提示"
              onClick={() => setIsExtractionProgressCardDismissed(true)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                zIndex: 2,
                color: token.colorTextSecondary,
              }}
            />
            <Row gutter={16} align="middle">
              <Col flex="auto">
                <div style={{ marginBottom: 8 }}>
                  <Space>
                    <Text strong>
                      {extractionProgress.status === 'cancelled' ? 'CRF 数据抽取已暂停' :
                       extractionProgress.status === 'failed' ? 'CRF 数据抽取失败' :
                       extractionProgress.status === 'completed' ? 'CRF 数据抽取完成' :
                       extractionProgress.status === 'completed_with_errors' ? 'CRF 数据抽取完成（有错误）' :
                       'CRF 数据抽取中'}
                    </Text>
                    <Tag color={
                      extractionProgress.status === 'cancelled' ? 'warning' :
                      extractionProgress.status === 'failed' ? 'error' :
                      extractionProgress.status === 'completed' ? 'success' :
                      extractionProgress.status === 'completed_with_errors' ? 'warning' :
                      'processing'
                    }>
                      {extractionProgress.current_step}
                    </Tag>
                  </Space>
                </div>
                <Progress
                  percent={extractionProgress.progress || 0}
                  status={
                    extractionProgress.status === 'cancelled' ? 'exception' :
                    extractionProgress.status === 'failed' ? 'exception' :
                    extractionProgress.status === 'completed' ? 'success' :
                    extractionProgress.status === 'completed_with_errors' ? 'success' :
                    'active'
                  }
                  strokeColor={
                    extractionProgress.status === 'cancelled' ? token.colorWarning :
                    extractionProgress.status === 'failed' ? token.colorError :
                    {
                      '0%': token.colorPrimary,
                      '100%': token.colorSuccess,
                    }
                  }
                />
                <div style={{ marginTop: 8 }}>
                  <Space split={<Divider type="vertical" />}>
                    <Text type="secondary">
                      患者: {extractionProgress.processed_patients || 0}/{extractionProgress.total_patients || 0}
                    </Text>
                    <Text style={{ color: token.colorSuccess }}>
                      成功: {extractionProgress.success_count || 0}
                    </Text>
                    {extractionProgress.error_count > 0 && (
                      <Text style={{ color: token.colorError }}>
                        失败: {extractionProgress.error_count}
                      </Text>
                    )}
                    {Array.isArray(extractionProgress.errors) && extractionProgress.errors.length > 0 && (
                      <Button
                        size="small"
                        type="link"
                        onClick={() => setExtractionErrorModalVisible(true)}
                        style={{ padding: 0 }}
                      >
                        查看失败原因
                      </Button>
                    )}
                  </Space>
                </div>
              </Col>
            </Row>
          </div>
        )}

      {/* 抽取失败原因弹窗 */}
      <Modal
        title="CRF 抽取失败原因"
        open={extractionErrorModalVisible}
        onCancel={() => setExtractionErrorModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setExtractionErrorModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={modalWidthPreset.wide}
        styles={modalBodyPreset}
      >
        <Alert
          type="warning"
          showIcon
          message="以下为任务执行时记录的失败明细（patient_id + error）"
          description={
            <div>
              <div>任务ID: <Text code>{extractionProgress?.task_id || extractionTaskId || '-'}</Text></div>
              <div style={{ marginTop: 4 }}>
                你也可以在浏览器 Network 里查看接口：<Text code>/projects/{projectId}/crf/extraction/progress?task_id=&lt;task_id&gt;</Text>
              </div>
            </div>
          }
          style={{ marginBottom: 12 }}
        />
        <Table
          size="small"
          bordered
          rowKey={(r) => `${r.patient_id || ''}-${r.error || ''}`}
          dataSource={Array.isArray(extractionProgress?.errors) ? extractionProgress.errors : []}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: '患者ID',
              dataIndex: 'patient_id',
              width: 340,
              render: (pid) => (
                <Space>
                  <Text code>{pid}</Text>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => handleNavigatePatientDetail(pid)}
                  >
                    打开患者
                  </Button>
                </Space>
              )
            },
            {
              title: '错误信息',
              dataIndex: 'error',
              render: (err) => <Text style={{ color: token.colorError }}>{String(err || '')}</Text>
            }
          ]}
        />
      </Modal>

       {/* {viewMode === 'penetration' && (
          <Alert
            message="操作说明"
            description="单字段可直接编辑 | 📋图标可展开查看详细记录 | 点击单元格查看数据来源"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )} */}

        <div className="project-dataset-table-region">
          {rendererMode === 'v2' ? (
            <ProjectDatasetV2
              loading={loading}
              patients={projectDatasetViewModel.visiblePatients}
              fieldGroups={projectDatasetViewModel.fieldGroups}
              folders={projectDatasetViewModel.folders}
              groupsByFolder={projectDatasetViewModel.groupsByFolder}
              activeGroupKey={projectDatasetViewModel.activeGroupKey}
              onGroupChange={setActiveGroupKey}
              selectedPatientIds={projectDatasetViewModel.selectedPatientIds}
              onToggleSelectPatient={toggleSelectPatient}
              onNavigatePatient={handleNavigatePatientDetail}
              onExtractPatient={(patientId) => confirmAndStartExtraction([patientId], 'incremental')}
              pagination={pagination}
              onPageChange={(page, pageSize) => fetchProjectPatients(page, pageSize)}
              leftScrollY={projectDatasetTableScrollY}
              rightScrollY={projectDatasetTableScrollY}
            />
          ) : (
            <Table
              columns={viewMode === 'penetration' ? penetrationColumns : overviewColumns}
              dataSource={patientDataset}
              loading={loading}
              pagination={{
                current: pagination.current,
                pageSize: pagination.pageSize,
                total: pagination.total,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`,
                onChange: (page, pageSize) => fetchProjectPatients(page, pageSize)
              }}
              // 字段列可能非常多（按模板全量展开），使用 max-content 自动横向滚动。
              scroll={{ x: 'max-content', y: projectDatasetTableScrollY }}
              size="small"
              bordered
              tableLayout="fixed"
              className="compact-table project-dataset-table table-scrollbar-unified"
            />
          )}
        </div>
      </Card>

      {/* 数据质量面板 
      <Card title="数据质量面板" style={{ marginTop: 16 }}>
        <Row gutter={[24, 16]}>
          <Col span={8}>
            <div>
              <Text strong>📈 完整度分布:</Text>
              <div style={{ marginTop: 8 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>优秀(90%以上)</Text>
                    <Text strong style={{ color: token.colorSuccess }}>60%</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>良好(70-90%)</Text>
                    <Text strong style={{ color: token.colorWarning }}>30%</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>待完善(70%以下)</Text>
                    <Text strong style={{ color: token.colorError }}>10%</Text>
                  </div>
                </Space>
              </div>
            </div>
          </Col>
          <Col span={8}>
            <div>
              <Text strong>🎯 置信度分布:</Text>
              <div style={{ marginTop: 8 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>高置信度</Text>
                    <Text strong style={{ color: token.colorSuccess }}>85%</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>中置信度</Text>
                    <Text strong style={{ color: token.colorWarning }}>12%</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>低置信度</Text>
                    <Text strong style={{ color: token.colorError }}>3%</Text>
                  </div>
                </Space>
              </div>
            </div>
          </Col>
          <Col span={8}>
            <div>
              <Text strong>⚠️ 需要关注:</Text>
              <div style={{ marginTop: 8 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text type="secondary">5名患者数据不完整</Text>
                  <Text type="secondary">3个字段存在冲突</Text>
                  <Text type="secondary">2个字段需要人工校验</Text>
                  <Button type="link" size="small" style={{ padding: 0 }}>
                    查看详细报告
                  </Button>
                </Space>
              </div>
            </div>
          </Col>
        </Row>
      </Card> */}

      {/* 专项抽取配置弹窗 */}
      <Modal
        title="专项抽取配置"
        open={extractionModalVisible}
        onCancel={() => setExtractionModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setExtractionModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="start"
            type="primary"
            disabled={extractionModalGroups.length === 0 || isExtracting}
            onClick={handleSubmitTargetedExtraction}
          >
            开始抽取
          </Button>
        ]}
        width={modalWidthPreset.standard}
        styles={modalBodyPreset}
      >
        <Alert
          message="专项抽取任务"
          description={`目标患者: ${selectedPatients.length > 0 ? `已选 ${selectedPatients.length} 名` : `全部 ${projectInfo.totalPatients || 0} 名`} | 已选字段组: ${extractionModalGroups.length} 个`}
          type="info"
          style={{ marginBottom: 16 }}
        />
        
        <Form layout="vertical">
          <Form.Item label="选择字段组">
            <div style={{ marginBottom: 8 }}>
              <Space>
                <Button
                  size="small"
                  type="link"
                  style={{ padding: 0 }}
                  onClick={() => setExtractionModalGroups(crfFieldGroups.map(g => g.group_id))}
                >
                  全选
                </Button>
                <Button
                  size="small"
                  type="link"
                  style={{ padding: 0 }}
                  onClick={() => setExtractionModalGroups(
                    crfFieldGroups.filter(g => g.status !== 'completed').map(g => g.group_id)
                  )}
                >
                  选择未完成
                </Button>
                <Button
                  size="small"
                  type="link"
                  style={{ padding: 0 }}
                  onClick={() => setExtractionModalGroups([])}
                >
                  清空
                </Button>
              </Space>
            </div>
            <Checkbox.Group
              style={{ width: '100%' }}
              value={extractionModalGroups}
              onChange={setExtractionModalGroups}
            >
              <Row>
                {crfFieldGroups.map(group => (
                  <Col span={24} key={group.group_id} style={{ marginBottom: 8 }}>
                    <Checkbox value={group.group_id}>
                      <Space>
                        <Text>{group.name}</Text>
                        {group.status === 'completed' && (
                          <Tag color="green" size="small">已完成</Tag>
                        )}
                        {group.status === 'partial' && (
                          <Tag color="orange" size="small">部分完成</Tag>
                        )}
                        <Text type="secondary">({group.completeness}%)</Text>
                      </Space>
                    </Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Form.Item>
          
          <Form.Item label="抽取模式">
            <Radio.Group value={extractionModalMode} onChange={e => setExtractionModalMode(e.target.value)}>
              <Radio value="incremental">增量抽取 - 仅补抽选中组内缺失字段</Radio>
              <Radio value="full">全量抽取 - 重新抽取选中组内所有字段</Radio>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>

      {/* 数据导出弹窗 */}
      <Modal
        title="数据导出配置"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setExportModalVisible(false)}>
            取消
          </Button>,
          <Button key="export" type="primary" loading={exportLoading} onClick={handleConfirmExport}>
            开始导出
          </Button>
        ]}
        width={modalWidthPreset.standard}
        styles={modalBodyPreset}
      >
        <Form form={exportForm} layout="vertical" initialValues={{ scope: 'selected', expand_repeatable_rows: true }}>
          <Form.Item label="导出范围" name="scope">
            <Select defaultValue="selected">
              <Select.Option value="all">全部患者</Select.Option>
              <Select.Option value="selected">选中的患者</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="expand_repeatable_rows" valuePropName="checked">
            <Checkbox>
              按多行记录展开导出（新增“患者数据(展开)”sheet，每条检验/重复记录一行）
            </Checkbox>
          </Form.Item>
        </Form>
        </Modal>

      {/* 患者筛选弹窗 */}
      <Modal
        title="从患者数据池筛选患者"
        open={patientSelectionVisible}
        onCancel={() => {
          setPatientSelectionVisible(false)
          setSelectedNewPatients([])
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setPatientSelectionVisible(false)
            setSelectedNewPatients([])
          }}>
            取消
          </Button>,
          <Button 
            key="add" 
            type="primary" 
            onClick={handleConfirmAddPatients} 
            disabled={selectedNewPatients.length === 0}
          >
            添加选中患者到项目 ({selectedNewPatients.length})
          </Button>
        ]}
        width={modalWidthPreset.xwide}
        styles={modalBodyPreset}
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Input.Search 
              id="project-dataset-patient-pool-search"
              name="projectDatasetPatientPoolSearch"
              placeholder="搜索患者姓名、编号..." 
              style={{ width: 250 }}
              value={patientPoolSearch}
              onChange={(e) => setPatientPoolSearch(e.target.value)}
              onSearch={(value) => {
                fetchPatientPool(1, patientPoolPagination.pageSize, value)
              }}
              allowClear
              enterButton
            />
          </Space>
        </div>
        
        <Alert
          message="已入组本项目的患者无法重复选择；曾退出本项目的患者可重新选择入组"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        <Table
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: selectedNewPatients,
            onChange: (selectedRowKeys, selectedRows) => {
              setSelectedNewPatients(selectedRowKeys)
            },
            getCheckboxProps: (record) => ({
              // 如果患者已关联本项目，禁用选择
              disabled: isPatientInCurrentProject(record),
            })
          }}
          columns={patientColumns}
          dataSource={availablePatients}
          loading={patientPoolLoading}
          pagination={{
            current: patientPoolPagination.current,
            pageSize: patientPoolPagination.pageSize,
            total: patientPoolPagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`,
            onChange: (page, pageSize) => {
              fetchPatientPool(page, pageSize, patientPoolSearch)
            }
          }}
          size="small"
          scroll={{ y: 350 }}
          rowClassName={(record) => isPatientInCurrentProject(record) ? 'ant-table-row-disabled' : ''}
        />
        
        <div style={{ marginTop: 16, padding: 12, background: token.colorBgLayout, borderRadius: 4 }}>
          <Space direction="vertical" size={4}>
            <Text type="secondary">
              💡 提示：基于项目CRF模版"{projectInfo.crfTemplate}"，从患者数据池中筛选患者。
            </Text>
            <Text type="secondary">
              • <Tag color="green" size="small">未关联</Tag> 表示该患者未加入任何项目
            </Text>
            <Text type="secondary">
              • <Tag color="blue" size="small">项目名称</Tag> 表示已关联其他项目（可同时加入本项目）
            </Text>
            <Text type="secondary">
              • <Tag color="red" size="small">本项目</Tag> 表示已入组本项目（无法重复选择）；<Tag color="orange" size="small">本项目(已退出)</Tag> 可重新选择入组
            </Text>
          </Space>
        </div>
      </Modal>

      {/* 字段组详情弹窗 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            {currentFieldGroup?.name} - {currentPatient?.name} ({currentPatient?.patientId})
          </Space>
        }
        open={fieldGroupDetailVisible}
        onCancel={() => {
          setFieldGroupDetailVisible(false)
          setCurrentFieldGroup(null)
          setCurrentPatient(null)
        }}
        footer={[
          <Button key="close" onClick={() => {
            setFieldGroupDetailVisible(false)
            setCurrentFieldGroup(null)
            setCurrentPatient(null)
          }}>
            关闭
          </Button>,
          <Button key="extract" type="primary" icon={<PlayCircleOutlined />}>
            重新抽取
          </Button>
        ]}
        width={modalWidthPreset.wide}
        styles={modalBodyPreset}
      >
        {currentFieldGroup && currentPatient && (
          <div>
            <Alert
              message={`${currentFieldGroup.name}详细信息`}
              description={`患者: ${currentPatient.name} | 完整度: ${currentFieldGroup.data.completeness}% | 记录数: ${(currentFieldGroup.data.displayModel?.rowCount ?? currentFieldGroup.data.records?.length) || 0}条`}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            {(() => {
              const detailModel = currentFieldGroup.data.displayModel || {
                rows: currentFieldGroup.data.records || [],
                scalarCells: [],
                rowCount: (currentFieldGroup.data.records || []).length
              }

              if (detailModel.rowCount > 0) {
                const tableFieldOrder = Array.isArray(detailModel.tableFieldOrder) ? detailModel.tableFieldOrder : []
                const nestedTableOrder = Array.isArray(detailModel.nestedTableOrder) ? detailModel.nestedTableOrder : []
                const rowsForTable = Array.isArray(detailModel.rowsForTable) ? detailModel.rowsForTable : []
                const dynamicColumns = [
                  ...tableFieldOrder.map((fieldName) => ({
                    title: fieldName,
                    dataIndex: fieldName,
                    key: `field_${fieldName}`,
                    width: 220,
                    render: (_ignored, rowRecord) => {
                      const cell = rowRecord?._cellMap?.[fieldName]
                      if (!cell) return <Text type="secondary">-</Text>
                      const hasValue = !isEmptyFieldValue(cell.value)
                      if (!hasValue) return <Text type="secondary">暂无数据</Text>
                      const sourceContext = buildProjectFieldSourceContext(currentPatient, cell.fieldData, {
                        fieldName: cell.fieldName,
                        fieldPath: cell.fieldPath,
                        rowIndex: Number.isInteger(rowRecord?._rowIndex) ? rowRecord._rowIndex : null,
                        groupName: currentFieldGroup?.name,
                      })
                      return (
                        <div>
                          <ClickableFieldValue
                            fieldName={cell.fieldName}
                            fieldValue={cell.value}
                            fieldData={cell.fieldData}
                            audit={sourceContext.audit}
                            documents={sourceContext.documents}
                            showSourceTag={true}
                            projectId={projectId}
                            projectPatientId={currentPatient?.id}
                            fieldPath={cell.fieldPath}
                          />
                        </div>
                      )
                    }
                  })),
                  ...nestedTableOrder.map((tableName) => ({
                    title: tableName,
                    dataIndex: tableName,
                    key: `nested_${tableName}`,
                    width: 260,
                    render: (_ignored, rowRecord) => {
                      const tableValue = rowRecord?._nestedTables?.[tableName]
                      if (!tableValue || (Array.isArray(tableValue) && tableValue.length === 0)) {
                        return <Text type="secondary">暂无数据</Text>
                      }
                      return <StructuredDataView data={tableValue} dense={false} />
                    }
                  })),
                ]

                return (
                  <Table
                    size="small"
                    bordered
                    rowKey={(row) => String(row?._rowIndex)}
                    pagination={false}
                    scroll={{ x: 'max-content', y: 460 }}
                    dataSource={rowsForTable}
                    columns={[
                      {
                        title: '记录',
                        dataIndex: '_rowIndex',
                        key: '_rowIndex',
                        width: 90,
                        fixed: 'left',
                        render: (rowIndex) => `#${Number(rowIndex) + 1}`
                      },
                      ...dynamicColumns,
                    ]}
                  />
                )
              }

              if ((detailModel.scalarCells || []).length > 0) {
                return (
                  <Card size="small" title="字段值" style={{ marginBottom: 12 }}>
                    <Row gutter={[16, 8]}>
                      {detailModel.scalarCells.map((cell) => {
                        const displayName = cell.fieldName
                        const value = cell.value
                        const hasValue = !isEmptyFieldValue(value)
                        const isComplexValue = Array.isArray(value) || (typeof value === 'object' && value !== null)
                        const sourceContext = buildProjectFieldSourceContext(currentPatient, cell.fieldData, {
                          fieldName: displayName,
                          fieldPath: cell.fieldPath,
                          groupName: currentFieldGroup?.name
                        })
                        return (
                          <Col span={12} key={cell.fieldPath || displayName}>
                            <div style={{ marginBottom: 8 }}>
                              <Text strong style={{ fontSize: 12, color: token.colorTextSecondary }}>
                                {displayName}:
                              </Text>
                              <div style={{ marginTop: 4 }}>
                                {hasValue ? (
                                  <div>
                                    <ClickableFieldValue
                                      fieldName={displayName}
                                      fieldValue={value}
                                      fieldData={cell.fieldData}
                                      audit={sourceContext.audit}
                                      documents={sourceContext.documents}
                                      showSourceTag={true}
                                      projectId={projectId}
                                      projectPatientId={currentPatient?.id}
                                      fieldPath={cell.fieldPath}
                                    />
                                    {isComplexValue && (
                                      <div style={{ marginTop: 6 }}>
                                        <StructuredDataView data={value} dense={false} />
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    暂无数据
                                  </Text>
                                )}
                              </div>
                            </div>
                          </Col>
                        )
                      })}
                    </Row>
                  </Card>
                )
              }

              return (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <Text type="secondary">暂无记录数据</Text>
                  <div style={{ marginTop: 8 }}>
                    <Button type="primary" icon={<PlayCircleOutlined />}>
                      开始抽取数据
                    </Button>
                  </div>
                </div>
              )
            })()}

            {/* 字段组统计信息 
            <Card size="small" title="统计信息" style={{ marginTop: 16 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="记录总数"
                    value={currentFieldGroup.data.records?.length || 0}
                    suffix="条"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="完整度"
                    value={currentFieldGroup.data.completeness}
                    suffix="%"
                    valueStyle={{ 
                      color: getCompletenessColor(currentFieldGroup.data.completeness) 
                    }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="状态"
                    value={
                      currentFieldGroup.data.status === 'completed' ? '已完成' :
                      currentFieldGroup.data.status === 'partial' ? '部分完成' : '待抽取'
                    }
                    valueStyle={{ 
                      color: currentFieldGroup.data.status === 'completed' ? token.colorSuccess :
                             currentFieldGroup.data.status === 'partial' ? token.colorWarning : token.colorError
                    }}
                  />
                </Col>
              </Row>
            </Card> */}
          </div>
        )}
      </Modal>

      {/* 编辑项目弹窗 */}
      <Modal
        title="编辑项目信息"
        open={editProjectVisible}
        onCancel={() => setEditProjectVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setEditProjectVisible(false)}>
            取消
          </Button>,
          <Button key="save" type="primary" onClick={handleSaveProjectMeta}>
            保存修改
          </Button>
        ]}
        width={modalWidthPreset.standard}
        styles={modalBodyPreset}
      >
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label="项目名称" name="name" rules={[{ required: true, message: '请输入项目名称' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="项目描述" name="description">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="项目状态" name="status">
                <Select>
                  {projectStatusOptions.map((option) => (
                    <Select.Option key={option.value} value={option.value}>
                      {option.label}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="CRF模版" name="crfTemplate">
                {/* 项目详情页的“项目设置”里不允许更换模板，仅只读展示 */}
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="预期患者数量" name="expected_patient_count">
                <InputNumber min={0} placeholder="预估参与研究的患者数量" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="项目周期" name="project_period">
                <DatePicker.RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 字段来源追踪弹窗 */}
      <FieldSourceModal
        visible={fieldSourceModalVisible}
        onClose={() => {
          setFieldSourceModalVisible(false)
          setCurrentFieldSource(null)
        }}
        fieldName={currentFieldSource?.fieldName}
        fieldValue={currentFieldSource?.fieldValue}
        audit={currentFieldSource?.audit}
        documents={currentFieldSource?.documents}
        changeLogs={currentFieldSource?.changeLogs}
        projectId={projectId}
        projectPatientId={currentFieldSource?.projectPatientId}
        fieldPath={currentFieldSource?.fieldPath}
      />

      {docDetailDoc && (
        <DocumentDetailModal
          visible={docDetailVisible}
          document={docDetailDoc}
          onClose={() => {
            setDocDetailVisible(false)
            setDocDetailDoc(null)
          }}
        />
      )}

      {/* 多选患者悬浮操作栏 */}
      {selectedPatients.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: token.colorBgElevated,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 12,
            padding: '12px 20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            minWidth: 420,
          }}
        >
          <div style={{ color: token.colorText, fontWeight: 500, whiteSpace: 'nowrap' }}>
            已选 <span style={{ color: token.colorPrimary, fontWeight: 700 }}>{selectedPatients.length}</span> 位患者
          </div>
          <div style={{ width: 1, height: 20, background: token.colorSplit }} />
          <Button
            size="small"
            type="primary"
            icon={<PlayCircleOutlined />}
            disabled={isExtracting}
            onClick={() => confirmAndStartExtraction(selectedPatients, 'incremental')}
          >
            增量抽取
          </Button>
          <Button
            size="small"
            danger
            icon={<ReloadOutlined />}
            disabled={isExtracting}
            onClick={() => {
              Modal.confirm({
                title: `确认对 ${selectedPatients.length} 位患者全量抽取？`,
                content: '如果所选患者已有抽取记录，重新抽取会清空历史记录并重新抽取。',
                okText: '确认抽取',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => confirmAndStartExtraction(selectedPatients, 'full'),
              })
            }}
          >
            全量抽取
          </Button>
          <div style={{ width: 1, height: 20, background: token.colorSplit }} />
          <Button
            size="small"
            danger
            icon={<UserDeleteOutlined />}
            onClick={handleRemovePatients}
          >
            移出项目
          </Button>
          <div style={{ width: 1, height: 20, background: token.colorSplit }} />
          <Button
            size="small"
            type="text"
            style={{ color: token.colorTextSecondary }}
            icon={<CloseOutlined />}
            onClick={() => setSelectedPatients([])}
          >
            取消选择
          </Button>
        </div>
      )}

      </div>
    )
  }
  
  export default ProjectDatasetView
