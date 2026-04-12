import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  Card,
  Typography,
  Table,
  Button,
  Space,
  Input,
  Select,
  TreeSelect,
  DatePicker,
  Row,
  Col,
  Tag,
  Progress,
  Dropdown,
  Checkbox,
  Statistic,
  Divider,
  Modal,
  Form,
  Alert,
  Tooltip,
  Badge,
  message,
  Popconfirm,
  Tabs,
  Timeline,
  Avatar,
  Drawer,
  Radio,
  Slider,
  Switch,
  Upload,
  Steps,
  InputNumber,
  AutoComplete
} from 'antd'
import {
  SearchOutlined,
  FilterOutlined,
  ExportOutlined,
  PlusOutlined,
  UserOutlined,
  FileTextOutlined,
  MoreOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SettingOutlined,
  BulbOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  MedicineBoxOutlined,
  HeartOutlined,
  ThunderboltOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  InfoCircleOutlined,
  UploadOutlined,
  DownloadOutlined,
  UserAddOutlined,
  UsergroupAddOutlined,
  FileExcelOutlined,
  CloudUploadOutlined,
  UpOutlined,
  DownOutlined
} from '@ant-design/icons'
import { getPatientList, createPatient, batchDeletePatients, batchDeleteCheck, exportPatients, getDepartmentTree } from '../../api/patient'
import { maskName } from '../../utils/sensitiveUtils'

const { Title, Text } = Typography
const { Search } = Input
const { RangePicker } = DatePicker
const { Step } = Steps
const { Dragger } = Upload

