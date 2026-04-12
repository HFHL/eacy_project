import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getProject, getProjectPatients, enrollPatient, removeProjectPatient, startCrfExtraction, getCrfExtractionProgress, getProjectExtractionTasks, getActiveExtractionTask, cancelCrfExtraction, resetCrfExtraction, exportProjectCrfFile, getProjectTemplateDesigner } from '../../api/project'
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
  Dropdown,
  Divider,
  Alert,
  Timeline,
  Badge,
  Spin,
  Empty,
  message
} from 'antd'
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ExportOutlined,
  SettingOutlined,
  FilterOutlined,
  EyeOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  UserOutlined,
  FileTextOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  DownloadOutlined,
  DeleteOutlined,
  UserDeleteOutlined,
  CloseOutlined,
  UpOutlined,
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

const { Title, Text } = Typography

const ProjectDatasetView = () => {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [viewMode, setViewMode] = useState('penetration') // 'penetration' | 'overview'
  // 这里存 patient_id（不是 ProjectPatient.id），以便直接用于后端移除/抽取等接口
  const [selectedPatients, setSelectedPatients] = useState([])
  const [extractionModalVisible, setExtractionModalVisible] = useState(false)
  const [extractionModalGroups, setExtractionModalGroups] = useState([])
  const [extractionModalMode, setExtractionModalMode] = useState('incremental')
  const [exportModalVisible, setExportModalVisible] = useState(false)
  const [qualityCheckVisible, setQualityCheckVisible] = useState(false)
  const [patientSelectionVisible, setPatientSelectionVisible] = useState(false)
  const [selectedNewPatients, setSelectedNewPatients] = useState([])
  const [fieldGroupDetailVisible, setFieldGroupDetailVisible] = useState(false)
  const [currentFieldGroup, setCurrentFieldGroup] = useState(null)
  const [currentPatient, setCurrentPatient] = useState(null)
  const [statisticsCollapsed, setStatisticsCollapsed] = useState(false)
  const [editProjectVisible, setEditProjectVisible] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportForm] = Form.useForm()
  
  // 字段来源弹窗状态
  const [fieldSourceModalVisible, setFieldSourceModalVisible] = useState(false)
  const [currentFieldSource, setCurrentFieldSource] = useState(null)
  
  // 文档详情弹窗状态
  const [docDetailVisible, setDocDetailVisible] = useState(false)
  const [docDetailDoc, setDocDetailDoc] = useState(null)
  
  // CRF 抽取任务状态
  const [extractionTaskId, setExtractionTaskId] = useState(null)
  const [extractionProgress, setExtractionProgress] = useState(null)
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
  
  // 患者选择弹框状态
  const [availablePatients, setAvailablePatients] = useState([])
  const [patientPoolLoading, setPatientPoolLoading] = useState(false)
  const [patientPoolPagination, setPatientPoolPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [patientPoolSearch, setPatientPoolSearch] = useState('')

  // 加载项目受试者列表
  const fetchProjectPatients = useCallback(async (page = 1, pageSize = 20) => {
    if (!projectId) return
    
    setLoading(true)
    try {
      const response = await getProjectPatients(projectId, { page, page_size: pageSize })
      if (response.success) {
        const rawList = Array.isArray(response.data) ? response.data : []
        // 转换 API 返回的数据格式为组件需要的格式
        const patients = rawList.map(patient => {
          // 解析 CRF 数据 - 新结构：crfData.groups.{group_id}.fields.{field_id}
          const crfData = patient.crf_data || {}
          const groups = crfData.groups || {}
          
          // 辅助函数：从 CRF groups 中获取字段值
          const getFieldValue = (groupId, fieldId) => {
            const group = groups[groupId]
            if (!group || !group.fields) return null
            const field = group.fields[fieldId]
            return field || null
          }
          
          // 辅助函数：获取字段数据（包含 value, source, confidence）
          const getFieldData = (groupId, fieldId, fallbackValue = '') => {
            const field = getFieldValue(groupId, fieldId)
            if (field) {
              return {
                value: field.value,
                source: field.source,
                confidence: field.confidence,
                field_name: field.field_name
              }
            }
            return { value: fallbackValue, source: null, confidence: null }
          }
          
          // 计算分组完整度（同时输出 filled/total，供概览视图 tooltip 使用）
          const calcGroupStats = (groupId) => {
            const group = groups[groupId]
            if (!group || !group.fields) return { percent: 0, filled: 0, total: 0 }
            const fields = Object.values(group.fields)
            const filledCount = fields.filter(f => f && f.value !== null && f.value !== undefined && f.value !== '').length
            const totalCount = fields.length
            const percent = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0
            return { percent, filled: filledCount, total: totalCount }
          }
          
          // 从 CRF 数据中提取各个分组的字段 - 使用正确的数据路径
          const basicInfo = {
            completeness: calcGroupStats('demographics').percent || calcGroupStats('personal_info').percent,
            status: 'pending',
            fields: {
              '患者姓名': getFieldData('demographics', 'personal_info_name', patient.patient_name) || getFieldData('personal_info', 'personal_info_name', patient.patient_name),
              // 基础信息优先使用后端直接返回的患者字段（无需依赖 CRF 抽取）
              '性别': getFieldData('demographics', 'personal_info_gender', patient.patient_gender) || getFieldData('personal_info', 'personal_info_gender', patient.patient_gender),
              '年龄': getFieldData('demographics', 'personal_info_age', patient.patient_age) || getFieldData('personal_info', 'personal_info_age', patient.patient_age),
              '诊断日期': getFieldData('demographics', 'personal_info_birth_date', patient.patient_birth_date) || getFieldData('personal_info', 'personal_info_birth_date', patient.patient_birth_date),
              '联系方式': getFieldData('contact_info', 'contact_info_phone'),
            }
          }
          
          // 诊断/肿瘤信息 - 从 diagnosis 组获取
          const diagnosisGroup = groups.diagnosis || {}
          const diagnosisRecords = diagnosisGroup.fields?.diagnosis_records?.value || []
          const tumorInfo = {
            completeness: calcGroupStats('diagnosis').percent || calcGroupStats('molecular').percent,
            status: diagnosisRecords.length > 0 ? 'partial' : 'pending',
            fields: {
              '原发部位': { value: diagnosisRecords[0]?.primary_site || '', source: 'AI抽取' },
              '病理类型': { value: diagnosisRecords[0]?.pathology_type || getFieldData('molecular', 'pathology_records')?.value?.[0]?.pathology_type || '', source: 'AI抽取' },
              'TNM分期': { value: diagnosisRecords[0]?.tnm_stage || '', source: 'AI抽取' },
              '分子标记物': getFieldData('molecular', 'genetics_records'),
            }
          }
          
          // 治疗记录 - 从 treatment 组获取
          const treatmentGroup = groups.treatment || {}
          const treatmentRecordsData = treatmentGroup.fields?.treatment_records?.value || treatmentGroup.fields?.surgical_records?.value || []
          const treatmentRecords = {
            completeness: calcGroupStats('treatment').percent,
            status: treatmentRecordsData.length > 0 ? 'partial' : 'pending',
            records: treatmentRecordsData
          }
          
          // 随访记录（暂无对应组）
          const followUpRecords = {
            completeness: 0,
            status: 'pending',
            records: []
          }
          
          // 保存原始 groups 用于动态渲染
          const crfGroups = {}
          Object.keys(groups).forEach(groupId => {
            const group = groups[groupId]
            const stats = calcGroupStats(groupId)
            crfGroups[groupId] = {
              group_id: groupId,
              group_name: group.group_name,
              completeness: stats.percent,
              filled_count: stats.filled,
              total_count: stats.total,
              fields: group.fields || {}
            }
          })
          
          // 推导每个患者的抽取状态
          const extractedAt = crfData._extracted_at || null
          const extractionErrors = crfData._errors
          const extractionMode = crfData._extraction_mode || null
          const completeness = parseFloat(patient.crf_completeness) || 0
          let extractionStatus = 'pending'
          if (extractedAt && completeness > 0) {
            extractionStatus = extractionErrors ? 'partial' : 'done'
          } else if (extractedAt) {
            extractionStatus = 'empty'
          }

          return {
            key: patient.id,
            id: patient.id,
            patientId: patient.subject_id || patient.id,
            patient_id: patient.patient_id,
            name: patient.patient_name,
            subject_id: patient.subject_id,
            group_name: patient.group_name,
            status: patient.status,
            enrollment_date: patient.enrollment_date,
            overallCompleteness: completeness,
            extractionStatus,
            extractedAt,
            extractionMode,
            crf_data: crfData,
            crfGroups,  // 新增：原始 CRF 分组数据
            basicInfo,
            tumorInfo,
            treatmentRecords,
            followUpRecords,
          }
        })
        setPatientDataset(patients)
        const pg = response.pagination || {}
        setPagination({
          current: pg.page ?? page,
          pageSize: pg.page_size ?? pageSize,
          total: pg.total ?? rawList.length
        })
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
          const fieldGroups = response.data.template_info.field_groups || []
          const fieldMapping = response.data.template_info.db_field_mapping || {}
          setTemplateFieldGroups(fieldGroups)
          // 兼容后端格式：db_field_mapping 可能是 {enabled, field_map} 或直接是 field_map
          setTemplateFieldMapping(fieldMapping.field_map || fieldMapping.fieldMap || fieldMapping)
        }
      }
    } catch (error) {
      console.error('获取项目详情失败:', error)
    }
  }, [projectId])

  const fetchProjectTemplateSchema = useCallback(async () => {
    if (!projectId) return
    try {
      const response = await getProjectTemplateDesigner(projectId)
      if (response?.success && response?.data?.schema_json && typeof response.data.schema_json === 'object') {
        setTemplateSchemaJson(response.data.schema_json)
        return
      }
      setTemplateSchemaJson(null)
    } catch (error) {
      console.error('获取项目模板 schema 失败:', error)
      setTemplateSchemaJson(null)
    }
  }, [projectId])

  // 加载患者数据池（用于添加患者弹框）
  const fetchPatientPool = useCallback(async (page = 1, pageSize = 10, search = '') => {
    setPatientPoolLoading(true)
    try {
      const response = await getPatientList({
        page,
        page_size: pageSize,
        search: search || undefined,
        project_id: projectId,
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
  }, [projectId])

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

  // ============ CRF 抽取任务管理 ============
  
  // 检查活跃任务（页面加载时调用）
  const checkActiveTask = useCallback(async () => {
    try {
      const response = await getActiveExtractionTask(projectId)
      
      if (response.success && response.data.has_active_task) {
        const activeTask = response.data.active_task
        setExtractionTaskId(activeTask.task_id)
        setExtractionProgress(activeTask)
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
  
  // 启动抽取任务
  const handleStartExtraction = async (patientIds = null, mode = 'incremental', targetGroups = null) => {
    try {
      setIsExtracting(true)
      const response = await startCrfExtraction(projectId, patientIds, mode, targetGroups)
      
      if (response.success) {
        const taskId = response.data.task_id
        setExtractionTaskId(taskId)
        message.success('抽取任务已启动')
        
        // 开始轮询进度
        pollExtractionProgress(taskId)
      } else {
        // 检查是否是因为已有活跃任务
        if (response.code === 40901 && response.data?.active_task) {
          const activeTask = response.data.active_task
          setExtractionTaskId(activeTask.task_id)
          setExtractionProgress(activeTask)
          message.warning('该项目已有正在进行的抽取任务')
          
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

  const projectInfo = projectData ? {
    id: projectData.id,
    name: projectData.project_name,
    description: projectData.description,
    status: projectData.status,
    totalPatients: projectData.expected_patient_count || 0,
    extractedPatients: projectData.actual_patient_count || 0,
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
    extractedPatients: 0,
    completeness: 0,
    crfTemplate: '未关联模板',
    lastUpdate: '-'
  }

  // 当前项目绑定的 CRF 模板 ID（用于跳转只读预览）
  const currentTemplateId = projectData?.template_info?.template_id
    || projectData?.template_scope_config?.template_id

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
          color: completeness >= 90 ? '#52c41a' : completeness >= 70 ? '#faad14' : '#ff4d4f' 
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
      case 'high': return '#52c41a'
      case 'medium': return '#faad14'
      case 'low': return '#ff4d4f'
      default: return '#d9d9d9'
    }
  }

  // 获取完整度颜色
  const getCompletenessColor = (completeness) => {
    if (completeness >= 90) return '#52c41a'
    if (completeness >= 70) return '#faad14'
    return '#ff4d4f'
  }

  // 渲染字段单元格
  const renderFieldCell = (fieldData, fieldName, record) => {
    // 处理空值或无数据的情况
    if (!fieldData || fieldData.value === null || fieldData.value === undefined || fieldData.value === '') {
      return (
        <div style={{ textAlign: 'center', height: 22, lineHeight: '22px' }}>
          <span style={{ color: '#ccc', fontSize: 11 }}>-</span>
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
            <div style={{ fontSize: 11, opacity: 0.8 }}>来源: {source} | 置信度: {(confidence * 100).toFixed(0)}%</div>
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
          <span style={{ fontSize: 13 }}>
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
    const isNestedTableBySchema = schemaDisplay === 'table' && schemaRowConstraint === 'multi_row'
    const isObjectArrayValue = Array.isArray(value) && value.every(item => item && typeof item === 'object' && !Array.isArray(item))

    return {
      schemaNode,
      schemaDisplay,
      schemaRowConstraint,
      schemaType,
      isNestedTable: isNestedTableBySchema || (schemaType === 'array' && isObjectArrayValue)
    }
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
    const fieldEntries = Object.entries(fields).filter(([, data]) => data && typeof data === 'object')

    const indexedRowMap = new Map() // rowIndex -> { cells, nestedTables }
    const scalarCells = []
    const groupRepeatableByTemplate = Boolean(groupConfig?.is_repeatable)

    fieldEntries.forEach(([fieldPath, fieldData]) => {
      const value = fieldData?.value
      const leafName = getLeafFieldName(fieldPath)
      const pathText = String(fieldPath)
      const indices = [...pathText.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]))
      const meta = inferFieldDisplayMeta(fieldPath, value)

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
        cells: (row.cells || []).filter(cell => cell && cell.fieldName),
        nestedTables: row.nestedTables || {}
      }))
      .filter(row => row.cells.length > 0 || Object.keys(row.nestedTables || {}).length > 0)

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
      scalarCells,
      rowCount: rows.length,
      filledCount,
      totalCount,
      hasData: rows.length > 0 || scalarCells.some(cell => !isEmptyFieldValue(cell.value)),
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
              style={{ color: '#999' }}
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
              <FileTextOutlined style={{ fontSize: 11, color: '#999', flexShrink: 0 }} />
              <a
                style={{ fontSize: 12, color: '#1677ff', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}
                title={d.file_name}
                onClick={(e) => { e.stopPropagation(); openDocDetail(d.id) }}
              >
                {d.file_name}
              </a>
              {d.patient_name && (
                <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>({d.patient_name})</span>
              )}
            </div>
          ))}
        </div>
      )

      return (
        <div style={{ maxWidth: 440, maxHeight: 420, overflow: 'auto' }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>
            {fieldLabel}
            {groupLabel ? <span style={{ fontWeight: 400, color: '#999' }}>（{groupLabel}）</span> : null}
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
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, marginTop: 2 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: '#1677ff', fontSize: 12 }}>
                实际文档匹配（本页 {patientDataset.length} 位受试者）
              </div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                抽取策略：优先使用全部首要文档；若首要覆盖不足则回退次要文档
              </div>
              {primaryMatched.map((m, i) => (
                <div key={`p${i}`} style={{ marginBottom: 4 }}>
                  <span style={{ color: '#52c41a', fontWeight: 500, fontSize: 12 }}>● 首要</span>{' '}
                  <span style={{ fontSize: 12 }}>{m.label}</span>
                  <span style={{ color: '#999', marginLeft: 4, fontSize: 12 }}>× {m.docs.length}</span>
                  {renderDocList(m.docs)}
                </div>
              ))}
              {secondaryMatched.map((m, i) => (
                <div key={`s${i}`} style={{ marginBottom: 4 }}>
                  <span style={{ color: '#faad14', fontWeight: 500, fontSize: 12 }}>● 次要</span>{' '}
                  <span style={{ fontSize: 12 }}>{m.label}</span>
                  <span style={{ color: '#999', marginLeft: 4, fontSize: 12 }}>× {m.docs.length}</span>
                  {renderDocList(m.docs)}
                </div>
              ))}
              {primaryMatched.length === 0 && secondaryMatched.length === 0 && allSourceNames.length > 0 && (
                <div style={{ color: '#ff4d4f', fontSize: 12 }}>⚠ 无匹配文档</div>
              )}
              {unmatched.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <span style={{ color: '#999', fontSize: 12 }}>其他文档：</span>
                  {unmatched.map((u, i) => (
                    <span key={i} style={{ fontSize: 12 }}>
                      {i > 0 ? '、' : ''}{u.label}
                      <span style={{ color: '#ccc' }}>({u.docs.length})</span>
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
            done: { color: '#52c41a', dot: '●', tip: `已抽取（${record.extractedAt ? new Date(record.extractedAt).toLocaleDateString('zh-CN') : ''}）` },
            partial: { color: '#faad14', dot: '●', tip: '已抽取（含错误）' },
            empty: { color: '#d9d9d9', dot: '○', tip: '已运行但无数据' },
            pending: { color: '#d9d9d9', dot: '○', tip: '未抽取' },
          }
          const s = statusMap[record.extractionStatus] || statusMap.pending
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tooltip title={s.tip}>
                <span style={{ color: s.color, fontSize: 10, lineHeight: 1, flexShrink: 0 }}>{s.dot}</span>
              </Tooltip>
              <Button
                type="link"
                size="small"
                onClick={() => navigate(`/research/projects/${projectId}/patients/${record.patient_id}`)}
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
                      onClick: () => handleStartExtraction([record.patient_id], 'incremental'),
                    },
                    {
                      key: 'full',
                      label: '全量重抽',
                      icon: <ReloadOutlined />,
                      danger: true,
                      onClick: () => {
                        Modal.confirm({
                          title: `确认对患者 ${record.subject_id || record.name} 全量重抽？`,
                          content: '已有数据将被覆盖，此操作不可撤销。',
                          okText: '确认重抽',
                          okButtonProps: { danger: true },
                          cancelText: '取消',
                          onOk: () => handleStartExtraction([record.patient_id], 'full'),
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
                  style={{ color: '#ccc', padding: '0 2px', fontSize: 11 }}
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
                return <span style={{ color: '#999' }}>-</span>
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
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
                        记录 #{idx + 1}
                      </div>
                      {rowItem.cells.map((cell) => (
                        <div key={cell.fieldPath} style={{ fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: 'rgba(255,255,255,0.7)' }}>{cell.fieldName}:</span>{' '}
                          <span style={{ color: '#fff' }}>{formatAnyValueForText(cell.value)}</span>
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
                      <span style={{ color: '#fff' }}>{formatAnyValueForText(cell.value)}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
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
          done: { color: '#52c41a', dot: '●', tip: `已抽取（${record.extractedAt ? new Date(record.extractedAt).toLocaleDateString('zh-CN') : ''}）` },
          partial: { color: '#faad14', dot: '●', tip: '已抽取（含错误）' },
          empty: { color: '#d9d9d9', dot: '○', tip: '已运行但无数据' },
          pending: { color: '#d9d9d9', dot: '○', tip: '未抽取' },
        }
        const s = statusMap[record.extractionStatus] || statusMap.pending
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tooltip title={s.tip}>
                <span style={{ color: s.color, fontSize: 10, lineHeight: 1, flexShrink: 0 }}>{s.dot}</span>
              </Tooltip>
              <Button
                type="link"
                size="small"
                onClick={() => navigate(`/research/projects/${projectId}/patients/${record.patient_id}`)}
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
                      onClick: () => handleStartExtraction([record.patient_id], 'incremental'),
                    },
                    {
                      key: 'full',
                      label: '全量重抽',
                      icon: <ReloadOutlined />,
                      danger: true,
                      onClick: () => {
                        Modal.confirm({
                          title: `确认对患者 ${record.subject_id || record.name} 全量重抽？`,
                          content: '已有数据将被覆盖，此操作不可撤销。',
                          okText: '确认重抽',
                          okButtonProps: { danger: true },
                          cancelText: '取消',
                          onOk: () => handleStartExtraction([record.patient_id], 'full'),
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
                  style={{ color: '#ccc', padding: '0 2px', fontSize: 11 }}
                  onClick={e => e.stopPropagation()}
                />
              </Dropdown>
            </div>
            {record.name && (
              <div style={{ fontSize: 12, color: '#666', paddingLeft: 14, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              <FileTextOutlined style={{ fontSize: 11, color: '#999', flexShrink: 0 }} />
              <a
                style={{ fontSize: 12, color: '#1677ff', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}
                title={d.file_name}
                onClick={(e) => { e.stopPropagation(); openDocDetail(d.id) }}
              >
                {d.file_name}
              </a>
              {d.patient_name && <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>({d.patient_name})</span>}
            </div>
          ))}
        </div>
      )

      return (
        <div style={{ maxWidth: 440, maxHeight: 420, overflow: 'auto' }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>{gname}</div>
          <div style={{ fontSize: 12 }}>
            <Text strong>首要来源：</Text>
            {primary.length ? primary.join('、') : '（空）'}
          </div>
          <div style={{ fontSize: 12 }}>
            <Text strong>次要来源：</Text>
            {secondary.length ? secondary.join('、') : '（空）'}
          </div>
          {hasDocInfo && (
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, marginTop: 6 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: '#1677ff', fontSize: 12 }}>
                实际文档（本页 {patientDataset.length} 位受试者）
              </div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                抽取策略：优先使用全部首要文档；若首要覆盖不足则回退次要文档
              </div>
              {pMatched.map((m, i) => (
                <div key={`p${i}`} style={{ marginBottom: 4 }}>
                  <span style={{ color: '#52c41a', fontWeight: 500, fontSize: 12 }}>● 首要</span>{' '}
                  <span style={{ fontSize: 12 }}>{m.label}</span>
                  <span style={{ color: '#999', marginLeft: 4, fontSize: 12 }}>× {m.docs.length}</span>
                  {renderDocLinks(m.docs)}
                </div>
              ))}
              {sMatched.map((m, i) => (
                <div key={`s${i}`} style={{ marginBottom: 4 }}>
                  <span style={{ color: '#faad14', fontWeight: 500, fontSize: 12 }}>● 次要</span>{' '}
                  <span style={{ fontSize: 12 }}>{m.label}</span>
                  <span style={{ color: '#999', marginLeft: 4, fontSize: 12 }}>× {m.docs.length}</span>
                  {renderDocLinks(m.docs)}
                </div>
              ))}
              {pMatched.length === 0 && sMatched.length === 0 && (primary.length > 0 || secondary.length > 0) && (
                <div style={{ color: '#ff4d4f', fontSize: 12 }}>⚠ 无匹配文档</div>
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
                  format={v => <span style={{ fontSize: 10 }}>{v}%</span>}
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
    handleStartExtraction([patientId], 'incremental', [groupKey])
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
    await handleStartExtraction(patientIds, extractionModalMode, extractionModalGroups)
  }

  const handleQualityCheck = () => {
    setQualityCheckVisible(true)
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
      const response = await enrollPatient(projectId, { patient_ids: [...selectedNewPatients] })
      if (response?.success) {
        const added = response.data?.added ?? selectedNewPatients.length
        const skipped = response.data?.skipped ?? 0
        if (skipped > 0) {
          message.success(`已添加 ${added} 名患者，${skipped} 名已在项目中`)
        } else {
          message.success(`成功添加 ${added} 名患者到项目`)
        }
        fetchProjectPatients(pagination.current, pagination.pageSize)
        fetchProjectDetail()
      } else {
        message.error(response?.message || '添加患者失败')
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
        records: displayModel.rows,
        displayModel,
        completeness,
      }
    })
    setFieldGroupDetailVisible(true)
  }

  return (
    <div className="page-container fade-in">
      {/* 表格样式优化 */}
      <style>{`
        .ant-table-row-disabled {
          background-color: #fafafa !important;
          opacity: 0.7;
        }
        .ant-table-row-disabled td {
          color: #999 !important;
        }
        .ant-table-row-disabled:hover > td {
          background-color: #fafafa !important;
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
          background: #fafafa !important;
        }
      `}</style>
      
      {/* 页面操作栏 */}
      <div style={{ marginBottom: 16 }}>
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate('/research/projects')}
        >
          返回项目列表
        </Button>
      </div>

      {/* 项目状态总览 - 与主页保持一致的色块设计 */}
      <Card 
        size="small" 
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <Text strong>项目概览</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {projectInfo.name} · 最近更新: {projectInfo.lastUpdate}
            </Text>
          </Space>
        }
        extra={
          <Button 
            type="text" 
            size="small"
            icon={statisticsCollapsed ? <DownOutlined /> : <UpOutlined />}
            onClick={() => setStatisticsCollapsed(!statisticsCollapsed)}
          >
            {statisticsCollapsed ? '展开' : '收起'}
          </Button>
        }
        styles={{ body: { padding: statisticsCollapsed ? 0 : undefined, display: statisticsCollapsed ? 'none' : 'block' } }}
      >
        {!statisticsCollapsed && (
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={6}>
              <div style={{
                background: '#6366f1',
                borderRadius: '8px',
                padding: '20px',
                color: 'white'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <TeamOutlined style={{ fontSize: 18, marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>患者统计</Text>
                </div>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                  {projectInfo.extractedPatients}/{projectInfo.totalPatients}
                </div>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  入组进度: {Math.round((projectInfo.extractedPatients / projectInfo.totalPatients) * 100)}%
                </Text>
              </div>
            </Col>
            <Col xs={24} sm={6}>
              <div style={{
                background: '#10b981',
                borderRadius: '8px',
                padding: '20px',
                color: 'white'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <CheckCircleOutlined style={{ fontSize: 18, marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>数据完整度</Text>
                </div>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                  {projectInfo.completeness}%
                </div>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  目标: 90% 以上
                </Text>
              </div>
            </Col>
            <Col xs={24} sm={6}>
              <div style={{
                background: '#f59e0b',
                borderRadius: '8px',
                padding: '20px',
                color: 'white'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <ExperimentOutlined style={{ fontSize: 18, marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>已抽取患者</Text>
                </div>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                  {patientDataset ? patientDataset.filter(p => p.overallCompleteness > 0).length : 0}
                  <span style={{ fontSize: 14, fontWeight: 'normal', marginLeft: 4 }}>/ {projectInfo.extractedPatients}</span>
                </div>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  有抽取数据的患者数
                </Text>
              </div>
            </Col>
            <Col xs={24} sm={6}>
              <div style={{
                background: '#8b5cf6',
                borderRadius: '8px',
                padding: '20px',
                color: 'white'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <FileTextOutlined style={{ fontSize: 18, marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>CRF模版</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 20, fontWeight: 'bold', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {projectInfo.crfTemplate}
                  </div>
                  <Space size={4}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    disabled={!currentTemplateId}
                      onClick={handleViewProjectTemplate}
                  >
                    查看
                  </Button>
                  </Space>
                </div>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  {currentSchemaVersion ? `当前版本: ${currentSchemaVersion}` : '模版类型'}
                </Text>
              </div>
            </Col>
          </Row>
        )}
      </Card>

      {/* 数据表格控制栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col>
            <Space>
              <Text strong>显示模式:</Text>
              <Radio.Group 
                value={viewMode} 
                onChange={(e) => setViewMode(e.target.value)}
                size="small"
              >
                <Radio.Button value="penetration">穿透视图</Radio.Button>
                <Radio.Button value="overview">概览视图</Radio.Button>
              </Radio.Group>
            </Space>
          </Col>
          <Col>
            <Space>
              <Text>筛选:</Text>
              <Select placeholder="全部状态" size="small" style={{ width: 100 }}>
                <Select.Option value="all">全部状态</Select.Option>
                <Select.Option value="completed">已完成</Select.Option>
                <Select.Option value="partial">部分完成</Select.Option>
                <Select.Option value="pending">待抽取</Select.Option>
              </Select>
              <Select placeholder="置信度" size="small" style={{ width: 100 }}>
                <Select.Option value="all">全部置信度</Select.Option>
                <Select.Option value="high">高置信度</Select.Option>
                <Select.Option value="medium">中置信度</Select.Option>
                <Select.Option value="low">低置信度</Select.Option>
              </Select>
              <Button icon={<FilterOutlined />} size="small">
                字段筛选
              </Button>
            </Space>
          </Col>
          <Col flex={1}>
            <div style={{ textAlign: 'right' }}>
              <Text type="secondary">
                已选择 {selectedPatients.length} 名患者
              </Text>
            </div>
          </Col>
        </Row>
      </Card>

      {/* CRF 抽取进度条 */}
      {extractionProgress && (
        <Card size="small" style={{ marginBottom: 16 }}>
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
                  extractionProgress.status === 'cancelled' ? '#faad14' :
                  extractionProgress.status === 'failed' ? '#ff4d4f' :
                  {
                    '0%': '#6366f1',
                    '100%': '#22c55e',
                  }
                }
              />
              <div style={{ marginTop: 8 }}>
                <Space split={<Divider type="vertical" />}>
                  <Text type="secondary">
                    患者: {extractionProgress.processed_patients || 0}/{extractionProgress.total_patients || 0}
                  </Text>
                  <Text style={{ color: '#22c55e' }}>
                    成功: {extractionProgress.success_count || 0}
                  </Text>
                  {extractionProgress.error_count > 0 && (
                    <Text style={{ color: '#ef4444' }}>
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
        </Card>
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
        width={900}
      >
        <Alert
          type="warning"
          showIcon
          message="以下为任务执行时记录的失败明细（patient_id + error）"
          description={
            <div>
              <div>任务ID: <Text code>{extractionProgress?.task_id || extractionTaskId || '-'}</Text></div>
              <div style={{ marginTop: 4 }}>
                你也可以在浏览器 Network 里查看接口：<Text code>/projects/{projectId}/crf/extraction/progress/&lt;task_id&gt;</Text>
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
                    onClick={() => navigate(`/research/projects/${projectId}/patients/${pid}`)}
                  >
                    打开患者
                  </Button>
                </Space>
              )
            },
            {
              title: '错误信息',
              dataIndex: 'error',
              render: (err) => <Text style={{ color: '#ef4444' }}>{String(err || '')}</Text>
            }
          ]}
        />
      </Modal>

      {/* 智能数据表格 */}
      <Card
        title={
          <Space>
            <Text strong>智能数据表格 (患者×字段穿透视图)</Text>
            <Tag color="blue">{viewMode === 'penetration' ? '穿透视图' : '概览视图'}</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button size="small" icon={<PlusOutlined />} onClick={handleAddPatients}>
              添加患者
            </Button>
            {!isExtracting ? (
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'incremental',
                      label: (
                        <div>
                          <div style={{ fontWeight: 500 }}>增量抽取</div>
                          <div style={{ fontSize: 12, color: '#999' }}>仅补抽新增/缺失字段，保留历史数据</div>
                        </div>
                      ),
                      icon: <PlayCircleOutlined />,
                      onClick: () => handleStartExtraction(null, 'incremental'),
                    },
                    {
                      key: 'full',
                      label: (
                        <div>
                          <div style={{ fontWeight: 500 }}>全量抽取</div>
                          <div style={{ fontSize: 12, color: '#999' }}>重新抽取所有字段，会覆盖历史数据</div>
                        </div>
                      ),
                      icon: <ReloadOutlined />,
                      danger: true,
                      onClick: () => {
                        Modal.confirm({
                          title: '确认全量抽取？',
                          content: '将重新抽取所有字段，已有数据将被覆盖。此操作不可撤销。',
                          okText: '确认抽取',
                          okButtonProps: { danger: true },
                          cancelText: '取消',
                          onOk: () => handleStartExtraction(null, 'full'),
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
                  icon={<PlayCircleOutlined />}
                  style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
                >
                  开始抽取 <DownOutlined style={{ fontSize: 10 }} />
                </Button>
              </Dropdown>
            ) : (
              <Button 
                size="small" 
                danger
                icon={<PauseCircleOutlined />} 
                onClick={handleCancelExtraction}
              >
                暂停
              </Button>
            )}
            {extractionProgress && (extractionProgress.status === 'cancelled' || extractionProgress.status === 'failed') && (
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'incremental',
                      label: (
                        <div>
                          <div style={{ fontWeight: 500 }}>增量续抽</div>
                          <div style={{ fontSize: 12, color: '#999' }}>继续抽取尚未处理的患者</div>
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
                          <div style={{ fontSize: 12, color: '#999' }}>对所有患者重新抽取，覆盖历史数据</div>
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
                  重新抽取 <DownOutlined style={{ fontSize: 10 }} />
                </Button>
              </Dropdown>
            )}
            <Button size="small" icon={<CheckCircleOutlined />} onClick={handleQualityCheck}>
              质量检查
            </Button>
            <Button size="small" icon={<ExportOutlined />} onClick={handleExportData}>
              导出数据
            </Button>
            <Button size="small" icon={<SettingOutlined />} onClick={() => setEditProjectVisible(true)}>
              项目设置
            </Button>
          </Space>
        }
      >
       {/* {viewMode === 'penetration' && (
          <Alert
            message="操作说明"
            description="单字段可直接编辑 | 📋图标可展开查看详细记录 | 点击单元格查看数据来源"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )} */}

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
          // 字段列可能非常多（按模板全量展开），使用 max-content 自动横向滚动
          scroll={{ x: 'max-content', y: 600 }}
          size="small"
          bordered
          tableLayout="fixed"
          className="compact-table"
        />
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
                    <Text strong style={{ color: '#52c41a' }}>60%</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>良好(70-90%)</Text>
                    <Text strong style={{ color: '#faad14' }}>30%</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>待完善(70%以下)</Text>
                    <Text strong style={{ color: '#ff4d4f' }}>10%</Text>
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
                    <Text strong style={{ color: '#52c41a' }}>85%</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>中置信度</Text>
                    <Text strong style={{ color: '#faad14' }}>12%</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>低置信度</Text>
                    <Text strong style={{ color: '#ff4d4f' }}>3%</Text>
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
            style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
            disabled={extractionModalGroups.length === 0 || isExtracting}
            onClick={handleSubmitTargetedExtraction}
          >
            开始抽取
          </Button>
        ]}
        width={640}
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

      {/* 质量检查弹窗 */}
      <Modal
        title="数据质量检查"
        open={qualityCheckVisible}
        onCancel={() => setQualityCheckVisible(false)}
        footer={[
          <Button key="close" onClick={() => setQualityCheckVisible(false)}>
            关闭
          </Button>,
          <Button key="fix" type="primary" style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}>
            修复问题
          </Button>
        ]}
        width={600}
      >
        <Timeline
          items={[
            {
              color: 'red',
              children: (
                <div>
                  <Text strong>数据冲突 (3个字段)</Text>
                  <br />
                  <Text type="secondary">患者P001的TNM分期存在多个不同值</Text>
                </div>
              )
            },
            {
              color: 'orange',
              children: (
                <div>
                  <Text strong>低置信度数据 (5个字段)</Text>
                  <br />
                  <Text type="secondary">需要人工校验确认</Text>
                </div>
              )
            },
            {
              color: 'blue',
              children: (
                <div>
                  <Text strong>缺失数据 (12个字段)</Text>
                  <br />
                  <Text type="secondary">建议补充相关文档</Text>
                </div>
              )
            }
          ]}
        />
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
          <Button key="export" type="primary" loading={exportLoading} onClick={handleConfirmExport} style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}>
            开始导出
          </Button>
        ]}
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
            style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
            disabled={selectedNewPatients.length === 0}
          >
            添加选中患者到项目 ({selectedNewPatients.length})
          </Button>
        ]}
        width={1000}
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Input.Search 
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
        
        <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
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
          <Button key="extract" type="primary" icon={<PlayCircleOutlined />} style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}>
            重新抽取
          </Button>
        ]}
        width={800}
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
                return (
                  <div>
                    {detailModel.rows.map((rowItem, index) => (
                      <Card 
                        key={rowItem.rowIndex ?? index} 
                        size="small" 
                        title={`记录 #${index + 1}`}
                        style={{ marginBottom: 12 }}
                      >
                        <Row gutter={[16, 8]}>
                          {(rowItem.cells || []).map((cell) => {
                            const displayName = cell.fieldName
                            const value = cell.value
                            const hasValue = !isEmptyFieldValue(value)
                            const isComplexValue = Array.isArray(value) || (typeof value === 'object' && value !== null)
                            const sourceContext = buildProjectFieldSourceContext(currentPatient, cell.fieldData, {
                              fieldName: displayName,
                              fieldPath: cell.fieldPath,
                              rowIndex: Number.isInteger(rowItem.rowIndex) ? rowItem.rowIndex : null,
                              groupName: currentFieldGroup?.name
                            })
                            return (
                            <Col span={12} key={cell.fieldPath || `${displayName}-${index}`}>
                              <div style={{ marginBottom: 8 }}>
                                <Text strong style={{ fontSize: 12, color: '#666' }}>
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
                          )})}
                        </Row>
                        {Object.keys(rowItem.nestedTables || {}).length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            {Object.entries(rowItem.nestedTables || {}).map(([tableName, tableValue]) => (
                              <div key={tableName} style={{ marginTop: 8 }}>
                                <Text strong style={{ fontSize: 12, color: '#666' }}>
                                  {tableName}:
                                </Text>
                                <div style={{ marginTop: 4 }}>
                                  <StructuredDataView data={tableValue} dense={false} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
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
                              <Text strong style={{ fontSize: 12, color: '#666' }}>
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
                      color: currentFieldGroup.data.status === 'completed' ? '#52c41a' : 
                             currentFieldGroup.data.status === 'partial' ? '#faad14' : '#ff4d4f'
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
          <Button key="save" type="primary" style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}>
            保存修改
          </Button>
        ]}
        width={600}
      >
        <Form layout="vertical" initialValues={projectInfo}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label="项目名称" name="name">
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
                  <Select.Option value="planning">规划中</Select.Option>
                  <Select.Option value="active">进行中</Select.Option>
                  <Select.Option value="paused">已暂停</Select.Option>
                  <Select.Option value="completed">已完成</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="CRF模版" name="crfTemplate">
                {/* 项目详情页的“项目设置”里不允许更换模板，仅只读展示 */}
                <Input disabled />
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
            background: '#1f1f1f',
            borderRadius: 12,
            padding: '12px 20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            minWidth: 420,
          }}
        >
          <div style={{ color: '#fff', fontWeight: 500, whiteSpace: 'nowrap' }}>
            已选 <span style={{ color: '#6366f1', fontWeight: 700 }}>{selectedPatients.length}</span> 位患者
          </div>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)' }} />
          <Button
            size="small"
            type="primary"
            icon={<PlayCircleOutlined />}
            style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
            disabled={isExtracting}
            onClick={() => handleStartExtraction(selectedPatients, 'incremental')}
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
                content: '已有数据将被覆盖，此操作不可撤销。',
                okText: '确认抽取',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => handleStartExtraction(selectedPatients, 'full'),
              })
            }}
          >
            全量抽取
          </Button>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)' }} />
          <Button
            size="small"
            danger
            icon={<UserDeleteOutlined />}
            onClick={handleRemovePatients}
          >
            移出项目
          </Button>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)' }} />
          <Button
            size="small"
            type="text"
            style={{ color: 'rgba(255,255,255,0.6)' }}
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