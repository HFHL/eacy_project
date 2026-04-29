import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadDocument, getDocumentList, deleteDocument, getDocumentTempUrl, parseDocument, markDocumentReview } from '../../api/document'
import {
  Card,
  Typography,
  Upload,
  Button,
  Space,
  Alert,
  Progress,
  List,
  Tag,
  Divider,
  Row,
  Col,
  Statistic,
  Modal,
  Form,
  Select,
  Checkbox,
  Input,
  Steps,
  Tooltip,
  message,
  Popconfirm,
  Radio,
  Descriptions,
  Collapse,
  Tabs,
  Spin,
  Badge,
  theme
} from 'antd'
import {
  UploadOutlined,
  InboxOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined,
  FolderOpenOutlined,
  CloudUploadOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
  SettingOutlined,
  DownloadOutlined,
  QuestionCircleOutlined,
  ArrowUpOutlined,
  SyncOutlined,
  ExclamationCircleOutlined,
  AuditOutlined,
  LoadingOutlined,
  RobotOutlined
} from '@ant-design/icons'
import { modalBodyPreset, modalWidthPreset } from '../../styles/themeTokens'

const { Title, Text } = Typography
const { Dragger } = Upload
const { Step } = Steps
const { Panel } = Collapse

const DocumentUpload = () => {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const [uploadFiles, setUploadFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [uploadSettings, setUploadSettings] = useState({
    csvMode: 'single',
    autoProcess: true,
    tags: []
  })
  const [settingsModalVisible, setSettingsModalVisible] = useState(false)
  const [previewModalVisible, setPreviewModalVisible] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [showProcessSteps, setShowProcessSteps] = useState(false)
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)

  // 删除文件加载状态
  const [deletingFileId, setDeletingFileId] = useState(null)
  
  // 下载文件加载状态
  const [downloading, setDownloading] = useState(false)
  
  // 解析文件加载状态
  const [parsingFileId, setParsingFileId] = useState(null)
  
  // 标记审核加载状态
  const [markingReviewFileId, setMarkingReviewFileId] = useState(null)

  // 未解析文件列表状态（已上传 Tab）
  const [unparsedDocuments, setUnparsedDocuments] = useState([])
  const [unparsedLoading, setUnparsedLoading] = useState(false)
  const [unparsedPagination, setUnparsedPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  })

  // 解析中文件列表状态（解析 Tab）
  const [parsingDocuments, setParsingDocuments] = useState([])
  const [parsingLoading, setParsingLoading] = useState(false)
  const [parsingPagination, setParsingPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  })

  // 当前激活的 Tab
  const [activeTab, setActiveTab] = useState('uploaded')

  // 轮询定时器引用
  const pollingTimerRef = useRef(null)

  // 获取已上传待处理文件列表（已上传 Tab）
  const fetchUnparsedDocuments = useCallback(async () => {
    setUnparsedLoading(true)
    try {
      const response = await getDocumentList({
        page: unparsedPagination.current,
        page_size: unparsedPagination.pageSize,
        task_status: 'uploaded'  // 只获取生命周期状态为已上传的文档
      })
      
      if (response.success && response.code === 0) {
        // 将后端数据转换为前端格式
        const documents = response.data.map(doc => ({
          id: doc.id,
          documentId: doc.id,
          name: doc.file_name,
          size: doc.file_size,
          type: doc.file_type,
          status: 'uploaded', // 已上传未解析
          taskStatus: doc.task_status,
          uploadStatus: 'success',
          uploadProgress: 100,
          fileUrl: doc.file_url,
          uploadTime: doc.upload_time,
          category: doc.category || '其他文档'
        }))
        setUnparsedDocuments(documents)
        setUnparsedPagination(prev => ({
          ...prev,
          total: response.pagination?.total || documents.length
        }))
      }
    } catch (error) {
      console.error('获取未解析文件列表失败:', error)
    } finally {
      setUnparsedLoading(false)
    }
  }, [unparsedPagination.current, unparsedPagination.pageSize])

  // 获取解析相关文件列表（解析 Tab）
  // showLoading: 是否显示加载状态，默认为 true（手动刷新时显示），轮询时设为 false 实现静默刷新
  const fetchParsingDocuments = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setParsingLoading(true)
    }
    try {
      const response = await getDocumentList({
        page: parsingPagination.current,
        page_size: parsingPagination.pageSize,
        task_status: 'parsing,parsed,parse_failed'  // 解析中、已解析、解析失败
      })
      
      if (response.success && response.code === 0) {
        // 将后端数据转换为前端格式
        const documents = response.data.map(doc => ({
          id: doc.id,
          documentId: doc.id,
          name: doc.file_name,
          size: doc.file_size,
          type: doc.file_type,
          status: doc.task_status, // parsing/parsed/parse_failed
          taskStatus: doc.task_status,
          parseError: doc.parse_error, // 解析失败原因
          uploadStatus: 'success',
          uploadProgress: 100,
          fileUrl: doc.file_url,
          uploadTime: doc.upload_time,
          category: doc.category || '其他文档',
          isParsed: doc.is_parsed,
          requiresReview: doc.requires_review || false // 是否需要人工审核
        }))
        setParsingDocuments(documents)
        setParsingPagination(prev => ({
          ...prev,
          total: response.pagination?.total || documents.length
        }))
      }
    } catch (error) {
      console.error('获取解析文件列表失败:', error)
    } finally {
      if (showLoading) {
        setParsingLoading(false)
      }
    }
  }, [parsingPagination.current, parsingPagination.pageSize])

  // 组件挂载时获取文件列表
  useEffect(() => {
    fetchUnparsedDocuments()
    fetchParsingDocuments()
  }, [fetchUnparsedDocuments, fetchParsingDocuments])

  // 自动轮询：如果有解析中的文档，每3秒刷新一次
  useEffect(() => {
    // 检查是否有解析中的文档
    const hasParsingDocs = parsingDocuments.some(doc => doc.taskStatus === 'parsing' || doc.status === 'parsing')
    
    // 清除之前的定时器
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current)
      pollingTimerRef.current = null
    }
    
    // 如果有解析中的文档，启动轮询
    if (hasParsingDocs) {
      console.log('[轮询] 检测到解析中的文档，启动3秒轮询')
      pollingTimerRef.current = setInterval(() => {
        console.log('[轮询] 刷新解析列表...')
        fetchParsingDocuments(false) // 静默刷新，不显示 loading
      }, 3000) // 每3秒刷新一次
    }
    
    // 组件卸载时清除定时器
    return () => {
      if (pollingTimerRef.current) {
        console.log('[轮询] 清除定时器')
        clearInterval(pollingTimerRef.current)
        pollingTimerRef.current = null
      }
    }
  }, [parsingDocuments, fetchParsingDocuments])

  // 合并本地上传文件和服务器未解析文件
  const allFiles = useMemo(() => {
    // 本地新上传的文件在前面，服务器文件在后面
    const localFiles = uploadFiles.filter(f => f.uploadStatus !== 'success' || f.documentId)
    const serverFiles = unparsedDocuments.filter(
      serverDoc => !uploadFiles.some(localDoc => localDoc.documentId === serverDoc.id)
    )
    return [...localFiles, ...serverFiles]
  }, [uploadFiles, unparsedDocuments])

  // 统计数据
  const uploadStats = useMemo(() => ({
    totalFiles: allFiles.length,
    uploadedFiles: allFiles.filter(f => f.uploadStatus === 'success' || f.status === 'uploaded').length,
    uploadingFiles: allFiles.filter(f => f.uploadStatus === 'uploading').length,
    failedFiles: allFiles.filter(f => f.uploadStatus === 'failed' || f.status === 'invalid').length,
    totalSize: allFiles.reduce((sum, f) => sum + (f.size || 0), 0),
    supportedFormats: ['PDF', 'JPG', 'PNG', 'DOCX', 'XLSX', 'CSV']
  }), [allFiles])

  // 统一的统计卡片样式
  const StatCard = ({ title, value, icon, color, suffix = '' }) => (
    <Card 
      style={{ 
        height: 100,
        background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
        border: 'none',
        borderRadius: 12
      }}
    >
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        height: '100%'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ 
            color: 'rgba(255, 255, 255, 0.8)', 
            fontSize: 12,
            marginBottom: 6,
            fontWeight: 400
          }}>
            {title}
          </div>
          <div style={{ 
            color: 'rgb(255, 255, 255)',
            fontSize: 24,
            fontWeight: 600,
            lineHeight: 1.2
          }}>
            {typeof value === 'string' ? value : value.toLocaleString()}{suffix}
          </div>
        </div>
        <div style={{ 
          color: 'rgba(255, 255, 255, 0.6)',
          fontSize: 20
        }}>
          {icon}
        </div>
      </div>
    </Card>
  )

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // 获取文件状态图标（优先显示上传状态）
  const getFileStatusIcon = (file) => {
    // 优先检查上传状态
    if (file.uploadStatus === 'uploading') {
      return <LoadingOutlined style={{ color: token.colorPrimary, fontSize: 16 }} spin />
    }
    if (file.uploadStatus === 'success' || file.status === 'uploaded') {
      return <CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 16 }} />
    }
    if (file.uploadStatus === 'failed') {
      return <CloseCircleOutlined style={{ color: token.colorError, fontSize: 16 }} />
    }
    // 检查格式状态
    switch (file.status) {
      case 'valid':
        return <FileTextOutlined style={{ color: token.colorPrimary, fontSize: 16 }} />
      case 'invalid':
        return <CloseCircleOutlined style={{ color: token.colorError, fontSize: 16 }} />
      case 'needsConfig':
        return <WarningOutlined style={{ color: token.colorWarning, fontSize: 16 }} />
      default:
        return <FileTextOutlined style={{ fontSize: 16 }} />
    }
  }

  // 获取文件状态提示文字
  const getFileStatusTooltip = (file) => {
    // 优先检查上传状态
    if (file.uploadStatus === 'uploading') {
      return '上传中...'
    }
    if (file.uploadStatus === 'success' || file.status === 'uploaded') {
      return '已上传，待处理'
    }
    if (file.uploadStatus === 'failed') {
      return file.error || '上传失败'
    }
    // 检查格式状态
    switch (file.status) {
      case 'valid':
        return '待上传'
      case 'invalid':
        return file.error || '格式错误'
      case 'needsConfig':
        return '需要设置'
      default:
        return '未知状态'
    }
  }

  // 预览文件 - 改为编辑文件信息
  const handleEditFile = (file) => {
    setSelectedFile(file)
    setPreviewModalVisible(true)
  }

  // 保存文件信息编辑
  const handleSaveFileInfo = (values) => {
    setUploadFiles(prev => prev.map(f => 
      f.id === selectedFile.id 
        ? {
            ...f,
            category: values.category,
            extractedInfo: {
              ...f.extractedInfo,
              patientName: values.patientName,
              reportDate: values.reportDate,
              reportType: values.reportType
            }
          }
        : f
    ))
    setPreviewModalVisible(false)
    message.success('文件信息已更新')
  }

  // 获取文件状态标签
  const getFileStatusTag = (file) => {
    switch (file.status) {
      case 'valid':
        return <Tag color="success" icon={<CheckCircleOutlined />}>格式正确</Tag>
      case 'invalid':
        return <Tag color="error" icon={<CloseCircleOutlined />}>格式错误</Tag>
      case 'needsConfig':
        return <Tag color="warning" icon={<WarningOutlined />}>需要设置</Tag>
      case 'uploading':
        return <Tag color="processing" icon={<LoadingOutlined spin />}>上传中</Tag>
      default:
        return <Tag>未知状态</Tag>
    }
  }

  // 文件上传处理 - 选中后自动上传
  const handleFileUpload = useCallback(async (fileList) => {
    // 重置文件输入框，避免重复处理
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = ''
    }
    
    const newFiles = fileList.map(file => {
      // 去掉文件名中的路径前缀（如"文档/"），只保留文件名
      const fileName = file.name.split('/').pop()
      
      // 创建新的 File 对象，使用处理后的文件名
      // File 对象的 name 属性是只读的，所以需要创建新对象
      const renamedFile = new File([file], fileName, { type: file.type })
      
      return {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: fileName,  // 使用处理后的文件名
        size: file.size,
        type: file.type,
        status: validateFileFormat(file) ? 'valid' : 'invalid',
        category: detectFileCategory(file),
        uploadProgress: 0,
        uploadStatus: 'pending',
        file: renamedFile,  // 使用重命名后的 File 对象
        originFileObj: renamedFile,  // 使用重命名后的 File 对象
        error: validateFileFormat(file) ? null : '不支持的文件格式'
      }
    })
    
    // 先添加到列表
    setUploadFiles(prev => [...prev, ...newFiles])
    
    // 筛选有效文件并自动上传
    const validFiles = newFiles.filter(f => f.status === 'valid')
    if (validFiles.length === 0) {
      message.warning('没有有效的文件可以上传')
      return
    }
    
    message.info(`正在上传 ${validFiles.length} 个文件...`)
    setShowProcessSteps(true)
    setCurrentStep(1)
    setUploading(true)
    
    let successCount = 0
    let failedCount = 0
    
    // 逐个上传文件
    for (const file of validFiles) {
      // 更新状态为上传中
      setUploadFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, uploadStatus: 'uploading' } : f
      ))
      
      try {
        const response = await uploadDocument(file.originFileObj, (percent) => {
          // 更新上传进度
          setUploadFiles(prev => prev.map(f => 
            f.id === file.id ? { ...f, uploadProgress: percent } : f
          ))
        })
        
        if (response.success) {
          successCount++
          // 更新为上传成功
          setUploadFiles(prev => prev.map(f => 
            f.id === file.id ? { 
              ...f, 
              uploadStatus: 'success',
              uploadProgress: 100,
              documentId: response.data.document_id,
              fileUrl: response.data.file_url
            } : f
          ))
        }
      } catch (error) {
        failedCount++
        setUploadFiles(prev => prev.map(f => 
          f.id === file.id ? { 
            ...f, 
            uploadStatus: 'failed',
            error: error.response?.data?.message || error.message || '上传失败'
          } : f
        ))
      }
    }
    
    setUploading(false)
    
    // 重置文件输入框
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    
    // 显示上传结果
    if (failedCount === 0 && successCount > 0) {
      message.success(`全部 ${successCount} 个文档上传成功`)
      // 刷新未解析文件列表
      fetchUnparsedDocuments()
    } else if (successCount > 0) {
      message.warning(`上传完成：${successCount} 个成功，${failedCount} 个失败`)
      fetchUnparsedDocuments()
    } else if (failedCount > 0) {
      message.error('所有文件上传失败，请检查后重试')
    }
  }, [fetchUnparsedDocuments])

  // 文件格式验证
  const validateFileFormat = (file) => {
    const supportedTypes = [
      'application/pdf',
      'image/jpg',
      'image/jpeg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ]
    return supportedTypes.includes(file.type) && file.size <= 50 * 1024 * 1024
  }

  // 检测文件类别
  const detectFileCategory = (file) => {
    const name = file.name.toLowerCase()
    if (name.includes('血常规') || name.includes('血检')) return '检验报告'
    if (name.includes('ct') || name.includes('mri') || name.includes('x光')) return '影像检查'
    if (name.includes('病理') || name.includes('活检')) return '病理检查'
    if (name.includes('用药') || name.includes('处方')) return '用药记录'
    if (name.includes('患者') || name.includes('信息')) return '患者信息'
    return '其他文档'
  }

  // 删除文件（已上传成功的文件，调用后端API）
  const handleRemoveFile = async (file) => {
    // 获取文档ID（本地上传的文件用documentId，服务器文件用id）
    const documentId = file.documentId || file.id
    const fileId = file.id
    
    if (!documentId) {
      // 如果没有documentId，说明文件还没上传成功，只从本地列表移除
    setUploadFiles(prev => prev.filter(f => f.id !== fileId))
    message.info('文件已移除')
      return
    }
    
    // 设置删除加载状态
    setDeletingFileId(fileId)
    
    try {
      const response = await deleteDocument(documentId)
      
      if (response.success) {
        // 从本地列表中移除
        setUploadFiles(prev => prev.filter(f => f.id !== fileId && f.documentId !== documentId))
        // 从未解析列表中移除
        setUnparsedDocuments(prev => prev.filter(f => f.id !== documentId))
        message.success('文档删除成功')
      }
    } catch (error) {
      console.error('删除文档失败:', error)
      message.error(error.response?.data?.message || '删除文档失败')
    } finally {
      // 清除删除加载状态
      setDeletingFileId(null)
    }
  }

  // 忽略文件（上传失败的文件，从列表移除不重试）
  const handleIgnoreFile = (fileId) => {
    setUploadFiles(prev => prev.filter(f => f.id !== fileId))
    message.info('已忽略该文件')
  }

  // 重试上传失败的文件
  const handleRetryUpload = async (file) => {
    if (!file.originFileObj) {
      message.error('无法重试：原始文件不存在')
      return
    }

    // 更新状态为上传中
    setUploadFiles(prev => prev.map(f => 
      f.id === file.id ? { ...f, uploadStatus: 'uploading', uploadProgress: 0, error: null } : f
    ))

    try {
      const response = await uploadDocument(file.originFileObj, (percent) => {
        setUploadFiles(prev => prev.map(f => 
          f.id === file.id ? { ...f, uploadProgress: percent } : f
        ))
      })

      if (response.success) {
        setUploadFiles(prev => prev.map(f => 
          f.id === file.id ? { 
            ...f, 
            uploadStatus: 'success',
            uploadProgress: 100,
            documentId: response.data.document_id,
            fileUrl: response.data.file_url,
            error: null
          } : f
        ))
        message.success(`文件 "${file.name}" 上传成功`)
        fetchUnparsedDocuments()
      }
    } catch (error) {
      setUploadFiles(prev => prev.map(f => 
        f.id === file.id ? { 
          ...f, 
          uploadStatus: 'failed',
          error: error.response?.data?.message || error.message || '上传失败'
        } : f
      ))
      message.error(`文件 "${file.name}" 上传失败`)
    }
  }

  // 根据文件状态获取操作按钮（已上传 Tab）
  const getFileActions = (file) => {
    // 已上传成功的文件 - 显示解析和删除按钮
    if (file.uploadStatus === 'success' || file.status === 'uploaded') {
      const isDeleting = deletingFileId === file.id
      const isParsing = parsingFileId === file.id
      return [
        <Tooltip title="解析文档" key="parse">
          <Button 
            type="link" 
            size="small" 
            icon={<PlayCircleOutlined />}
            loading={isParsing}
            disabled={isParsing || isDeleting}
            onClick={(e) => {
              e.stopPropagation()
              handleParseDocument(file)
            }}
            style={{ color: token.colorPrimary }}
          >
            解析
          </Button>
        </Tooltip>,
        <Tooltip title="删除文件" key="delete">
          <Popconfirm
            title="确定要删除这个文件吗？"
            description="此操作将从服务器永久删除该文件"
            onConfirm={(e) => {
              e?.stopPropagation()
              handleRemoveFile(file)
            }}
            okText="确定删除"
            cancelText="取消"
            disabled={isDeleting || isParsing}
          >
            <Button 
              type="link" 
              size="small" 
              icon={<DeleteOutlined />}
              danger
              loading={isDeleting}
              disabled={isDeleting || isParsing}
              onClick={(e) => e.stopPropagation()}
            >
              删除
            </Button>
          </Popconfirm>
        </Tooltip>
      ]
    }
    
    // 上传失败或格式错误的文件 - 显示重试和忽略按钮
    if (file.uploadStatus === 'failed' || file.status === 'invalid') {
      const actions = []
      
      // 只有上传失败且有原始文件的才显示重试按钮
      if (file.uploadStatus === 'failed' && file.originFileObj) {
        actions.push(
          <Tooltip title="重新上传" key="retry">
            <Button 
              type="link" 
              size="small" 
              icon={<ReloadOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                handleRetryUpload(file)
              }}
            >
              重试
            </Button>
          </Tooltip>
        )
      }
      
      // 忽略按钮
      actions.push(
        <Tooltip title="忽略此文件" key="ignore">
          <Button 
            type="link" 
            size="small" 
            icon={<CloseCircleOutlined />}
            danger
            onClick={(e) => {
              e.stopPropagation()
              handleIgnoreFile(file.id)
            }}
          >
            忽略
          </Button>
        </Tooltip>
      )
      
      return actions
    }
    
    // 上传中的文件 - 不显示操作按钮
    if (file.uploadStatus === 'uploading') {
      return []
    }
    
    // 待上传的文件（正在验证格式）- 不显示按钮
    return []
  }

  // 根据文件状态获取操作按钮（解析 Tab）
  const getParsingFileActions = (file) => {
    const isParsing = parsingFileId === file.id
    const taskStatus = file.taskStatus || file.status
    
    // 解析中 - 不显示按钮
    if (taskStatus === 'parsing') {
      return []
    }
    
    // 解析失败 - 显示重新解析按钮
    if (taskStatus === 'parse_failed') {
      return [
        <Tooltip title="重新解析" key="reparse">
          <Button 
            type="link" 
            size="small" 
            icon={<ReloadOutlined />}
            loading={isParsing}
            disabled={isParsing}
            onClick={(e) => {
              e.stopPropagation()
              handleReParseDocument(file)
            }}
            style={{ color: token.colorWarning }}
          >
            重新解析
          </Button>
        </Tooltip>
      ]
    }
    
    // 已解析（仅OCR完成，workflow未完成） - 显示OCR查看、标记审核按钮
    // 注意：正常流程下解析会自动完成整个 workflow 并进入匹配后状态
    // 此状态仅在 workflow 组件不可用或中途失败时出现
    if (taskStatus === 'parsed') {
      const documentId = file?.documentId || file?.id
      const isMarkingReview = markingReviewFileId === documentId
      
      return [
        <Tooltip title="查看OCR解析结果" key="ocr">
          <Button 
            type="link" 
            size="small" 
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              if (documentId) {
                navigate(`/document/ocr-viewer/${documentId}`)
              }
            }}
            style={{ color: token.colorSuccess }}
          >
            OCR
          </Button>
        </Tooltip>,
        <Tooltip title={file.requiresReview ? "标记不需要审核" : "标记需要人工审核"} key="review">
          <Button 
            type="link" 
            size="small" 
            icon={<AuditOutlined />}
            loading={isMarkingReview}
            disabled={isMarkingReview}
            onClick={(e) => {
              e.stopPropagation()
              handleMarkForReview(file, !file.requiresReview)
            }}
            style={{ color: file.requiresReview ? token.colorWarning : token.colorPrimary }}
          >
            {file.requiresReview ? '标记不审核' : '标记审核'}
          </Button>
        </Tooltip>
      ]
    }
    
    return []
  }

  // 获取解析 Tab 中文件的状态图标
  const getParsingFileStatusIcon = (file) => {
    const taskStatus = file.taskStatus || file.status
    
    switch (taskStatus) {
      case 'parsing':
        return <LoadingOutlined style={{ color: token.colorPrimary, fontSize: 16 }} spin />
      case 'parsed':
        return <CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 16 }} />
      case 'parse_failed':
        return <ExclamationCircleOutlined style={{ color: token.colorError, fontSize: 16 }} />
      default:
        return <FileTextOutlined style={{ fontSize: 16 }} />
    }
  }

  // 获取解析 Tab 中文件的状态标签
  const getParsingFileStatusTag = (file) => {
    const taskStatus = file.taskStatus || file.status
    
    switch (taskStatus) {
      case 'parsing':
        return <Tag color="processing" icon={<SyncOutlined spin />}>解析中</Tag>
      case 'parsed':
        return <Tag color="success" icon={<CheckCircleOutlined />}>已解析</Tag>
      case 'parse_failed':
        return <Tag color="error" icon={<ExclamationCircleOutlined />}>解析失败</Tag>
      default:
        return <Tag>未知状态</Tag>
    }
  }

  // 预览文件
  const handlePreviewFile = (file) => {
    setSelectedFile(file)
    setPreviewModalVisible(true)
  }
  
  // 下载原文件
  const handleDownloadFile = async (file) => {
    // 获取文档 ID（本地上传的文件用 documentId，服务器文件用 id）
    const documentId = file?.documentId || file?.id
    
    if (!documentId) {
      message.warning('该文件尚未上传，无法下载')
      return
    }
    
    setDownloading(true)
    try {
      const response = await getDocumentTempUrl(documentId)
      
      if (response.success && response.data?.temp_url) {
        // 在新窗口中打开下载链接，避免被浏览器拦截
        window.open(response.data.temp_url, '_blank')
        message.success('成功')
      } else {
        message.error(response.message || '获取下载链接失败')
      }
    } catch (error) {
      console.error('下载文件失败:', error)
      message.error(error.response?.data?.message || '下载文件失败')
    } finally {
      setDownloading(false)
    }
  }

  // 解析文档
  const handleParseDocument = async (file) => {
    // 获取文档 ID（本地上传的文件用 documentId，服务器文件用 id）
    const documentId = file?.documentId || file?.id
    const fileId = file.id
    
    if (!documentId) {
      message.warning('该文件尚未上传，无法解析')
      return
    }
    
    setParsingFileId(fileId)
    try {
      const response = await parseDocument(documentId, 'textin')
      
      if (response.success && response.code === 0) {
        message.success(`文档 "${file.name}" 解析任务已启动`)
        // 从已上传列表中移除
        setUploadFiles(prev => prev.filter(f => f.id !== fileId && f.documentId !== documentId))
        setUnparsedDocuments(prev => prev.filter(f => f.id !== documentId))
        // 刷新解析列表（静默刷新）
        fetchParsingDocuments(false)
      } else {
        message.error(response.message || '启动解析失败')
      }
    } catch (error) {
      console.error('解析文档失败:', error)
      message.error(error.response?.data?.message || '解析文档失败')
    } finally {
      setParsingFileId(null)
    }
  }

  // 重新解析文档（解析失败后）
  const handleReParseDocument = async (file) => {
    const documentId = file?.documentId || file?.id
    const fileId = file.id
    
    if (!documentId) {
      message.warning('该文件不存在，无法重新解析')
      return
    }
    
    setParsingFileId(fileId)
    try {
      const response = await parseDocument(documentId, 'textin')
      
      if (response.success && response.code === 0) {
        message.success(`文档 "${file.name}" 重新解析任务已启动`)
        // 刷新解析列表（静默刷新）
        fetchParsingDocuments(false)
      } else {
        message.error(response.message || '启动重新解析失败')
      }
    } catch (error) {
      console.error('重新解析文档失败:', error)
      message.error(error.response?.data?.message || '重新解析文档失败')
    } finally {
      setParsingFileId(null)
    }
  }

  // 标记需要审核（已解析的文档）
  const handleMarkForReview = async (file, requiresReview) => {
    const documentId = file?.documentId || file?.id
    
    if (!documentId) {
      message.warning('该文件不存在，无法标记审核')
      return
    }
    
    setMarkingReviewFileId(documentId)
    
    try {
      const response = await markDocumentReview(documentId, requiresReview)
      
      if (response.success && response.code === 0) {
        const actionText = requiresReview ? '需要人工审核' : '不需要审核'
        message.success(`文档 "${file.name}" 已标记为${actionText}`)
        // 刷新列表（静默刷新）
        fetchParsingDocuments(false)
      } else {
        message.error(response.message || '标记审核失败')
      }
    } catch (error) {
      console.error('标记审核失败:', error)
      message.error(error.response?.data?.message || '标记审核失败')
    } finally {
      setMarkingReviewFileId(null)
    }
  }

  // 开始AI处理 - 跳转到AI处理页面
  const handleStartProcess = () => {
    if (uploadStats.uploadedFiles === 0) {
      message.warning('没有可处理的文件，请先上传文件')
      return
    }
    
    setCurrentStep(2)
    message.success(`正在跳转到AI处理页面，共 ${uploadStats.uploadedFiles} 个文件待处理...`)
    
    setTimeout(() => {
      navigate('/document/processing')
    }, 1000)
  }

  // 忽略所有失败的文件
  const handleIgnoreAllFailed = () => {
    const failedFiles = uploadFiles.filter(f => f.uploadStatus === 'failed' || f.status === 'invalid')
    if (failedFiles.length === 0) {
      message.info('没有失败的文件')
      return
  }

    // 只保留成功的文件
    setUploadFiles(prev => prev.filter(f => 
      f.uploadStatus === 'success' || (f.uploadStatus !== 'failed' && f.status !== 'invalid')
    ))
    message.success(`已忽略 ${failedFiles.length} 个失败的文件`)
  }

  // 清空文件列表
  const handleClearFiles = () => {
    setUploadFiles([])
    setCurrentStep(0)
    setShowProcessSteps(false)
    message.info('文件列表已清空')
  }

  // 用于追踪已处理的文件，避免重复上传
  const processedFilesRef = useRef(new Set())
  
  // 拖拽上传配置
  const uploadProps = {
    name: 'file',
    multiple: true,
    showUploadList: false,
    fileList: [], // 保持为空，避免内部状态累积
    beforeUpload: (file) => {
      // 使用文件名+大小+修改时间生成唯一标识
      const fileKey = `${file.name}_${file.size}_${file.lastModified}`
      
      // 检查是否已处理过
      if (processedFilesRef.current.has(fileKey)) {
        return false
      }
      
      // 标记为已处理
      processedFilesRef.current.add(fileKey)
      
      // 5秒后从已处理集合中移除，允许重新上传相同文件
      setTimeout(() => {
        processedFilesRef.current.delete(fileKey)
      }, 5000)
      
      // 直接处理单个文件
      handleFileUpload([file])
      
      return false // 阻止自动上传
    },
    onDrop: (e) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      
      // 先过滤掉已处理的文件
      const newFiles = files.filter(file => {
        const fileKey = `${file.name}_${file.size}_${file.lastModified}`
        if (processedFilesRef.current.has(fileKey)) {
          return false
        }
        processedFilesRef.current.add(fileKey)
        setTimeout(() => {
          processedFilesRef.current.delete(fileKey)
        }, 5000)
        return true
      })
      
      // 再过滤出支持的文件格式
      const supportedTypes = [
        'application/pdf',
        'image/jpg',
        'image/jpeg',
        'image/png',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv'
      ]
      
      const validFiles = newFiles.filter(file => 
        supportedTypes.includes(file.type) && file.size <= 50 * 1024 * 1024
      )
      
      if (validFiles.length === 0) {
        message.warning('没有找到支持的文件格式')
        return
      }
      
      if (validFiles.length < newFiles.length) {
        message.info(`共 ${newFiles.length} 个文件，筛选出 ${validFiles.length} 个支持的文件`)
      }
      
      handleFileUpload(validFiles)
    }
  }

  return (
    <div className="page-container fade-in">
      {/* 可折叠的上传进度步骤 */}
      {showProcessSteps && (
        <Card size="small" style={{ marginBottom: 24 }}>
          <Steps
            current={currentStep}
            items={[
              {
                title: '选择文件',
                description: '添加需要处理的医疗文档',
                icon: <FolderOpenOutlined />
              },
              {
                title: '上传文件',
                description: '将文件上传到云端',
                icon: <CloudUploadOutlined />
              },
              {
                title: 'AI处理',
                description: '智能识别和分类文档',
                icon: <PlayCircleOutlined />
              }
            ]}
          />
        </Card>
      )}

      {/* 上传统计 - 使用统一的卡片设计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={6}>
          <StatCard
            title="文件总数"
            value={uploadStats.totalFiles}
            icon={<FileTextOutlined />}
            color={token.colorPrimary}
          />
        </Col>
        <Col xs={24} sm={6}>
          <StatCard
            title="已上传"
            value={uploadStats.uploadedFiles}
            icon={<CheckCircleOutlined />}
            color={token.colorSuccess}
          />
        </Col>
        <Col xs={24} sm={6}>
          <StatCard
            title="上传失败"
            value={uploadStats.failedFiles}
            icon={<CloseCircleOutlined />}
            color={token.colorError}
          />
        </Col>
        <Col xs={24} sm={6}>
          <StatCard
            title="总大小"
            value={formatFileSize(uploadStats.totalSize)}
            icon={<CloudUploadOutlined />}
            color={token.colorPrimary}
          />
        </Col>
      </Row>

      {/* 上传区域 */}
      <Card 
        title={
          <Space>
            <InboxOutlined />
            <Text strong>文档上传区域</Text>
          </Space>
        }
        extra={
          <Space>
            {/* #隐藏1 */}
            {/* <Button 
              icon={<SettingOutlined />} 
              onClick={() => setSettingsModalVisible(true)}
            >
              上传设置
            </Button> */}
            <Tooltip title="查看处理流程">
              <Button 
                icon={<QuestionCircleOutlined />}
                onClick={() => setShowProcessSteps(!showProcessSteps)}
              >
                处理流程
              </Button>
            </Tooltip>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        {/* 可折叠的上传须知 */}
        <Collapse 
          ghost 
          size="small"
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'upload-notice',
              label: (
                <Space>
                  <InfoCircleOutlined style={{ color: token.colorPrimary }} />
                  <Text type="secondary">医疗文档上传须知</Text>
                </Space>
              ),
              children: (
                <div style={{ paddingLeft: 24 }}>
                  <p>• 支持格式: PDF, JPG, PNG, DOCX, XLSX, CSV | 单文件≤50MB | 批量≤100个</p>
                  <p>• 请确保文档清晰可读，模糊或损坏的文档会影响AI识别准确率</p>
                  <p>• 系统会自动检测患者信息并进行智能分类，请确保文档包含患者姓名等关键信息</p>
                </div>
              )
            }
          ]}
        />

        <Dragger {...uploadProps} style={{ marginBottom: 16 }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ color: token.colorPrimary }} />
          </p>
          <p className="ant-upload-text">
            <Text strong>点击或拖拽文件到此处上传</Text>
          </p>
          <p className="ant-upload-hint">
            支持单个或批量上传。可以直接拖拽整个文件夹，系统会自动筛选支持的格式
          </p>
        </Dragger>

        <Row gutter={[16, 16]}>
          <Col>
            <Space>
              <Button 
                type="primary" 
                icon={<UploadOutlined />}
                onClick={() => fileInputRef.current?.click()}
              >
                选择文件
              </Button>
              <Button 
                icon={<FolderOpenOutlined />}
                onClick={() => folderInputRef.current?.click()}
              >
                选择文件夹
              </Button>
            </Space>
          </Col>
          <Col flex={1}>
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Text type="secondary">
                  已上传 {uploadStats.uploadedFiles} 个文件
                </Text>
                {uploadStats.uploadingFiles > 0 && (
                  <Text type="warning">
                    正在上传 {uploadStats.uploadingFiles} 个文件
                  </Text>
                )}
                {uploadStats.failedFiles > 0 && (
                  <Text type="danger">
                    {uploadStats.failedFiles} 个文件有错误
                  </Text>
                )}
              </Space>
            </div>
          </Col>
        </Row>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files.length > 0) {
              handleFileUpload(Array.from(e.target.files))
            }
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          webkitdirectory=""
          directory=""
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files.length > 0) {
              const files = Array.from(e.target.files)
              // 过滤出支持的文件格式
              const validFiles = files.filter(file => {
                const supportedTypes = [
                  'application/pdf',
                  'image/jpg',
                  'image/jpeg',
                  'image/png',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'text/csv'
                ]
                return supportedTypes.includes(file.type) && file.size <= 50 * 1024 * 1024
              })
              
              if (validFiles.length === 0) {
                message.warning('文件夹中没有找到支持的文件格式')
                return
              }
              
              if (validFiles.length < files.length) {
                message.info(`文件夹中共 ${files.length} 个文件，筛选出 ${validFiles.length} 个支持的文件`)
              }
              
              handleFileUpload(validFiles)
            }
            // 重置，允许重复选择同一文件夹
            e.target.value = ''
          }}
        />
      </Card>

      {/* 我的上传 */}
      <Card 
        title={
          <Space>
            <FileTextOutlined />
            <Text strong>我的上传</Text>
            <Badge count={unparsedPagination.total} size="small" style={{ marginLeft: 8 }} />
          </Space>
        }
        extra={
          <Space>
            <Button 
              icon={<ReloadOutlined />} 
              size="small"
              onClick={() => {
                fetchUnparsedDocuments()
              }}
            >
              刷新
            </Button>
            {uploadStats.failedFiles > 0 && (
              <Popconfirm
                title={`确定要忽略所有失败的文件吗？`}
                description={`将移除 ${uploadStats.failedFiles} 个失败的文件`}
                onConfirm={handleIgnoreAllFailed}
                okText="确定忽略"
                cancelText="取消"
              >
                <Button size="small" danger icon={<CloseCircleOutlined />}>
                  全部忽略
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      >
        {allFiles.length === 0 && !unparsedLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: token.colorTextSecondary }}>
            <FileTextOutlined style={{ fontSize: 48 }} />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">暂无文件，请选择或拖拽文件到上传区域</Text>
            </div>
          </div>
        ) : (
          <>
            <List
              loading={unparsedLoading}
              dataSource={allFiles}
              renderItem={file => (
                <List.Item
                  style={{ 
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    padding: '12px 16px',
                    borderRadius: '8px'
                  }}
                  className="file-list-item"
                  onClick={() => handleEditFile(file)}
                  actions={getFileActions(file)}
                >
                  <List.Item.Meta
                    avatar={
                      <Tooltip title={getFileStatusTooltip(file)}>
                        <div style={{ position: 'relative' }}>
                          {getFileStatusIcon(file)}
                          {file.uploadProgress > 0 && file.uploadProgress < 100 && (
                            <Progress
                              type="circle"
                              percent={file.uploadProgress}
                              size={20}
                              style={{ position: 'absolute', top: -10, left: -10 }}
                            />
                          )}
                        </div>
                      </Tooltip>
                    }
                    title={
                      <div>
                        <Text strong style={{ fontSize: 14 }}>{file.name}</Text>
                        {file.category && (
                          <Tag color="blue" size="small" style={{ marginLeft: 8 }}>
                            {file.category}
                          </Tag>
                        )}
                      </div>
                    }
                    description={
                      <div>
                        <Space split={<Divider type="vertical" />}>
                          <Text type="secondary">{formatFileSize(file.size)}</Text>
                          <Text type="secondary">{file.type.split('/')[1]?.toUpperCase()}</Text>
                          {file.extractedInfo && (
                            <Text type="secondary">
                              患者: {file.extractedInfo.patientName} | 
                              日期: {file.extractedInfo.reportDate}
                            </Text>
                          )}
                        </Space>
                        {file.error && (
                          <div style={{ marginTop: 4 }}>
                            <Text type="danger" style={{ fontSize: 12 }}>
                              <WarningOutlined /> {file.error}
                            </Text>
                          </div>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />

            <Divider />

            <div style={{ textAlign: 'center' }}>
              <Space size="large">
                <Button 
                  size="large"
                  icon={<SettingOutlined />}
                  onClick={() => setSettingsModalVisible(true)}
                >
                  上传设置
                </Button>
                <Button 
                  size="large"
                  onClick={handleClearFiles}
                  disabled={uploading}
                >
                  重置
                </Button>
              </Space>
            </div>
          </>
        )}
      </Card>

      {/* 上传设置弹窗 */}
      <Modal
        title="上传设置"
        open={settingsModalVisible}
        onCancel={() => setSettingsModalVisible(false)}
        width={modalWidthPreset.standard}
        styles={modalBodyPreset}
        footer={[
          <Button key="cancel" onClick={() => setSettingsModalVisible(false)}>
            取消
          </Button>,
          <Button key="save" type="primary">
            保存设置
          </Button>
        ]}
      >
        <Form layout="vertical" initialValues={uploadSettings}>
          <Form.Item label="Excel/CSV文件处理方式">
            <Radio.Group 
              value={uploadSettings.csvMode}
              onChange={(e) => setUploadSettings({...uploadSettings, csvMode: e.target.value})}
            >
              <Radio value="multiple">每行代表一位独立患者 (适用于患者列表)</Radio>
              <Radio value="single">整个文件属于一位患者 (适用于单患者多项检查)</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="文档标签 (可选)">
            <Select
              mode="tags"
              placeholder="添加文档标签，便于后续管理"
              value={uploadSettings.tags}
              onChange={(tags) => setUploadSettings({...uploadSettings, tags})}
            >
              <Select.Option value="临床检查">临床检查</Select.Option>
              <Select.Option value="常规检查">常规检查</Select.Option>
              <Select.Option value="随访记录">随访记录</Select.Option>
              <Select.Option value="影像资料">影像资料</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="处理选项">
            <Checkbox.Group>
              <Row>
                <Col span={24}>
                  <Checkbox 
                    checked={uploadSettings.autoProcess}
                    onChange={(e) => setUploadSettings({...uploadSettings, autoProcess: e.target.checked})}
                  >
                    上传完成后自动开始AI处理
                  </Checkbox>
                </Col>
                <Col span={24}>
                  <Checkbox defaultChecked>
                    启用智能文档分类
                  </Checkbox>
                </Col>
                <Col span={24}>
                  <Checkbox defaultChecked>
                    自动检测重复文档
                  </Checkbox>
                </Col>
              </Row>
            </Checkbox.Group>
          </Form.Item>

          <Alert
            message="隐私保护提醒"
            description="所有上传的医疗文档都将进行加密存储，仅用于您的科研数据分析，不会用于其他用途。"
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        </Form>
      </Modal>

      {/* 文件信息编辑弹窗 */}
      <Modal
        title={`编辑文件信息 - ${selectedFile?.name}`}
        open={previewModalVisible}
        onCancel={() => setPreviewModalVisible(false)}
        footer={null}
        width={modalWidthPreset.wide}
        styles={modalBodyPreset}
      >
        {selectedFile && (
          <Form
            layout="vertical"
            initialValues={{
              category: selectedFile.category,
              patientName: selectedFile.extractedInfo?.patientName || '',
              reportDate: selectedFile.extractedInfo?.reportDate || '',
              reportType: selectedFile.extractedInfo?.reportType || ''
            }}
            onFinish={handleSaveFileInfo}
          >
            <Row gutter={16}>
              <Col span={12}>
                <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="文件名">{selectedFile.name}</Descriptions.Item>
                  <Descriptions.Item label="文件大小">{formatFileSize(selectedFile.size)}</Descriptions.Item>
                  <Descriptions.Item label="文件类型">{selectedFile.type}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Space>
                      {getFileStatusIcon(selectedFile)}
                      <Text>{getFileStatusTooltip(selectedFile)}</Text>
                    </Space>
                  </Descriptions.Item>
                </Descriptions>
              </Col>
              <Col span={12}>
                <div style={{ background: token.colorBgLayout, padding: 16, borderRadius: 8, height: '100%' }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>可编辑信息</Text>
                  
                  <Form.Item label="文档类别" name="category">
                    <Select placeholder="选择文档类别">
                      <Select.Option value="检验报告">检验报告</Select.Option>
                      <Select.Option value="影像检查">影像检查</Select.Option>
                      <Select.Option value="病理检查">病理检查</Select.Option>
                      <Select.Option value="用药记录">用药记录</Select.Option>
                      <Select.Option value="患者信息">患者信息</Select.Option>
                      <Select.Option value="其他文档">其他文档</Select.Option>
                    </Select>
                  </Form.Item>

                  <Form.Item label="患者姓名" name="patientName">
                    <Input placeholder="请输入患者姓名" />
                  </Form.Item>

                  <Form.Item label="报告日期" name="reportDate">
                    <Input placeholder="请输入报告日期 (如: 2024-01-15)" />
                  </Form.Item>

                  <Form.Item label="报告类型" name="reportType">
                    <Input placeholder="请输入报告类型 (如: 血常规)" />
                  </Form.Item>
                </div>
              </Col>
            </Row>

            {selectedFile.error && (
              <Alert
                message="文件错误"
                description={selectedFile.error}
                type="error"
                showIcon
                style={{ marginTop: 16 }}
              />
            )}

            {selectedFile.previewUrl ? (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>文件预览</Text>
                <img 
                  src={selectedFile.previewUrl} 
                  alt="文件预览" 
                  style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8 }}
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, background: token.colorBgLayout, borderRadius: 8, marginTop: 16 }}>
                <FileTextOutlined style={{ fontSize: 32, color: token.colorTextSecondary }} />
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">
                    {selectedFile.type === 'application/pdf' ? 'PDF文件预览功能开发中' : '该文件类型暂不支持预览'}
                  </Text>
                </div>
              </div>
            )}

            <div style={{ textAlign: 'right', marginTop: 24 }}>
              <Space>
                <Button onClick={() => setPreviewModalVisible(false)}>
                  取消
                </Button>
                <Button 
                  icon={<DownloadOutlined />}
                  loading={downloading}
                  onClick={() => handleDownloadFile(selectedFile)}
                  disabled={!selectedFile?.documentId && !selectedFile?.id}
                >
                  下载原文件
                </Button>
                <Button type="primary" htmlType="submit">
                  保存修改
                </Button>
              </Space>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  )
}

export default DocumentUpload