const PatientPool = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [filterVisible, setFilterVisible] = useState(false)
  const [exportModalVisible, setExportModalVisible] = useState(false)
  const [smartFilterVisible, setSmartFilterVisible] = useState(false)
  const [addPatientVisible, setAddPatientVisible] = useState(false)
  const [batchImportVisible, setBatchImportVisible] = useState(false)
  const [viewMode, setViewMode] = useState('table') // 'table' | 'card'
  const [sortConfig, setSortConfig] = useState({ field: 'lastUpdate', order: 'desc' })
  const [addPatientStep, setAddPatientStep] = useState(0)
  const [batchImportStep, setBatchImportStep] = useState(0)
  const [importFileList, setImportFileList] = useState([])
  const [importData, setImportData] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [selectedImportKeys, setSelectedImportKeys] = useState([])
  const [viewingPatientDetail, setViewingPatientDetail] = useState(null)
  const [patientDetailVisible, setPatientDetailVisible] = useState(false)
  const [filters, setFilters] = useState({
    search: '',
    gender: '',
    ageRange: [0, 100],
    department: '',
    diagnosis: '',
    completeness: '',
    projectStatus: '',
    dateRange: null
  })
  
  // 高级筛选状态
  const [advancedFilters, setAdvancedFilters] = useState({
    diagnosisKeywords: '',
    dateRange: null,
    projectStatus: [],
    docCountMin: null,
    docCountMax: null
  })
  const [advancedFilterForm] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportForm, setExportForm] = useState({
    format: 'excel',
    scope: 'selected',
    include_basic_info: true,
    include_diagnosis: true,
    include_completeness: true,
    include_ehr: true,
    desensitize: false
  })
  const [addPatientForm] = Form.useForm()
  const [batchImportForm] = Form.useForm()
  const [columnWidths, setColumnWidths] = useState({})
  const [visibleColumns, setVisibleColumns] = useState([
    'id', 'name', 'basicInfo', 'diagnosis', 'documentCount', 
    'conflicts', 'completeness', 'doctor', 'projects', 'lastUpdate'
  ])
  const [statisticsCollapsed, setStatisticsCollapsed] = useState(false)

  // 患者数据状态
  const [patientData, setPatientData] = useState([])
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  })

  // 科室树数据
  const [departmentTreeData, setDepartmentTreeData] = useState([])
  const [departmentLoading, setDepartmentLoading] = useState(false)

  // 处理列宽调整
  const handleResize = (index, size) => {
    const newColumnWidths = { ...columnWidths }
    newColumnWidths[index] = size.width
    setColumnWidths(newColumnWidths)
  }

  // 列显示控制选项
  const columnOptions = [
    { label: '患者ID', value: 'id' },
    { label: '姓名', value: 'name' },
    { label: '基本信息', value: 'basicInfo' },
    { label: '主要诊断', value: 'diagnosis' },
    { label: '文档数量', value: 'documentCount' },
    { label: '字段冲突', value: 'conflicts' },
    { label: '数据完整度', value: 'completeness' },
    { label: '主治医生', value: 'doctor' },
    { label: '关联项目', value: 'projects' },
    { label: '最近更新', value: 'lastUpdate' }
  ]

  // 获取患者列表
  const fetchPatients = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page: pagination.current,
        page_size: pagination.pageSize
      }
      
      // 添加基础筛选条件
      if (filters.search) {
        params.search = filters.search
      }
      if (filters.gender) {
        params.gender = filters.gender
      }
      if (filters.department) {
        params.department_id = filters.department
      }
      if (filters.projectStatus) {
        params.has_projects = filters.projectStatus
      }
      
      // 添加高级筛选条件
      if (advancedFilters.diagnosisKeywords) {
        params.diagnosis_keywords = advancedFilters.diagnosisKeywords
      }
      if (advancedFilters.dateRange && advancedFilters.dateRange.length === 2) {
        params.start_date = advancedFilters.dateRange[0].format('YYYY-MM-DD')
        params.end_date = advancedFilters.dateRange[1].format('YYYY-MM-DD')
      }
      if (advancedFilters.projectStatus && advancedFilters.projectStatus.length > 0) {
        // 只取第一个值（后端目前只支持单选）
        params.project_status = advancedFilters.projectStatus[0]
      }
      if (advancedFilters.docCountMin !== null && advancedFilters.docCountMin !== undefined) {
        params.doc_count_min = advancedFilters.docCountMin
      }
      if (advancedFilters.docCountMax !== null && advancedFilters.docCountMax !== undefined) {
        params.doc_count_max = advancedFilters.docCountMax
      }

      const response = await getPatientList(params)
      
      if (response.success && response.code === 0) {
        // 转换后端数据格式为前端格式
        const transformedData = response.data.map(patient => ({
          key: patient.id,
          id: patient.patient_code,
          patientId: patient.id, // 保留原始UUID用于导航
          name: patient.name,
          gender: patient.gender,
          age: patient.age,
          birthDate: patient.birth_date,
          diagnosis: patient.diagnosis || [],
          tags: patient.tags || [],
          department: patient.department_name || '未分配',
          documentCount: patient.document_count || 0,
          pendingFieldConflictCount: patient.pending_field_conflict_count || 0,
          hasPendingFieldConflicts: !!patient.has_pending_field_conflicts,
          completeness: parseFloat(patient.data_completeness) || 0,
          projects: patient.projects || [],  // 关联项目列表
          lastUpdate: patient.updated_at ? new Date(patient.updated_at).toLocaleDateString() : '-',
          doctor: patient.attending_doctor_name || '未分配',
          status: patient.status
        }))
        
        setPatientData(transformedData)
        setPagination(prev => ({
          ...prev,
          total: response.pagination?.total || 0
        }))
        
        // 更新统计数据
        if (response.statistics) {
          setStatistics({
            totalPatients: response.pagination?.total || 0,
            totalDocuments: response.statistics.total_documents || 0,
            averageCompleteness: response.statistics.average_completeness || 0,
            recentlyAdded: response.statistics.recently_added || 0
          })
        }
      }
    } catch (error) {
      console.error('获取患者列表失败:', error)
    } finally {
      setLoading(false)
    }
  }, [pagination.current, pagination.pageSize, filters.search, filters.gender, filters.department, filters.projectStatus, advancedFilters])

  // 初始加载和筛选条件变化时重新获取数据
  useEffect(() => {
    fetchPatients()
  }, [fetchPatients])

  useEffect(() => {
    if (searchParams.get('openCreate') !== '1') return
    setAddPatientVisible(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('openCreate')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  // 获取科室树数据
  const fetchDepartmentTree = useCallback(async () => {
    setDepartmentLoading(true)
    try {
      const response = await getDepartmentTree()
      if (response.success && response.code === 0) {
        // 转换为TreeSelect需要的格式
        const formatTreeData = (nodes) => {
          return nodes.map(node => ({
            title: node.name,
            value: node.id, // 使用id作为value，因为API查询使用department_id
            key: node.id,
            children: node.children && node.children.length > 0 
              ? formatTreeData(node.children) 
              : undefined
          }))
        }
        setDepartmentTreeData(formatTreeData(response.data))
      }
    } catch (error) {
      console.error('获取科室树失败:', error)
      message.error('获取科室列表失败')
    } finally {
      setDepartmentLoading(false)
    }
  }, [])

  // 根据科室ID查找科室名称
  const getDepartmentNameById = useCallback((departmentId) => {
    if (!departmentId || departmentTreeData.length === 0) return '未选择'
    
    const findInTree = (nodes) => {
      for (const node of nodes) {
        if (node.value === departmentId || node.key === departmentId) {
          return node.title
        }
        if (node.children && node.children.length > 0) {
          const found = findInTree(node.children)
          if (found) return found
        }
      }
      return null
    }
    
    return findInTree(departmentTreeData) || '未知科室'
  }, [departmentTreeData])

  // 组件挂载时获取科室树
  useEffect(() => {
    fetchDepartmentTree()
  }, [fetchDepartmentTree])

  // 防抖搜索
  const debounceSearch = useCallback((value) => {
    const timer = setTimeout(() => {
      setFilters(prev => ({...prev, search: value}))
      setPagination(prev => ({ ...prev, current: 1 })) // 搜索时重置到第一页
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  // 处理表格分页变化
  const handleTableChange = (paginationConfig) => {
    setPagination(prev => ({
      ...prev,
      current: paginationConfig.current,
      pageSize: paginationConfig.pageSize
    }))
  }

  // 统计数据状态
  const [statistics, setStatistics] = useState({
    totalPatients: 0,
    totalDocuments: 0,
    averageCompleteness: 0,
    recentlyAdded: 0
  })

  // 常见诊断选项
  const diagnosisOptions = [
    '高血压', '糖尿病', '冠心病', '肺癌', '胃癌', '肝癌',
    '脑梗死', '心肌梗死', '慢性阻塞性肺疾病', '甲状腺功能亢进'
  ]

  // 新建患者步骤配置
  const addPatientSteps = [
    {
      title: '基本信息',
      description: '患者基础资料'
    },
    {
      title: '医疗信息',
      description: '诊断和病史'
    },
    {
      title: '确认保存',
      description: '信息确认'
    }
  ]

  // 批量导入步骤配置
  const batchImportSteps = [
    {
      title: '下载模版',
      description: '获取导入模版'
    },
    {
      title: '上传验证',
      description: '上传并验证Excel'
    },
    {
      title: '数据预览',
      description: '确认患者信息'
    }
  ]

  // 处理新建患者
  const [addPatientLoading, setAddPatientLoading] = useState(false)
  
  const handleAddPatient = async () => {
    if (addPatientStep === 0) {
      addPatientForm.validateFields(['name', 'gender', 'age', 'department']).then(() => {
        setAddPatientStep(1)
      }).catch(() => {
        message.error('请完善必填信息')
      })
    } else if (addPatientStep === 1) {
      setAddPatientStep(2)
    } else if (addPatientStep === 2) {
      // 提交表单到后端
      try {
        // 获取所有表单字段值（包括前面步骤的字段）
        const values = addPatientForm.getFieldsValue(true)
        setAddPatientLoading(true)
        
        // 构建请求数据
        const requestData = {
          name: values.name,
          gender: values.gender,
          age: Number(values.age),
          id_card: values.idCard || '',
          phone: values.phone || '',
          address: values.address || '',
          diagnosis: values.diagnosis || [],
          department_id: values.department || '',
          attending_doctor_name: values.doctor || ''
        }
        
        console.log('创建患者请求数据:', requestData) // 调试日志
        
        const response = await createPatient(requestData)
        
        if (response.success && response.code === 0) {
        message.success('患者信息已成功添加')
        setAddPatientVisible(false)
        setAddPatientStep(0)
        addPatientForm.resetFields()
          fetchPatients() // 刷新列表
        }
      } catch (error) {
        console.error('创建患者失败:', error)
      } finally {
        setAddPatientLoading(false)
      }
    }
  }

  // 处理批量导入
  const handleBatchImport = async () => {
    if (batchImportStep === 0) {
      // 下一步：进入上传文件
      setBatchImportStep(1)
    } else if (batchImportStep === 1) {
      // 在上传验证步骤点击下一步（如果已经有文件解析出的数据，则进入预览）
      if (importFileList.length === 0) {
        message.warning('请先选择Excel文件')
        return
      }
      if (importData.length > 0) {
        // 进入预览步骤，默认选中所有验证通过的数据
        const successKeys = importData
          .filter(item => item.status === 'success')
          .map(item => item.key)
        setSelectedImportKeys(successKeys)
        setBatchImportStep(2)
      } else {
        message.warning('请等待文件解析完成或重新选择文件')
      }
    } else if (batchImportStep === 2) {
      // 确认导入：逐个创建选中的患者
      if (selectedImportKeys.length === 0) {
        message.warning('请至少选择一个患者进行导入')
        return
      }

      const selectedData = importData.filter(item => 
        selectedImportKeys.includes(item.key) && item.status === 'success'
      )

      if (selectedData.length === 0) {
        message.warning('没有可以导入的数据')
        return
      }

      setLoading(true)
      message.loading({ content: `正在创建患者 (0/${selectedData.length})...`, key: 'importing' })

      let successCount = 0
      let failCount = 0

      // 逐个创建患者
      for (let i = 0; i < selectedData.length; i++) {
        const patient = selectedData[i]
        
        try {
          message.loading({ 
            content: `正在创建患者 (${i + 1}/${selectedData.length})...`, 
            key: 'importing' 
          })

          // 获取科室ID
          const departmentId = getDepartmentIdByName(patient.department, departmentTreeData)
          if (!departmentId) {
            throw new Error(`无法找到科室 "${patient.department}" 的ID`)
          }

          // 构造请求数据（与新建患者接口一致）
          const requestData = {
            name: patient.name,
            gender: patient.gender,
            age: parseInt(patient.age),
            phone: patient.phone || '',
            id_card: patient.idCard || '',
            address: patient.address || '',
            department_id: departmentId, // 使用科室ID
            attending_doctor_name: patient.doctor || '',
            diagnosis: patient.diagnosis ? patient.diagnosis.split(';').filter(d => d.trim()) : []
          }

          // 调用创建患者接口
          const response = await createPatient(requestData)

          if (response.success && response.code === 0) {
            successCount++
            // 更新该行状态为创建成功
            setImportData(prev => prev.map(item => 
              item.key === patient.key 
                ? { ...item, createStatus: 'success', createMessage: '创建成功' }
                : item
            ))
          } else {
            failCount++
            setImportData(prev => prev.map(item => 
              item.key === patient.key 
                ? { ...item, createStatus: 'error', createMessage: response.message || '创建失败' }
                : item
            ))
          }
        } catch (error) {
          console.error(`创建患者失败 (${patient.name}):`, error)
          failCount++
          setImportData(prev => prev.map(item => 
            item.key === patient.key 
              ? { ...item, createStatus: 'error', createMessage: error.message || '创建失败' }
              : item
          ))
        }
      }

      setLoading(false)

      // 显示最终结果
      if (failCount === 0) {
        message.success({ 
          content: `批量导入完成！成功创建 ${successCount} 名患者`, 
          key: 'importing',
          duration: 3 
        })
        // 延迟关闭弹窗，让用户看到成功状态
        setTimeout(() => {
          setBatchImportVisible(false)
          setBatchImportStep(0)
          setImportFileList([])
          setImportData([])
          setSelectedImportKeys([])
          fetchPatients() // 刷新患者列表
        }, 2000)
      } else {
        message.warning({ 
          content: `批量导入完成：成功 ${successCount} 个，失败 ${failCount} 个`, 
          key: 'importing',
          duration: 5 
        })
      }
    }
  }

  // 下载导入模版
  const downloadTemplate = () => {
    const link = document.createElement('a')
    link.href = '/resource/患者批量导入模版_v2.0.xlsx'
    link.download = '患者批量导入模版_v2.0.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    message.success('模版下载成功')
  }

  // 解析Excel文件
  const parseExcelFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          
          // 读取第一个工作表（患者数据）
          const firstSheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheetName]
          
          // 将工作表转换为JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            raw: false,  // 保持原始格式
            defval: ''   // 空单元格默认值为空字符串
          })
          
          console.log('解析Excel数据:', jsonData)
          resolve(jsonData)
        } catch (error) {
          console.error('Excel解析错误:', error)
          reject(error)
        }
      }
      
      reader.onerror = (error) => {
        reject(error)
      }
      
      reader.readAsArrayBuffer(file)
    })
  }

  // 验证单条患者数据
  const validatePatientData = (data, rowIndex, validDepartments) => {
    const errors = []
    const warnings = []
    
    // 必填字段验证
    if (!data['患者姓名'] || !data['患者姓名'].trim()) {
      errors.push('患者姓名不能为空')
    }
    
    if (!data['性别']) {
      errors.push('性别不能为空')
    } else if (!['男', '女'].includes(data['性别'])) {
      errors.push('性别只能是"男"或"女"')
    }
    
    if (!data['年龄'] && data['年龄'] !== 0) {
      errors.push('年龄不能为空')
    } else {
      const age = parseInt(data['年龄'])
      if (isNaN(age) || age < 0 || age > 150) {
        errors.push('年龄必须是0-150之间的整数')
      }
    }
    
    if (!data['科室'] || !data['科室'].trim()) {
      errors.push('科室不能为空')
    } else {
      const deptName = data['科室'].trim()
      if (validDepartments && !validDepartments.includes(deptName)) {
        errors.push(`系统不存在科室: ${deptName}`)
      }
    }
    
    // 选填字段格式验证
    if (data['身份证号'] && data['身份证号'].length !== 18) {
      warnings.push('身份证号应为18位')
    }
    
    if (data['联系电话'] && !/^1[3-9]\d{9}$/.test(data['联系电话'])) {
      warnings.push('联系电话格式不正确')
    }
    
    return {
      hasError: errors.length > 0,
      errors,
      warnings,
      rowIndex: rowIndex + 2 // Excel行号（从第2行开始数据）
    }
  }

  // 辅助函数：平铺科室树以获取所有合法的科室名称
  const getFlatDepartmentNames = (treeData) => {
    let names = []
    const traverse = (nodes) => {
      nodes.forEach(node => {
        names.push(node.title) // 对应 TreeSelect 的 title
        if (node.children) {
          traverse(node.children)
        }
      })
    }
    traverse(treeData)
    return names
  }

  // 辅助函数：根据科室名称获取科室ID
  const getDepartmentIdByName = (deptName, treeData) => {
    let foundId = null
    const traverse = (nodes) => {
      for (const node of nodes) {
        if (node.title === deptName) {
          foundId = node.value // TreeSelect 的 value 对应科室ID
          return true
        }
        if (node.children && traverse(node.children)) {
          return true
        }
      }
      return false
    }
    traverse(treeData)
    return foundId
  }

  // 处理Excel数据解析 and 验证
  const handleFileChange = async (file) => {
    try {
      message.loading({ content: '正在解析Excel文件...', key: 'parsing' })
      
      // 解析Excel
      let rawData = await parseExcelFile(file)
      
      if (!rawData || rawData.length === 0) {
        message.error({ content: 'Excel文件中没有数据', key: 'parsing' })
        return
      }

      // 获取当前合法的科室列表
      const validDepts = getFlatDepartmentNames(departmentTreeData)
      
      message.loading({ content: '正在验证数据...', key: 'parsing' })
      
      // 验证数据
      const validatedData = rawData.map((row, index) => {
        // 直接从第2行（rawData[0]）开始解析，不再执行 slice(1)
        const validation = validatePatientData(row, index, validDepts)
        
        return {
          key: index,
          rowIndex: index + 1, // 序号从1开始
          excelRow: index + 2, // 实际Excel行号（表头后的起始行）
          name: row['患者姓名'] || '',
          gender: row['性别'] || '',
          age: row['年龄'] || '',
          idCard: row['身份证号'] || '',
          phone: row['联系电话'] || '',
          address: row['住址'] || '',
          department: row['科室'] || '',
          doctor: row['主治医师'] || '',
          diagnosis: row['主要诊断'] || '',
          icdCodes: row['ICD编码'] || '',
          medicalHistory: row['既往病史'] || '',
          allergyHistory: row['过敏史'] || '',
          currentMedication: row['当前用药'] || '',
          notes: row['备注'] || '',
          status: validation.hasError ? 'error' : 'success',
          errors: validation.errors,
          warnings: validation.warnings
        }
      })
      
      setImportData(validatedData)
      
      const errorCount = validatedData.filter(item => item.status === 'error').length
      const successCount = validatedData.filter(item => item.status === 'success').length
      
      if (errorCount > 0) {
        message.warning({ 
          content: `数据验证完成：成功 ${successCount} 条，错误 ${errorCount} 条`, 
          key: 'parsing',
          duration: 3
        })
      } else {
        message.success({ 
          content: `数据验证完成：全部 ${successCount} 条数据验证通过`, 
          key: 'parsing',
          duration: 3
        })
      }
      
      // 直接跳转到预览步骤
      setBatchImportStep(2)
      
    } catch (error) {
      console.error('文件处理错误:', error)
      message.error({ content: '文件解析失败，请检查文件格式', key: 'parsing' })
    }
  }

  // 文件上传配置
  const uploadProps = {
    name: 'file',
    multiple: false,
    accept: '.xlsx,.xls',
    fileList: importFileList,
    beforeUpload: (file) => {
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                     file.type === 'application/vnd.ms-excel'
      if (!isExcel) {
        message.error('只能上传Excel文件')
        return false
      }
      const isLt10M = file.size / 1024 / 1024 < 10
      if (!isLt10M) {
        message.error('文件大小不能超过10MB')
        return false
      }
      
      // 立即解析文件
      handleFileChange(file)
      
      return false // 阻止自动上传
    },
    onChange: (info) => {
      setImportFileList(info.fileList.slice(-1)) // 只保留最新的一个文件
    },
    onRemove: () => {
      setImportFileList([])
      setImportData([])
      setBatchImportStep(1) // 返回上传步骤
    }
  }

  // 获取数据完整度颜色
  const getCompletenessColor = (completeness) => {
    if (completeness >= 90) return '#52c41a'
    if (completeness >= 70) return '#faad14'
    return '#ff4d4f'
  }

  // 表格列定义
  const columns = [
    {
      title: '患者ID',
      dataIndex: 'id',
      key: 'id',
      width: 160,
      minWidth: 120,
      fixed: 'left',
      sorter: true,
      resizable: true,
      render: (id) => <Text strong style={{ fontSize: 12 }}>{id}</Text>
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      minWidth: 100,
      resizable: true,
      render: (name, record) => (
        <Button 
          type="link" 
          onClick={() => navigate(`/patient/detail/${record.patientId}`)}
          style={{ padding: 0, height: 'auto', fontWeight: 'bold' }}
        >
          {name ? maskName(name) : '-'}
        </Button>
      )
    },
    {
      title: '基本信息',
      key: 'basicInfo',
      width: 140,
      minWidth: 120,
      resizable: true,
      render: (_, record) => (
        <div>
          <div style={{ marginBottom: 2 }}>
            <Text strong>{record.gender} {record.age}岁</Text>
          </div>
        </div>
      )
    },
    {
      title: '主要诊断',
      dataIndex: 'diagnosis',
      key: 'diagnosis',
      width: 220,
      minWidth: 180,
      resizable: true,
      render: (diagnosis) => (
        <div>
          <Space wrap style={{ marginBottom: 4 }}>
            {diagnosis.slice(0, 2).map(d => (
              <Tag key={d} color="blue" size="small">{d}</Tag>
            ))}
            {diagnosis.length > 2 && (
              <Tooltip title={diagnosis.slice(2).join(', ')}>
                <Tag size="small" color="default">+{diagnosis.length - 2}</Tag>
              </Tooltip>
            )}
            {diagnosis.length === 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>暂无诊断</Text>
            )}
          </Space>
        </div>
      )
    },
    {
      title: '文档数量',
      dataIndex: 'documentCount',
      key: 'documentCount',
      width: 100,
      minWidth: 80,
      sorter: true,
      resizable: true,
      render: (count) => (
        <Space>
          <FileTextOutlined />
          <Text>{count || 0}份</Text>
        </Space>
      )
    },
    {
      title: '数据完整度',
      dataIndex: 'completeness',
      key: 'completeness',
      width: 130,
      minWidth: 110,
      sorter: true,
      resizable: true,
      render: (completeness) => (
        <Progress
          percent={completeness}
          size="small"
          strokeColor={getCompletenessColor(completeness)}
          format={percent => `${percent}%`}
        />
      )
    },
    {
      title: '字段冲突',
      dataIndex: 'pendingFieldConflictCount',
      key: 'conflicts',
      width: 120,
      minWidth: 100,
      resizable: true,
      render: (count, record) => (
        record.hasPendingFieldConflicts ? (
          <Tooltip title="该患者存在待解决字段冲突">
            <Tag color="error">{`待处理 ${count}`}</Tag>
          </Tooltip>
        ) : (
          <Tag color="success">无冲突</Tag>
        )
      )
    },
    {
      title: '主治医生',
      dataIndex: 'doctor',
      key: 'doctor',
      width: 100,
      minWidth: 80,
      resizable: true,
      render: (doctor) => (
        <Text style={{ fontSize: 12 }}>
          {doctor || '未分配'}
        </Text>
      )
    },
    {
      title: '关联项目',
      dataIndex: 'projects',
      key: 'projects',
      width: 160,
      minWidth: 120,
      resizable: true,
      render: (projects) => (
        <div>
          {projects && projects.length > 0 ? (
            <Space direction="vertical" size="small">
              {projects.slice(0, 2).map(project => (
                <Tooltip key={project.id} title={`${project.project_code}: ${project.project_name}`}>
                  <Tag 
                    size="small" 
                    color={project.status === 'active' ? 'green' : project.status === 'completed' ? 'blue' : 'default'}
                    style={{ cursor: 'pointer', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {project.project_name.length > 10 ? `${project.project_name.substring(0, 10)}...` : project.project_name}
                  </Tag>
                </Tooltip>
              ))}
              {projects.length > 2 && (
                <Tooltip title={projects.slice(2).map(p => p.project_name).join(', ')}>
                  <Text type="secondary" style={{ fontSize: 10, cursor: 'pointer' }}>
                    +{projects.length - 2}个项目
                  </Text>
                </Tooltip>
              )}
            </Space>
          ) : (
            <Tag size="small" color="default">
              未关联
            </Tag>
          )}
        </div>
      )
    },
    {
      title: '最近更新',
      dataIndex: 'lastUpdate',
      key: 'lastUpdate',
      width: 100,
      minWidth: 80,
      sorter: true,
      resizable: true,
      render: (date) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {date}
        </Text>
      )
    }
  ]

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_INVERT,
      Table.SELECTION_NONE,
      {
        key: 'high-completeness',
        text: '选择高完整度患者',
        onSelect: () => {
          const highCompletenessKeys = patientData
            .filter(item => item.completeness >= 90)
            .map(item => item.key)
          setSelectedRowKeys(highCompletenessKeys)
        }
      }
    ]
  }

  // 批量操作菜单
  const batchActions = [
    {
      key: 'export',
      icon: <ExportOutlined />,
      label: '批量导出'
    },
    {
      key: 'add-to-project',
      icon: <PlusOutlined />,
      label: '添加到项目'
    },
    {
      key: 'update-tags',
      icon: <EditOutlined />,
      label: '批量标签'
    },
    {
      type: 'divider'
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '批量删除',
      danger: true
    }
  ]

  const handleBatchAction = ({ key }) => {
    console.log('批量操作:', key, selectedRowKeys)
    if (key === 'export') {
      setExportModalVisible(true)
    } else if (key === 'delete') {
      handleBatchDelete()
    }
  }

  // 批量删除患者
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的患者')
      return
    }

    // 先检查关联的科研项目
    let linkedProjects = []
    try {
      const checkResp = await batchDeleteCheck({ patient_ids: selectedRowKeys })
      if (checkResp.success && checkResp.data?.projects) {
        linkedProjects = checkResp.data.projects
      }
    } catch {
      // 检查失败不阻塞删除流程
    }

    const confirmContent = (
      <div>
        <p>确定要删除选中的 <strong>{selectedRowKeys.length}</strong> 位患者吗？此操作不可恢复。</p>
        {linkedProjects.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message="以下科研项目包含选中的患者，删除后将同时从项目中移出"
            description={
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                {linkedProjects.map(p => (
                  <li key={p.project_id}>
                    {p.project_name}（涉及 {p.patient_count} 位患者）
                  </li>
                ))}
              </ul>
            }
          />
        )}
      </div>
    )

    Modal.confirm({
      title: '确认删除患者',
      content: confirmContent,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      width: linkedProjects.length > 0 ? 520 : undefined,
      onOk: async () => {
        try {
          const response = await batchDeletePatients({ patient_ids: selectedRowKeys })
          
          if (response.success) {
            const { success_count, failed_count, failed_ids, removed_from_projects } = response.data
            
            if (failed_count > 0) {
              Modal.warning({
                title: '批量删除完成',
                content: (
                  <div>
                    <p>成功删除: {success_count} 位患者</p>
                    <p style={{ color: '#ff4d4f' }}>删除失败: {failed_count} 位患者</p>
                    {failed_ids && failed_ids.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary">失败的患者ID:</Text>
                        <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 4 }}>
                          {failed_ids.map(id => (
                            <div key={id} style={{ fontSize: 12 }}>{id}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {removed_from_projects && removed_from_projects.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <Text type="warning">已从以下项目中移出: {removed_from_projects.join('、')}</Text>
                      </div>
                    )}
                  </div>
                )
              })
            } else {
              let msg = `成功删除 ${success_count} 位患者`
              if (removed_from_projects && removed_from_projects.length > 0) {
                msg += `，已从 ${removed_from_projects.length} 个科研项目中移出`
              }
              message.success(msg)
            }
            
            // 清空选中项
            setSelectedRowKeys([])
            // 重新加载列表
            fetchPatients()
          }
        } catch (error) {
          console.error('批量删除失败:', error)
          message.error('批量删除失败，请稍后重试')
        }
      }
    })
  }

  // 导出患者数据
  const handleExport = async () => {
    // 验证导出范围
    if (exportForm.scope === 'selected' && selectedRowKeys.length === 0) {
      message.warning('请先选择要导出的患者')
      return
    }

    setExportLoading(true)
    try {
      // 构建导出请求参数
      const exportData = {
        format: exportForm.format,
        scope: exportForm.scope,
        include_basic_info: exportForm.include_basic_info,
        include_diagnosis: exportForm.include_diagnosis,
        include_completeness: exportForm.include_completeness,
        include_ehr: exportForm.include_ehr,
        desensitize: exportForm.desensitize
      }

      // 根据导出范围添加额外参数
      if (exportForm.scope === 'selected') {
        exportData.patient_ids = selectedRowKeys
      } else if (exportForm.scope === 'filtered') {
        // 添加基础筛选条件
        if (filters.search) exportData.search = filters.search
        if (filters.gender) exportData.gender = filters.gender
        if (filters.department) exportData.department_id = filters.department
        if (filters.projectStatus) exportData.has_projects = filters.projectStatus
        
        // 添加高级筛选条件
        if (advancedFilters.diagnosisKeywords) {
          exportData.diagnosis_keywords = advancedFilters.diagnosisKeywords
        }
        if (advancedFilters.dateRange && advancedFilters.dateRange.length === 2) {
          exportData.start_date = advancedFilters.dateRange[0].format('YYYY-MM-DD')
          exportData.end_date = advancedFilters.dateRange[1].format('YYYY-MM-DD')
        }
        if (advancedFilters.projectStatus && advancedFilters.projectStatus.length > 0) {
          exportData.project_status = advancedFilters.projectStatus[0]
        }
        if (advancedFilters.docCountMin !== null && advancedFilters.docCountMin !== undefined) {
          exportData.doc_count_min = advancedFilters.docCountMin
        }
        if (advancedFilters.docCountMax !== null && advancedFilters.docCountMax !== undefined) {
          exportData.doc_count_max = advancedFilters.docCountMax
        }
      }

      console.log('导出请求数据:', exportData)

      const response = await exportPatients(exportData)
      
      // 处理文件下载
      const blob = new Blob([response], { 
        type: exportForm.format === 'excel' 
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : exportForm.format === 'csv'
            ? 'text/csv'
            : 'application/json'
      })
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // 生成文件名
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const extension = exportForm.format === 'excel' ? 'xlsx' : exportForm.format
      link.download = `患者数据导出_${timestamp}.${extension}`
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      message.success('导出成功')
      setExportModalVisible(false)
    } catch (error) {
      console.error('导出失败:', error)
      message.error('导出失败，请稍后重试')
    } finally {
      setExportLoading(false)
    }
  }

  // 重置筛选条件
  const handleResetFilters = () => {
    setFilters({
      search: '',
      gender: '',
      ageRange: [0, 100],
      department: '',
      diagnosis: '',
      completeness: '',
      projectStatus: '',
      dateRange: null
    })
    // 同时重置高级筛选
    setAdvancedFilters({
      diagnosisKeywords: '',
      dateRange: null,
      projectStatus: [],
      docCountMin: null,
      docCountMax: null
    })
    advancedFilterForm.resetFields()
    setPagination(prev => ({ ...prev, current: 1 }))
    message.success('筛选条件已重置')
  }

  return (
    <div className="page-container fade-in">

      {/* 统计面板 - 仪表板风格 */}
      <Card 
        size="small" 
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <Text strong>数据概览</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              实时统计 · 最近更新: {new Date().toLocaleTimeString()}
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
                  <UserOutlined style={{ fontSize: 18, marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>患者总数</Text>
                </div>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                  {statistics.totalPatients.toLocaleString()}
                </div>
                {/* <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  较上月 +{Math.floor(statistics.totalPatients * 0.08)}
                </Text> */}
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
                  <FileTextOutlined style={{ fontSize: 18, marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>文档总数</Text>
                </div>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                  {statistics.totalDocuments.toLocaleString()}
                </div>
                {/* <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  今日新增 +{Math.floor(statistics.totalDocuments * 0.02)}
                </Text> */}
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
                  <CheckCircleOutlined style={{ fontSize: 18, marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>平均完整度</Text>
                </div>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                  {statistics.averageCompleteness}%
                </div>
                {/* <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  目标: 90% 以上
                </Text> */}
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
                  <ThunderboltOutlined style={{ fontSize: 18, marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>最近30天新增</Text>
                </div>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                  {statistics.recentlyAdded}
                </div>
                {/* <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  日均 +{Math.ceil(statistics.recentlyAdded / 30)} 名
                </Text> */}
              </div>
            </Col>
          </Row>
        )}
      </Card>

      {/* 筛选工具栏 */}
       <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Search
              placeholder="搜索患者姓名、ID或诊断"
              allowClear
              enterButton={<SearchOutlined />}
              onChange={(e) => debounceSearch(e.target.value)}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={12} sm={4} md={3}>
            <Select 
              placeholder="性别" 
              allowClear 
              style={{ width: '100%' }}
              value={filters.gender || undefined}
              onChange={(value) => {
                setFilters({...filters, gender: value || ''})
                setPagination(prev => ({ ...prev, current: 1 }))
              }}
            >
              <Select.Option value="男">男</Select.Option>
              <Select.Option value="女">女</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={6} md={5}>
            <TreeSelect 
              placeholder="科室" 
              allowClear 
              loading={departmentLoading}
              style={{ width: '100%' }}
              value={filters.department || undefined}
              treeData={departmentTreeData}
              onChange={(value) => {
                setFilters({...filters, department: value || ''})
                setPagination(prev => ({ ...prev, current: 1 }))
              }}
            />
          </Col>
          <Col xs={12} sm={4} md={3}>
            <Select 
              placeholder="项目状态" 
              allowClear 
              style={{ width: '100%' }}
              value={filters.projectStatus || undefined}
              onChange={(value) => {
                setFilters({...filters, projectStatus: value || ''})
                setPagination(prev => ({ ...prev, current: 1 }))
              }}
            >
              <Select.Option value="unlinked">未关联</Select.Option>
              <Select.Option value="linked">已关联</Select.Option>
            </Select>
          </Col>
          <Col flex={1}>
            <Space>
              <Button 
                icon={<ReloadOutlined />}
                onClick={handleResetFilters}
              >
                重置
              </Button>
              <Badge 
                count={
                  (advancedFilters.diagnosisKeywords ? 1 : 0) +
                  (advancedFilters.dateRange ? 1 : 0) +
                  (advancedFilters.projectStatus?.length > 0 ? 1 : 0) +
                  ((advancedFilters.docCountMin !== null || advancedFilters.docCountMax !== null) ? 1 : 0)
                }
                size="small"
                offset={[-5, 5]}
              >
                <Button icon={<FilterOutlined />} onClick={() => setFilterVisible(true)}>
                  高级筛选
                </Button>
              </Badge>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'column-control',
                      label: (
                        <div style={{ padding: '8px 0' }}>
                          <Text strong style={{ marginBottom: 8, display: 'block' }}>显示列设置</Text>
                          <Checkbox.Group
                            value={visibleColumns}
                            onChange={setVisibleColumns}
                            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                          >
                            {columnOptions.map(option => (
                              <Checkbox key={option.value} value={option.value}>
                                {option.label}
                              </Checkbox>
                            ))}
                          </Checkbox.Group>
                        </div>
                      )
                    }
                  ]
                }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button icon={<SettingOutlined />}>
                  列设置
                </Button>
              </Dropdown>
            </Space>
          </Col>
          <Col>
            <Text type="secondary" style={{ fontSize: 12 }}>
              显示 {patientData.length} / {pagination.total} 名患者
            </Text>
          </Col>
        </Row>
      </Card>

      {/* 患者列表 */}
      <Card
        title={
          <Space>
            <Text strong style={{ fontSize: 16, color: '#374151' }}>患者数据池</Text>
            <Divider type="vertical" />
            <Checkbox
               indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < patientData.length}
               checked={selectedRowKeys.length === patientData.length && patientData.length > 0}
              onChange={(e) => {
                setSelectedRowKeys(e.target.checked ? patientData.map(item => item.key) : [])
              }}
            >
              全选
            </Checkbox>
            <Text>已选择 {selectedRowKeys.length} 名患者</Text>
            <Text type="secondary">当前显示: {patientData.length}/{pagination.total.toLocaleString()} 名患者</Text>
            <Divider type="vertical" />
            <Tooltip title="点击患者姓名查看详情，使用右上角列设置调整显示内容">
              <InfoCircleOutlined style={{ color: '#6366f1' }} />
            </Tooltip>
          </Space>
        }
        extra={
          <Space>
            {selectedRowKeys.length > 0 && (
              <Dropdown
                menu={{
                  items: batchActions,
                  onClick: handleBatchAction
                }}
              >
                <Button type="primary" style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}>
                  批量操作 <MoreOutlined />
                </Button>
              </Dropdown>
            )}
            <Button icon={<ExportOutlined />} onClick={() => setExportModalVisible(true)}>
              导出数据
            </Button>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'add-single',
                    icon: <UserAddOutlined />,
                    label: '新建患者',
                    onClick: () => setAddPatientVisible(true)
                  },
                  {
                    key: 'batch-import',
                    icon: <UsergroupAddOutlined />,
                    label: '批量导入',
                    onClick: () => setBatchImportVisible(true)
                  }
                ]
              }}
            >
              <Button type="primary" icon={<PlusOutlined />} style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}>
                添加患者 <MoreOutlined />
              </Button>
            </Dropdown>
          </Space>
        }
      >
        <Table
          rowSelection={rowSelection}
          columns={columns
            .filter(col => visibleColumns.includes(col.key))
            .map((col, index) => ({
              ...col,
              width: columnWidths[index] || col.width,
              onHeaderCell: (column) => ({
                width: columnWidths[index] || column.width,
                onResize: (e, { size }) => handleResize(index, size),
              }),
            }))}
          dataSource={patientData}
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`
          }}
          onChange={handleTableChange}
          scroll={{ x: 'max-content' }}
          size="small"
          bordered
          tableLayout="auto"
        />
      </Card>

      {/* 高级筛选弹窗 */}
      <Modal
        title="高级筛选设置"
        open={filterVisible}
        onCancel={() => setFilterVisible(false)}
        footer={[
          <Button 
            key="reset" 
            onClick={() => {
              advancedFilterForm.resetFields()
              setAdvancedFilters({
                diagnosisKeywords: '',
                dateRange: null,
                projectStatus: [],
                docCountMin: null,
                docCountMax: null
              })
            }}
          >
            重置
          </Button>,
          <Button key="cancel" onClick={() => setFilterVisible(false)}>取消</Button>,
          <Button 
            key="apply" 
            type="primary" 
            style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
            onClick={() => {
              const values = advancedFilterForm.getFieldsValue()
              setAdvancedFilters({
                diagnosisKeywords: values.diagnosisKeywords || '',
                dateRange: values.dateRange || null,
                projectStatus: values.projectStatus || [],
                docCountMin: values.docCountMin,
                docCountMax: values.docCountMax
              })
              setPagination(prev => ({ ...prev, current: 1 }))
              setFilterVisible(false)
              message.success('高级筛选已应用')
            }}
          >
            应用筛选
          </Button>
        ]}
        width={800}
      >
        <Form 
          form={advancedFilterForm} 
          layout="vertical"
          initialValues={{
            diagnosisKeywords: advancedFilters.diagnosisKeywords,
            dateRange: advancedFilters.dateRange,
            projectStatus: advancedFilters.projectStatus,
            docCountMin: advancedFilters.docCountMin,
            docCountMax: advancedFilters.docCountMax
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                name="diagnosisKeywords" 
                label="诊断关键词"
                tooltip="输入诊断关键词，多个关键词用逗号分隔，任一匹配即可"
              >
                <Input placeholder="例如：肺癌,糖尿病（逗号分隔）" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item 
                name="dateRange" 
                label="创建时间范围"
                tooltip="筛选患者创建时间在此范围内的记录"
              >
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                name="projectStatus" 
                label="项目状态"
                tooltip="根据患者参与的项目数量筛选"
              >
                <Select mode="multiple" placeholder="选择项目状态" allowClear>
                  <Select.Option value="unassigned">未分配项目</Select.Option>
                  <Select.Option value="single">单项目患者</Select.Option>
                  <Select.Option value="multiple">多项目患者</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="文档数量范围" tooltip="根据患者关联的文档数量筛选">
                <Space>
                  <Form.Item name="docCountMin" noStyle>
                    <InputNumber placeholder="最少" min={0} style={{ width: 100 }} />
                  </Form.Item>
                  <Text>-</Text>
                  <Form.Item name="docCountMax" noStyle>
                    <InputNumber placeholder="最多" min={0} style={{ width: 100 }} />
                  </Form.Item>
                  <Text>份</Text>
                </Space>
              </Form.Item>
            </Col>
          </Row>
          
          {/* 当前筛选条件预览 */}
          {(advancedFilters.diagnosisKeywords || advancedFilters.dateRange || 
            advancedFilters.projectStatus?.length > 0 || 
            advancedFilters.docCountMin !== null || advancedFilters.docCountMax !== null) && (
            <Alert
              message="当前已应用的高级筛选"
              description={
                <Space wrap>
                  {advancedFilters.diagnosisKeywords && (
                    <Tag color="blue">诊断: {advancedFilters.diagnosisKeywords}</Tag>
                  )}
                  {advancedFilters.dateRange && (
                    <Tag color="green">
                      时间: {advancedFilters.dateRange[0]?.format('YYYY-MM-DD')} ~ {advancedFilters.dateRange[1]?.format('YYYY-MM-DD')}
                    </Tag>
                  )}
                  {advancedFilters.projectStatus?.map(status => (
                    <Tag key={status} color="purple">
                      {status === 'unassigned' ? '未分配项目' : status === 'single' ? '单项目' : '多项目'}
                    </Tag>
                  ))}
                  {(advancedFilters.docCountMin !== null || advancedFilters.docCountMax !== null) && (
                    <Tag color="orange">
                      文档: {advancedFilters.docCountMin ?? 0} ~ {advancedFilters.docCountMax ?? '∞'} 份
                    </Tag>
                  )}
                </Space>
              }
              type="info"
              showIcon
              style={{ marginTop: 16 }}
            />
          )}
        </Form>
      </Modal>

      {/* 数据导出弹窗 */}
      <Modal
        title="数据导出"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setExportModalVisible(false)}>取消</Button>,
          <Button 
            key="export" 
            type="primary" 
            loading={exportLoading}
            onClick={handleExport}
            style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
          >
            开始导出
          </Button>
        ]}
      >
        <Form layout="vertical">
          <Form.Item label="导出格式">
            <Select 
              value={exportForm.format}
              onChange={(value) => setExportForm(prev => ({ ...prev, format: value }))}
            >
              <Select.Option value="excel">Excel格式</Select.Option>
              <Select.Option value="csv">CSV格式</Select.Option>
              <Select.Option value="json">JSON格式</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="导出范围">
            <Select 
              value={exportForm.scope}
              onChange={(value) => setExportForm(prev => ({ ...prev, scope: value }))}
            >
              <Select.Option value="all">全部患者</Select.Option>
              <Select.Option value="filtered">当前筛选结果</Select.Option>
              <Select.Option value="selected">
                选中的患者 ({selectedRowKeys.length})
              </Select.Option>
            </Select>
          </Form.Item>
          {exportForm.scope === 'selected' && selectedRowKeys.length === 0 && (
            <Alert
              message="请先在列表中选择要导出的患者"
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          {exportForm.scope === 'filtered' && (
            (filters.search || filters.gender || filters.department || filters.projectStatus ||
             advancedFilters.diagnosisKeywords || advancedFilters.dateRange || 
             advancedFilters.projectStatus?.length > 0 || 
             advancedFilters.docCountMin !== null || advancedFilters.docCountMax !== null) ? (
              <Alert
                message="当前筛选条件将应用于导出"
                description={
                  <Space wrap size={[4, 4]}>
                    {filters.search && <Tag color="blue">搜索: {filters.search}</Tag>}
                    {filters.gender && <Tag color="blue">性别: {filters.gender}</Tag>}
                    {filters.department && <Tag color="blue">科室已选</Tag>}
                    {filters.projectStatus && (
                      <Tag color="blue">
                        项目: {filters.projectStatus === 'linked' ? '已关联' : '未关联'}
                      </Tag>
                    )}
                    {advancedFilters.diagnosisKeywords && (
                      <Tag color="purple">诊断: {advancedFilters.diagnosisKeywords}</Tag>
                    )}
                    {advancedFilters.dateRange && (
                      <Tag color="green">
                        时间: {advancedFilters.dateRange[0]?.format('YYYY-MM-DD')} ~ {advancedFilters.dateRange[1]?.format('YYYY-MM-DD')}
                      </Tag>
                    )}
                    {advancedFilters.projectStatus?.map(status => (
                      <Tag key={status} color="orange">
                        {status === 'unassigned' ? '未分配项目' : status === 'single' ? '单项目' : '多项目'}
                      </Tag>
                    ))}
                    {(advancedFilters.docCountMin !== null || advancedFilters.docCountMax !== null) && (
                      <Tag color="cyan">
                        文档: {advancedFilters.docCountMin ?? 0} ~ {advancedFilters.docCountMax ?? '∞'} 份
                      </Tag>
                    )}
                  </Space>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            ) : (
              <Alert
                message="未设置筛选条件，将导出全部患者数据"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )
          )}
          <Form.Item label="包含字段">
            <Row gutter={[8, 8]}>
              <Col span={8}>
                <Checkbox 
                  checked={exportForm.include_basic_info}
                  onChange={(e) => setExportForm(prev => ({ ...prev, include_basic_info: e.target.checked }))}
                >
                  基本信息
                </Checkbox>
              </Col>
              <Col span={8}>
                <Checkbox 
                  checked={exportForm.include_diagnosis}
                  onChange={(e) => setExportForm(prev => ({ ...prev, include_diagnosis: e.target.checked }))}
                >
                  诊断信息
                </Checkbox>
              </Col>
              <Col span={8}>
                <Checkbox 
                  checked={exportForm.include_completeness}
                  onChange={(e) => setExportForm(prev => ({ ...prev, include_completeness: e.target.checked }))}
                >
                  完整度
                </Checkbox>
              </Col>
              <Col span={8}>
                <Checkbox defaultChecked>文档信息</Checkbox>
              </Col>
              <Col span={8}>
                <Checkbox defaultChecked>项目关联</Checkbox>
              </Col>
              <Col span={8}>
                <Checkbox defaultChecked>时间线</Checkbox>
              </Col>
              </Row>
          </Form.Item>
          <Form.Item label="数据脱敏" valuePropName="checked">
            <Checkbox 
              checked={exportForm.desensitize}
              onChange={(e) => setExportForm(prev => ({ ...prev, desensitize: e.target.checked }))}
            >
              对敏感信息进行脱敏处理
            </Checkbox>
          </Form.Item>
        </Form>
       </Modal>

      {/* 新建患者弹窗 */}
      <Modal
        title={
          <Space>
            <UserAddOutlined />
            新建患者
          </Space>
        }
        open={addPatientVisible}
        onCancel={() => {
          setAddPatientVisible(false)
          setAddPatientStep(0)
          addPatientForm.resetFields()
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setAddPatientVisible(false)
            setAddPatientStep(0)
            addPatientForm.resetFields()
          }}>
            取消
          </Button>,
          addPatientStep > 0 && (
            <Button key="prev" onClick={() => setAddPatientStep(addPatientStep - 1)}>
              上一步
            </Button>
          ),
          <Button key="next" type="primary" onClick={handleAddPatient} loading={addPatientLoading} style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}>
            {addPatientStep === 2 ? '保存' : '下一步'}
          </Button>
        ]}
        width={800}
        destroyOnHidden
      >
        <Steps current={addPatientStep} style={{ marginBottom: 24 }}>
          {addPatientSteps.map(step => (
            <Step key={step.title} title={step.title} description={step.description} />
          ))}
        </Steps>

        <Form form={addPatientForm} layout="vertical">
          {addPatientStep === 0 && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item 
                  label="患者姓名" 
                  name="name" 
                  rules={[{ required: true, message: '请输入患者姓名' }]}
                >
                  <Input placeholder="请输入患者姓名" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item 
                  label="性别" 
                  name="gender" 
                  rules={[{ required: true, message: '请选择性别' }]}
                >
                  <Select placeholder="选择性别">
                    <Select.Option value="男">男</Select.Option>
                    <Select.Option value="女">女</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item 
                  label="年龄" 
                  name="age" 
                  rules={[{ required: true, message: '请输入年龄' }]}
                >
                  <InputNumber 
                    placeholder="年龄" 
                    min={0} 
                    max={150} 
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item 
                  label="联系电话" 
                  name="phone"
                >
                  <Input placeholder="请输入联系电话" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item 
                  label="身份证号" 
                  name="idCard"
                >
                  <Input placeholder="请输入身份证号" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item 
                  label="所属科室" 
                  name="department" 
                  rules={[{ required: true, message: '请选择科室' }]}
                >
                  <TreeSelect 
                    placeholder="选择科室" 
                    showSearch
                    treeDefaultExpandAll
                    loading={departmentLoading}
                    treeData={departmentTreeData}
                    filterTreeNode={(input, treeNode) =>
                      treeNode.title.toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="主治医生" name="doctor">
                  <Input placeholder="请输入主治医生" />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="住址" name="address">
                  <Input.TextArea placeholder="请输入详细住址" rows={2} />
                </Form.Item>
              </Col>
            </Row>
          )}

          {addPatientStep === 1 && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="主要诊断" name="diagnosis">
                  <Select 
                    mode="tags" 
                    placeholder="输入或选择诊断" 
                    style={{ width: '100%' }}
                  >
                    {diagnosisOptions.map(diagnosis => (
                      <Select.Option key={diagnosis} value={diagnosis}>{diagnosis}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="ICD编码" name="icdCodes">
                  <Select mode="tags" placeholder="输入ICD编码" />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="既往病史" name="medicalHistory">
                  <Input.TextArea placeholder="请输入既往病史" rows={3} />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="过敏史" name="allergyHistory">
                  <Input.TextArea placeholder="请输入过敏史" rows={2} />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="当前用药" name="currentMedication">
                  <Input.TextArea placeholder="请输入当前用药情况" rows={3} />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="备注" name="notes">
                  <Input.TextArea placeholder="其他备注信息" rows={2} />
                </Form.Item>
              </Col>
            </Row>
          )}

          {addPatientStep === 2 && (
            <div>
              <Alert
                message="请确认患者信息"
                description="请仔细核对以下信息，确认无误后点击保存。"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Card size="small" title="基本信息">
                <Row gutter={16}>
                  <Col span={8}>
                    <Text strong>姓名：</Text>
                    <Text>{addPatientForm.getFieldValue('name')}</Text>
                  </Col>
                  <Col span={8}>
                    <Text strong>性别：</Text>
                    <Text>{addPatientForm.getFieldValue('gender')}</Text>
                  </Col>
                  <Col span={8}>
                    <Text strong>年龄：</Text>
                    <Text>{addPatientForm.getFieldValue('age')}岁</Text>
                  </Col>
                  <Col span={12}>
                    <Text strong>科室：</Text>
                    <Text>{getDepartmentNameById(addPatientForm.getFieldValue('department'))}</Text>
                  </Col>
                  <Col span={12}>
                    <Text strong>主治医生：</Text>
                    <Text>{addPatientForm.getFieldValue('doctor') || '未填写'}</Text>
                  </Col>
                </Row>
              </Card>
              <Card size="small" title="医疗信息" style={{ marginTop: 16 }}>
                <Row gutter={16}>
                  <Col span={24}>
                    <Text strong>主要诊断：</Text>
                    <div style={{ marginTop: 4 }}>
                      {(addPatientForm.getFieldValue('diagnosis') || []).map(d => (
                        <Tag key={d} color="blue">{d}</Tag>
                      ))}
                      {(!addPatientForm.getFieldValue('diagnosis') || addPatientForm.getFieldValue('diagnosis').length === 0) && (
                        <Text type="secondary">未填写</Text>
                      )}
                    </div>
                  </Col>
                </Row>
              </Card>
            </div>
          )}
        </Form>
      </Modal>

      {/* 批量导入弹窗 */}
      <Modal
        title={
          <Space>
            <UsergroupAddOutlined />
            批量导入患者
          </Space>
        }
        open={batchImportVisible}
        onCancel={() => {
          setBatchImportVisible(false)
          setBatchImportStep(0)
          setImportFileList([])
          setImportData([])
          setImportErrors([])
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setBatchImportVisible(false)
            setBatchImportStep(0)
            setImportFileList([])
            setImportData([])
            setImportErrors([])
          }}>
            取消
          </Button>,
          batchImportStep > 0 && (
            <Button key="prev" onClick={() => {
              const prevStep = batchImportStep - 1
              setBatchImportStep(prevStep)
              if (prevStep === 1) {
                // 如果回到上传步骤，清空解析数据以便重新触发上传/解析
                // 或者保留数据供用户查看已选择的文件，这里选择不强制清空
              }
            }}>
              上一步
            </Button>
          ),
          (batchImportStep === 0 || batchImportStep === 1) && (
            <Button 
              key="next" 
              type="primary" 
              onClick={handleBatchImport}
              style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
            >
              下一步
            </Button>
          ),
          batchImportStep === 2 && (
            <Button 
              key="confirm" 
              type="primary" 
              onClick={handleBatchImport}
              loading={loading}
              disabled={importData.filter(item => item.status === 'success').length === 0}
              style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
            >
              确认导入
            </Button>
          )
        ]}
        width={900}
        destroyOnHidden
      >
        <Steps current={batchImportStep} style={{ marginBottom: 24 }}>
          {batchImportSteps.map(step => (
            <Step key={step.title} title={step.title} description={step.description} />
          ))}
        </Steps>

        {batchImportStep === 0 && (
          <div>
            <Alert
              message="导入说明"
              description="请先下载Excel模版，按照模版格式填写患者信息后上传。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Card>
              <Row gutter={16} align="middle">
                <Col span={16}>
                  <Space direction="vertical">
                    <Text strong>患者信息导入模版.xlsx</Text>
                    <Text type="secondary">
                      包含字段：患者姓名、性别、年龄、联系电话、科室、主要诊断等
                    </Text>
                  </Space>
                </Col>
                <Col span={8}>
                  <Button 
                    type="primary" 
                    icon={<DownloadOutlined />} 
                    onClick={downloadTemplate}
                    block
                    style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
                  >
                    下载模版
                  </Button>
                </Col>
              </Row>
            </Card>
          </div>
        )}

        {batchImportStep === 1 && (
          <div>
            <Alert
              message="上传Excel文件"
              description="请选择填写完成的Excel文件进行上传。支持.xlsx和.xls格式，文件大小不超过10MB。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Dragger {...uploadProps}>
              <p className="ant-upload-drag-icon">
                <CloudUploadOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
              <p className="ant-upload-hint">
                支持Excel格式文件(.xlsx, .xls)，文件大小不超过10MB
              </p>
            </Dragger>
          </div>
        )}

        {batchImportStep === 2 && (
          <div>
            {importData.filter(item => item.status === 'error').length > 0 && (
              <Alert
                message={`发现 ${importData.filter(item => item.status === 'error').length} 个错误`}
                description="错误的数据将被跳过，只导入验证通过的数据。"
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            
            {importData.filter(item => item.status === 'success').length > 0 && (
              <Alert
                message="数据验证完成"
                description={`共 ${importData.length} 条数据，其中 ${importData.filter(item => item.status === 'success').length} 条验证通过，可以导入。`}
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            
            <Card 
              title={
                <Space>
                  <span>数据预览 ({importData.length} 条)</span>
                  <Checkbox
                    checked={selectedImportKeys.length > 0 && selectedImportKeys.length === importData.filter(item => item.status === 'success').length}
                    indeterminate={selectedImportKeys.length > 0 && selectedImportKeys.length < importData.filter(item => item.status === 'success').length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // 全选：只选择验证通过的数据
                        const allSuccessKeys = importData
                          .filter(item => item.status === 'success')
                          .map(item => item.key)
                        setSelectedImportKeys(allSuccessKeys)
                      } else {
                        // 取消全选
                        setSelectedImportKeys([])
                      }
                    }}
                  >
                    全选
                  </Checkbox>
                  <Text type="secondary">（已选 {selectedImportKeys.length} 个）</Text>
                </Space>
              } 
              size="small"
            >
              <Table
                dataSource={importData}
                rowKey="key"
                onRow={(record) => ({
                  onClick: (e) => {
                    // 避免点击checkbox时触发详情弹窗
                    if (e.target.type === 'checkbox' || e.target.closest('.ant-checkbox-wrapper')) {
                      return
                    }
                    setViewingPatientDetail(record)
                    setPatientDetailVisible(true)
                  },
                  style: { cursor: 'pointer' }
                })}
                rowSelection={{
                  selectedRowKeys: selectedImportKeys,
                  onChange: (selectedKeys) => {
                    setSelectedImportKeys(selectedKeys)
                  },
                  getCheckboxProps: (record) => ({
                    disabled: record.status === 'error' // 验证失败的不能选择
                  })
                }}
                columns={[
                  {
                    title: '序号',
                    dataIndex: 'rowIndex',
                    width: 50,
                    fixed: 'left'
                  },
                  { 
                    title: '姓名', 
                    dataIndex: 'name', 
                    width: 80,
                    fixed: 'left',
                    render: (text, record) => (
                      <Text type={record.status === 'error' ? 'danger' : undefined}>{text ? maskName(text) : '-'}</Text>
                    )
                  },
                  { 
                    title: '性别', 
                    dataIndex: 'gender', 
                    width: 50,
                    render: (text, record) => (
                      <Text type={record.status === 'error' ? 'danger' : undefined}>{text || '-'}</Text>
                    )
                  },
                  { 
                    title: '年龄', 
                    dataIndex: 'age', 
                    width: 50,
                    render: (text, record) => (
                      <Text type={record.status === 'error' ? 'danger' : undefined}>{text || '-'}</Text>
                    )
                  },
                  { 
                    title: '科室', 
                    dataIndex: 'department', 
                    width: 100,
                    render: (text, record) => (
                      <Text type={record.status === 'error' ? 'danger' : undefined}>{text || '-'}</Text>
                    )
                  },
                  { 
                    title: '联系电话', 
                    dataIndex: 'phone', 
                    width: 110,
                    render: (text) => text || '-'
                  },
                  { 
                    title: '主治医师', 
                    dataIndex: 'doctor', 
                    width: 90,
                    render: (text) => text || '-'
                  },
                  { 
                    title: '主要诊断', 
                    dataIndex: 'diagnosis', 
                    width: 120,
                    ellipsis: { showTitle: true },
                    render: (text) => text || '-'
                  },
                  { 
                    title: 'ICD编码', 
                    dataIndex: 'icdCodes', 
                    width: 100,
                    ellipsis: true,
                    render: (text) => text || '-'
                  },
                  { 
                    title: '既往病史', 
                    dataIndex: 'medicalHistory', 
                    width: 100,
                    ellipsis: true,
                    render: (text) => text || '-'
                  },
                  { 
                    title: '过敏史', 
                    dataIndex: 'allergyHistory', 
                    width: 100,
                    ellipsis: true,
                    render: (text) => text || '-'
                  },
                  { 
                    title: '当前用药', 
                    dataIndex: 'currentMedication', 
                    width: 100,
                    ellipsis: true,
                    render: (text) => text || '-'
                  },
                  { 
                    title: '备注', 
                    dataIndex: 'notes', 
                    width: 100,
                    ellipsis: true,
                    render: (text) => text || '-'
                  },
                  {
                    title: '验证结果',
                    width: 100,
                    render: (_, record) => {
                      const messages = [...record.errors, ...record.warnings]
                      return messages.length > 0 ? (
                        <div>
                          {record.errors.slice(0, 2).map((err, idx) => (
                            <div key={`err-${idx}`}>
                              <Text type="danger" style={{ fontSize: 12 }}>{err}</Text>
                            </div>
                          ))}
                          {record.errors.length > 2 && (
                            <Text type="danger" style={{ fontSize: 12 }}>...还有{record.errors.length - 2}个错误</Text>
                          )}
                          {record.warnings.slice(0, 1).map((warn, idx) => (
                            <div key={`warn-${idx}`}>
                              <Text type="warning" style={{ fontSize: 12 }}>{warn}</Text>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Text type="success">✓ 通过</Text>
                      )
                    }
                  },
                  {
                    title: '创建状态',
                    width: 100,
                    fixed: 'right',
                    render: (_, record) => {
                      if (record.createStatus === 'success') {
                        return <Tag color="success" icon={<CheckCircleOutlined />}>创建成功</Tag>
                      } else if (record.createStatus === 'error') {
                        return (
                          <Tooltip title={record.createMessage}>
                            <Tag color="error" icon={<WarningOutlined />}>创建失败</Tag>
                          </Tooltip>
                        )
                      }
                      return '-'
                    }
                  }
                ]}
                pagination={{
                  pageSize: 10,
                  showTotal: (total) => `共 ${total} 条`,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50', '100']
                }}
                size="small"
                scroll={{ x: 1450, y: 400 }}
              />
            </Card>

            <div style={{ marginTop: 16 }}>
              <Space split={<Divider type="vertical" />}>
                <Text strong>导入统计：</Text>
                <Text>总计 <Text strong>{importData.length}</Text> 条</Text>
                <Text type="success">验证通过 <Text strong>{importData.filter(item => item.status === 'success').length}</Text> 条</Text>
                <Text type="danger">错误 <Text strong>{importData.filter(item => item.status === 'error').length}</Text> 条</Text>
                {importData.some(item => item.warnings && item.warnings.length > 0) && (
                  <Text type="warning">警告 <Text strong>{importData.filter(item => item.warnings && item.warnings.length > 0).length}</Text> 条</Text>
                )}
              </Space>
            </div>
          </div>
        )}
      </Modal>

      {/* 患者详情查看Modal */}
      <Modal
        title={
          <Space>
            <EyeOutlined />
            <span>患者详细信息</span>
            {viewingPatientDetail && (
              <Tag color={viewingPatientDetail.status === 'success' ? 'success' : 'error'}>
                {viewingPatientDetail.status === 'success' ? '验证通过' : '验证失败'}
              </Tag>
            )}
          </Space>
        }
        open={patientDetailVisible}
        onCancel={() => {
          setPatientDetailVisible(false)
          setViewingPatientDetail(null)
        }}
        footer={[
          <Button key="close" type="primary" onClick={() => {
            setPatientDetailVisible(false)
            setViewingPatientDetail(null)
          }}>
            关闭
          </Button>
        ]}
        width={800}
      >
        {viewingPatientDetail && (
          <div>
            {viewingPatientDetail.status === 'error' && (
              <Alert
                message="数据验证失败"
                description={
                  <div>
                    {viewingPatientDetail.errors.map((err, idx) => (
                      <div key={idx}>• {err}</div>
                    ))}
                  </div>
                }
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            {viewingPatientDetail.warnings && viewingPatientDetail.warnings.length > 0 && (
              <Alert
                message="数据警告"
                description={
                  <div>
                    {viewingPatientDetail.warnings.map((warn, idx) => (
                      <div key={idx}>• {warn}</div>
                    ))}
                  </div>
                }
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Card title="基本信息" size="small" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 16]}>
                <Col span={4}>
                  <Text strong>序号：</Text>
                  <div><Text>{viewingPatientDetail.rowIndex}</Text></div>
                </Col>
                <Col span={4}>
                  <Text strong>Excel行号：</Text>
                  <div><Text>{viewingPatientDetail.excelRow}</Text></div>
                </Col>
                <Col span={8}>
                  <Text strong>患者姓名：</Text>
                  <div><Text>{viewingPatientDetail.name ? maskName(viewingPatientDetail.name) : '-'}</Text></div>
                </Col>
                <Col span={8}>
                  <Text strong>性别：</Text>
                  <div><Text>{viewingPatientDetail.gender || '-'}</Text></div>
                </Col>
                <Col span={8}>
                  <Text strong>年龄：</Text>
                  <div><Text>{viewingPatientDetail.age || '-'}</Text></div>
                </Col>
                <Col span={8}>
                  <Text strong>身份证号：</Text>
                  <div><Text>{viewingPatientDetail.idCard || '-'}</Text></div>
                </Col>
                <Col span={8}>
                  <Text strong>联系电话：</Text>
                  <div><Text>{viewingPatientDetail.phone || '-'}</Text></div>
                </Col>
                <Col span={24}>
                  <Text strong>住址：</Text>
                  <div><Text>{viewingPatientDetail.address || '-'}</Text></div>
                </Col>
              </Row>
            </Card>

            <Card title="医疗信息" size="small" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Text strong>科室：</Text>
                  <div><Text>{viewingPatientDetail.department || '-'}</Text></div>
                </Col>
                <Col span={12}>
                  <Text strong>主治医师：</Text>
                  <div><Text>{viewingPatientDetail.doctor || '-'}</Text></div>
                </Col>
                <Col span={24}>
                  <Text strong>主要诊断：</Text>
                  <div style={{ marginTop: 8 }}>
                    <Text>{viewingPatientDetail.diagnosis || '-'}</Text>
                  </div>
                </Col>
                <Col span={24}>
                  <Text strong>ICD编码：</Text>
                  <div style={{ marginTop: 8 }}>
                    <Text>{viewingPatientDetail.icdCodes || '-'}</Text>
                  </div>
                </Col>
              </Row>
            </Card>

            <Card title="病史信息" size="small">
              <Row gutter={[16, 16]}>
                <Col span={24}>
                  <Text strong>既往病史：</Text>
                  <div style={{ 
                    marginTop: 8, 
                    padding: '8px 12px', 
                    backgroundColor: '#f5f5f5', 
                    borderRadius: 4,
                    minHeight: 40
                  }}>
                    <Text style={{ whiteSpace: 'pre-wrap' }}>
                      {viewingPatientDetail.medicalHistory || '-'}
                    </Text>
                  </div>
                </Col>
                <Col span={24}>
                  <Text strong>过敏史：</Text>
                  <div style={{ 
                    marginTop: 8, 
                    padding: '8px 12px', 
                    backgroundColor: '#f5f5f5', 
                    borderRadius: 4,
                    minHeight: 40
                  }}>
                    <Text style={{ whiteSpace: 'pre-wrap' }}>
                      {viewingPatientDetail.allergyHistory || '-'}
                    </Text>
                  </div>
                </Col>
                <Col span={24}>
                  <Text strong>当前用药：</Text>
                  <div style={{ 
                    marginTop: 8, 
                    padding: '8px 12px', 
                    backgroundColor: '#f5f5f5', 
                    borderRadius: 4,
                    minHeight: 40
                  }}>
                    <Text style={{ whiteSpace: 'pre-wrap' }}>
                      {viewingPatientDetail.currentMedication || '-'}
                    </Text>
                  </div>
                </Col>
                <Col span={24}>
                  <Text strong>备注：</Text>
                  <div style={{ 
                    marginTop: 8, 
                    padding: '8px 12px', 
                    backgroundColor: '#f5f5f5', 
                    borderRadius: 4,
                    minHeight: 40
                  }}>
                    <Text style={{ whiteSpace: 'pre-wrap' }}>
                      {viewingPatientDetail.notes || '-'}
                    </Text>
                  </div>
                </Col>
              </Row>
            </Card>
          </div>
        )}
      </Modal>
     </div>
   )
 }
 
 export default PatientPool
