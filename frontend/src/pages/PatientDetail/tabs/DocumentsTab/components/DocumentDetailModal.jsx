/**
 * 文档详情弹窗组件
 * 双栏布局：左侧文档预览，右侧字段编辑
 */
import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { 
  Modal, 
  Row, 
  Col, 
  Tabs, 
  Button, 
  Space, 
  Typography, 
  Divider,
  Card,
  message,
  Spin,
  Tag,
  Empty,
  Collapse,
  Badge,
  Tooltip,
  Select,
  Input,
  Dropdown,
  Descriptions,
  Drawer,
  Segmented
} from 'antd'
import { 
  CloseOutlined, 
  DownloadOutlined, 
  ReloadOutlined,
  UserSwitchOutlined,
  SaveOutlined, 
  EyeOutlined, 
  ExperimentOutlined, 
  CheckCircleOutlined, 
  ClockCircleOutlined, 
  MergeCellsOutlined, 
  FileTextOutlined, 
  TableOutlined, 
  PictureOutlined, 
  OrderedListOutlined, 
  UploadOutlined, 
  RobotOutlined, 
  EditOutlined, 
  SolutionOutlined, 
  HistoryOutlined,
  PlusOutlined,
  DeleteOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  UndoOutlined,
  UserOutlined,
  DownOutlined,
  DisconnectOutlined,
  CalendarOutlined,
  PhoneOutlined,
  IdcardOutlined,
  EnvironmentOutlined,
  CopyOutlined,
  ManOutlined,
  WomanOutlined,
  LinkOutlined,
  TeamOutlined,
  CoffeeOutlined,
  MedicineBoxOutlined,
  CaretRightOutlined
} from '@ant-design/icons'
import FieldEditor from './FieldEditor'
import ConfidenceIndicator from './ConfidenceIndicator'
import StatusIndicator from './StatusIndicator'
import ConflictDetailModal from './ConflictDetailModal'
import { DOC_TYPE_CATEGORIES } from '../../../../../components/FormDesigner/core/docTypes'
import { extractEhrDataAsync, extractDocumentMetadata, getDocumentDetail, getDocumentOperationHistory, getDocumentTempUrl, reparseDocumentSync, unarchiveDocument, updateDocumentMetadata, deleteDocument } from '../../../../../api/document'
import { mergeEhrData } from '../../../../../api/patient'
import { getFieldLabel, isArrayField, isEmptyValue, normalizeDisplayValue, EHR_FIELD_GROUPS } from './ehrFieldLabels'
import './DocumentDetailModal.css'
import StructuredDataView from '../../../../../components/Common/StructuredDataView'
import MarkdownRenderer from '../../AiSummaryTab/components/MarkdownRenderer'

const { Title, Text, Paragraph } = Typography
const { Panel } = Collapse

const DocumentDetailModal = forwardRef(({ 
  visible, 
  document, 
  patientId,
  onClose,
  onSave,
  onReExtract,
  onChangePatient,
  onArchivePatient,    // 未绑定患者时点击「选择患者归档」的回调
  onDownload,
  onViewOcr,
  onExtractSuccess,
  onRefresh,           // 解除绑定/更换患者后刷新列表
  onDeleteSuccess,     // 删除文档成功后回调（关闭弹窗、刷新列表）
  refreshTrigger = 0,  // 父组件递增后触发详情重新拉取（如更换患者成功）
  showTaskStatus = false  // 是否显示 task_status（归档审核页面使用）
}, ref) => {
  const [activeTab, setActiveTab] = useState('metadata')
  const [hasChanges, setHasChanges] = useState(false)
  const [editedFields, setEditedFields] = useState({})
  const [extracting, setExtracting] = useState(false)
  const [extractingMetadata, setExtractingMetadata] = useState(false)
  const [mergeModalVisible, setMergeModalVisible] = useState(false)
  const [extractResult, setExtractResult] = useState(null)
  const [merging, setMerging] = useState(false)
  const [reparsing, setReparsing] = useState(false)
  const [savingMetadata, setSavingMetadata] = useState(false)
  const [unbinding, setUnbinding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  /** 患者详情弹窗：当前选中的关联患者（来自 linked_patients，含基本信息脱敏字段） */
  const [patientDetailModalVisible, setPatientDetailModalVisible] = useState(false)
  const [selectedPatientForDetail, setSelectedPatientForDetail] = useState(null)
  
  // 图片操作状态
  const [imgScale, setImgScale] = useState(1)
  const [imgRotate, setImgRotate] = useState(0)
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setStart] = useState({ x: 0, y: 0 })
  
  // 文档详情数据（从 API 获取，包含 content_list 和 extracted_ehr_data）
  const [documentDetail, setDocumentDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  
  // 文档预览URL
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewImageLoading, setPreviewImageLoading] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  
  // OCR内容中图片的加载状态（使用Map跟踪每个图片）
  const [ocrImageLoading, setOcrImageLoading] = useState(new Map())
  // OCR 内容展示模式：结构化内容块 / Markdown
  const [ocrDisplayMode, setOcrDisplayMode] = useState('blocks')
  const [ocrMarkdown, setOcrMarkdown] = useState('')
  const [ocrMarkdownLoading, setOcrMarkdownLoading] = useState(false)
  const [ocrMarkdownLoaded, setOcrMarkdownLoaded] = useState(false)
  
  // 当前文档状态
  // 如果 showTaskStatus=true（归档审核页面），初始显示"待确认-审核"，加载中显示"..."
  // 如果 showTaskStatus=false（患者详情页面），使用原来的状态逻辑
  const [currentStatus, setCurrentStatus] = useState(
    showTaskStatus ? 'pending_confirm_review' : document?.status
  )
  
  // 冲突详情弹窗状态
  const [conflictModalVisible, setConflictModalVisible] = useState(false)
  const [selectedExtractionId, setSelectedExtractionId] = useState(null)
  
  // 可重复字段详情弹窗状态
  const [arrayFieldModalVisible, setArrayFieldModalVisible] = useState(false)
  const [selectedArrayField, setSelectedArrayField] = useState(null)
  const [activeCollapseKey, setActiveCollapseKey] = useState([])
  
  // 操作历史数据
  const [operationHistory, setOperationHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  // 当弹窗打开或 refreshTrigger 变化时，获取文档详情
  useEffect(() => {
    if (visible && document?.id) {
      // 重置图片变换状态（仅打开时重置，refreshTrigger 变化不重置）
      if (refreshTrigger === 0 || !documentDetail) {
        setImgScale(1)
        setImgRotate(0)
        setImgOffset({ x: 0, y: 0 })
      }
      // 如果是归档审核页面，初始显示"待确认-审核"
      if (showTaskStatus && !documentDetail) {
        setCurrentStatus('pending_confirm_review')
      } else if (!documentDetail) {
        setCurrentStatus(document?.status)
      }
      fetchDocumentDetail(document.id)
    } else {
      // 弹窗关闭时清空详情数据
      setDocumentDetail(null)
      setPreviewUrl(null)
      setPreviewImageLoading(false)
      setOcrImageLoading(new Map())
      setOcrDisplayMode('blocks')
      setOcrMarkdown('')
      setOcrMarkdownLoading(false)
      setOcrMarkdownLoaded(false)
      if (showTaskStatus) {
        setCurrentStatus('pending_confirm_review')
      } else {
        setCurrentStatus(document?.status)
      }
      setActiveCollapseKey([]) // 重置折叠状态
    }
  }, [visible, document?.id, showTaskStatus, refreshTrigger])

  // 切换文档时重置 OCR 展示相关状态
  useEffect(() => {
    if (visible) {
      setOcrDisplayMode('blocks')
      setOcrMarkdown('')
      setOcrMarkdownLoading(false)
      setOcrMarkdownLoaded(false)
    }
  }, [visible, document?.id])

  // 当文档详情加载完成时，更新状态
  useEffect(() => {
    if (showTaskStatus) {
      // 归档审核页面：从 task.status 获取真实状态
      if (detailLoading) {
        // 加载中显示"..."
        setCurrentStatus('loading')
      } else if (documentDetail?.task?.status) {
        setCurrentStatus(documentDetail.task.status)
      } else if (documentDetail && !documentDetail.task) {
        // 如果没有 task，保持"待确认-审核"
        setCurrentStatus('pending_confirm_review')
      }
    } else {
      // 患者详情页面：使用原来的状态逻辑（extracted/pending/processing/error）
      // 不更新状态，保持使用 document.status
      setCurrentStatus(document?.status)
    }
  }, [documentDetail, detailLoading, showTaskStatus])

  // 加载操作历史（弹窗打开时就加载，和抽取记录一样）
  useEffect(() => {
    if (visible && document?.id) {
      fetchOperationHistory(document.id)
    }
  }, [visible, document?.id])

  // 获取文档预览URL
  const fetchPreviewUrl = async (documentId) => {
    if (!documentId) return
    
    setPreviewLoading(true)
    setPreviewError(false)
    try {
      const urlResponse = await getDocumentTempUrl(documentId, 3600)
      if (urlResponse.success && urlResponse.data?.temp_url) {
        setPreviewUrl(urlResponse.data.temp_url)
        setPreviewImageLoading(true)  // 重置图片加载状态
      } else {
        // 如果获取临时URL失败，尝试使用 documentDetail 中的 file_path
        const filePath = documentDetail?.file_path || document?.file_path
        if (filePath) {
          setPreviewUrl(filePath)
          setPreviewImageLoading(true)
        } else {
          message.error('无法获取预览URL')
        }
      }
    } catch (error) {
      console.error('获取预览URL失败:', error)
      const filePath = documentDetail?.file_path || document?.file_path
      if (filePath) {
        setPreviewUrl(filePath)
        setPreviewImageLoading(true)
      } else {
        message.error('获取预览URL失败')
      }
    } finally {
      setPreviewLoading(false)
    }
  }

  // 获取文档详情（包含 content_list 和抽取记录列表）
  const fetchDocumentDetail = async (documentId) => {
    setDetailLoading(true)
    try {
      const response = await getDocumentDetail(documentId, {
        include_content: false,  // 不需要 parsed_content（太大）
        include_versions: false,
        include_patients: true,  // 包含关联患者信息
        include_extracted: true  // 包含抽取记录列表
      })
      
      if (response.success && response.data) {
        setDocumentDetail(response.data)
        // 获取详情后，获取预览URL
        fetchPreviewUrl(documentId)
      } else {
        console.error('获取文档详情失败:', response.message)
      }
    } catch (error) {
      console.error('获取文档详情失败:', error)
    } finally {
      setDetailLoading(false)
    }
  }

  // 暴露给父组件：强制重新拉取详情（如更换患者成功后刷新 tag）
  useImperativeHandle(ref, () => ({
    refetch: () => {
      if (document?.id) fetchDocumentDetail(document.id)
    }
  }), [document?.id])

  // 获取操作历史
  const fetchOperationHistory = async (documentId) => {
    setHistoryLoading(true)
    try {
      const response = await getDocumentOperationHistory(documentId, {
        include_upload: true,
        include_extractions: true,
        include_field_changes: true,
        include_conflict_resolves: true
      })
      
      if (response.success && response.data) {
        setOperationHistory(response.data)
      } else {
        console.error('获取操作历史失败:', response.message)
      }
    } catch (error) {
      console.error('获取操作历史失败:', error)
    } finally {
      setHistoryLoading(false)
    }
  }

  // 渲染患者绑定标签
  const renderPatientTag = () => {
    if (!document?.id) {
      return (
        <Tag color="default" style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
          <Space size={4}><UserOutlined style={{ fontSize: '12px' }} /><span>未绑定患者</span></Space>
        </Tag>
      )
    }
    const linkedPatients = documentDetail?.linked_patients || []
    const isLinked = linkedPatients.length > 0
    const patient = isLinked ? linkedPatients[0] : null

    if (!isLinked) {
      const tagContent = (
        <Space size={4}>
          <UserOutlined style={{ fontSize: '12px' }} />
          <span>未绑定患者</span>
          {onArchivePatient && <span style={{ color: '#1890ff', marginLeft: 2 }}></span>}
        </Space>
      )
      if (onArchivePatient) {
        return (
          <Button
            type="link"
            size="small"
            className="patient-binding-tag patient-binding-tag-unbound"
            style={{
              padding: '2px 8px',
              height: 'auto',
              fontSize: '12px',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              background: '#fafafa',
              color: 'rgba(0,0,0,0.88)'
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onArchivePatient(document.id)
            }}
          >
            {tagContent}
          </Button>
        )
      }
      return (
        <Tag color="default" style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
          {tagContent}
        </Tag>
      )
    }

    const menuItems = [
      {
        key: 'view',
        label: '查看患者详情',
        icon: <EyeOutlined />,
        onClick: () => {
          if (patient?.patient_id) {
            setSelectedPatientForDetail(patient)
            setPatientDetailModalVisible(true)
          }
        }
      },
      {
        key: 'change',
        label: '更换绑定患者',
        icon: <UserSwitchOutlined />,
        onClick: () => onChangePatient?.(document.id)
      },
      {
        type: 'divider'
      },
      {
        key: 'unbind',
        label: '解除绑定',
        icon: <DisconnectOutlined />,
        danger: true,
        disabled: unbinding,
        onClick: async () => {
          if (!document?.id) return
          const hideLoading = message.loading('解除绑定中...', 0)
          setUnbinding(true)
          try {
            await unarchiveDocument(document.id, true)
            hideLoading()
            message.success('已解除绑定')
            await fetchDocumentDetail(document.id)
            onRefresh?.()
          } catch (e) {
            hideLoading()
            message.error(e?.response?.data?.message || e?.message || '解除绑定失败')
          } finally {
            setUnbinding(false)
          }
        }
      }
    ]

    return (
      <Dropdown menu={{ items: menuItems }} trigger={['click']}>
        <div style={{ 
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          background: '#f6ffed',
          border: '1px solid #b7eb8f',
          padding: '2px 10px',
          borderRadius: '4px',
          color: '#52c41a',
          transition: 'all 0.3s'
        }} className="patient-binding-tag">
          <Space size={4}>
            <UserOutlined style={{ fontSize: '12px' }} />
            <Text style={{ color: '#52c41a', fontWeight: 500, fontSize: '12px' }}>
              {patient.patient_name} {patient.patient_code ? `(${patient.patient_code})` : ''}
            </Text>
            <DownOutlined style={{ fontSize: 10 }} />
          </Space>
        </div>
      </Dropdown>
    )
  }

  if (!document) return null

  // 处理字段保存
  const handleFieldSave = (fieldId, value, confidence, skipMessage = false) => {
    setEditedFields(prev => {
      const next = { ...prev, [fieldId]: { value, confidence } }
      if (fieldId === 'documentType') {
        const children = value && DOC_TYPE_CATEGORIES[value]
          ? DOC_TYPE_CATEGORIES[value].children
          : []
        const currentSubtype = prev.documentSubtype?.value
        if (currentSubtype && !children.includes(currentSubtype)) {
          next.documentSubtype = { value: undefined, confidence: undefined }
        }
      }
      return next
    })
    setHasChanges(true)
    if (!skipMessage) {
      message.success('字段已修改，请点击保存按钮确认')
    }
  }

  // 保存所有修改
  const handleSaveAll = async () => {
    if (!document?.id) {
      message.error('文档ID不存在')
      return
    }
    
    // 定义元数据字段列表
    const metadataFields = [
      'identifiers',
      'organizationName',
      'patientName',
      'gender',
      'age',
      'documentType',
      'documentSubtype',
      'effectiveDate'
    ]
    
    // 从 editedFields 中提取元数据字段
    const metadata = {}
    let hasMetadataChanges = false
    
    metadataFields.forEach(fieldId => {
      if (editedFields[fieldId] !== undefined) {
        const value = editedFields[fieldId]?.value ?? editedFields[fieldId]
        // FieldEditor 已经将日期格式化为 YYYY-MM-DD 字符串，直接使用
        metadata[fieldId] = value !== null && value !== undefined && value !== '' ? value : null
        hasMetadataChanges = true
      }
    })
    
    // 如果有元数据修改，调用更新接口
    if (hasMetadataChanges) {
      setSavingMetadata(true)
      try {
        const response = await updateDocumentMetadata(document.id, metadata)
        if (response.success) {
          message.success('元数据保存成功')
          // 刷新文档详情
          if (document?.id) {
            await fetchDocumentDetail(document.id)
          }
          // 清空编辑状态
          setEditedFields({})
          setHasChanges(false)
        } else {
          message.error(response.message || '保存失败')
        }
      } catch (error) {
        console.error('保存元数据失败:', error)
        message.error('保存失败，请稍后重试')
      } finally {
        setSavingMetadata(false)
      }
    } else {
      // 如果没有元数据修改，调用原来的 onSave（用于其他字段）
      onSave?.(document.id, editedFields)
      setEditedFields({})
      setHasChanges(false)
      message.success('所有修改已保存')
    }
  }

  // 获取字段当前值
  const getFieldValue = (field) => {
    return editedFields[field.fieldId]?.value ?? field.value
  }

  // 获取字段当前置信度
  const getFieldConfidence = (field) => {
    return editedFields[field.fieldId]?.confidence ?? field.confidence
  }

  // 处理重新解析（同步，不改变状态机状态）
  const handleReparse = async () => {
    if (!document?.id) {
      message.error('文档信息不存在')
      return
    }
    
    setReparsing(true)
    try {
      console.log('开始同步重新解析，文档ID:', document.id)
      const response = await reparseDocumentSync(document.id, { parserType: 'textin' })
      console.log('同步重新解析响应:', response)
      
      if (response.success) {
        message.success(`重新解析完成，共 ${response.data?.content_blocks || 0} 个内容块`)
        // 立即刷新文档详情以显示新的OCR内容
        if (document?.id) {
          await fetchDocumentDetail(document.id)
        }
      } else {
        console.error('重新解析失败:', response.message)
        message.error(response.message || '重新解析失败，请稍后重试')
      }
    } catch (error) {
      console.error('重新解析异常:', error)
      const errorMsg = error.response?.data?.message || error.message || '重新解析失败'
      message.error(`重新解析失败: ${errorMsg}`)
    } finally {
      setReparsing(false)
    }
  }

  // 仅重新抽取文档元数据（元数据字段旁的「重新提取」）
  const handleExtractMetadata = async () => {
    if (!document) {
      message.error('文档信息不存在')
      return
    }
    if (!document.isParsed) {
      message.warning('文档尚未完成 OCR 解析，请先进行解析')
      return
    }
    setExtractingMetadata(true)
    try {
      const response = await extractDocumentMetadata(document.id)
      if (response.success) {
        message.success('元数据抽取任务已启动，请稍后在文档信息中查看更新结果')
        if (document?.id) fetchDocumentDetail(document.id)
      } else {
        message.error(response.message || '元数据抽取任务启动失败')
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message || '元数据抽取任务启动失败'
      message.error(errorMsg)
    } finally {
      setExtractingMetadata(false)
    }
  }

  // 处理 AI 抽取（抽取记录处的「重新抽取」：完整病历结构化抽取）
  const handleExtract = async () => {
    if (!document) {
      message.error('文档信息不存在')
      return
    }
    
    if (!document.isParsed) {
      message.warning('文档尚未完成 OCR 解析，请先进行解析')
      return
    }
    
    setExtracting(true)
    try {
      console.log('开始异步 AI 抽取，文档ID:', document.id)
      const response = await extractEhrDataAsync(document.id)
      console.log('异步 AI 抽取响应:', response)

      if (response.success) {
        message.success('已启动异步抽取任务，请稍后在抽取记录中查看结果')
        // 通知父组件刷新，以便后续重新拉取抽取记录
        onExtractSuccess?.()
        // 可选：立即刷新一次文档详情，后续由轮询/WS 更新
        if (document?.id) {
          fetchDocumentDetail(document.id)
        }
      } else {
        console.error('AI 抽取任务启动失败:', response.message)
        message.error(response.message || '抽取任务启动失败，请稍后重试')
      }
    } catch (error) {
      console.error('AI 抽取异常:', error)
      const errorMsg = error.response?.data?.message || error.message || 'AI 抽取失败'
      message.error(`抽取失败: ${errorMsg}`)
    } finally {
      setExtracting(false)
    }
  }

  // 处理确认合并
  const handleConfirmMerge = async () => {
    if (!document || !document.patientBinding?.patientId) {
      message.warning('缺少患者信息，无法合并')
      return
    }

    setMerging(true)
    try {
      const response = await mergeEhrData(document.patientBinding.patientId, {
        document_id: document.id,
        conflict_policy: 'prefer_latest'
      })

      if (response.success) {
        const result = response.data
        message.success(
          `合并成功！新增 ${result.new_field_count || 0} 个字段，更新 ${result.updated_field_count || 0} 个字段`
        )
        setMergeModalVisible(false)
        setExtractResult(null)
        // 通知父组件刷新
        onExtractSuccess?.()
      } else {
        message.error(response.message || '合并失败')
      }
    } catch (error) {
      console.error('合并病历失败:', error)
      message.error(error.response?.data?.message || '合并病历失败')
    } finally {
      setMerging(false)
    }
  }

  // 处理取消合并
  const handleCancelMerge = () => {
    setMergeModalVisible(false)
    setExtractResult(null)
    message.info('已跳过合并，抽取数据已保存到文档')
  }

  // 处理删除文档
  const handleDelete = () => {
    if (!document?.id) return
    Modal.confirm({
      title: '确认删除文档',
      icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <p>确定要删除文档 <Text strong>{document.fileName || document.file_name || document.id}</Text> 吗？</p>
          <p style={{ color: '#ff4d4f' }}>删除操作不可撤销</p>
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        try {
          setDeleting(true)
          const response = await deleteDocument(document.id, true)
          if (response.success) {
            message.success('文档删除成功')
            onClose?.()
            onDeleteSuccess?.()
          } else {
            message.error(response.message || '删除失败')
          }
        } catch (error) {
          console.error('删除文档失败:', error)
          message.error(error.response?.data?.message || '删除文档失败')
        } finally {
          setDeleting(false)
        }
      }
    })
  }

  // 处理从抽取记录列表合并到患者
  const handleMergeToPatient = async (extractionId, extractedEhrData) => {
    // 检查是否有 patientId
    if (!patientId) {
      message.warning('缺少患者信息，无法合并')
      return
    }

    if (!document?.id) {
      message.warning('缺少文档信息，无法合并')
      return
    }

    if (!extractionId) {
      message.warning('缺少抽取记录ID，无法合并')
      return
    }

    setMerging(true)
    try {
      // 现在只需要传递 source_extraction_id，后端会自动从该抽取记录获取数据
      const response = await mergeEhrData(patientId, {
        document_id: document.id,
        source_extraction_id: extractionId  // 使用 source_extraction_id 指定要合并的抽取记录
      })

      if (response.success) {
        const result = response.data
        const msgParts = []
        if (result.new_field_count > 0) {
          msgParts.push(`新增 ${result.new_field_count} 个字段`)
        }
        if (result.appended_array_count > 0) {
          msgParts.push(`累加 ${result.appended_array_count} 个数组字段`)
        }
        if (result.conflict_count > 0) {
          msgParts.push(`${result.conflict_count} 个冲突待处理`)
        }
        message.success(msgParts.length > 0 ? `合并成功！${msgParts.join('，')}` : '合并成功！')
        // 重新获取文档详情以刷新合并状态
        fetchDocumentDetail(document.id)
        // 通知父组件刷新
        onExtractSuccess?.()
      } else {
        message.error(response.message || '合并失败')
      }
    } catch (error) {
      console.error('合并病历失败:', error)
      message.error(error.response?.data?.message || '合并病历失败')
    } finally {
      setMerging(false)
    }
  }

  // 渲染文档预览区域
  const renderPreviewArea = () => {
    const rawFileType = documentDetail?.file_type || document?.fileType || 'unknown'
    const fileName = documentDetail?.file_name || document?.fileName || ''
    
    // 统一的文件类型识别逻辑
    const isPDF = (type, name, url) => {
      const t = String(type || '').toLowerCase()
      const n = String(name || '').toLowerCase()
      const u = String(url || '').toLowerCase()
      return t === 'pdf' || t === '.pdf' || t.includes('application/pdf') || n.endsWith('.pdf') || u.includes('.pdf?') || u.split('?')[0].endsWith('.pdf')
    }

    const isImage = (type, name, url) => {
      const t = String(type || '').toLowerCase()
      const n = String(name || '').toLowerCase()
      const u = String(url || '').toLowerCase()
      const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']
      return imageExtensions.includes(t) || 
             imageExtensions.includes(t.replace('.', '')) || 
             imageExtensions.some(ext => n.endsWith('.' + ext)) ||
             imageExtensions.some(ext => u.split('?')[0].endsWith('.' + ext))
    }

    const fileTypeDisplay = rawFileType.startsWith('.') ? rawFileType.substring(1).toUpperCase() : rawFileType.toUpperCase()

    return (
      <div className="document-preview-area">
        <div className="preview-header">
          <Space align="center">
            <Title level={5} style={{ margin: 0 }}>文档预览</Title>
            <Text type="secondary" ellipsis style={{ maxWidth: 200, fontSize: 12 }}>
              {fileName}
            </Text>
          </Space>
          {/* OCR查看按钮未提供有效功能，按需求隐藏 */}
        </div>
        
        <div className="preview-content">
          {previewLoading || detailLoading ? (
            <div className="preview-placeholder">
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">正在加载文档预览...</Text>
              </div>
            </div>
          ) : previewUrl ? (
            <div style={{ 
              width: '100%', 
              height: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              overflow: 'auto',
              padding: '16px'
            }}>
              {isPDF(rawFileType, fileName, previewUrl) ? (
                <iframe
                  title="document-preview"
                  src={previewUrl}
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    border: '1px solid #f0f0f0', 
                    borderRadius: 8,
                    minHeight: '500px'
                  }}
                />
              ) : isImage(rawFileType, fileName, previewUrl) ? (
                <div style={{ 
                  width: '100%', 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column'
                }}>
                  {/* 图片工具栏 */}
                  {!previewError && !previewLoading && !detailLoading && (
                    <div className="image-toolbar" style={{ 
                      padding: '4px 16px', 
                      background: '#f5f5f5', 
                      borderBottom: '1px solid #d9d9d9',
                      display: 'flex',
                      justifyContent: 'center',
                      gap: '16px'
                    }}>
                      <Tooltip title="放大">
                        <Button 
                          type="text" 
                          icon={<ZoomInOutlined />} 
                          onClick={() => setImgScale(prev => Math.min(prev + 0.2, 5))} 
                        />
                      </Tooltip>
                      <Tooltip title="缩小">
                        <Button 
                          type="text" 
                          icon={<ZoomOutOutlined />} 
                          onClick={() => setImgScale(prev => Math.max(prev - 0.2, 0.2))} 
                        />
                      </Tooltip>
                      <Tooltip title="向左旋转">
                        <Button 
                          type="text" 
                          icon={<RotateLeftOutlined />} 
                          onClick={() => setImgRotate(prev => prev - 90)} 
                        />
                      </Tooltip>
                      <Tooltip title="向右旋转">
                        <Button 
                          type="text" 
                          icon={<RotateRightOutlined />} 
                          onClick={() => setImgRotate(prev => prev + 90)} 
                        />
                      </Tooltip>
                      <Tooltip title="重置">
                        <Button 
                          type="text" 
                          icon={<UndoOutlined />} 
                          onClick={() => {
                            setImgScale(1)
                            setImgRotate(0)
                            setImgOffset({ x: 0, y: 0 })
                          }} 
                        />
                      </Tooltip>
                    </div>
                  )}

                  <div 
                    className="image-preview-container"
                    style={{ 
                      position: 'relative', 
                      flex: 1, 
                      width: '100%', 
                      height: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      overflow: 'hidden', 
                      padding: '16px',
                      background: '#e9e9e9',
                      cursor: isDragging ? 'grabbing' : (imgScale > 1 ? 'move' : 'default'),
                      touchAction: 'none' // 防止移动端干扰
                    }}
                    onMouseDown={(e) => {
                      if (imgScale <= 1) return
                      setIsDragging(true)
                      setStart({ x: e.clientX - imgOffset.x, y: e.clientY - imgOffset.y })
                      e.preventDefault()
                    }}
                    onMouseMove={(e) => {
                      if (!isDragging) return
                      setImgOffset({
                        x: e.clientX - dragStart.x,
                        y: e.clientY - dragStart.y
                      })
                    }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                  >
                    {previewImageLoading && !previewError && (
                      <div style={{ 
                        position: 'absolute', 
                        top: '50%', 
                        left: '50%', 
                        transform: 'translate(-50%, -50%)',
                        zIndex: 1,
                        pointerEvents: 'none'
                      }}>
                        <Spin size="large" />
                      </div>
                    )}
                    {previewError ? (
                      <div className="preview-placeholder">
                        <div className="preview-icon">❌</div>
                        <div className="preview-info">
                          <Text strong>图片加载失败</Text>
                        </div>
                        <div className="preview-note">
                          <Button 
                            size="small" 
                            icon={<ReloadOutlined />} 
                            onClick={() => fetchPreviewUrl(document.id)}
                            loading={previewLoading}
                          >
                            重试
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <img
                        alt="document-preview"
                        src={previewUrl}
                        style={{ 
                          maxWidth: '100%', 
                          maxHeight: '100%', 
                          objectFit: 'contain', 
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)', 
                          opacity: previewImageLoading ? 0.3 : 1,
                          transition: isDragging ? 'opacity 0.3s' : 'opacity 0.3s, transform 0.3s cubic-bezier(0.2, 0, 0, 1)', 
                          transform: `translate(${imgOffset.x}px, ${imgOffset.y}px) scale(${imgScale}) rotate(${imgRotate}deg)`,
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none',
                          pointerEvents: 'none', // 事件由容器处理，防止 img 元素拦截
                          WebkitTouchCallout: 'none',
                          draggable: false
                        }}
                        onLoad={() => {
                          setPreviewImageLoading(false)
                          setPreviewError(false)
                        }}
                        onLoadStart={() => {
                          setPreviewImageLoading(true)
                        }}
                        onError={(e) => {
                          console.error('图片加载失败:', previewUrl)
                          setPreviewImageLoading(false)
                          setPreviewError(true)
                          e.target.style.display = 'none'
                        }}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="preview-placeholder">
                  <div className="preview-icon">
                    📄
                  </div>
                  <div className="preview-info">
                    <Text strong>{fileName || '未知文档'}</Text>
                    <br />
                    <Text type="secondary">文件类型: {fileTypeDisplay}</Text>
                    <br />
                    <Text type="secondary">
                      {documentDetail?.document_type || ''} | {documentDetail?.document_sub_type || ''}
                    </Text>
                  </div>
                  <div className="preview-note" style={{ marginTop: 16 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      不支持预览此文件类型
                    </Text>
                    <br />
                    <Button 
                      type="link" 
                      size="small"
                      onClick={() => {
                        if (previewUrl) {
                          window.open(previewUrl, '_blank', 'noopener,noreferrer')
                        }
                      }}
                    >
                      在新窗口打开
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="preview-placeholder">
              <div className="preview-icon">
                📄
              </div>
              <div className="preview-info">
                <Text strong>{fileName || '未知文档'}</Text>
                <br />
                <Text type="secondary">文件类型: {fileTypeDisplay}</Text>
                <br />
                <Text type="secondary">
                  {documentDetail?.document_type || ''} | {documentDetail?.document_sub_type || ''}
                </Text>
              </div>
              <div className="preview-note">
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  无法获取文档预览URL
                </Text>
                <Button 
                  size="small" 
                  icon={<ReloadOutlined />} 
                  onClick={() => fetchPreviewUrl(document.id)}
                  loading={previewLoading}
                >
                  重新获取
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 判断字段是否需要全宽显示
  const isFullWidthField = (field) => {
    const fullWidthTypes = ['textarea', 'checkbox']
    const longTextFields = ['organizationName', 'parsedText']
    
    return fullWidthTypes.includes(field.uiComponentHint) || 
           longTextFields.includes(field.fieldId) ||
           (field.value && typeof field.value === 'object') ||
           (field.value && field.value.length > 20)
  }

  // 渲染元数据字段
  const renderMetadataFields = () => {
    // 元数据优先使用"详情接口"返回的数据（documentDetail），否则回退到列表项传入的 document
    // 注意：为避免生效时间等字段在详情加载前显示错误值，优先等待详情加载完成
    const meta = documentDetail?.metadata || document?.metadata || {}
    
    // 对于 effectiveDate，优先使用详情数据，避免列表数据的闪烁
    const effectiveDateValue = detailLoading 
      ? '加载中...' 
      : (documentDetail?.metadata?.effectiveDate || document?.metadata?.effectiveDate || '')
    
    // 处理多唯一标识符的本地编辑状态
    const currentIdentifiers = editedFields.identifiers?.value || meta.identifiers || []
    
    const handleAddIdentifier = () => {
      const newIdentifiers = [...currentIdentifiers, { '标识符类型': '住院号', '标识符编号': '' }]
      handleFieldSave('identifiers', newIdentifiers)
    }
    
    const handleRemoveIdentifier = (index) => {
      const newIdentifiers = currentIdentifiers.filter((_, i) => i !== index)
      handleFieldSave('identifiers', newIdentifiers)
    }
    
    const handleUpdateIdentifier = (index, field, value) => {
      const newIdentifiers = currentIdentifiers.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
      handleFieldSave('identifiers', newIdentifiers, undefined, true) // 静默更新，不弹提示
    }
    const docTypeOptions = Object.entries(DOC_TYPE_CATEGORIES).map(([key, cat]) => ({
      value: key, label: cat.label
    }))

    const currentDocType = editedFields.documentType?.value ?? meta.documentType
    const docSubtypeOptions = currentDocType && DOC_TYPE_CATEGORIES[currentDocType]
      ? DOC_TYPE_CATEGORIES[currentDocType].children.map(child => ({ value: child, label: child }))
      : []

    const metadataFields = [
      { fieldId: 'organizationName', fieldName: '机构名称', value: meta.organizationName, uiComponentHint: 'text' },
      { fieldId: 'patientName', fieldName: '患者姓名', value: meta.patientName, uiComponentHint: 'text' },
      { fieldId: 'gender', fieldName: '性别', value: meta.gender, uiComponentHint: 'radio', options: [
        { value: '男', label: '男' },
        { value: '女', label: '女' },
        { value: '不详', label: '不详' }
      ]},
      { fieldId: 'age', fieldName: '年龄', value: meta.age, unit: '岁', uiComponentHint: 'number' },
      { fieldId: 'documentType', fieldName: '文档类型', value: meta.documentType, uiComponentHint: 'select', options: docTypeOptions },
      { fieldId: 'documentSubtype', fieldName: '文档子类型', value: meta.documentSubtype, uiComponentHint: 'select', options: docSubtypeOptions },
      { fieldId: 'effectiveDate', fieldName: '生效时间', value: effectiveDateValue, uiComponentHint: 'datepicker' }
    ]

    return (
      <div className="metadata-fields">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={5} style={{ margin: 0 }}>元数据字段</Title>
          <Tooltip title={!document.isParsed ? '文档尚未完成 OCR 解析，请先进行解析' : '仅重新抽取文档元数据（文档类型、患者名等），不包含病历字段'}>
            <Button
              size="small"
              icon={extractingMetadata ? <Spin size="small" /> : <ExperimentOutlined />}
              onClick={handleExtractMetadata}
              loading={extractingMetadata}
              disabled={!document.isParsed || extractingMetadata || detailLoading}
            >
              重新提取
            </Button>
          </Tooltip>
        </div>
        
        {/* 唯一标识符列表 (特殊处理) */}
        <div className="identifiers-section" style={{ marginBottom: 24, padding: 16, background: '#fafafa', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text strong>唯一标识符 ({currentIdentifiers.length})</Text>
            <Button 
              type="dashed" 
              size="small" 
              icon={<PlusOutlined />} 
              onClick={handleAddIdentifier}
            >
              添加标识符
            </Button>
          </div>
          
          {currentIdentifiers.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无标识符" style={{ margin: '10px 0' }} />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {currentIdentifiers.map((item, index) => (
                <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Select
                    value={item['标识符类型']}
                    onChange={(val) => handleUpdateIdentifier(index, '标识符类型', val)}
                    style={{ width: 140 }}
                    size="small"
                    placeholder="选择类型"
                  >
                    <Select.Option value="住院号">住院号</Select.Option>
                    <Select.Option value="门诊号">门诊号</Select.Option>
                    <Select.Option value="急诊号">急诊号</Select.Option>
                    <Select.Option value="MRN">MRN</Select.Option>
                    <Select.Option value="医保号">医保号</Select.Option>
                    <Select.Option value="社保号">社保号</Select.Option>
                    <Select.Option value="病案号">病案号</Select.Option>
                    <Select.Option value="健康卡号">健康卡号</Select.Option>
                    <Select.Option value="身份证号">身份证号</Select.Option>
                    <Select.Option value="ID号">ID号</Select.Option>
                    <Select.Option value="其他">其他</Select.Option>
                  </Select>
                  <Input
                    value={item['标识符编号']}
                    onChange={(e) => handleUpdateIdentifier(index, '标识符编号', e.target.value)}
                    placeholder="请输入编号"
                    style={{ flex: 1 }}
                    size="small"
                  />
                  <Button 
                    type="text" 
                    danger 
                    icon={<DeleteOutlined />} 
                    onClick={() => handleRemoveIdentifier(index)}
                    size="small"
                  />
                </div>
              ))}
            </Space>
          )}
        </div>

        <div className="fields-grid-responsive">
          <Row gutter={[16, 16]}>
            {metadataFields.map(field => {
              const isFullWidth = isFullWidthField(field)
              return (
                <Col 
                  key={field.fieldId} 
                  span={isFullWidth ? 24 : 12}
                  className="field-col"
                >
                  <div className="field-item">
                    <FieldEditor
                      field={field}
                      value={getFieldValue(field)}
                      confidence={getFieldConfidence(field)}
                      onSave={handleFieldSave}
                    />
                  </div>
                </Col>
              )
            })}
          </Row>
        </div>
      </div>
    )
  }

  // 将 extracted_ehr_data 转换为字段列表用于展示（不包含内部字段如 _extraction_metadata）
  const convertEhrDataToFields = (ehrData) => {
    if (!ehrData || typeof ehrData !== 'object') return []
    
    const fields = []
    
    Object.entries(ehrData).forEach(([key, value]) => {
      // 跳过内部/调试字段，避免在列表中展示大块元数据
      if (key === '_extraction_metadata' || (key.startsWith('_') && key.length > 1)) {
        return
      }

      // 处理值：如果值是对象且有 value 属性，则取 value；否则直接用
      let displayValue = value
      let confidence = null
      let sourceIndex = null
      let rawValue = value
      
      if (typeof value === 'object' && !Array.isArray(value) && value.value !== undefined) {
        const normalizedNestedValue = normalizeDisplayValue(value.value)
        if (normalizedNestedValue === undefined) {
          return
        }
        displayValue = normalizedNestedValue
        rawValue = normalizedNestedValue
        confidence = value.confidence
        sourceIndex = value.source_index
      } else {
        const normalizedValue = normalizeDisplayValue(value)
        if (normalizedValue === undefined || isEmptyValue(normalizedValue)) {
          return
        }
        displayValue = normalizedValue
        rawValue = normalizedValue
      }
      
      // 对于数组类型，保存原始数组值
      const isArray = Array.isArray(displayValue)
      const arrayLength = isArray ? displayValue.length : 0
      
      // 生成列表字段的摘要（提取前3条的关键信息）
      let arraySummary = []
      if (isArray && arrayLength > 0) {
        arraySummary = displayValue.slice(0, 3).map(item => {
          if (item === null || item === undefined) {
            return { title: '空记录', sub: null }
          }
          if (typeof item !== 'object') {
            return { title: String(item), sub: null }
          }
          // 尝试提取 name/title 等关键字段
          const nameKey = Object.keys(item).find(k => k.toLowerCase().includes('name') || k === 'title' || k === 'diagnosis' || k === 'drug')
          const timeKey = Object.keys(item).find(k => k.toLowerCase().includes('date') || k === 'time')
          return {
            title: nameKey ? item[nameKey] : (item.name || item.title || item.diagnosis_name || '未命名记录'),
            sub: timeKey ? item[timeKey] : null
          }
        })
      }

      // 使用字典获取中文标签
      const fieldLabel = getFieldLabel(key)
      
      fields.push({
        fieldId: key,
        fieldName: fieldLabel,
        value: displayValue,
        displayText: isArray ? `共 ${arrayLength} 条记录` : displayValue,
        rawValue: rawValue,
        confidence: confidence,
        sourceIndex: sourceIndex,
        isArray: isArray,
        arrayLength: arrayLength,
        arraySummary: arraySummary, // 新增摘要字段
        uiComponentHint: isArrayField(key) ? 'list' : 'text'
      })
    })
    
    return fields
  }
  
  // 查看可重复字段详情
  const handleViewArrayField = (field) => {
    setSelectedArrayField(field)
    setArrayFieldModalVisible(true)
  }

  // 可重复字段内部字段的中文映射（参考电子病历的定义）
  const arrayFieldLabelsMap = {
    // 通用字段
    institution: '检查机构',
    report_no: '报告编号',
    exam_date: '检查日期',
    report_date: '报告日期',
    specimen_type: '标本类型',
    project_name: '项目名称',
    
    // 实验室检查 items 内的字段
    items: '检验指标',
    item_name: '指标名称',
    item_abbr: '英文简称',
    value: '检测值',
    unit: '单位',
    reference_range: '参考范围',
    is_abnormal: '是否异常',
    
    // 诊断记录
    diagnosis_name: '疾病名称',
    diagnosis_code: '疾病编码',
    diagnosis_type: '诊断类型',
    diagnosis_date: '诊断日期',
    diagnosis_doctor: '诊断医师',
    diagnosis_institution: '诊断机构',
    
    // 治疗记录
    treatment_name: '治疗名称',
    treatment_type: '治疗类型',
    treatment_date: '治疗日期',
    treatment_institution: '治疗机构',
    treatment_doctor: '主治医师',
    treatment_effect: '治疗效果',
    treatment_summary: '治疗总结',
    
    // 用药记录
    drug_name: '药品名称',
    drug_code: '药品编码',
    dosage: '用药剂量',
    frequency: '用药频次',
    route: '给药途径',
    start_date: '开始日期',
    end_date: '结束日期',
    purpose: '用药目的',
    
    // 手术记录
    surgery_name: '手术名称',
    surgery_code: '手术编码',
    surgery_date: '手术日期',
    surgery_institution: '手术机构',
    surgeon: '主刀医师',
    anesthesia_type: '麻醉方式',
    surgery_duration: '手术时长',
    intraoperative_finding: '术中所见',
    postoperative_diagnosis: '术后诊断',
    
    // 影像检查
    imaging_type: '检查类型',
    imaging_part: '检查部位',
    finding: '所见描述',
    conclusion: '结论',
    impression: '印象',
    
    // 病理检查
    pathology_type: '病理类型',
    sample_type: '标本类型',
    sample_site: '取样部位',
    gross_finding: '肉眼所见',
    microscopic_finding: '镜下所见',
    pathology_diagnosis: '病理诊断',
    
    // 过敏史
    allergen: '过敏原',
    allergy_type: '过敏类型',
    severity: '严重程度',
    reaction: '过敏反应',
    
    // 家族史
    relation: '亲属关系',
    health_status: '健康状态',
    disease_history: '疾病史',
    
    // 既往史
    disease: '疾病名称',
    onset_date: '发病日期',
    cure_date: '治愈日期',
    status: '当前状态',
    
    // 其他通用
    remark: '备注',
    notes: '备注说明',
    description: '描述',
    result: '结果',
    doctor: '医师',
    operator: '操作者'
  }

  // 获取字段的中文标签
  const getArrayFieldLabel = (key) => {
    return arrayFieldLabelsMap[key] || key
  }

  // 渲染检验指标表格（items）
  const renderLabItems = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
      return <Text type="secondary">（无检验指标）</Text>
    }
    
    return (
      <table className="lab-items-table">
        <thead>
          <tr>
            <th>指标名称</th>
            <th>检测值</th>
            <th>单位</th>
            <th>参考范围</th>
            <th>异常</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className={item.is_abnormal ? 'abnormal' : ''}>
              <td>{item.item_name || '-'}</td>
              <td>{item.value || '-'}</td>
              <td>{item.unit || '-'}</td>
              <td>{item.reference_range || '-'}</td>
              <td>{item.is_abnormal ? '↑↓' : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // 渲染单个记录的字段
  const renderRecordFields = (record, fieldType) => {
    const normalizedRecord = normalizeDisplayValue(record)

    if (normalizedRecord === undefined) {
      return <Text type="secondary" style={{ fontStyle: 'italic' }}>无可展示字段</Text>
    }

    if (typeof normalizedRecord !== 'object' || normalizedRecord === null) {
      return <Text>{String(normalizedRecord)}</Text>
    }

    // 分离普通字段和 items（检验指标）
    const normalFields = []
    let itemsData = null

    Object.entries(normalizedRecord).forEach(([key, value]) => {
      // 跳过 _source_index 等内部字段
      if (key.startsWith('_')) return
      
      if (key === 'items' && Array.isArray(value)) {
        itemsData = value
      } else {
        normalFields.push({ key, value })
      }
    })

    return (
      <div>
        {/* 普通字段 */}
        {normalFields.length > 0 && (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '12px',
            marginBottom: itemsData ? 16 : 0
          }}>
            {normalFields.map(({ key, value }) => (
              <div key={key} style={{ marginBottom: 8 }}>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {getArrayFieldLabel(key)}
                  </Text>
                </div>
                <div>
                  {typeof value === 'object'
                    ? <StructuredDataView data={value} />
                    : <Text>{String(value)}</Text>}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* 检验指标表格 */}
        {itemsData && (
          <div>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
              检验指标（共 {itemsData.length} 项）
            </Text>
            {renderLabItems(itemsData)}
          </div>
        )}
      </div>
    )
  }

  // 格式化抽取时间
  const formatExtractionTime = (isoString) => {
    if (!isoString) return '未知时间'
    const date = new Date(isoString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }

  const getExtractionRecordKey = (record, index) => record.extraction_id || `record-${index}`

  const renderFieldValue = (field) => {
    if (field?.isArray) {
      return <Text>{field.displayText}</Text>
    }
    if (typeof field?.value === 'object' && field?.value !== null) {
      return <StructuredDataView data={field.value} />
    }
    return <Text>{String(field?.value ?? '—')}</Text>
  }

  // 获取分组图标
  const getGroupIcon = (iconName) => {
    const icons = {
      UserOutlined: <UserOutlined />,
      PhoneOutlined: <PhoneOutlined />,
      TeamOutlined: <TeamOutlined />,
      CoffeeOutlined: <CoffeeOutlined />,
      HistoryOutlined: <HistoryOutlined />,
      CalendarOutlined: <CalendarOutlined />,
      MedicineBoxOutlined: <MedicineBoxOutlined />,
      ExperimentOutlined: <ExperimentOutlined />
    }
    return icons[iconName] || <FileTextOutlined />
  }

  // 渲染单个抽取记录 (分组渲染)
  const renderExtractionRecord = (record, index) => {
    const extractedFields = convertEhrDataToFields(record.extracted_ehr_data || {})
    const visibleFieldCount = extractedFields.length
    const isMerged = record.is_merged
    const conflictCount = record.conflict_count || 0
    const recordKey = getExtractionRecordKey(record, index)
    
    // 按照 EHR_FIELD_GROUPS 对字段进行分组
    const groupedFields = {}
    const assignedFields = new Set()

    // 初始化分组
    Object.entries(EHR_FIELD_GROUPS).forEach(([groupKey, groupConfig]) => {
      groupedFields[groupKey] = {
        config: groupConfig,
        fields: []
      }
    })

    // 分配字段
    extractedFields.forEach(field => {
      let matched = false
      for (const [groupKey, groupConfig] of Object.entries(EHR_FIELD_GROUPS)) {
        if (groupConfig.fields.includes(field.fieldId)) {
          groupedFields[groupKey].fields.push(field)
          assignedFields.add(field.fieldId)
          matched = true
          break
        }
      }
      // 如果没有匹配到任何组，放入"其他"组
      if (!matched) {
        if (!groupedFields['other']) {
          groupedFields['other'] = {
            config: { label: '其他信息', icon: 'FileTextOutlined' },
            fields: []
          }
        }
        groupedFields['other'].fields.push(field)
      }
    })

    // 过滤掉空的分组
    const activeGroups = Object.entries(groupedFields).filter(([_, group]) => group.fields.length > 0)

    // 默认展开第一个分组
    const defaultActiveKeys = activeGroups.length > 0 ? [activeGroups[0][0]] : []

    return (
      <div key={recordKey} className="extraction-record">
        {/* 抽取记录头部：时间 + 状态 */}
        <div className="extraction-record-header">
          <div className="extraction-time">
            <ClockCircleOutlined style={{ marginRight: 6 }} />
            <Text strong>{formatExtractionTime(record.created_at)}</Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              （共 {visibleFieldCount} 个字段）
            </Text>
          </div>
          <div className="extraction-status">
            {/* 显示冲突数量（如果有），点击可查看详情 */}
            {conflictCount > 0 && (
              <Tag 
                color="error" 
                style={{ marginRight: 8, cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedExtractionId(record.extraction_id)
                  setConflictModalVisible(true)
                }}
              >
                {conflictCount} 个冲突
              </Tag>
            )}
            {isMerged ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>已合并</Tag>
            ) : (
              <Tag color="warning" icon={<ClockCircleOutlined />}>未合并</Tag>
            )}
            {isMerged && record.merged_at && (
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                合并于 {formatExtractionTime(record.merged_at)}
              </Text>
            )}
          </div>
        </div>
        
        {/* 抽取的字段内容 - 分组展示 */}
        <div className="extraction-record-content">
          {extractedFields.length === 0 ? (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <Text type="secondary">无可展示的字段</Text>
            </div>
          ) : (
            <div className="extraction-grouped-content">
              <Collapse 
                defaultActiveKey={defaultActiveKeys}
                expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
                ghost
                className="extraction-collapse"
              >
                {activeGroups.map(([groupKey, group]) => (
                  <Panel 
                    header={
                      <Space>
                        {getGroupIcon(group.config.icon)}
                        <Text strong>{group.config.label}</Text>
                        <Tag style={{ marginLeft: 8, borderRadius: 10 }}>{group.fields.length}</Tag>
                      </Space>
                    } 
                    key={groupKey}
                    className="extraction-group-panel"
                  >
                    <div className="extraction-group-grid">
                      {group.fields.map(field => (
                        <div key={field.fieldId} className={`extraction-field-card ${field.isArray ? 'full-width' : ''}`}>
                          {field.isArray ? (
                            // 列表字段展示
                            <div className="extraction-array-field">
                              <div className="array-field-header">
                                <Text strong className="field-label">{field.fieldName}</Text>
                                <Button 
                                  type="link" 
                                  size="small" 
                                  onClick={() => handleViewArrayField(field)}
                                >
                                  查看全部 ({field.arrayLength})
                                </Button>
                              </div>
                              {field.arraySummary.length > 0 ? (
                                <div className="array-summary-list">
                                  {field.arraySummary.map((item, idx) => (
                                    <div key={idx} className="array-summary-item">
                                      <Text style={{ fontSize: 13 }}>{idx + 1}. {item.title}</Text>
                                      {item.sub && <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>{item.sub}</Text>}
                                    </div>
                                  ))}
                                  {field.arrayLength > 3 && (
                                    <Text type="secondary" style={{ fontSize: 12, display: 'block', paddingLeft: 12, paddingTop: 4 }}>
                                      ... 等 {field.arrayLength} 条记录
                                    </Text>
                                  )}
                                </div>
                              ) : (
                                <Text type="secondary" style={{ fontSize: 12, display: 'block', padding: 8 }}>暂无明细</Text>
                              )}
                            </div>
                          ) : (
                            // 普通字段展示
                            <div className="extraction-primitive-field">
                              <Text type="secondary" className="field-label">{field.fieldName}</Text>
                              <div className="field-value">{renderFieldValue(field)}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Panel>
                ))}
              </Collapse>
            </div>
          )}
        </div>

        {/* 抽取元数据：可折叠、默认收起，便于调试/溯源 */}
        {(record.extracted_ehr_data && record.extracted_ehr_data._extraction_metadata) && (
          <Collapse ghost style={{ marginTop: 12 }}>
            <Panel
              header={<Text type="secondary" style={{ fontSize: 12 }}>抽取元数据 (Extraction metadata)</Text>}
              key="extraction-metadata"
            >
              <div
                style={{
                  background: '#fafafa',
                  borderRadius: 6,
                  padding: 12,
                  maxHeight: 360,
                  overflow: 'auto'
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    fontSize: 12,
                    lineHeight: 1.5,
                    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                >
                  {JSON.stringify(record.extracted_ehr_data._extraction_metadata, null, 2)}
                </pre>
              </div>
            </Panel>
          </Collapse>
        )}
        
        {/* 操作按钮 */}
        <div className="extraction-record-actions">
          {!isMerged && (
            <Button 
              type="primary"
              size="small"
              icon={<MergeCellsOutlined />}
              loading={merging}
              onClick={() => handleMergeToPatient(record.extraction_id, record.extracted_ehr_data)}
            >
              合并到患者
            </Button>
          )}
        </div>
      </div>
    )
  }

  // 渲染抽取记录列表
  const renderExtractedFields = () => {
    // 加载中状态
    if (detailLoading) {
      return (
        <div className="extracted-fields">
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">正在加载抽取记录...</Text>
            </div>
          </div>
        </div>
      )
    }

    // 从文档详情 API 获取抽取记录列表
    const extractionRecords = documentDetail?.extraction_records || []
    const extractionCount = documentDetail?.extraction_count || 0

    return (
      <div className="extracted-fields">
        {extractionRecords.length === 0 ? (
          <div className="ocr-content-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="文档尚未进行 AI 抽取"
            />
            {document.isParsed && (
              <Button 
                type="primary" 
                style={{ marginTop: 16 }}
                icon={<ExperimentOutlined />}
                onClick={handleExtract}
                loading={extracting}
              >
                开始抽取
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* 抽取记录标题栏 + 重新抽取按钮 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0 }}>抽取记录 ({extractionCount})</Title>
              <Tooltip title={!document.isParsed ? '文档尚未完成 OCR 解析，请先进行解析' : ''}>
                <Button
                  size="small"
                  icon={extracting ? <Spin size="small" /> : <ExperimentOutlined />}
                  onClick={handleExtract}
                  loading={extracting}
                  disabled={!document.isParsed || extracting}
                >
                  重新抽取
                </Button>
              </Tooltip>
            </div>
            <div className="extraction-records-list">
              {extractionRecords.map((record, index) => renderExtractionRecord(record, index))}
            </div>
          </>
        )}
      </div>
    )
  }

  // 获取操作类型的配置
  const getOperationTypeConfig = (type) => {
    const configs = {
      upload: { 
        icon: <UploadOutlined />, 
        color: '#1890ff', 
        bgColor: '#e6f7ff',
        label: '上传' 
      },
      extraction: { 
        icon: <RobotOutlined />, 
        color: '#722ed1', 
        bgColor: '#f9f0ff',
        label: '抽取' 
      },
      field_change: { 
        icon: <EditOutlined />, 
        color: '#52c41a', 
        bgColor: '#f6ffed',
        label: '变更' 
      },
      conflict_resolve: { 
        icon: <SolutionOutlined />, 
        color: '#faad14', 
        bgColor: '#fffbe6',
        label: '解决' 
      }
    }
    return configs[type] || configs.upload
  }

  // 格式化操作时间
  const formatOperationTime = (isoString) => {
    if (!isoString) return '未知时间'
    const date = new Date(isoString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  const renderOperationHistory = () => {
    // 加载中状态
    if (historyLoading) {
      return (
        <div className="operation-history">
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">正在加载操作历史...</Text>
            </div>
          </div>
        </div>
      )
    }

    // 无数据状态
    if (!operationHistory || !operationHistory.history || operationHistory.history.length === 0) {
      return (
        <div className="operation-history">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无操作历史"
          />
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button 
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => document?.id && fetchOperationHistory(document.id)}
            >
              刷新
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="operation-history">
        {/* 统计信息 */}
        <div className="history-stats">
          <Space size="large">
            <Text>
              共 <Text strong>{operationHistory.history.length}</Text> 条记录
            </Text>
            {operationHistory.extraction_count > 0 && (
              <Text type="secondary">
                <RobotOutlined /> 抽取 {operationHistory.extraction_count} 次
              </Text>
            )}
            {operationHistory.field_change_count > 0 && (
              <Text type="secondary">
                <EditOutlined /> 变更 {operationHistory.field_change_count} 次
              </Text>
            )}
            {operationHistory.conflict_resolve_count > 0 && (
              <Text type="secondary">
                <SolutionOutlined /> 解决冲突 {operationHistory.conflict_resolve_count} 次
              </Text>
            )}
          </Space>
          <Button 
            type="text" 
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => document?.id && fetchOperationHistory(document.id)}
          >
            刷新
          </Button>
        </div>
        
        {/* 时间线 */}
        <div className="history-timeline">
          {operationHistory.history.map((item, index) => {
            const config = getOperationTypeConfig(item.type)
            return (
              <div key={item.id || index} className="history-timeline-item">
                <div className="timeline-icon" style={{ background: config.bgColor, color: config.color }}>
                  {config.icon}
                </div>
                <div className="timeline-content">
                  <div className="timeline-header">
                    <Text strong>{item.title}</Text>
                    <Tag color={config.color} style={{ marginLeft: 8 }}>{config.label}</Tag>
                  </div>
                  {item.description && (
                    <div className="timeline-description">
                      <Text type="secondary">{item.description}</Text>
                    </div>
                  )}
                  <div className="timeline-meta">
                    <Space size="middle">
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                        {formatOperationTime(item.created_at)}
                      </Text>
                      {item.operator_name && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.operator_type === 'ai' ? <RobotOutlined /> : <EditOutlined />}
                          <span style={{ marginLeft: 4 }}>{item.operator_name}</span>
                        </Text>
                      )}
                    </Space>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // 获取内容块类型的配置信息
  const getBlockTypeConfig = (type) => {
    const configs = {
      text: { icon: <FileTextOutlined />, color: 'blue', label: '文本' },
      table: { icon: <TableOutlined />, color: 'green', label: '表格' },
      image: { icon: <PictureOutlined />, color: 'purple', label: '图片' },
      discarded: { icon: <FileTextOutlined />, color: 'default', label: '其他' }
    }
    return configs[type] || configs.discarded
  }

  // 渲染单个内容块
  const renderContentBlock = (block, index) => {
    const config = getBlockTypeConfig(block.type)
    const pageNum = (block.page_idx || 0) + 1

    return (
      <div key={index} className="ocr-content-block">
        <div className="ocr-block-header">
          <Space size="small">
            <Tag icon={config.icon} color={config.color}>
              {config.label}
            </Tag>
            <Tag color="default">第 {pageNum} 页</Tag>
            {block.text_level && (
              <Tag color="orange">H{block.text_level}</Tag>
            )}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            #{index + 1}
          </Text>
        </div>
        <div className="ocr-block-content">
          {block.type === 'table' && block.table_body ? (
            <div 
              className="ocr-table-wrapper"
              dangerouslySetInnerHTML={{ __html: block.table_body }}
            />
          ) : block.type === 'image' ? (
            <div className="ocr-image-wrapper" style={{ position: 'relative' }}>
              {block._image_url ? (
                <>
                  {ocrImageLoading.get(block._image_url) && (
                    <div style={{ 
                      position: 'absolute', 
                      top: '50%', 
                      left: '50%', 
                      transform: 'translate(-50%, -50%)',
                      zIndex: 1
                    }}>
                      <Spin size="small" />
                    </div>
                  )}
                  <img 
                    src={block._image_url} 
                    alt={block.img_path || 'OCR图片'} 
                    style={{
                      maxWidth: '100%',
                      height: 'auto',
                      borderRadius: 4,
                      border: '1px solid #e8e8e8',
                      display: 'block',
                      marginBottom: 8,
                      opacity: ocrImageLoading.get(block._image_url) ? 0.3 : 1,
                      transition: 'opacity 0.3s',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none',
                      pointerEvents: 'auto',
                      WebkitTouchCallout: 'none'
                    }}
                    onLoad={() => {
                      setOcrImageLoading(prev => {
                        const newMap = new Map(prev)
                        newMap.set(block._image_url, false)
                        return newMap
                      })
                    }}
                    onLoadStart={() => {
                      setOcrImageLoading(prev => {
                        const newMap = new Map(prev)
                        newMap.set(block._image_url, true)
                        return newMap
                      })
                    }}
                    onError={(e) => {
                      // 图片加载失败时显示占位符
                      setOcrImageLoading(prev => {
                        const newMap = new Map(prev)
                        newMap.set(block._image_url, false)
                        return newMap
                      })
                      const placeholder = e.target.nextElementSibling
                      if (placeholder) {
                        e.target.style.display = 'none'
                        placeholder.style.display = 'flex'
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      return false
                    }}
                    onDragStart={(e) => {
                      e.preventDefault()
                      return false
                    }}
                    onCopy={(e) => {
                      e.preventDefault()
                      return false
                    }}
                    draggable={false}
                  />
                </>
              ) : null}
              {(!block._image_url || block.img_path) && (
                <div 
                  className="ocr-image-placeholder"
                  style={{ 
                    display: block._image_url ? 'none' : 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '20px',
                    background: '#fafafa',
                    borderRadius: 4,
                    border: '1px dashed #d9d9d9'
                  }}
                >
                  <PictureOutlined style={{ fontSize: 32, color: '#8c8c8c', marginBottom: 8 }} />
                  <Text type="secondary">图片: {block.img_path || '未知'}</Text>
                </div>
              )}
            </div>
          ) : (
            <div className={`ocr-text-content ${block.text_level ? 'ocr-heading' : ''}`}>
              {block.text || <Text type="secondary" italic>（无文本内容）</Text>}
            </div>
          )}
        </div>
      </div>
    )
  }

  // 按页面分组内容块
  const groupContentByPage = (contentList) => {
    if (!contentList || !Array.isArray(contentList)) return []
    
    const grouped = {}
    contentList.forEach((block, index) => {
      const pageIdx = block.page_idx || 0
      if (!grouped[pageIdx]) {
        grouped[pageIdx] = []
      }
      grouped[pageIdx].push({ ...block, _originalIndex: index })
    })
    
    return Object.entries(grouped)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([pageIdx, blocks]) => ({
        pageNum: parseInt(pageIdx) + 1,
        blocks
      }))
  }

  // 统计各类型内容块数量
  const getContentStats = (contentList) => {
    if (!contentList || !Array.isArray(contentList)) {
      return { total: 0, text: 0, table: 0, image: 0, other: 0, pages: 0 }
    }
    
    const stats = { total: contentList.length, text: 0, table: 0, image: 0, other: 0 }
    const pages = new Set()
    
    contentList.forEach(block => {
      pages.add(block.page_idx || 0)
      if (block.type === 'text') stats.text++
      else if (block.type === 'table') stats.table++
      else if (block.type === 'image') stats.image++
      else stats.other++
    })
    
    stats.pages = pages.size
    return stats
  }

  // 从 parsed_content 中提取 OCR markdown（兼容多种响应结构）
  const extractMarkdownFromParsedContent = (parsedContent) => {
    if (!parsedContent) return ''

    let parsed = parsedContent
    if (typeof parsedContent === 'string') {
      try {
        parsed = JSON.parse(parsedContent)
      } catch {
        return ''
      }
    }

    if (!parsed || typeof parsed !== 'object') return ''

    const stack = [parsed]
    const seen = new Set()
    let visited = 0
    const maxNodes = 5000

    while (stack.length > 0 && visited < maxNodes) {
      const current = stack.pop()
      visited += 1

      if (!current || typeof current !== 'object') continue
      if (seen.has(current)) continue
      seen.add(current)

      if (typeof current.markdown === 'string' && current.markdown.trim()) {
        return current.markdown
      }

      if (Array.isArray(current)) {
        current.forEach(item => stack.push(item))
      } else {
        Object.values(current).forEach(value => {
          if (value && typeof value === 'object') {
            stack.push(value)
          }
        })
      }
    }

    return ''
  }

  const ensureOcrMarkdownLoaded = async () => {
    if (!document?.id || ocrMarkdownLoading || ocrMarkdownLoaded) return

    setOcrMarkdownLoading(true)
    try {
      const response = await getDocumentDetail(document.id, {
        include_content: true,
        include_versions: false,
        include_patients: false,
        include_extracted: false
      })
      if (response.success && response.data) {
        const markdown = extractMarkdownFromParsedContent(response.data.parsed_content)
        setOcrMarkdown(markdown || '')
      } else {
        setOcrMarkdown('')
      }
      setOcrMarkdownLoaded(true)
    } catch (error) {
      console.error('加载 OCR Markdown 失败:', error)
      setOcrMarkdown('')
      setOcrMarkdownLoaded(true)
    } finally {
      setOcrMarkdownLoading(false)
    }
  }

  const handleOcrDisplayModeChange = async (mode) => {
    setOcrDisplayMode(mode)
    if (mode === 'markdown') {
      await ensureOcrMarkdownLoaded()
    }
  }

  // 渲染 OCR 解析内容
  const renderOcrContent = () => {
    // 加载中状态
    if (detailLoading) {
      return (
        <div className="ocr-content-empty">
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">正在加载 OCR 内容...</Text>
          </div>
        </div>
      )
    }

    // 从文档详情 API 获取 content_list
    const contentList = documentDetail?.content_list || []
    const stats = getContentStats(contentList)
    const groupedContent = groupContentByPage(contentList)
    const markdownContent = (ocrMarkdown || '').trim()

    return (
      <div className="ocr-content-wrapper">
        <div className="ocr-view-switch-bar">
          <Segmented
            size="small"
            value={ocrDisplayMode}
            onChange={handleOcrDisplayModeChange}
            options={[
              { label: '内容块', value: 'blocks' },
              { label: 'Markdown', value: 'markdown' }
            ]}
          />
          {ocrDisplayMode === 'markdown' && ocrMarkdownLoading && (
            <Text type="secondary" style={{ fontSize: 12 }}>加载 Markdown 中...</Text>
          )}
        </div>

        {ocrDisplayMode === 'markdown' ? (
          ocrMarkdownLoading ? (
            <div className="ocr-content-empty">
              <Spin />
            </div>
          ) : markdownContent ? (
            <div className="ocr-markdown-container">
              <MarkdownRenderer content={markdownContent} />
            </div>
          ) : (
            <div className="ocr-content-empty">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无 Markdown 格式 OCR 内容"
              />
            </div>
          )
        ) : !contentList || contentList.length === 0 ? (
          <div className="ocr-content-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                document.isParsed
                  ? '文档已解析，但无可展示的内容块'
                  : '文档尚未解析，请先进行 OCR 解析'
              }
            />
          </div>
        ) : (
          <>
            {/* 统计概览 */}
            <div className="ocr-stats-bar">
              <Space size="middle" wrap>
                <Tag icon={<OrderedListOutlined />}>页数</Tag>
                <Tag icon={<FileTextOutlined />}>文本块</Tag>
                <Tag icon={<TableOutlined />}>表格</Tag>
                <Tag icon={<PictureOutlined />}>图片</Tag>
                {stats.other > 0 && (
                  <Tag>其他</Tag>
                )}
              </Space>
              <span />
            </div>

            {/* 按页面分组展示 */}
            <div className="ocr-pages-container">
              <Collapse
                defaultActiveKey={groupedContent.map((_, i) => String(i))}
                ghost
                size="small"
              >
                {groupedContent.map((page, pageIndex) => (
                  <Panel
                    key={String(pageIndex)}
                    header={
                      <div className="ocr-page-header">
                        <Space>
                          <OrderedListOutlined />
                          <Text strong>第 {page.pageNum} 页</Text>
                          <Text type="secondary">({page.blocks.length} 个内容块)</Text>
                        </Space>
                      </div>
                    }
                  >
                    <div className="ocr-page-content">
                      {page.blocks.map((block) =>
                        renderContentBlock(block, block._originalIndex)
                      )}
                    </div>
                  </Panel>
                ))}
              </Collapse>
            </div>
          </>
        )}
      </div>
    )
  }
  
  // 计算抽取字段数量（从文档详情 API 获取）
  // 注意：API 返回的是 extraction_records 列表，取最新的抽取记录
  const extractionRecords = documentDetail?.extraction_records || []
  const extractedEhrData = extractionRecords[0]?.extracted_ehr_data || {}
  const extractedFieldsCount = convertEhrDataToFields(extractedEhrData).length

  const tabItems = [
    {
      key: 'metadata',
      label: '文档信息',
      children: renderMetadataFields()
    },
    {
      key: 'ocr',
      label: (
        <Space size={4}>
          <FileTextOutlined />
          <span>OCR 内容</span>
        </Space>
      ),
      children: renderOcrContent()
    },
    {
      key: 'extracted',
      label: (
        <Space size={4}>
          <ExperimentOutlined />
          <span>抽取记录</span>
          {detailLoading ? (
            <Spin size="small" style={{ marginLeft: 4 }} />
          ) : (documentDetail?.extraction_count || 0) > 0 ? (
            <Badge count={documentDetail?.extraction_count || 0} size="small" style={{ marginLeft: 4 }} />
          ) : null}
        </Space>
      ),
      children: renderExtractedFields()
    },
    {
      key: 'history',
      label: (
        <Space size={4}>
          <HistoryOutlined />
          <span>操作历史</span>
          {historyLoading ? (
            <Spin size="small" style={{ marginLeft: 4 }} />
          ) : null}
        </Space>
      ),
      children: renderOperationHistory()
    }
  ]

  return (
    <>
    <Modal
      title={
        <div className="modal-header" style={{ width: '100%', paddingRight: 24 }}>
          <Row gutter={16} style={{ width: '100%' }} align="middle">
            <Col span={10}>
              <div className="modal-title">
                <Title level={4} style={{ margin: 0 }}>
                  文档详情
                </Title>
              </div>
            </Col>
            <Col span={14} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 18 }}>
                {renderPatientTag()}
              </div>
              <Space size="middle">
                <StatusIndicator 
                  status={showTaskStatus ? (detailLoading ? 'loading' : (currentStatus || 'pending_confirm_review')) : (document.status || 'pending')} 
                  extractedFieldsCount={document.extractedFields?.length || 0}
                />
                <ConfidenceIndicator confidence={document.confidence} />
              </Space>
            </Col>
          </Row>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width="90%"
      centered
      footer={
        <div className="modal-footer">
          <div className="footer-left">
            <Space>
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleDelete}
                disabled={deleting}
                loading={deleting}
              >
                删除
              </Button>
            </Space>
          </div>
          <div className="footer-right">
            <Space>
              <Button onClick={onClose}>
                关闭
              </Button>
              <Button 
                type="primary" 
                icon={<SaveOutlined />}
                onClick={handleSaveAll}
                disabled={!hasChanges || savingMetadata}
                loading={savingMetadata}
              >
                保存修改
              </Button>
            </Space>
          </div>
        </div>
      }
      closeIcon={<CloseOutlined />}
    >
      <div className="document-detail-content" style={{ height: '75vh', overflow: 'hidden' }}>
        <Row gutter={16} style={{ height: '100%' }}>
          {/* 左侧：文档预览 */}
          <Col span={10} style={{ height: '100%' }}>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              {renderPreviewArea()}
            </div>
          </Col>
          
          {/* 右侧：字段信息 */}
          <Col span={14} style={{ height: '100%' }}>
            <div className="document-fields" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                size="small"
                style={{ height: '100%' }}
                tabBarStyle={{ marginBottom: 16, flexShrink: 0 }}
              />
            </div>
          </Col>
        </Row>
      </div>
    </Modal>

      {/* 合并确认弹窗 */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>AI 抽取完成</span>
          </Space>
        }
        open={mergeModalVisible}
        onCancel={handleCancelMerge}
        footer={[
          <Button key="cancel" onClick={handleCancelMerge}>
            暂不合并
          </Button>,
          <Button 
            key="confirm" 
            type="primary" 
            onClick={handleConfirmMerge}
            loading={merging}
          >
            确认合并到患者病历
          </Button>
        ]}
        width={500}
      >
        <div style={{ padding: '16px 0' }}>
          <Paragraph>
            已成功从文档中抽取 <Text strong style={{ color: '#1677ff' }}>{extractResult?.fields_count || 0}</Text> 个病历字段。
          </Paragraph>
          <Paragraph type="secondary">
            是否将抽取的数据合并到患者的电子病历中？
          </Paragraph>
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            提示：合并后，新抽取的数据将覆盖现有相同字段的值。如有冲突，可在病历变更日志中查看。
          </Paragraph>
        </div>
      </Modal>

      {/* 冲突详情弹窗 */}
      <ConflictDetailModal
        visible={conflictModalVisible}
        extractionId={selectedExtractionId}
        onClose={() => {
          setConflictModalVisible(false)
          setSelectedExtractionId(null)
        }}
        onResolve={() => {
          // 冲突解决后刷新文档详情
          if (document?.id) {
            fetchDocumentDetail(document.id)
          }
        }}
      />

      {/* 可重复字段详情弹窗 */}
      <Modal
        title={selectedArrayField?.fieldName || '字段详情'}
        open={arrayFieldModalVisible}
        onCancel={() => {
          setArrayFieldModalVisible(false)
          setSelectedArrayField(null)
        }}
        footer={[
          <Button key="close" onClick={() => {
            setArrayFieldModalVisible(false)
            setSelectedArrayField(null)
          }}>
            关闭
          </Button>
        ]}
        width={800}
        className="array-field-detail-modal"
      >
        {selectedArrayField && selectedArrayField.isArray && (
          <div className="array-field-records">
            {selectedArrayField.rawValue.map((record, index) => (
              <Card
                key={index}
                size="small"
                title={
                  <Space>
                    <Text strong style={{ fontSize: 14 }}>
                      {selectedArrayField.fieldName} #{index + 1}
                    </Text>
                  </Space>
                }
                style={{ 
                  marginBottom: 16,
                  border: '1px solid #f0f0f0',
                  borderRadius: 6
                }}
              >
                {renderRecordFields(record, selectedArrayField.fieldId)}
              </Card>
            ))}
          </div>
        )}
      </Modal>

      {/* 患者详情侧边栏（文档绑定患者的基本信息，脱敏展示） */}
      <Drawer
        title="患者详情"
        placement="right"
        width={400}
        open={patientDetailModalVisible}
        onClose={() => {
          setPatientDetailModalVisible(false)
          setSelectedPatientForDetail(null)
        }}
        closable
        destroyOnClose
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => { setPatientDetailModalVisible(false); setSelectedPatientForDetail(null) }}>
              关闭
            </Button>
            {selectedPatientForDetail?.patient_id && (
              <Button
                type="primary"
                icon={<LinkOutlined />}
                onClick={() => window.open(`/patient/detail/${selectedPatientForDetail.patient_id}`, '_blank')}
              >
                查看完整档案
              </Button>
            )}
          </div>
        }
      >
        {selectedPatientForDetail && (
          <div style={{ padding: '0 4px' }}>
            {/* 头部：姓名、性别、年龄、患者编号 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space align="start" size={12}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: '#e6f7ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {(selectedPatientForDetail.gender === '女' || selectedPatientForDetail.gender === '女性')
                    ? <WomanOutlined style={{ fontSize: 24, color: '#eb2f96' }} />
                    : <ManOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Title level={4} style={{ margin: 0, marginBottom: 4 }}>
                    {selectedPatientForDetail.patient_name || '--'}
                  </Title>
                  <Space size={8} style={{ marginBottom: 4 }}>
                    <Text type="secondary">{selectedPatientForDetail.gender || '--'}</Text>
                    <Text type="secondary">
                      {selectedPatientForDetail.age != null && selectedPatientForDetail.age !== '' ? `${selectedPatientForDetail.age}岁` : '--'}
                    </Text>
                  </Space>
                  <Space>
                    <Text type="secondary" copyable={{ text: selectedPatientForDetail.patient_code || '' }}>
                      {selectedPatientForDetail.patient_code || '--'}
                    </Text>
                  </Space>
                </div>
              </Space>
            </Card>

            {/* 基本信息 */}
            <Card size="small" title="基本信息" style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CalendarOutlined style={{ color: '#999', width: 16 }} />
                  <Text type="secondary">出生日期：</Text>
                  <Text>{selectedPatientForDetail.birth_date || '--'}</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PhoneOutlined style={{ color: '#999', width: 16 }} />
                  <Text type="secondary">联系电话：</Text>
                  <Text>{selectedPatientForDetail.phone || '--'}</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IdcardOutlined style={{ color: '#999', width: 16 }} />
                  <Text type="secondary">身份证号：</Text>
                  <Text>{selectedPatientForDetail.id_card || '--'}</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <EnvironmentOutlined style={{ color: '#999', width: 16 }} />
                  <Text type="secondary">地址：</Text>
                  <Text style={{ flex: 1 }}>{selectedPatientForDetail.address || '--'}</Text>
                </div>
                {(selectedPatientForDetail.department || selectedPatientForDetail.attending_doctor) && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text type="secondary">科室：</Text>
                      <Text>{selectedPatientForDetail.department || '--'}</Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text type="secondary">主治医生：</Text>
                      <Text>{selectedPatientForDetail.attending_doctor || '--'}</Text>
                    </div>
                  </>
                )}
              </Space>
            </Card>

            {/* 诊断信息 */}
            <Card size="small" title="诊断信息" style={{ marginBottom: 16 }}>
              {(selectedPatientForDetail.diagnoses && selectedPatientForDetail.diagnoses.length > 0) ? (
                <Space wrap size={[8, 8]}>
                  {selectedPatientForDetail.diagnoses.map((d, i) => (
                    <Tag key={i} color="red" style={{ border: '1px solid #ff4d4f', marginBottom: 4 }}>
                      {d}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">--</Text>
              )}
            </Card>

            {/* 档案统计 */}
            <Card size="small" title="档案统计">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileTextOutlined style={{ color: '#1890ff', fontSize: 16 }} />
                <Text type="secondary">关联文档：</Text>
                <Text strong>{selectedPatientForDetail.document_count != null ? selectedPatientForDetail.document_count : '--'}</Text>
              </div>
            </Card>
          </div>
        )}
      </Drawer>
    </>
  )
})

DocumentDetailModal.displayName = 'DocumentDetailModal'

export default DocumentDetailModal