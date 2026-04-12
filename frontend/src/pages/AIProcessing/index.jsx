import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDocumentList, archiveDocument, changeArchivePatient, getDocumentAiMatchInfo, confirmCreatePatientAndArchive, batchCreatePatientAndArchive, confirmAutoArchive, batchConfirmAutoArchive, getDocumentDetail, getDocumentTempUrl, extractEhrData, batchAiMatchAsync } from '../../api/document'
import { getPatientList } from '../../api/patient'
import DocumentDetailModal from '../PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal'
import CreatePatientDrawer from '../../components/Patient/CreatePatientDrawer'
import {
  Card,
  Typography,
  Row,
  Col,
  Button,
  Space,
  Tag,
  List,
  Avatar,
  Progress,
  Modal,
  Select,
  Input,
  Divider,
  Steps,
  Statistic,
  Alert,
  Checkbox,
  Table,
  Tooltip,
  Badge,
  message,
  Popconfirm,
  Timeline,
  Collapse,
  Radio,
  Form,
  Descriptions,
  Empty,
  Spin,
  Drawer,
  Tabs,
  DatePicker
} from 'antd'
import dayjs from 'dayjs'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  UserAddOutlined,
  FileTextOutlined,
  SearchOutlined,
  EditOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  HistoryOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  CheckOutlined,
  CloseOutlined,
  QuestionCircleOutlined,
  BulbOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  ScanOutlined,
  CodeOutlined,
  CopyOutlined
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography
const { Search } = Input
const { Panel } = Collapse

const AIProcessing = () => {
  const navigate = useNavigate()
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [patientMatchVisible, setPatientMatchVisible] = useState(false)
  const [batchConfirmVisible, setBatchConfirmVisible] = useState(false)
  const [qualityCheckVisible, setQualityCheckVisible] = useState(false)
  const [selectedDocs, setSelectedDocs] = useState([]) // 需要确认栏目的选中列表
  const [selectedAutoDocs, setSelectedAutoDocs] = useState([]) // 自动归档栏目的选中列表
  const [selectedNewPatientDocs, setSelectedNewPatientDocs] = useState([]) // 新建患者栏目的选中列表
  const [processingStep, setProcessingStep] = useState(2) // 0: 处理中, 1: 分析中, 2: 审核中, 3: 完成
  
  // 排序状态
  const [needsReviewSort, setNeedsReviewSort] = useState(null) // null | 'confidence_asc' | 'confidence_desc'
  const [newPatientSort, setNewPatientSort] = useState(null) // null | 'name_asc' | 'name_desc'
  const [autoArchivedSort, setAutoArchivedSort] = useState(null) // null | 'confidence_asc' | 'confidence_desc'
  
  const [processedDocs, setProcessedDocs] = useState([]) // 已处理的文档ID列表
  
  // 文档详情弹窗状态
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedDocumentForDetail, setSelectedDocumentForDetail] = useState(null)
  
  // 待确认文档列表状态
  const [needsReviewDocs, setNeedsReviewDocs] = useState([])
  const [needsReviewLoading, setNeedsReviewLoading] = useState(false)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  })
  
  // 患者搜索状态
  const [patientSearchValue, setPatientSearchValue] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState([])
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [selectedMatchPatient, setSelectedMatchPatient] = useState(null) // 选中的待匹配患者
  const searchTimerRef = useRef(null) // 防抖定时器
  const searchVersionRef = useRef(0) // 请求版本号，用于忽略旧请求结果
  
  // 归档加载状态
  const [archivingLoading, setArchivingLoading] = useState(false)
  const [batchMatchLoading, setBatchMatchLoading] = useState(false)
  
  // 自动归档文档列表状态
  const [autoArchivedDocs, setAutoArchivedDocs] = useState([])
  const [autoArchivedLoading, setAutoArchivedLoading] = useState(false)
  const [autoArchivedPagination, setAutoArchivedPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  })
  // 确认自动归档的加载状态
  const [confirmingDocId, setConfirmingDocId] = useState(null)
  const [batchConfirming, setBatchConfirming] = useState(false)

  // 将文档数据转换为 DocumentDetailModal 需要的格式
  const convertDocToDocument = (doc) => {
    // 判断是否已解析：根据文档状态判断
    // 在归档和审核页面，文档通常已经解析过
    const isParsed = true  // 归档和审核页面的文档通常都已解析
    
    // 判断是否已抽取：根据是否有 extractedInfo 判断（现在没有姓名时显示'--'而不是'待AI提取'）
    const isExtracted = !!(doc.extractedInfo && doc.extractedInfo.name && doc.extractedInfo.name !== '--' && doc.extractedInfo.name !== '待AI提取')

    // 从文档数据中获取状态，优先使用 task_status，其次使用 matchResult 映射
    let status = 'pending_confirm_review'  // 默认状态
    if (doc.task_status) {
      status = doc.task_status
    } else if (doc.matchResult) {
      // 将 matchResult 映射到 task_status
      const matchResultMap = {
        'matched': 'pending_confirm_review',
        'new': 'pending_confirm_new',
        'uncertain': 'pending_confirm_uncertain'
      }
      status = matchResultMap[doc.matchResult] || 'pending_confirm_review'
    }

    return {
      id: doc.id,
      fileName: doc.fileName || doc.file_name || doc.documentName || doc.name || '未知文档',
      status: status,  // 使用 task_status，弹窗会从详情 API 中获取最新的 task.status
      confidence: doc.confidence || doc.matchScore || null,
      extractedFields: [],  // 文档列表中没有抽取字段信息，弹窗会从详情中获取
      isParsed: isParsed,
      isExtracted: isExtracted,
      patientId: doc.patientId || doc.matchedPatientId || null
    }
  }

  // 处理文档点击
  const handleDocumentClick = (doc) => {
    const document = convertDocToDocument(doc)
    setSelectedDocumentForDetail(document)
    setDetailModalVisible(true)
  }

  // 处理文档详情弹窗关闭（关闭时刷新列表）
  const handleDetailModalClose = () => {
    setDetailModalVisible(false)
    setSelectedDocumentForDetail(null)
    fetchNeedsReviewDocs()
    fetchAutoArchivedDocs()
    fetchNewPatientDocs()
  }

  // 处理字段保存
  const handleFieldSave = (documentId, editedFields) => {
    console.log('保存字段修改:', documentId, editedFields)
    message.info('字段保存功能待实现')
    // TODO: 实现字段保存功能
  }

  // 处理重新抽取
  const handleReExtract = async (documentId) => {
    try {
      const response = await extractEhrData(documentId)
      if (response.success) {
        message.success('重新抽取成功')
        // 刷新文档列表
        fetchNeedsReviewDocs()
        fetchAutoArchivedDocs()
      } else {
        message.error(response.message || '重新抽取失败')
      }
    } catch (error) {
      console.error('重新抽取失败:', error)
      message.error('重新抽取失败')
    }
  }

  // 处理更换患者
  const handleChangePatient = (documentId) => {
    message.info('更换患者功能待实现')
    // TODO: 实现更换患者功能
  }

  // 处理未绑定文档选择患者归档 - 打开患者匹配详情弹窗
  const handleArchivePatient = async (documentId) => {
    // 从三个列表中查找文档
    const doc = [
      ...needsReviewDocs,
      ...autoArchivedDocs,
      ...newPatientDocs
    ].find(d => d.id === documentId)

    if (!doc) {
      message.warning('文档不存在')
      return
    }

    // 准备选中文档数据用于弹窗展示
    const docData = {
      id: doc.id,
      name: doc.fileName || doc.file_name || doc.name || '未知文档',
      fileName: doc.fileName || doc.file_name,
      createdAt: doc.created_at || doc.createdAt,
      confidence: doc.confidence || doc.matchScore || 0,
      extractedInfo: {},
      candidates: [],
      aiRecommendation: null,
      aiReason: null,
      matchResult: null,
      isFromAutoArchived: false,
      archivedPatientId: null,
      archivedPatientInfo: null
    }

    setSelectedDocument(docData)
    setPatientMatchVisible(true)
    setMatchInfoLoading(true)
    // 重置搜索状态
    setSelectedMatchPatient(null)
    setPatientSearchValue('')
    setPatientSearchResults([])
    setShowSearchResults(false)

    try {
      // 获取文档 AI 匹配信息
      const matchResponse = await getDocumentAiMatchInfo(documentId)
      if (matchResponse.success && matchResponse.data) {
        const matchData = matchResponse.data
        const documentWithInfo = {
          ...docData,
          documentMetadata: matchData.document_metadata || {},
          extractedInfo: matchData.extracted_info || {},
          matchScore: matchData.match_score || 0,
          confidence: matchData.confidence || 0,
          candidates: (matchData.candidates || []).map(c => ({
            id: c.id,
            name: c.name,
            patientCode: c.patient_code,
            similarity: c.similarity || 0,
            matchReasoning: c.match_reasoning,
            keyEvidence: c.key_evidence || [],
            concerns: c.concerns || [],
            matchFeatures: (c.key_evidence && c.key_evidence.length > 0)
              ? c.key_evidence
              : (c.concerns && c.concerns.length > 0)
                ? c.concerns
                : ['待AI分析'],
            gender: c.gender || '',
            age: c.age || ''
          })),
          aiRecommendation: matchData.ai_recommendation,
          aiReason: matchData.ai_reason,
          matchResult: matchData.match_result || 'matched'
        }
        setSelectedDocument(documentWithInfo)
      } else {
        message.error('获取文档匹配信息失败')
        setPatientMatchVisible(false)
        setSelectedDocument(null)
      }
    } catch (error) {
      console.error('获取文档匹配信息失败:', error)
      message.error('获取文档匹配信息失败')
      setPatientMatchVisible(false)
      setSelectedDocument(null)
    } finally {
      setMatchInfoLoading(false)
    }
  }

  // 处理下载文档
  const handleDownload = async (documentId) => {
    try {
      const response = await getDocumentTempUrl(documentId)
      if (response.success && response.data?.temp_url) {
        window.open(response.data.temp_url, '_blank')
      } else {
        message.error('获取文档URL失败')
      }
    } catch (error) {
      console.error('下载文档失败:', error)
      message.error('下载文档失败')
    }
  }

  // 处理查看 OCR
  const handleViewOcr = (documentId) => {
    window.open(`/document/ocr-viewer/${documentId}`, '_blank')
  }

  // 处理抽取成功
  const handleExtractSuccess = () => {
    // 刷新文档列表
    fetchNeedsReviewDocs()
    fetchAutoArchivedDocs()
  }

  const normalizeValue = (value) => (value || '').toString().trim()

  // 标识符等价组：院内常为同一套编号，合并分组时视作重合
  const IDENTIFIER_EQUIVALENCE_GROUPS = {
    inpatient: ['住院号', '病案号', 'MRN'],
    outpatient: ['门诊号', '急诊号']
  }
  const getCanonicalKey = (type, value) => {
    for (const [groupKey, types] of Object.entries(IDENTIFIER_EQUIVALENCE_GROUPS)) {
      if (types.includes(type)) return `${groupKey}:${value}`
    }
    return `${type}:${value}`
  }

  // 从文档数据中提取唯一标识符（病案号、住院号、门诊号等）
  // 返回格式：["病案号:123456", "住院号:H001"] - 类型和编号组合
  const getDocumentIdentifiers = (doc) => {
    const identifiers = []
    // 优先使用后端返回的 identifiers 字段
    const docIdentifiers = doc.identifiers || []
    if (Array.isArray(docIdentifiers)) {
      docIdentifiers.forEach(item => {
        if (item && typeof item === 'object') {
          const type = normalizeValue(item['标识符类型'] || item.type)
          const value = normalizeValue(item['标识符编号'] || item.value)
          if (type && value) {
            // 格式：类型:编号，确保同类型同编号才会匹配
            identifiers.push(`${type}:${value}`)
          }
        }
      })
    }
    return identifiers
  }

  const groupDocumentsByIdentifiers = (docs) => {
    if (!docs.length) return []
    const parent = docs.map((_, index) => index)
    const find = (x) => {
      if (parent[x] !== x) parent[x] = find(parent[x])
      return parent[x]
    }
    const union = (a, b) => {
      const rootA = find(a)
      const rootB = find(b)
      if (rootA !== rootB) parent[rootB] = rootA
    }

    const identifierMap = new Map()
    const identifiersByIndex = docs.map(doc => getDocumentIdentifiers(doc))
    identifiersByIndex.forEach((identifiers, index) => {
      identifiers.forEach(identifier => {
        const colonIdx = identifier.indexOf(':')
        const type = colonIdx === -1 ? '' : identifier.slice(0, colonIdx)
        const value = colonIdx === -1 ? identifier : identifier.slice(colonIdx + 1)
        const canonicalKey = getCanonicalKey(type, value)
        if (identifierMap.has(canonicalKey)) {
          union(index, identifierMap.get(canonicalKey))
        } else {
          identifierMap.set(canonicalKey, index)
        }
      })
    })

    const groupMap = new Map()
    docs.forEach((doc, index) => {
      const root = find(index)
      if (!groupMap.has(root)) {
        groupMap.set(root, { items: [], identifiers: new Set(), order: index })
      }
      const group = groupMap.get(root)
      group.items.push(doc)
      identifiersByIndex[index].forEach(identifier => group.identifiers.add(identifier))
    })

    return Array.from(groupMap.values()).sort((a, b) => a.order - b.order)
  }

  // 获取文档对应的「将要创建的患者姓名」（与展示/合并逻辑一致：优先 documentMetadata）
  const getPatientNameForCreate = (doc) => {
    const name = (doc.documentMetadata?.name ?? doc.extractedInfo?.name ?? '').toString().trim()
    return name || ''
  }

  // 隔离逻辑：合并后若同组内将要创建的患者姓名不一致，则按姓名拆成多组
  const isolateGroupsByPatientName = (groups) => {
    const result = []
    for (const group of groups) {
      const byName = new Map()
      for (const item of group.items) {
        const name = getPatientNameForCreate(item)
        if (!byName.has(name)) byName.set(name, [])
        byName.get(name).push(item)
      }
      if (byName.size <= 1) {
        result.push(group)
        continue
      }
      let subOrder = 0
      for (const [, items] of byName) {
        const identifiers = new Set()
        items.forEach(doc => getDocumentIdentifiers(doc).forEach(id => identifiers.add(id)))
        result.push({ items, identifiers, order: group.order + subOrder * 0.001 })
        subOrder += 1
      }
    }
    return result.sort((a, b) => a.order - b.order)
  }

  // 将等价组内同编号的多个标识符合并为一条展示，如 住院号:521723 + 病案号:521723 => 住院号/病案号:521723
  const mergeIdentifiersForDisplay = (identifiersSet) => {
    const byCanonical = new Map()
    identifiersSet.forEach(identifier => {
      const colonIdx = identifier.indexOf(':')
      if (colonIdx === -1) return
      const type = identifier.slice(0, colonIdx)
      const value = identifier.slice(colonIdx + 1)
      const canonicalKey = getCanonicalKey(type, value)
      if (!byCanonical.has(canonicalKey)) {
        byCanonical.set(canonicalKey, { types: new Set(), value })
      }
      byCanonical.get(canonicalKey).types.add(type)
    })
    const typeOrder = [...IDENTIFIER_EQUIVALENCE_GROUPS.inpatient, ...IDENTIFIER_EQUIVALENCE_GROUPS.outpatient]
    return Array.from(byCanonical.entries()).map(([, { types, value }]) => {
      const typesArr = Array.from(types).sort((a, b) => {
        const ia = typeOrder.indexOf(a)
        const ib = typeOrder.indexOf(b)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return String(a).localeCompare(b)
      })
      const label = typesArr.join('/')
      return `${label}:${value}`
    })
  }

  // 根据标识符类型返回显示标签和颜色（支持合并后的 "住院号/病案号:521723" 格式）
  const formatIdentifierTag = (identifier) => {
    const colonIndex = identifier.lastIndexOf(':')
    if (colonIndex === -1) {
      return { label: '唯一标识', value: identifier, color: 'default' }
    }
    const labelPart = identifier.slice(0, colonIndex)
    const value = identifier.slice(colonIndex + 1)
    const type = labelPart.includes('/') ? labelPart.split('/')[0] : labelPart

    const colorMap = {
      '病案号': 'purple',
      '住院号': 'blue',
      '门诊号': 'cyan',
      '急诊号': 'orange',
      'MRN': 'green',
      '医保号': 'gold',
      '社保号': 'lime',
      '健康卡号': 'magenta',
      '身份证号': 'geekblue',
      'ID号': 'default'
    }

    return {
      label: labelPart,
      value,
      color: colorMap[type] || 'default'
    }
  }

  const getBatchMatchTargets = (patientInfo, excludeIds = []) => {
    const excludeSet = new Set(excludeIds)
    const idCard = normalizeValue(patientInfo?.id_card)
    const phone = normalizeValue(patientInfo?.phone)
    const name = normalizeValue(patientInfo?.name)

    const targets = newPatientDocs.filter(doc => {
      if (excludeSet.has(doc.id)) return false
      const info = doc.extractedInfo || {}
      if (idCard) return normalizeValue(info.id_number) === idCard
      if (phone) return normalizeValue(info.phone) === phone
      if (name) return normalizeValue(info.name) === name
      return false
    })

    return Array.from(new Set(targets.map(doc => doc.id)))
  }

  const handleBatchAiMatch = async (documentIds, patientName) => {
    if (!documentIds.length) return
    setBatchMatchLoading(true)
    try {
      const response = await batchAiMatchAsync(documentIds)
      if (response?.success) {
        message.success(`已对 ${documentIds.length} 个文档启动匹配推荐${patientName ? `（${patientName}）` : ''}`)
        setTimeout(() => {
          fetchNewPatientDocs()
          fetchNeedsReviewDocs()
        }, 300)
      } else {
        message.error(response?.message || '批量匹配推荐启动失败')
      }
    } catch (error) {
      console.error('批量匹配推荐启动失败:', error)
      message.error(error.response?.data?.message || '批量匹配推荐启动失败')
    } finally {
      setBatchMatchLoading(false)
    }
  }

  const promptBatchMatchForSamePerson = (patientInfo, excludeIds = []) => {
    const targetIds = getBatchMatchTargets(patientInfo, excludeIds)
    if (!targetIds.length) return
    Modal.confirm({
      title: '对同患者文档批量匹配推荐？',
      content: `检测到 ${targetIds.length} 个可能属于同一患者的文档，是否立即批量匹配推荐？`,
      okText: '开始匹配',
      cancelText: '稍后',
      onOk: () => handleBatchAiMatch(targetIds, patientInfo?.name)
    })
  }
  
  // AI 抽取结果查看弹窗状态
  const [extractionResultVisible, setExtractionResultVisible] = useState(false)
  const [extractionResultData, setExtractionResultData] = useState(null)
  const [extractionResultLoading, setExtractionResultLoading] = useState(false)
  const [extractionDocName, setExtractionDocName] = useState('')

  // 原文档/提取数据预览抽屉
  const [docPreviewVisible, setDocPreviewVisible] = useState(false)
  const [docPreviewLoading, setDocPreviewLoading] = useState(false)
  const [docPreviewDocumentId, setDocPreviewDocumentId] = useState(null)
  const [docPreviewName, setDocPreviewName] = useState('')
  const [docPreviewTempUrl, setDocPreviewTempUrl] = useState('')
  const [docPreviewFileType, setDocPreviewFileType] = useState('')
  const [docPreviewExtractionRecord, setDocPreviewExtractionRecord] = useState(null)
  const [docPreviewTab, setDocPreviewTab] = useState('original')
  
  // 新建患者文档列表状态
  const [newPatientDocs, setNewPatientDocs] = useState([])
  const [newPatientLoading, setNewPatientLoading] = useState(false)
  const [newPatientPagination, setNewPatientPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  })
  
  // 编辑患者信息抽屉状态
  const [editPatientVisible, setEditPatientVisible] = useState(false)
  const [editingPatientItem, setEditingPatientItem] = useState(null)
  const [editPatientForm] = Form.useForm()

  // 默认的 AI 解析假数据模板（用于已解析但 AI 提取结果未准备好的文档）
  const defaultExtractedData = {
    extractedInfo: { 
      name: '待AI提取', 
      gender: '--', 
      age: '--', 
      reportDate: '--',
      reportType: '待AI识别'
    },
    confidence: 70,
    candidates: [
      { 
        id: 'P001', 
        name: '张三', 
        gender: '男', 
        age: 45, 
        similarity: 78,
        lastVisit: '2024-01-10',
        department: '心内科',
        matchFeatures: ['OCR已完成', '待AI分析']
      },
      { 
        id: 'P002', 
        name: '李四', 
        gender: '女', 
        age: 38, 
        similarity: 65,
        lastVisit: '2024-01-12',
        department: '消化科',
        matchFeatures: ['OCR已完成', '待AI分析']
      }
    ],
    aiRecommendation: 'P001',
    aiReason: 'OCR解析已完成，AI智能匹配功能开发中，请手动选择或确认推荐患者'
  }

  // 获取待确认文档列表（生命周期状态为 pending_confirm_review 或 pending_confirm_uncertain）
  const fetchNeedsReviewDocs = useCallback(async () => {
    setNeedsReviewLoading(true)
    try {
      const response = await getDocumentList({
        page: pagination.current,
        page_size: pagination.pageSize,
        task_status: 'pending_confirm_review,pending_confirm_uncertain'  // 待确认-审核、待确认-不确定
      })
      
      if (response.success && response.data) {
        // 先转换基础文档信息
        const basicDocs = response.data.map(doc => ({
          id: doc.id,
          name: doc.file_name,
          fileName: doc.file_name,  // 确保有 fileName 字段用于文档详情弹窗
          fileType: doc.file_type,
          filePath: doc.file_path,
          fileSize: doc.file_size,
          isParsed: doc.is_parsed,
          documentType: doc.document_type,
          documentSubType: doc.document_sub_type,
          createdAt: doc.created_at,
          // 先使用默认值，后续会被 AI 匹配信息覆盖
          extractedInfo: defaultExtractedData.extractedInfo,
          confidence: defaultExtractedData.confidence,
          candidates: defaultExtractedData.candidates || [],  // 确保是数组
          aiRecommendation: defaultExtractedData.aiRecommendation,
          aiReason: defaultExtractedData.aiReason
        }))
        
        // 批量获取 AI 匹配信息
        const aiMatchPromises = basicDocs.map(doc => 
          getDocumentAiMatchInfo(doc.id).catch(err => {
            console.warn(`获取文档 ${doc.id} AI匹配信息失败:`, err)
            return null
          })
        )
        
        const aiMatchResults = await Promise.all(aiMatchPromises)
        
        // 合并 AI 匹配信息到文档数据
        const transformedDocs = basicDocs.map((doc, index) => {
          const aiMatch = aiMatchResults[index]
          if (aiMatch && aiMatch.success && aiMatch.data) {
            const matchData = aiMatch.data
            return {
              ...doc,
              documentMetadata: matchData.document_metadata || {},
              extractedInfo: {
                name: matchData.extracted_info?.name || '--',
                gender: matchData.extracted_info?.gender || '--',
                age: matchData.extracted_info?.age || '--',
                birthDate: matchData.extracted_info?.birth_date,
                phone: matchData.extracted_info?.phone,
                idNumber: matchData.extracted_info?.id_number,
                address: matchData.extracted_info?.address
              },
              // 唯一标识符（病案号、住院号等）
              identifiers: matchData.identifiers || [],
              confidence: matchData.confidence || matchData.match_score || 0,
              matchResult: matchData.match_result,
              matchScore: matchData.match_score,
              candidates: (matchData.candidates || []).map(c => ({
                id: c.id,
                name: c.name,
                patientCode: c.patient_code,
                similarity: c.similarity || 0,
                matchReasoning: c.match_reasoning,
                keyEvidence: c.key_evidence || [],
                concerns: c.concerns || [],
                // 添加缺失的字段，避免渲染错误
                matchFeatures: (c.key_evidence && c.key_evidence.length > 0) 
                  ? c.key_evidence 
                  : (c.concerns && c.concerns.length > 0) 
                    ? c.concerns 
                    : ['待AI分析'],  // 使用关键证据或疑虑作为匹配特征，如果都没有则使用默认值
                department: '待确认',
                lastVisit: '待确认'
              })),
              aiRecommendation: matchData.ai_recommendation,
              aiReason: matchData.ai_reason,
              extractionId: matchData.extraction_id,
              extractionTime: matchData.extraction_time
            }
          }
          // 如果没有 AI 匹配数据，确保 candidates 数组存在且每个候选者都有完整的结构
          return {
            ...doc,
            candidates: doc.candidates.map(c => ({
              ...c,
              matchFeatures: c.matchFeatures || ['待AI分析'],  // 确保 matchFeatures 存在
              keyEvidence: c.keyEvidence || [],
              concerns: c.concerns || []
            }))
          }
        })
        
        setNeedsReviewDocs(transformedDocs)
        setPagination(prev => ({
          ...prev,
          total: response.pagination?.total || 0
        }))
      }
    } catch (error) {
      console.error('获取待确认文档失败:', error)
      message.error('获取待确认文档失败')
    } finally {
      setNeedsReviewLoading(false)
    }
  }, [pagination.current, pagination.pageSize])

  // 获取自动归档文档列表（status=archived + match_result=matched + requires_review=false）
  const fetchAutoArchivedDocs = useCallback(async () => {
    setAutoArchivedLoading(true)
    try {
      const response = await getDocumentList({
        page: autoArchivedPagination.current,
        page_size: autoArchivedPagination.pageSize,
        task_status: 'auto_archived'  // 虚拟状态，后端会解析为自动归档条件
      })
      
      if (response.success && response.data) {
        // 转换为前端需要的格式
        const transformedDocs = response.data.map(doc => ({
          id: doc.id,
          name: doc.file_name,
          fileName: doc.file_name,  // 确保有 fileName 字段用于文档详情弹窗
          fileType: doc.file_type,
          filePath: doc.file_path,
          createdAt: doc.created_at,
          documentType: doc.document_type,
          documentSubType: doc.document_sub_type,
          // 自动归档文档的信息
          confidence: 'high',  // 自动归档的都是高置信度
          extractedFields: 0,  // 暂时不展示
          processingTime: '--'
        }))
        
        // 批量获取 AI 匹配信息以获取患者名称等详情
        const aiMatchPromises = transformedDocs.map(doc =>
          getDocumentAiMatchInfo(doc.id).catch(err => {
            console.warn(`获取文档 ${doc.id} AI匹配信息失败:`, err)
            return null
          })
        )
        
        const aiMatchResults = await Promise.all(aiMatchPromises)
        
        // 合并 AI 匹配信息
        const enrichedDocs = transformedDocs.map((doc, index) => {
          const aiMatch = aiMatchResults[index]
          if (aiMatch && aiMatch.success && aiMatch.data) {
            const matchData = aiMatch.data
            const recommendedPatient = matchData.candidates?.find(c => c.id === matchData.ai_recommendation)
            return {
              ...doc,
              patientName: matchData.extracted_info?.name || recommendedPatient?.name || '未知',
              patientId: matchData.ai_recommendation,
              matchScore: matchData.match_score || 0,
              extractedInfo: matchData.extracted_info,
              // 唯一标识符（病案号、住院号等）
              identifiers: matchData.identifiers || [],
              confidence: matchData.match_score >= 90 ? 'high' : matchData.match_score >= 70 ? 'medium' : 'low',
              // 保存完整的匹配信息，用于匹配详情弹窗
              candidates: (matchData.candidates || []).map(c => ({
                id: c.id,
                name: c.name,
                patientCode: c.patient_code,
                similarity: c.similarity || 0,
                matchReasoning: c.match_reasoning,
                keyEvidence: c.key_evidence || [],
                concerns: c.concerns || [],
                matchFeatures: (c.key_evidence && c.key_evidence.length > 0) 
                  ? c.key_evidence 
                  : (c.concerns && c.concerns.length > 0) 
                    ? c.concerns 
                    : ['待AI分析'],
                department: '待确认',
                lastVisit: '待确认',
                gender: c.gender || '',
                age: c.age || ''
              })),
              aiRecommendation: matchData.ai_recommendation,
              aiReason: matchData.ai_reason,
              matchResult: matchData.match_result || 'matched'
            }
          }
          return doc
        })
        
        setAutoArchivedDocs(enrichedDocs)
        setAutoArchivedPagination(prev => ({
          ...prev,
          total: response.pagination?.total || 0
        }))
      }
    } catch (error) {
      console.error('获取自动归档文档失败:', error)
      message.error('获取自动归档文档失败')
    } finally {
      setAutoArchivedLoading(false)
    }
  }, [autoArchivedPagination.current, autoArchivedPagination.pageSize])

  // 查看 AI 抽取结果
  const handleViewExtractionResult = async (documentId, documentName) => {
    setExtractionDocName(documentName || '文档')
    setExtractionResultVisible(true)
    setExtractionResultLoading(true)
    setExtractionResultData(null)
    
    try {
      const response = await getDocumentDetail(documentId, { include_extracted: true })
      if (response.success && response.data) {
        const extractionRecords = response.data.extraction_records || []
        if (extractionRecords.length > 0) {
          // 取最新的抽取记录
          setExtractionResultData(extractionRecords[0])
        } else {
          message.warning('该文档暂无 AI 抽取结果')
          setExtractionResultVisible(false)
        }
      } else {
        message.error(response.message || '获取抽取结果失败')
        setExtractionResultVisible(false)
      }
    } catch (error) {
      console.error('获取抽取结果失败:', error)
      message.error('获取抽取结果失败')
      setExtractionResultVisible(false)
    } finally {
      setExtractionResultLoading(false)
    }
  }
  
  // 复制 JSON 到剪贴板
  const handleCopyJson = () => {
    if (extractionResultData?.extracted_ehr_data) {
      const jsonStr = JSON.stringify(extractionResultData.extracted_ehr_data, null, 2)
      navigator.clipboard.writeText(jsonStr).then(() => {
        message.success('已复制到剪贴板')
      }).catch(() => {
        message.error('复制失败')
      })
    }
  }

  // 确认单个自动归档文档
  const handleConfirmAutoArchive = async (documentId) => {
    setConfirmingDocId(documentId)
    try {
      const response = await confirmAutoArchive(documentId)
      if (response.success) {
        message.success('确认归档成功')
        // 从列表中移除已确认的文档
        setAutoArchivedDocs(prev => prev.filter(doc => doc.id !== documentId))
        setSelectedAutoDocs(prev => prev.filter(id => id !== documentId))
      } else {
        message.error(response.message || '确认归档失败')
      }
    } catch (error) {
      console.error('确认归档失败:', error)
      message.error('确认归档失败')
    } finally {
      setConfirmingDocId(null)
    }
  }

  // 批量确认自动归档文档
  const handleBatchConfirmAutoArchive = async (ids) => {
    const documentIds = ids || autoArchivedDocs.map(doc => doc.id)
    
    if (documentIds.length === 0) {
      message.info('没有待确认的自动归档文档')
      return
    }
    
    setBatchConfirming(true)
    try {
      const response = await batchConfirmAutoArchive(documentIds)
      if (response.success) {
        message.success(`确认完成：成功 ${response.data.success_count} 个，失败 ${response.data.failed_count} 个`)
        // 刷新列表
        fetchAutoArchivedDocs()
        if (ids) setSelectedAutoDocs([]) // 如果是指定ID批量，则清空选中
      } else {
        message.error(response.message || '批量确认失败')
      }
    } catch (error) {
      console.error('批量确认失败:', error)
      message.error('批量确认失败')
    } finally {
      setBatchConfirming(false)
    }
  }

  // 排序后的文档列表
  const sortedNeedsReviewDocs = useMemo(() => {
    let docs = [...needsReviewDocs]
    if (needsReviewSort === 'confidence_desc') {
      docs.sort((a, b) => (b.confidence || b.matchScore || 0) - (a.confidence || a.matchScore || 0))
    } else if (needsReviewSort === 'confidence_asc') {
      docs.sort((a, b) => (a.confidence || a.matchScore || 0) - (b.confidence || b.matchScore || 0))
    }
    return docs
  }, [needsReviewDocs, needsReviewSort])

  const sortedNewPatientDocs = useMemo(() => {
    let docs = [...newPatientDocs]
    if (newPatientSort === 'name_desc' || newPatientSort === 'name_asc') {
      docs.sort((a, b) => {
        const nameA = a.extractedInfo?.name || ''
        const nameB = b.extractedInfo?.name || ''
        if (newPatientSort === 'name_desc') {
          return nameB.localeCompare(nameA, 'zh-CN')
        } else {
          return nameA.localeCompare(nameB, 'zh-CN')
        }
      })
    }
    return docs
  }, [newPatientDocs, newPatientSort])

  const visibleNewPatientDocs = useMemo(
    () => sortedNewPatientDocs.filter(doc => !processedDocs.includes(doc.id)),
    [sortedNewPatientDocs, processedDocs]
  )
  const groupedNewPatientDocs = useMemo(() => {
    const groups = groupDocumentsByIdentifiers(visibleNewPatientDocs)
    return isolateGroupsByPatientName(groups)
  }, [visibleNewPatientDocs])

  const sortedAutoArchivedDocs = useMemo(() => {
    let docs = [...autoArchivedDocs]
    if (autoArchivedSort === 'confidence_desc') {
      docs.sort((a, b) => (b.matchScore || b.confidence || 0) - (a.matchScore || a.confidence || 0))
    } else if (autoArchivedSort === 'confidence_asc') {
      docs.sort((a, b) => (a.matchScore || a.confidence || 0) - (b.matchScore || b.confidence || 0))
    }
    return docs
  }, [autoArchivedDocs, autoArchivedSort])

  const groupedAutoArchivedDocs = useMemo(
    () => groupDocumentsByIdentifiers(sortedAutoArchivedDocs),
    [sortedAutoArchivedDocs]
  )

  // 获取新建患者文档列表（status=pending_confirm_new）
  const fetchNewPatientDocs = useCallback(async () => {
    setNewPatientLoading(true)
    try {
      const response = await getDocumentList({
        page: newPatientPagination.current,
        page_size: newPatientPagination.pageSize,
        task_status: 'pending_confirm_new'  // 待确认-新患者
      })
      
      if (response.success && response.data) {
        // 转换为前端需要的格式
        const transformedDocs = response.data.map(doc => ({
          id: doc.id,
          fileName: doc.file_name,
          fileType: doc.file_type,
          filePath: doc.file_path,
          createdAt: doc.created_at,
          documentType: doc.document_type,
          documentSubType: doc.document_sub_type
        }))
        
        // 批量获取 AI 匹配信息以获取患者信息
        const aiMatchPromises = transformedDocs.map(doc =>
          getDocumentAiMatchInfo(doc.id).catch(err => {
            console.warn(`获取文档 ${doc.id} AI匹配信息失败:`, err)
            return null
          })
        )
        
        const aiMatchResults = await Promise.all(aiMatchPromises)
        
        // 合并 AI 匹配信息
        const enrichedDocs = transformedDocs.map((doc, index) => {
          const aiMatch = aiMatchResults[index]
          if (aiMatch && aiMatch.success && aiMatch.data) {
            const matchData = aiMatch.data
            const extractedInfo = matchData.extracted_info || {}
            return {
              ...doc,
              // 新患者的基本信息（从AI抽取）
              name: extractedInfo.name || '未知姓名',
              gender: extractedInfo.gender || '--',
              age: extractedInfo.age || '--',
              phone: extractedInfo.phone || '--',
              idNumber: extractedInfo.id_number || '--',
              address: extractedInfo.address || '--',
              birthDate: extractedInfo.birth_date || '--',
              extractedInfo: extractedInfo,
              // 唯一标识符（病案号、住院号等）
              identifiers: matchData.identifiers || [],
              // 匹配置信度
              confidence: matchData.confidence || matchData.match_score || 0,
              matchScore: matchData.match_score || 0,
              matchResult: matchData.match_result || 'new',
              // 保存完整的匹配信息，用于匹配详情弹窗
              candidates: (matchData.candidates || []).map(c => ({
                id: c.id,
                name: c.name,
                patientCode: c.patient_code,
                similarity: c.similarity || 0,
                matchReasoning: c.match_reasoning,
                keyEvidence: c.key_evidence || [],
                concerns: c.concerns || [],
                matchFeatures: (c.key_evidence && c.key_evidence.length > 0) 
                  ? c.key_evidence 
                  : (c.concerns && c.concerns.length > 0) 
                    ? c.concerns 
                    : ['待AI分析'],
                department: '待确认',
                lastVisit: '待确认',
                gender: c.gender || '',
                age: c.age || ''
              })),
              aiRecommendation: matchData.ai_recommendation,
              aiReason: matchData.ai_reason || ''
            }
          }
          return {
            ...doc,
            name: '未知姓名',
            gender: '--',
            age: '--',
            extractedInfo: {},
            confidence: 0,
            candidates: [],
            aiRecommendation: null,
            aiReason: ''
          }
        })
        
        setNewPatientDocs(enrichedDocs)
        setNewPatientPagination(prev => ({
          ...prev,
          total: response.pagination?.total || 0
        }))
      }
    } catch (error) {
      console.error('获取新建患者文档失败:', error)
      message.error('获取新建患者文档失败')
    } finally {
      setNewPatientLoading(false)
    }
  }, [newPatientPagination.current, newPatientPagination.pageSize])

  // 组件挂载时获取文档列表
  useEffect(() => {
    fetchNeedsReviewDocs()
    fetchAutoArchivedDocs()
    fetchNewPatientDocs()
  }, [fetchNeedsReviewDocs, fetchAutoArchivedDocs, fetchNewPatientDocs])

  // 搜索患者（带防抖和版本控制，确保只显示最新请求结果）
  const handlePatientSearch = (value) => {
    setPatientSearchValue(value)
    
    // 清除之前的定时器
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }
    
    // 每次输入都递增版本号
    searchVersionRef.current += 1
    const currentVersion = searchVersionRef.current
    
    // 空搜索时不显示结果，等待用户输入
    if (!value || value.trim().length < 1) {
      setShowSearchResults(false)
      setPatientSearchResults([])
      setPatientSearchLoading(false)
      return
    }
    
    // 只要有输入变化，立即显示加载状态，清空旧结果
    setPatientSearchLoading(true)
    setShowSearchResults(true)
    setPatientSearchResults([]) // 清空旧结果，避免显示过时数据
    
    // 设置防抖定时器，500ms 后执行搜索
    searchTimerRef.current = setTimeout(async () => {
      try {
        const response = await getPatientList({
          page: 1,
          page_size: 10,
          search: value.trim()
        })
        
        // 只有当前请求版本是最新的，才更新结果
        if (currentVersion === searchVersionRef.current) {
          if (response.success && response.data) {
            setPatientSearchResults(response.data)
          } else {
            setPatientSearchResults([])
          }
          setPatientSearchLoading(false)
        }
        // 如果不是最新版本，忽略结果，保持 loading 状态
      } catch (error) {
        console.error('搜索患者失败:', error)
        // 只有当前请求版本是最新的，才更新状态
        if (currentVersion === searchVersionRef.current) {
          setPatientSearchResults([])
          setPatientSearchLoading(false)
        }
      }
    }, 500)
  }
  
  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
      }
    }
  }, [])

  // 选择搜索结果中的患者（填入输入框，不直接归档）
  const handleSelectSearchPatient = (patient) => {
    // 设置选中的患者
    setSelectedMatchPatient(patient)
    // 将患者姓名填入输入框
    setPatientSearchValue(patient.name)
    // 隐藏搜索结果
    setShowSearchResults(false)
  }
  
  // 确认匹配/更换按钮 - 调用归档或更换接口
  const handleConfirmPatientMatch = async () => {
    if (!selectedDocument) {
      message.warning('缺少文档信息')
      return
    }
    
    if (!selectedMatchPatient) {
      message.warning('请先选择一个患者')
      return
    }
    
    // 判断是否来自自动归档区域（需要更换归档）
    const isFromAutoArchived = selectedDocument?.isFromAutoArchived || false
    
    // 显示确认弹窗
    Modal.confirm({
      title: isFromAutoArchived ? '确认更换归档患者' : '确认归档文档',
      content: isFromAutoArchived ? '确定要将文档更换归档到该患者吗？' : '确定要将文档归档到该患者吗？',
      okText: isFromAutoArchived ? '确认更换' : '确认归档',
      cancelText: '取消',
      centered: true,
      wrapClassName: 'confirm-modal-up',
      onOk: async () => {
    setArchivingLoading(true)
    try {
          let response
          if (isFromAutoArchived) {
            // 调用更换归档患者接口
            response = await changeArchivePatient(selectedDocument.id, selectedMatchPatient.id, {
              revokeLastMerge: true,
              autoMergeEhr: true
            })
          } else {
            // 调用归档接口
            response = await archiveDocument(selectedDocument.id, selectedMatchPatient.id)
          }
      
      if (response.success) {
            message.success(
              isFromAutoArchived 
                ? `文档已更换归档到患者: ${selectedMatchPatient.name}`
                : `文档已归档到患者: ${selectedMatchPatient.name}`
            )
        // 添加到已处理列表，触发消失动画
        setProcessedDocs(prev => [...prev, selectedDocument.id])
        // 关闭弹窗并清空搜索状态
        setPatientMatchVisible(false)
        setPatientSearchValue('')
        setPatientSearchResults([])
        setShowSearchResults(false)
        setSelectedMatchPatient(null)
            // 刷新列表
        fetchNeedsReviewDocs()
            fetchAutoArchivedDocs()
            fetchNewPatientDocs()
      } else {
            message.error(response.message || (isFromAutoArchived ? '更换归档失败' : '归档失败'))
      }
    } catch (error) {
          console.error(isFromAutoArchived ? '确认更换归档失败:' : '确认匹配归档失败:', error)
          message.error(error.response?.data?.message || (isFromAutoArchived ? '更换归档失败' : '归档失败'))
    } finally {
      setArchivingLoading(false)
    }
  }
    })
  }

  // 打开“原文档 / 提取数据”预览
  const openDocumentPreview = async (documentId, documentName) => {
    if (!documentId) return
    setDocPreviewVisible(true)
    setDocPreviewLoading(true)
    setDocPreviewDocumentId(documentId)
    setDocPreviewName(documentName || '文档')
    setDocPreviewTempUrl('')
    setDocPreviewFileType('')
    setDocPreviewExtractionRecord(null)
    setDocPreviewTab('original')

    try {
      const [tempUrlRes, detailRes] = await Promise.all([
        getDocumentTempUrl(documentId).catch(err => ({ success: false, error: err })),
        getDocumentDetail(documentId, { include_extracted: true }).catch(err => ({ success: false, error: err }))
      ])

      if (tempUrlRes?.success && tempUrlRes?.data?.temp_url) {
        setDocPreviewTempUrl(tempUrlRes.data.temp_url)
        setDocPreviewFileType(tempUrlRes.data.file_type || '')
      }

      if (detailRes?.success && detailRes?.data) {
        const records = detailRes.data.extraction_records || []
        setDocPreviewExtractionRecord(records.length > 0 ? records[0] : null)
        // 兜底：有些情况下 temp-url 失败，但 doc detail 里能拿到 file_type
        if (!tempUrlRes?.success) {
          setDocPreviewFileType(detailRes.data.file_type || '')
        }
      }

      if (!tempUrlRes?.success && !detailRes?.success) {
        message.error('加载文档预览失败')
      }
    } catch (e) {
      console.error('加载文档预览失败:', e)
      message.error('加载文档预览失败')
    } finally {
      setDocPreviewLoading(false)
    }
  }

  // 从“需要确认/手动选择”弹窗创建新患者并归档
  const handleCreatePatientAndArchiveFromModal = () => {
    if (!selectedDocument?.id) {
      message.warning('缺少文档信息')
      return
    }

    // 将 selectedDocument 转换为 editingPatientItem 格式
    const patientItem = {
      id: selectedDocument.id,
      fileName: selectedDocument.name || selectedDocument.fileName || '未知文档',
      name: selectedDocument.extractedInfo?.name || '',
      gender: selectedDocument.extractedInfo?.gender || '--',
      age: selectedDocument.extractedInfo?.age || '--',
      birthDate: selectedDocument.extractedInfo?.birth_date || '--',
      phone: selectedDocument.extractedInfo?.phone || '--',
      idNumber: selectedDocument.extractedInfo?.id_number || '--',
      address: selectedDocument.extractedInfo?.address || '--'
    }

    // 设置表单字段值
    editPatientForm.setFieldsValue({
      name: patientItem.name || '',
      gender: patientItem.gender && patientItem.gender !== '--' ? patientItem.gender : '',
      age: patientItem.age && patientItem.age !== '--' ? patientItem.age : '',
      birthDate: patientItem.birthDate && patientItem.birthDate !== '--' ? dayjs(patientItem.birthDate) : null,
      phone: patientItem.phone && patientItem.phone !== '--' ? patientItem.phone : '',
      idNumber: patientItem.idNumber && patientItem.idNumber !== '--' ? patientItem.idNumber : '',
      address: patientItem.address && patientItem.address !== '--' ? patientItem.address : ''
    })

    // 打开创建新患者抽屉
    setEditingPatientItem(patientItem)
    setEditPatientVisible(true)
  }

  // AI处理统计（根据实际数据动态计算）
  const statistics = {
    total: pagination.total + autoArchivedPagination.total + newPatientPagination.total,
    autoProcessed: autoArchivedPagination.total,
    needsReview: pagination.total,
    newPatients: newPatientPagination.total,
    errors: 0,
    processingTime: '8分钟',
    accuracy: 94,
    confidence: {
      high: 85,
      medium: 12,
      low: 3
    }
  }

  // 获取置信度颜色和标签
  const getConfidenceDisplay = (confidence) => {
    if (typeof confidence === 'number') {
      if (confidence >= 90) return { color: '#10b981', label: '高置信度', level: 'high' }
      if (confidence >= 70) return { color: '#f59e0b', label: '中置信度', level: 'medium' }
      return { color: '#ef4444', label: '低置信度', level: 'low' }
    }
    
    const configs = {
      high: { color: '#10b981', label: '高置信度', level: 'high' },
      medium: { color: '#f59e0b', label: '中置信度', level: 'medium' },
      low: { color: '#ef4444', label: '低置信度', level: 'low' }
    }
    return configs[confidence] || configs.medium
  }

  // 处理确认匹配/更换 - 调用归档或更换接口（从候选列表选择）
  const handleConfirmMatch = async (docId, patientId) => {
    if (!docId || !patientId) {
      message.warning('缺少文档或患者信息')
      return
    }
    
    // 找到选中的患者信息和文档
    const candidate = selectedDocument?.candidates?.find(c => c.id === patientId)
    const doc = needsReviewDocs.find(d => d.id === docId) || 
                autoArchivedDocs.find(d => d.id === docId) || 
                newPatientDocs.find(d => d.id === docId) ||
                selectedDocument
    
    // 判断是否来自自动归档区域（需要更换归档）
    const isFromAutoArchived = selectedDocument?.isFromAutoArchived || autoArchivedDocs.some(d => d.id === docId)
    
    // 显示确认弹窗
    Modal.confirm({
      title: isFromAutoArchived ? '确认更换归档患者' : '确认归档文档',
      content: isFromAutoArchived ? '确定要将文档更换归档到该患者吗？' : '确定要将文档归档到该患者吗？',
      okText: isFromAutoArchived ? '确认更换' : '确认归档',
      cancelText: '取消',
      centered: true,
      wrapClassName: 'confirm-modal-up',
      onOk: async () => {
        try {
          let response
          if (isFromAutoArchived) {
            // 调用更换归档患者接口
            response = await changeArchivePatient(docId, patientId, {
              revokeLastMerge: true,
              autoMergeEhr: true
            })
          } else {
            // 调用归档接口
            response = await archiveDocument(docId, patientId)
          }
      
      if (response.success) {
        // 添加到已处理列表，触发消失动画
        setProcessedDocs(prev => [...prev, docId])
            message.success(
              isFromAutoArchived 
                ? `文档已更换归档到患者: ${candidate?.name || response.data?.patient_name || patientId}`
                : `文档已归档到患者: ${candidate?.name || response.data?.patient_name || patientId}`
            )
            // 如果是在匹配详情弹窗中操作的，关闭弹窗
            if (patientMatchVisible) {
              setPatientMatchVisible(false)
              setPatientSearchValue('')
              setPatientSearchResults([])
              setShowSearchResults(false)
              setSelectedMatchPatient(null)
            }
            // 刷新列表
        fetchNeedsReviewDocs()
            fetchAutoArchivedDocs()
            fetchNewPatientDocs()
      } else {
            message.error(response.message || (isFromAutoArchived ? '更换归档失败' : '归档失败'))
      }
    } catch (error) {
          console.error(isFromAutoArchived ? '更换归档失败:' : '归档文档失败:', error)
          message.error(error.response?.data?.message || (isFromAutoArchived ? '更换归档失败' : '归档文档失败'))
    }
      }
    })
  }

  // 处理创建患者 - 从待确认区域创建新患者
  const [createPatientLoadingId, setCreatePatientLoadingId] = useState(null)
  
  const handleCreatePatient = async (docId, patientData) => {
    setCreatePatientLoadingId(docId)
    try {
      // 从selectedDocument中获取患者信息（如果存在）
      const item = selectedDocument || needsReviewDocs.find(doc => doc.id === docId)
      const patientInfo = {
        name: item?.extractedInfo?.name || patientData || '',
        gender: item?.extractedInfo?.gender || '未知',
        age: item?.extractedInfo?.age && item?.extractedInfo?.age !== '--' ? parseInt(item.extractedInfo.age) || null : null,
        birth_date: item?.extractedInfo?.birth_date && item?.extractedInfo?.birth_date !== '--' ? item.extractedInfo.birth_date : null,
        phone: item?.extractedInfo?.phone && item?.extractedInfo?.phone !== '--' ? item.extractedInfo.phone : null,
        id_card: item?.extractedInfo?.id_number && item?.extractedInfo?.id_number !== '--' ? item.extractedInfo.id_number : null,
        address: item?.extractedInfo?.address && item?.extractedInfo?.address !== '--' ? item.extractedInfo.address : null
      }
      
      // 调用 API 创建患者并归档
      const response = await confirmCreatePatientAndArchive(docId, patientInfo)
      
      if (response.success) {
        message.success(`已创建新患者「${patientInfo.name || patientData}」并归档文档`)
    // 添加到已处理列表，触发消失动画
    setProcessedDocs(prev => [...prev, docId])
        promptBatchMatchForSamePerson(patientInfo, [docId])
        // 刷新待确认列表
        setTimeout(() => {
          fetchNeedsReviewDocs()
        }, 300)
      } else {
        message.error(response.message || '创建患者失败')
      }
    } catch (error) {
      console.error('创建患者失败:', error)
      message.error(error.response?.data?.message || '创建患者失败')
    } finally {
      setCreatePatientLoadingId(null)
    }
  }
  
  // 确认创建患者并归档文档 - 使用文档ID记录加载状态
  const [createAndArchiveLoadingId, setCreateAndArchiveLoadingId] = useState(null)
  
  const handleConfirmCreateAndArchive = async (item) => {
    setCreateAndArchiveLoadingId(item.id)
    try {
      // 构建患者信息对象，从前端数据中获取（可能已编辑）
      const patientData = {
        name: item.name || '',
        gender: item.gender || '未知',
        age: item.age && item.age !== '--' ? parseInt(item.age) || null : null,
        birth_date: item.birthDate && item.birthDate !== '--' ? item.birthDate : null,
        phone: item.phone && item.phone !== '--' ? item.phone : null,
        id_card: item.idNumber && item.idNumber !== '--' ? item.idNumber : null,
        address: item.address && item.address !== '--' ? item.address : null
      }
      
      const response = await confirmCreatePatientAndArchive(item.id, patientData)
      
      if (response.success) {
        message.success(`已创建患者「${item.name}」并归档文档`)
        // 添加到已处理列表，触发消失动画
        setProcessedDocs(prev => [...prev, item.id])
        promptBatchMatchForSamePerson(patientData, [item.id])
        // 刷新列表
    setTimeout(() => {
          fetchNewPatientDocs()
    }, 300)
      } else {
        message.error(response.message || '创建患者并归档失败')
      }
    } catch (error) {
      console.error('创建患者并归档失败:', error)
      message.error('创建患者并归档失败')
    } finally {
      setCreateAndArchiveLoadingId(null)
    }
  }

  // 打开编辑患者信息抽屉（单个文档）
  const handleOpenEditPatient = (item) => {
    setEditingPatientItem(item)
    editPatientForm.setFieldsValue({
      name: item.name || '',
      gender: item.gender && item.gender !== '--' ? item.gender : '',
      age: item.age && item.age !== '--' ? item.age : '',
      birthDate: item.birthDate && item.birthDate !== '--' ? dayjs(item.birthDate) : null,
      phone: item.phone && item.phone !== '--' ? item.phone : '',
      idNumber: item.idNumber && item.idNumber !== '--' ? item.idNumber : '',
      address: item.address && item.address !== '--' ? item.address : ''
    })
    setEditPatientVisible(true)
  }

  // 打开批量创建患者信息抽屉（多个文档）
  const handleOpenBatchEditPatient = (docIds = selectedNewPatientDocs) => {
    if (docIds.length === 0) {
      message.warning('请先选择要批量创建的文档')
      return
    }

    // 获取所有选中文档的患者信息
    const selectedItems = sortedNewPatientDocs.filter(doc => docIds.includes(doc.id))
    
    // 合并患者信息（取并集）
    const mergedInfo = {
      name: '',
      gender: '',
      age: '',
      birthDate: null,
      phone: '',
      idNumber: '',
      address: ''
    }

    // 优先取第一个有值的信息
    for (const item of selectedItems) {
      if (!mergedInfo.name && item.name) mergedInfo.name = item.name
      if (!mergedInfo.gender && item.gender && item.gender !== '--') mergedInfo.gender = item.gender
      if (!mergedInfo.age && item.age && item.age !== '--') mergedInfo.age = item.age
      if (!mergedInfo.birthDate && item.birthDate && item.birthDate !== '--') mergedInfo.birthDate = dayjs(item.birthDate)
      if (!mergedInfo.phone && item.phone && item.phone !== '--') mergedInfo.phone = item.phone
      if (!mergedInfo.idNumber && item.idNumber && item.idNumber !== '--') mergedInfo.idNumber = item.idNumber
      if (!mergedInfo.address && item.address && item.address !== '--') mergedInfo.address = item.address
    }

    // 标记为批量模式
    setEditingPatientItem({ 
      isBatch: true, 
      documentIds: docIds,
      documentCount: docIds.length 
    })
    
    editPatientForm.setFieldsValue(mergedInfo)
    setEditPatientVisible(true)
  }

  // 关闭编辑患者信息抽屉
  const handleCloseEditPatient = () => {
    setEditPatientVisible(false)
    setEditingPatientItem(null)
    editPatientForm.resetFields()
  }

  // 批量创建患者并归档
  const handleBatchCreatePatient = async () => {
    try {
      const values = await editPatientForm.validateFields()
      
      // 构建患者信息对象
      const patientData = {
        name: values.name || '',
        gender: values.gender || '未知',
        age: values.age && values.age !== '--' ? parseInt(values.age) || null : null,
        birth_date: values.birthDate ? values.birthDate.format('YYYY-MM-DD') : null,
        phone: values.phone && values.phone !== '--' ? values.phone : null,
        id_card: values.idNumber && values.idNumber !== '--' ? values.idNumber : null,
        address: values.address && values.address !== '--' ? values.address : null
      }
      
      setCreateAndArchiveLoadingId('batch')
      
      const response = await batchCreatePatientAndArchive(editingPatientItem.documentIds, patientData)
      
      if (response.success) {
        const { success_count, failed_count } = response.data
        message.success(
          `批量创建患者「${patientData.name}」并归档完成：${success_count} 个成功` +
          (failed_count > 0 ? `，${failed_count} 个失败` : '')
        )
        
        // 添加成功的文档到已处理列表
        if (response.data.success_documents) {
          const successIds = response.data.success_documents.map(doc => doc.document_id)
          setProcessedDocs(prev => [...prev, ...successIds])
        }
        
        // 关闭抽屉
        handleCloseEditPatient()
        
        // 清空选中
        setSelectedNewPatientDocs([])

        promptBatchMatchForSamePerson(patientData, editingPatientItem.documentIds || [])
        
        // 延迟刷新列表
        setTimeout(() => {
          fetchNewPatientDocs()
        }, 300)
      } else {
        message.error(response.message || '批量创建患者并归档失败')
      }
    } catch (error) {
      console.error('批量创建患者并归档失败:', error)
      if (error.errorFields) {
        // 表单验证错误
        return
      }
      message.error(error.response?.data?.message || '批量创建患者并归档失败')
    } finally {
      setCreateAndArchiveLoadingId(null)
    }
  }

  // 确认创建新患者并归档
  const handleSaveEditPatient = async () => {
    if (!editingPatientItem) {
      message.warning('缺少文档信息')
      return
    }

    // 判断是否为批量模式
    if (editingPatientItem.isBatch) {
      await handleBatchCreatePatient()
      return
    }

    try {
      const values = await editPatientForm.validateFields()
      
      // 构建患者信息对象
      const patientData = {
        name: values.name || '',
        gender: values.gender || '未知',
        age: values.age && values.age !== '--' ? parseInt(values.age) || null : null,
        birth_date: values.birthDate ? values.birthDate.format('YYYY-MM-DD') : null,
        phone: values.phone && values.phone !== '--' ? values.phone : null,
        id_card: values.idNumber && values.idNumber !== '--' ? values.idNumber : null,
        address: values.address && values.address !== '--' ? values.address : null
      }
      
      // 设置loading状态
      setCreateAndArchiveLoadingId(editingPatientItem.id)
      
      // 调用创建新患者并归档接口（后端会自动处理 auto_archived 状态，使用更换归档患者的方法）
      const response = await confirmCreatePatientAndArchive(editingPatientItem.id, patientData)
      
      if (response.success) {
        message.success(`已创建患者「${patientData.name}」并归档文档`)
        // 添加到已处理列表，触发消失动画
        setProcessedDocs(prev => [...prev, editingPatientItem.id])
        promptBatchMatchForSamePerson(patientData, [editingPatientItem.id])
        // 关闭创建新患者抽屉
        handleCloseEditPatient()
        // 如果是从患者匹配详情弹窗打开的，也关闭该弹窗
        if (patientMatchVisible) {
          setPatientMatchVisible(false)
          setPatientSearchValue('')
          setPatientSearchResults([])
          setShowSearchResults(false)
          setSelectedMatchPatient(null)
        }
        // 刷新列表
        setTimeout(() => {
          fetchNeedsReviewDocs()
          fetchNewPatientDocs()
          fetchAutoArchivedDocs()
        }, 300)
      } else {
        message.error(response.message || (isFromAutoArchived ? '创建患者并更换归档失败' : '创建患者并归档失败'))
      }
    } catch (error) {
      console.error(isFromAutoArchived ? '创建患者并更换归档失败:' : '创建患者并归档失败:', error)
      if (error.errorFields) {
        // 表单验证错误
        return
      }
      message.error(error.response?.data?.message || (isFromAutoArchived ? '创建患者并更换归档失败' : '创建患者并归档失败'))
    } finally {
      setCreateAndArchiveLoadingId(null)
    }
  }

  // 批量确认自动处理结果
  const handleBatchConfirmProcessed = () => {
    Modal.confirm({
      title: '批量确认自动处理结果',
      content: `确认将 ${autoArchivedDocs.length} 份已处理文档全部归档？`,
      okText: '确认归档',
      cancelText: '取消',
      onOk: () => {
        // 自动归档文档已经归档完成，这里只是确认
        message.success(`已确认 ${autoArchivedDocs.length} 份文档归档`)
      }
    })
  }

  // 获取置信度背景色和图标
  const getConfidenceStyle = (confidence) => {
    if (typeof confidence === 'number') {
      if (confidence >= 90) return { 
        background: '#f0fdf4', 
        border: '1px solid #bbf7d020',
        icon: '🟢'
      }
      if (confidence >= 70) return { 
        background: '#fffbeb', 
        border: '1px solid #fed7aa20',
        icon: '🟡'
      }
      return { 
        background: '#fef2f2', 
        border: '1px solid #fecaca20',
        icon: '🔴'
      }
    }
    
    const configs = {
      high: { 
        background: '#f0fdf4', 
        border: '1px solid #bbf7d020',
        icon: '🟢'
      },
      medium: { 
        background: '#fffbeb', 
        border: '1px solid #fed7aa20',
        icon: '🟡'
      },
      low: { 
        background: '#fef2f2', 
        border: '1px solid #fecaca20',
        icon: '🔴'
      }
    }
    return configs[confidence] || configs.medium
  }

  // 显示患者匹配详情
  const showPatientMatch = (doc) => {
    // 确保文档名称正确（优先使用 fileName 或 file_name，而不是 name）
    // 检查文档是否来自自动归档区域（已经归档）
    const isFromAutoArchived = autoArchivedDocs.some(d => d.id === doc.id)
    const documentWithCorrectName = {
      ...doc,
      name: doc.fileName || doc.file_name || doc.name || '未知文档',
      isFromAutoArchived,  // 标记是否来自自动归档区域
      archivedPatientId: isFromAutoArchived ? doc.patientId : null  // 已归档的患者ID
    }
    setSelectedDocument(documentWithCorrectName)
    setPatientMatchVisible(true)
    // 重置搜索状态
    setSelectedMatchPatient(null)
    setPatientSearchValue('')
    setPatientSearchResults([])
    setShowSearchResults(false)
  }

  // 批量确认操作
  const handleBatchConfirm = () => {
    if (selectedDocs.length === 0) {
      message.warning('请先选择要确认的文档')
      return
    }
    setBatchConfirmVisible(true)
  }

  // 质量检查
  const handleQualityCheck = () => {
    setQualityCheckVisible(true)
  }

  // 智能推荐匹配
  const handleSmartRecommend = (doc) => {
    // 如果是自动归档的文档，不需要采用推荐
    if (doc.isFromAutoArchived) {
      return
    }
    const recommended = doc.candidates.find(c => c.id === doc.aiRecommendation)
    if (recommended) {
      handleConfirmMatch(doc.id, recommended.id)
    }
  }

  // 全部确认并归档
  const handleConfirmAll = () => {
    Modal.confirm({
      title: '确认全部归档',
      content: (
        <div>
          <p>即将归档以下内容：</p>
          <ul>
            <li>自动处理成功：{statistics.autoProcessed} 份文档</li>
            <li>新建患者档案：{statistics.newPatients} 名患者</li>
            <li>待确认文档：{statistics.needsReview} 份文档</li>
          </ul>
          <Alert
            message="重要提醒"
            description="归档后的数据将进入患者数据池，建议先完成所有审核确认。"
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
          />
        </div>
      ),
      okText: '确认归档',
      cancelText: '取消',
      onOk: () => {
        message.success('正在归档数据，即将跳转到患者数据池...')
        setTimeout(() => {
          navigate('/patient/pool')
        }, 2000)
      }
    })
  }

  return (
    <div className="page-container fade-in">
      <style>{`
        .confirm-modal-up .ant-modal {
          transform: translateY(-20%) !important;
        }
      `}</style>
      {/* AI处理进度步骤 - 注释掉，减少界面干扰 */}
      {/* <Card size="small" style={{ marginBottom: 24 }}>
        <Steps
          current={processingStep}
          items={[
            {
              title: 'AI处理中',
              description: '智能识别文档内容',
              icon: <RobotOutlined />
            },
            {
              title: '数据分析',
              description: '提取关键信息',
              icon: <ThunderboltOutlined />
            },
            {
              title: '等待审核',
              description: '需要人工确认',
              icon: <ExclamationCircleOutlined />
            },
            {
              title: '归档完成',
              description: '数据已入库',
              icon: <CheckCircleOutlined />
            }
          ]}
        />
      </Card> */}

      {/* 处理统计面板 - 注释掉，减少信息干扰 */}
      {/* <Card style={{ marginBottom: 24 }}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} lg={16}>
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Statistic
                  title="总计"
                  value={statistics.total}
                  suffix="份"
                  prefix={<FileTextOutlined />}
                  valueStyle={{ color: '#1677ff' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="自动处理"
                  value={statistics.autoProcessed}
                  suffix="份"
                  prefix={<CheckCircleOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="需确认"
                  value={statistics.needsReview}
                  suffix="份"
                  prefix={<ExclamationCircleOutlined />}
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="新患者"
                  value={statistics.newPatients}
                  suffix="名"
                  prefix={<UserAddOutlined />}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Col>
            </Row>
          </Col>
          <Col xs={24} lg={8}>
            <div style={{ textAlign: 'right' }}>
              <Space direction="vertical" size="small">
                <div>
                  <Text type="secondary">处理时间: </Text>
                  <Text strong>{statistics.processingTime}</Text>
                </div>
                <div>
                  <Text type="secondary">AI准确率: </Text>
                  <Text strong style={{ color: '#52c41a' }}>{statistics.accuracy}%</Text>
                </div>
                <div>
                  <Text type="secondary">高置信度: </Text>
                  <Text strong style={{ color: '#52c41a' }}>{statistics.confidence.high}%</Text>
                </div>
              </Space>
            </div>
          </Col>
        </Row>
        
        <Divider style={{ margin: '16px 0' }} />
        
        <Progress
          percent={Math.round((statistics.autoProcessed / statistics.total) * 100)}
          strokeColor="#52c41a"
          format={percent => `自动处理完成 ${percent}%`}
        />
      </Card> */}

      {/* 快速操作工具栏 */}
      {/* 
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col flex={1}>
            <Space>
              <Button 
                icon={<CheckCircleOutlined />}
                onClick={handleQualityCheck}
              >
                质量检查
              </Button>
              <Button icon={<FilterOutlined />}>
                筛选显示
              </Button>
              <Button icon={<SortAscendingOutlined />}>
                排序
              </Button>
            </Space>
          </Col>
          <Col>
            <Space>
              <Text type="secondary">已选择 {selectedDocs.length} 个文档</Text>
              <Button 
                size="small"
                onClick={() => setSelectedDocs([])}
                disabled={selectedDocs.length === 0}
              >
                清空选择
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>
      */}

      {/* 三区域审核界面 */}
      <Row gutter={[16, 16]}>
        {/* 需要确认区域 */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <Tooltip title="已上传未归档的文档 - 请确认匹配或创建新档案">
                  <ExclamationCircleOutlined style={{ color: '#f59e0b' }} />
                </Tooltip>
                <Text strong>需要确认</Text>
                <Badge count={needsReviewDocs.filter(doc => !processedDocs.includes(doc.id)).length} style={{ backgroundColor: '#f59e0b' }} />
              </Space>
            }
            size="small"
            extra={
              <Space>
                <Tooltip title="刷新列表">
                  <Button 
                    size="small" 
                    icon={<ReloadOutlined spin={needsReviewLoading} />} 
                    onClick={fetchNeedsReviewDocs}
                    loading={needsReviewLoading}
                  />
                </Tooltip>
                <Tooltip title={
                  !needsReviewSort ? '按置信度降序排序' :
                  needsReviewSort === 'confidence_desc' ? '按置信度升序排序' :
                  '取消排序'
                }>
                  <Button 
                    size="small" 
                    icon={<SortAscendingOutlined />}
                    type={needsReviewSort ? 'primary' : 'default'}
                    onClick={() => {
                      if (!needsReviewSort) {
                        setNeedsReviewSort('confidence_desc')
                      } else if (needsReviewSort === 'confidence_desc') {
                        setNeedsReviewSort('confidence_asc')
                      } else {
                        setNeedsReviewSort(null)
                      }
                    }}
                  />
                </Tooltip>
              </Space>
            }
            style={{ height: '800px', display: 'flex', flexDirection: 'column' }}
            styles={{ 
              body: { 
                flex: 1, 
                overflowY: 'auto', 
                padding: '12px',
                minHeight: 0
              } 
            }}
            loading={needsReviewLoading}
            actions={[
              <div key="actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0 16px', height: '15px' }}>
                <Checkbox
                  checked={sortedNeedsReviewDocs.filter(doc => !processedDocs.includes(doc.id) && doc.aiRecommendation).length > 0 && 
                           sortedNeedsReviewDocs.filter(doc => !processedDocs.includes(doc.id) && doc.aiRecommendation).every(doc => selectedDocs.includes(doc.id))}
                  indeterminate={
                    selectedDocs.length > 0 && 
                    selectedDocs.length < sortedNeedsReviewDocs.filter(doc => !processedDocs.includes(doc.id) && doc.aiRecommendation).length
                  }
                  onChange={(e) => {
                    // 只选择有AI推荐的文档
                    const visibleDocs = sortedNeedsReviewDocs.filter(doc => !processedDocs.includes(doc.id) && doc.aiRecommendation)
                    if (e.target.checked) {
                      setSelectedDocs(visibleDocs.map(doc => doc.id))
                    } else {
                      setSelectedDocs([])
                    }
                  }}
                >
                  全选
                </Checkbox>
                
                <Button 
                  type="primary"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  onClick={async () => {
                    if (selectedDocs.length === 0) {
                      message.warning('请先选择要批量处理的文档')
                      return
                    }
                    
                    // 过滤出有AI推荐的文档
                    const docsToProcess = sortedNeedsReviewDocs.filter(doc => 
                      selectedDocs.includes(doc.id) && 
                      doc.aiRecommendation && 
                      !processedDocs.includes(doc.id)
                    )
                    
                    if (docsToProcess.length === 0) {
                      message.warning('所选文档中没有可批量采用推荐的文档（需要有AI推荐）')
                      return
                    }
                    
                    Modal.confirm({
                      title: '确认归档文档',
                      content: `确定要将 ${docsToProcess.length} 个文档归档到这些患者吗？`,
                      okText: '确认',
                      cancelText: '取消',
                      centered: true,
                      wrapClassName: 'confirm-modal-up',
                      onOk: async () => {
                        let successCount = 0
                        let failedCount = 0
                        
                        for (const doc of docsToProcess) {
                          try {
                            // 直接调用归档接口，不显示单个确认弹窗
                            const response = await archiveDocument(doc.id, doc.aiRecommendation)
                            if (response.success) {
                              successCount++
                              // 添加到已处理列表，触发消失动画
                              setProcessedDocs(prev => [...prev, doc.id])
                            } else {
                              failedCount++
                            }
                          } catch (error) {
                            console.error(`批量采用推荐失败: ${doc.name}`, error)
                            failedCount++
                          }
                        }
                        
                        if (successCount > 0) {
                          message.success(`批量归档完成：${successCount} 个成功${failedCount > 0 ? `，${failedCount} 个失败` : ''}`)
                          setSelectedDocs([])
                          // 延迟刷新以显示消失动画
                          setTimeout(() => {
                            fetchNeedsReviewDocs()
                          }, 300)
                        } else {
                          message.error('批量归档失败')
                        }
                      }
                    })
                  }}
                  disabled={selectedDocs.length === 0}
                  style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
                >
                  批量采用推荐 ({selectedDocs.filter(id => {
                    const doc = sortedNeedsReviewDocs.find(d => d.id === id)
                    return doc && doc.aiRecommendation && !processedDocs.includes(doc.id)
                  }).length})
                </Button>
              </div>
            ]}
          >
            {sortedNeedsReviewDocs.filter(doc => !processedDocs.includes(doc.id)).length === 0 ? (
              <Empty 
                image={Empty.PRESENTED_IMAGE_SIMPLE} 
                description="暂无待确认的文档" 
              />
            ) : (
            <List
              dataSource={sortedNeedsReviewDocs.filter(doc => !processedDocs.includes(doc.id))}
              renderItem={item => (
                <List.Item 
                  style={{ 
                    padding: '16px 12px',
                    borderBottom: '1px solid #f0f0f0',
                    borderRadius: '8px',
                    margin: '8px 0',
                    background: '#ffffff',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.3s ease',
                    opacity: processedDocs.includes(item.id) ? 0 : 1,
                    transform: processedDocs.includes(item.id) ? 'translateX(100px)' : 'translateX(0)'
                  }}
                  className="review-card"
                >
                  <div style={{ width: '100%' }}>
                    {/* 极简信息显示 */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: 8
                      }}>
                        <Space>
                          <Text style={{ fontSize: 12, color: '#6b7280' }}>
                            📄 {item.name}
                          </Text>
                          <Text 
                            style={{ 
                              fontSize: 12, 
                              color: '#1677ff', 
                              cursor: 'pointer',
                              textDecoration: 'underline'
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDocumentClick(item)
                            }}
                          >
                            查看
                          </Text>
                        </Space>
                        {/* 只有有AI推荐的文档才显示勾选框 */}
                        {item.aiRecommendation && (
                        <Checkbox
                          checked={selectedDocs.includes(item.id)}
                          onChange={(e) => {
                              e.stopPropagation()
                            if (e.target.checked) {
                              setSelectedDocs([...selectedDocs, item.id])
                            } else {
                              setSelectedDocs(selectedDocs.filter(id => id !== item.id))
                            }
                          }}
                        />
                        )}
                      </div>
                      
                      {/* 患者基本信息 - 一行显示 */}
                      <div style={{ marginBottom: 8 }}>
                        <Text style={{ fontSize: 13, color: '#6b7280' }}>
                          👤 {item.documentMetadata?.name ?? '--'} {item.documentMetadata?.gender ?? '--'} {(item.documentMetadata?.age && item.documentMetadata?.age !== '--') ? `${item.documentMetadata.age}岁` : (item.documentMetadata?.age ?? '--')}
                        </Text>
                        {item.fileType && (
                          <Tag size="small" style={{ marginLeft: 8 }}>
                            {item.fileType === 'image' ? '图片' : item.fileType === 'pdf' ? 'PDF' : item.fileType}
                          </Tag>
                        )}
                      </div>

                      {/* AI推荐 - 简化显示 */}
                      {item.aiRecommendation && (
                        <div style={{ 
                          background: '#6366f110', 
                          padding: '6px 8px', 
                          borderRadius: 4,
                          marginBottom: 12,
                          border: '1px solid #6366f120'
                        }}>
                          <Text style={{ fontSize: 12, color: '#6366f1' }}>
                            🤖 推荐匹配: {item.candidates.find(c => c.id === item.aiRecommendation)?.name || item.aiRecommendation} 
                            <Text style={{ color: '#6b7280', marginLeft: 4 }}>
                              ({item.candidates.find(c => c.id === item.aiRecommendation)?.similarity || item.matchScore || 0}%匹配)
                            </Text>
                          </Text>
                        </div>
                      )}
                      
                      {/* 匹配状态标签 */}
                      {item.matchResult && (
                        <div style={{ marginBottom: 8 }}>
                          <Tag color={
                            item.matchResult === 'matched' ? 'green' :
                            item.matchResult === 'new' ? 'blue' :
                            'orange'
                          }>
                            {item.matchResult === 'matched' ? '已匹配' :
                             item.matchResult === 'new' ? '新患者' :
                             item.matchResult === 'uncertain' ? '缺信息' :
                             '待确认'}
                          </Tag>
                          {item.matchScore > 0 && (
                            <Text style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>
                              置信度: {item.matchScore}%
                            </Text>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 悬停显示的详细信息 */}
                    <div 
                      className="detailed-info"
                      style={{
                        opacity: 0,
                        maxHeight: 0,
                        overflow: 'hidden',
                        transition: 'all 0.3s ease',
                        background: '#f8fafc',
                        borderRadius: 4,
                        padding: 0,
                        marginBottom: 8
                      }}
                    >
                      <div style={{ padding: '8px 12px' }}>
                        {/* 候选患者列表 */}
                        {item.candidates && item.candidates.length > 0 ? (
                          <>
                        <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>
                          候选患者:
                        </Text>
                        {item.candidates.map(candidate => (
                          <div key={candidate.id} style={{ 
                            fontSize: 11,
                                marginBottom: 4,
                                padding: '4px 6px',
                                borderRadius: 4,
                                background: candidate.id === item.aiRecommendation ? '#6366f120' : 'transparent',
                            color: candidate.id === item.aiRecommendation ? '#6366f1' : '#6b7280'
                          }}>
                                <div>
                                  <strong>{candidate.name || '未知'}</strong>
                                  {candidate.patientCode && <span style={{ marginLeft: 4 }}>({candidate.patientCode})</span>}
                                  <span style={{ marginLeft: 8 }}>{candidate.similarity || 0}%匹配</span>
                                  {candidate.id === item.aiRecommendation && ' ⭐推荐'}
                                </div>
                                {candidate.matchReasoning && (
                                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                                    {candidate.matchReasoning}
                                  </div>
                                )}
                          </div>
                        ))}
                          </>
                        ) : (
                          <Text style={{ fontSize: 11, color: '#9ca3af' }}>
                            暂无候选患者
                          </Text>
                        )}
                        
                        {/* AI分析依据 */}
                        {item.aiReason && (
                          <div style={{ marginTop: 8, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                            <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>
                              AI分析:
                            </Text>
                            <Text style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'pre-wrap' }}>
                              {item.aiReason.length > 200 ? item.aiReason.substring(0, 200) + '...' : item.aiReason}
                            </Text>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div style={{ textAlign: 'right', marginTop: 8, display: 'flex', gap: 6, justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                      <Button 
                        size="small" 
                          onClick={(e) => {
                            e.stopPropagation()
                            showPatientMatch(item)
                          }}
                          style={{ fontSize: 12, height: '24px', lineHeight: '24px' }}
                      >
                          匹配详情
                      </Button>
                        <Tooltip title="查看AI抽取的JSON结果">
                      <Button 
                        size="small"
                            icon={<CodeOutlined />}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleViewExtractionResult(item.id, item.name)
                            }}
                            style={{ fontSize: 12, backgroundColor: '#f59e0b', borderColor: '#f59e0b', color: '#fff', height: '24px', lineHeight: '24px' }}
                      >
                            JSON
                      </Button>
                        </Tooltip>
                      </div>
                      <Button 
                        size="small" 
                        type="primary"
                        icon={<ThunderboltOutlined />}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleConfirmMatch(item.id, item.aiRecommendation)
                        }}
                        disabled={!item.aiRecommendation}
                        style={{ 
                          backgroundColor: '#6366f1', 
                          borderColor: '#6366f1',
                          fontSize: 12,
                          height: '24px',
                          lineHeight: '24px'
                        }}
                      >
                        采用推荐
                      </Button>
                    </div>
                  </div>
                </List.Item>
              )}
            />
            )}
          </Card>
        </Col>

        {/* 新建患者区域 */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <Tooltip title="新患者档案 - AI识别出新患者，请确认基本信息后创建档案">
                  <UserAddOutlined style={{ color: '#8b5cf6' }} />
                </Tooltip>
                <Text strong>新建患者</Text>
                <Badge count={newPatientDocs.length} style={{ backgroundColor: '#8b5cf6' }} />
              </Space>
            }
            size="small"
            extra={
              <Space>
                <Tooltip title="刷新列表">
                  <Button 
                    size="small" 
                    icon={<ReloadOutlined spin={newPatientLoading} />} 
                    onClick={fetchNewPatientDocs}
                    loading={newPatientLoading}
                  />
              </Tooltip>
                <Tooltip title={
                  !newPatientSort ? '按姓名字典降序排序' :
                  newPatientSort === 'name_desc' ? '按姓名字典升序排序' :
                  '取消排序'
                }>
                  <Button 
                    size="small" 
                    icon={<SortAscendingOutlined />}
                    type={newPatientSort ? 'primary' : 'default'}
                    onClick={() => {
                      if (!newPatientSort) {
                        setNewPatientSort('name_desc')
                      } else if (newPatientSort === 'name_desc') {
                        setNewPatientSort('name_asc')
                      } else {
                        setNewPatientSort(null)
                      }
                    }}
                  />
                </Tooltip>
              </Space>
            }
            style={{ height: '800px', display: 'flex', flexDirection: 'column' }}
            styles={{ 
              body: { 
                flex: 1, 
                overflowY: 'auto', 
                padding: '12px',
                minHeight: 0
              } 
            }}
            loading={newPatientLoading}
            actions={[
              <div key="actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0 16px', height: '15px' }}>
                <Checkbox
                  checked={sortedNewPatientDocs.filter(doc => !processedDocs.includes(doc.id)).length > 0 && 
                           sortedNewPatientDocs.filter(doc => !processedDocs.includes(doc.id)).every(doc => selectedNewPatientDocs.includes(doc.id))}
                  indeterminate={
                    selectedNewPatientDocs.length > 0 && 
                    selectedNewPatientDocs.length < sortedNewPatientDocs.filter(doc => !processedDocs.includes(doc.id)).length
                  }
                  onChange={(e) => {
                    const visibleDocs = sortedNewPatientDocs.filter(doc => !processedDocs.includes(doc.id))
                    if (e.target.checked) {
                      setSelectedNewPatientDocs(visibleDocs.map(doc => doc.id))
                    } else {
                      setSelectedNewPatientDocs([])
                    }
                  }}
                >
                  全选
                </Checkbox>
                
                <Tooltip title="将文档批量合并&归档到一个新患者" placement="bottom">
                  <Button 
                    type="primary"
                    size="small"
                    icon={<UserAddOutlined />}
                    onClick={() => handleOpenBatchEditPatient(selectedNewPatientDocs)}
                    disabled={selectedNewPatientDocs.length === 0}
                    style={{ backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }}
                  >
                    批量创建新患者{selectedNewPatientDocs.length > 0 ? ` (${selectedNewPatientDocs.length})` : ''}
                  </Button>
                </Tooltip>
              </div>
            ]}
          >
            {visibleNewPatientDocs.length === 0 ? (
              <Empty 
                image={Empty.PRESENTED_IMAGE_SIMPLE} 
                description="暂无需要新建患者的文档" 
              />
            ) : (
            <Collapse
              bordered={false}
              expandIconPosition="end"
              style={{ background: 'transparent' }}
            >
              {groupedNewPatientDocs.map((group, groupIndex) => {
                const groupIds = group.items.map(item => item.id)
                const allSelected = groupIds.length > 0 && groupIds.every(id => selectedNewPatientDocs.includes(id))
                const isIndeterminate = groupIds.some(id => selectedNewPatientDocs.includes(id)) && !allSelected
                const groupPatientName = (group.items[0] && getPatientNameForCreate(group.items[0])) || '未填写'
                const identifiers = mergeIdentifiersForDisplay(group.identifiers)
                const mergeReasonContent = identifiers.length ? (
                  <Space size="small" wrap>
                    {identifiers.map(identifier => {
                      const tag = formatIdentifierTag(identifier)
                      return (
                        <Tag key={identifier} color={tag.color}>
                          {tag.label}:{tag.value}
                        </Tag>
                      )
                    })}
                  </Space>
                ) : (
                  <span style={{ fontSize: 11 }}>无唯一标识</span>
                )
                return (
                  <Panel
                    key={`new-${groupIndex}`}
                    header={(
                      <Space size="small" wrap>
                        <Tooltip title={mergeReasonContent} placement="top">
                          <Text strong style={{ fontSize: 12, cursor: 'help', borderBottom: '1px dashed rgba(0,0,0,0.2)' }}>
                            {groupPatientName}
                          </Text>
                        </Tooltip>
                        <Tag color="default">{group.items.length} 份</Tag>
                      </Space>
                    )}
                    extra={(
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={allSelected}
                          indeterminate={isIndeterminate}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedNewPatientDocs(prev => Array.from(new Set([...prev, ...groupIds])))
                            } else {
                              setSelectedNewPatientDocs(prev => prev.filter(id => !groupIds.includes(id)))
                            }
                          }}
                        >
                          全选
                        </Checkbox>
                      </div>
                    )}
                  >
                    <List
                      dataSource={group.items}
                      renderItem={item => (
                <List.Item 
                  style={{ 
                    padding: '16px 12px',
                    borderBottom: '1px solid #f0f0f0',
                    borderRadius: '8px',
                    margin: '8px 0',
                    background: '#ffffff',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.3s ease',
                    opacity: processedDocs.includes(item.id) ? 0 : 1,
                    transform: processedDocs.includes(item.id) ? 'translateX(100px)' : 'translateX(0)'
                  }}
                  className="patient-card"
                >
                  <div style={{ width: '100%' }}>
                      {/* 来源文档 */}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: 8
                      }}>
                        <Space>
                      <Text style={{ fontSize: 12, color: '#6b7280' }}>
                            📄 {item.fileName}
                      </Text>
                          <Text 
                      style={{
                              fontSize: 12, 
                              color: '#1677ff', 
                              cursor: 'pointer',
                              textDecoration: 'underline'
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDocumentClick(item)
                      }}
                    >
                            查看
                          </Text>
                        </Space>
                        <Checkbox
                          checked={selectedNewPatientDocs.includes(item.id)}
                          onChange={(e) => {
                            e.stopPropagation()
                            if (e.target.checked) {
                              setSelectedNewPatientDocs([...selectedNewPatientDocs, item.id])
                            } else {
                              setSelectedNewPatientDocs(selectedNewPatientDocs.filter(id => id !== item.id))
                            }
                          }}
                        />
                        </div>

                      {/* AI抽取的患者信息 - 将创建此患者 */}
                      <div style={{ 
                        background: '#f8fafc',
                        padding: '12px', 
                        borderRadius: 6,
                        marginBottom: 12,
                        border: '1px solid #e5e7eb'
                      }}>
                        <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8, display: 'block' }}>
                          将创建以下患者信息：
                        </Text>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                          {item.name && (
                            <div>
                              <Text style={{ fontSize: 11, color: '#9ca3af' }}>姓名：</Text>
                              <Text style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{item.name}</Text>
                        </div>
                          )}
                          {item.gender && (
                            <div>
                              <Text style={{ fontSize: 11, color: '#9ca3af' }}>性别：</Text>
                              <Text style={{ fontSize: 12, color: '#374151' }}>{item.gender}</Text>
                            </div>
                          )}
                          {item.age && item.age !== '--' && (
                            <div>
                              <Text style={{ fontSize: 11, color: '#9ca3af' }}>年龄：</Text>
                              <Text style={{ fontSize: 12, color: '#374151' }}>{item.age}</Text>
                            </div>
                          )}
                          {item.birthDate && item.birthDate !== '--' && (
                            <div>
                              <Text style={{ fontSize: 11, color: '#9ca3af' }}>生日：</Text>
                              <Text style={{ fontSize: 12, color: '#374151' }}>{item.birthDate}</Text>
                            </div>
                          )}
                          {item.phone && item.phone !== '--' && (
                            <div>
                              <Text style={{ fontSize: 11, color: '#9ca3af' }}>电话：</Text>
                              <Text style={{ fontSize: 12, color: '#374151' }}>{item.phone}</Text>
                            </div>
                          )}
                          {item.idNumber && item.idNumber !== '--' && (
                            <div>
                              <Text style={{ fontSize: 11, color: '#9ca3af' }}>身份证号：</Text>
                              <Text style={{ fontSize: 12, color: '#374151' }}>{item.idNumber}</Text>
                            </div>
                          )}
                          {item.address && item.address !== '--' && (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <Text style={{ fontSize: 11, color: '#9ca3af' }}>地址：</Text>
                              <Text style={{ fontSize: 12, color: '#374151' }}>{item.address}</Text>
                            </div>
                          )}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div style={{ textAlign: 'right', marginTop: 8, display: 'flex', gap: 6, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button 
                        size="small" 
                          onClick={(e) => {
                            e.stopPropagation()
                            showPatientMatch(item)
                          }}
                          style={{ fontSize: 12, height: '24px', lineHeight: '24px' }}
                      >
                          匹配详情
                      </Button>
                        <Tooltip title="查看AI抽取的JSON结果">
                      <Button 
                        size="small" 
                            icon={<CodeOutlined />}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleViewExtractionResult(item.id, item.documentName)
                            }}
                            style={{ fontSize: 12, backgroundColor: '#f59e0b', borderColor: '#f59e0b', color: '#fff', height: '24px', lineHeight: '24px' }}
                      >
                            JSON
                      </Button>
                        </Tooltip>
                      </div>
                      <Button 
                        size="small" 
                        type="primary" 
                        icon={<UserAddOutlined />}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenEditPatient(item)
                        }}
                        style={{ 
                          backgroundColor: '#6366f1', 
                          borderColor: '#6366f1',
                          fontSize: 12,
                          height: '24px',
                          lineHeight: '24px'
                        }}
                      >
                        创建新患者
                      </Button>
                    </div>
                  </div>
                </List.Item>
                      )}
                    />
                  </Panel>
                )
              })}
            </Collapse>
            )}
          </Card>
        </Col>

        {/* 自动处理区域 */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <Tooltip title="高置信度匹配 - AI自动处理成功，已归档到对应患者">
                  <CheckCircleOutlined style={{ color: '#10b981' }} />
                </Tooltip>
                <Text strong>自动归档</Text>
                <Badge count={autoArchivedDocs.length} style={{ backgroundColor: '#10b981' }} />
              </Space>
            }
            size="small"
            extra={
              <Space>
                <Tooltip title="刷新列表">
                  <Button 
                    size="small" 
                    icon={<ReloadOutlined spin={autoArchivedLoading} />} 
                    onClick={fetchAutoArchivedDocs}
                    loading={autoArchivedLoading}
                  />
              </Tooltip>
                <Tooltip title={
                  !autoArchivedSort ? '按置信度降序排序' :
                  autoArchivedSort === 'confidence_desc' ? '按置信度升序排序' :
                  '取消排序'
                }>
                  <Button 
                    size="small" 
                    icon={<SortAscendingOutlined />}
                    type={autoArchivedSort ? 'primary' : 'default'}
                    onClick={() => {
                      if (!autoArchivedSort) {
                        setAutoArchivedSort('confidence_desc')
                      } else if (autoArchivedSort === 'confidence_desc') {
                        setAutoArchivedSort('confidence_asc')
                      } else {
                        setAutoArchivedSort(null)
                      }
                    }}
                  />
                </Tooltip>
              </Space>
            }
            style={{ height: '800px', display: 'flex', flexDirection: 'column' }}
            styles={{ 
              body: { 
                flex: 1, 
                overflowY: 'auto', 
                padding: '12px',
                minHeight: 0
              } 
            }}
            loading={autoArchivedLoading}
            actions={[
              <div key="actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0 16px', height: '15px' }}>
                <Checkbox
                  checked={sortedAutoArchivedDocs.length > 0 && selectedAutoDocs.length === sortedAutoArchivedDocs.length}
                  indeterminate={selectedAutoDocs.length > 0 && selectedAutoDocs.length < sortedAutoArchivedDocs.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedAutoDocs(sortedAutoArchivedDocs.map(doc => doc.id))
                    } else {
                      setSelectedAutoDocs([])
                    }
                  }}
                >
                  全选
                </Checkbox>
                <Button 
                  type="primary"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  loading={batchConfirming}
                  disabled={selectedAutoDocs.length === 0}
                  onClick={() => handleBatchConfirmAutoArchive(selectedAutoDocs)}
                  style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                >
                  批量自动确认 ({selectedAutoDocs.length})
                </Button>
              </div>
            ]}
          >
            {sortedAutoArchivedDocs.length === 0 ? (
              <Empty 
                image={Empty.PRESENTED_IMAGE_SIMPLE} 
                description="暂无自动归档文档" 
              />
            ) : (
              <Collapse
                bordered={false}
                expandIconPosition="end"
                style={{ background: 'transparent' }}
              >
                {groupedAutoArchivedDocs.map((group, groupIndex) => {
                  const groupIds = group.items.map(item => item.id)
                  const allSelected = groupIds.length > 0 && groupIds.every(id => selectedAutoDocs.includes(id))
                  const isIndeterminate = groupIds.some(id => selectedAutoDocs.includes(id)) && !allSelected
                  const identifiers = mergeIdentifiersForDisplay(group.identifiers)
                  return (
                    <Panel
                      key={`auto-${groupIndex}`}
                      header={(
                        <Space size="small" wrap>
                          <Text strong style={{ fontSize: 12 }}>同一患者</Text>
                          {identifiers.length ? identifiers.map(identifier => {
                            const tag = formatIdentifierTag(identifier)
                            return (
                              <Tag key={identifier} color={tag.color}>
                                {tag.label}:{tag.value}
                              </Tag>
                            )
                          }) : (
                            <Tag>无唯一标识</Tag>
                          )}
                          <Tag color="default">{group.items.length} 份</Tag>
                        </Space>
                      )}
                      extra={(
                        <div onClick={(e) => e.stopPropagation()}>
                          <Space size="small">
                            <Checkbox
                              checked={allSelected}
                              indeterminate={isIndeterminate}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAutoDocs(prev => Array.from(new Set([...prev, ...groupIds])))
                                } else {
                                  setSelectedAutoDocs(prev => prev.filter(id => !groupIds.includes(id)))
                                }
                              }}
                            >
                              本组
                            </Checkbox>
                            <Button
                              size="small"
                              type="primary"
                              loading={batchConfirming}
                              onClick={() => handleBatchConfirmAutoArchive(groupIds)}
                              style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                            >
                              本组确认
                            </Button>
                          </Space>
                        </div>
                      )}
                    >
                      <List
                        dataSource={group.items}
                        renderItem={item => {
                          const confidenceStyle = getConfidenceStyle(item.confidence)
                          return (
                            <List.Item 
                              style={{ 
                                padding: '16px 12px',
                                borderBottom: '1px solid #f0f0f0',
                                borderRadius: '8px',
                                margin: '8px 0',
                                background: '#ffffff',
                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                                transition: 'all 0.3s ease'
                              }}
                              className="processed-card"
                            >
                              <div style={{ width: '100%' }}>
                                {/* 极简信息显示 - 与其他栏目保持一致 */}
                                <div style={{ marginBottom: 12 }}>
                                  <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center',
                                    marginBottom: 8
                                  }}>
                                    <Space>
                                      <Text style={{ fontSize: 12, color: '#6b7280' }}>
                                        📄 {item.name}
                                      </Text>
                                      <Text 
                                        style={{ 
                                          fontSize: 12, 
                                          color: '#1677ff', 
                                          cursor: 'pointer',
                                          textDecoration: 'underline'
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDocumentClick(item)
                                        }}
                                      >
                                        查看
                                      </Text>
                                    </Space>
                                    <Checkbox
                                      checked={selectedAutoDocs.includes(item.id)}
                                      onChange={(e) => {
                                        e.stopPropagation()
                                        if (e.target.checked) {
                                          setSelectedAutoDocs([...selectedAutoDocs, item.id])
                                        } else {
                                          setSelectedAutoDocs(selectedAutoDocs.filter(id => id !== item.id))
                                        }
                                      }}
                                    />
                                  </div>
                                  
                                  {/* 归档状态信息 - 一行显示 */}
                                  <div style={{ marginBottom: 8 }}>
                                    <Text style={{ fontSize: 13, color: '#6b7280' }}>
                                      ✅ 归档至 {item.patientName || '未知患者'}
                                      {item.patientId && item.candidates?.find(c => c.id === item.patientId)?.patientCode && 
                                        ` (${item.candidates.find(c => c.id === item.patientId).patientCode})`
                                      }
                                    </Text>
                                  </div>

                                  {/* 显示文档元数据（仅主表，不含抽取记录） */}
                                  {(item.documentMetadata?.name || item.documentMetadata?.gender || item.documentMetadata?.age) && (
                                    <div style={{ 
                                      background: '#6366f110', 
                                      padding: '6px 8px', 
                                      borderRadius: 4,
                                      marginTop: 8,
                                      marginBottom: 12,
                                      border: '1px solid #6366f120'
                                    }}>
                                      <Text style={{ fontSize: 12, color: '#6366f1' }}>
                                        🤖 元数据: {item.documentMetadata?.name && `姓名:${item.documentMetadata.name}`}
                                        {item.documentMetadata?.gender && item.documentMetadata.gender !== '--' && ` 性别:${item.documentMetadata.gender}`}
                                        {item.documentMetadata?.age && item.documentMetadata.age !== '--' && ` 年龄:${item.documentMetadata.age}`}
                                      </Text>
                                    </div>
                                  )}
                                </div>

                                {/* 悬停显示的详细信息 */}
                                <div 
                                  className="detailed-info"
                                  style={{
                                    opacity: 0,
                                    maxHeight: 0,
                                    overflow: 'hidden',
                                    transition: 'all 0.3s ease',
                                    background: '#f8fafc',
                                    borderRadius: 4,
                                    padding: 0,
                                    marginBottom: 0
                                  }}
                                >
                                  <div style={{ padding: '8px 12px' }}>
                                    <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>
                                      处理详情:
                                    </Text>
                                    <div style={{ fontSize: 11, marginBottom: 2, color: '#6b7280' }}>
                                      置信度: {confidenceStyle.icon} {getConfidenceDisplay(item.confidence).label}
                                    </div>
                                    {item.createdAt && (
                                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                                        上传时间: {new Date(item.createdAt).toLocaleString('zh-CN')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                      
                                {/* 匹配状态标签 */}
                                {item.matchResult && (
                                  <div style={{ marginBottom: 18 }}>
                                    <Tag color={
                                      item.matchResult === 'matched' ? 'green' :
                                      item.matchResult === 'new' ? 'blue' :
                                      'orange'
                                    }>
                                      {item.matchResult === 'matched' ? '已匹配' :
                                       item.matchResult === 'new' ? '新患者' :
                                       item.matchResult === 'uncertain' ? '缺信息' :
                                       '待确认'}
                                    </Tag>
                                    {item.matchScore > 0 && (
                                      <Text style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>
                                        置信度: {item.matchScore}%
                                      </Text>
                                    )}
                                  </div>
                                )}
                      
                                {/* 操作按钮 */}
                                <div style={{ textAlign: 'right', marginTop: 8, display: 'flex', gap: 6, justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <Button 
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        showPatientMatch(item)
                                      }}
                                      style={{ fontSize: 12, height: '24px', lineHeight: '24px' }}
                                    >
                                      匹配详情
                                    </Button>
                                    <Tooltip title="查看AI抽取的JSON结果">
                                      <Button 
                                        size="small"
                                        icon={<CodeOutlined />}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleViewExtractionResult(item.id, item.name)
                                        }}
                                        style={{ fontSize: 12, backgroundColor: '#f59e0b', borderColor: '#f59e0b', color: '#fff', height: '24px', lineHeight: '24px' }}
                                      >
                                        JSON
                                      </Button>
                                    </Tooltip>
                                  </div>
                                  <Button
                                    size="small"
                                    type="primary" 
                                    icon={<CheckCircleOutlined />}
                                    loading={confirmingDocId === item.id}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleConfirmAutoArchive(item.id)
                                    }}
                                    style={{ backgroundColor: '#10b981', borderColor: '#10b981', fontSize: 12, height: '24px', lineHeight: '24px' }}
                                  >
                                    确认
                                  </Button>
                                </div>
                              </div>
                            </List.Item>
                          )
                        }}
                      />
                    </Panel>
                  )
                })}
              </Collapse>
            )}
          </Card>
        </Col>
      </Row>

      {/* 底部操作 */}
      {/* #隐藏3 */}
      {/* 
      <Card style={{ marginTop: 24, textAlign: 'center' }}>
        <Space size="large">
          <Button type="primary" size="large" onClick={handleConfirmAll} style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}>
            全部确认并归档
          </Button>
          <Button size="large">
            暂存进度
          </Button>
          <Button size="large">
            重新处理
          </Button>
          <Button size="large">
            查看详细日志
          </Button>
        </Space>
        
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            💡 提示：建议先完成所有确认操作再进行归档，确保数据准确性
          </Text>
        </div>
      </Card>
      */}

      {/* 文档详情弹窗 */}
      {selectedDocumentForDetail && (
        <DocumentDetailModal
          visible={detailModalVisible}
          document={selectedDocumentForDetail}
          patientId={selectedDocumentForDetail.patientId}
          onClose={handleDetailModalClose}
          onSave={handleFieldSave}
          onReExtract={handleReExtract}
          onChangePatient={handleChangePatient}
          onArchivePatient={handleArchivePatient}
          onDownload={handleDownload}
          onViewOcr={handleViewOcr}
          onExtractSuccess={handleExtractSuccess}
          showTaskStatus={true}
        />
      )}

      {/* 患者匹配详情弹窗 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <Text>患者匹配详情 - {selectedDocument?.name}</Text>
          </Space>
        }
        open={patientMatchVisible}
        zIndex={2000}  // 设置更高的z-index，确保显示在文档详情弹窗之上
        onCancel={() => {
          setPatientMatchVisible(false)
          setPatientSearchValue('')
          setPatientSearchResults([])
          setShowSearchResults(false)
          setSelectedMatchPatient(null)
        }}
        footer={[
          <Button 
            key="cancel" 
            onClick={() => {
              setPatientMatchVisible(false)
              setPatientSearchValue('')
              setPatientSearchResults([])
              setShowSearchResults(false)
              setSelectedMatchPatient(null)
            }}
          >
            取消
          </Button>,
          <Button 
            key="create" 
            icon={<UserAddOutlined />} 
            onClick={handleCreatePatientAndArchiveFromModal}
          >
            {selectedDocument?.isFromAutoArchived ? '创建并更换新患者' : '创建新患者'}
          </Button>,
          <Button 
            key="confirm" 
            type="primary" 
            icon={<CheckOutlined />}
            onClick={handleConfirmPatientMatch}
            disabled={!selectedMatchPatient}
            loading={archivingLoading}
          >
            {selectedDocument?.isFromAutoArchived ? '确认更换' : '确认匹配'}
          </Button>
        ]}
        width={900}
      >
        {selectedDocument && (
          <Row gutter={24}>
            {/* 左侧：文档信息 */}
            <Col span={10}>
              <Card size="small" title="文档信息">
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="文档名称">
                    {selectedDocument.name}
                  </Descriptions.Item>
                  <Descriptions.Item label="上传时间">
                    {selectedDocument.createdAt ? new Date(selectedDocument.createdAt).toLocaleString('zh-CN') : '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="AI置信度">
                    <Space>
                      <Progress 
                        percent={typeof selectedDocument.confidence === 'number' ? selectedDocument.confidence : (selectedDocument.matchScore || 0)} 
                        size="small" 
                        strokeColor={getConfidenceDisplay(selectedDocument.confidence).color}
                        format={percent => `${percent}%`}
                      />
                      <Tag color={getConfidenceDisplay(selectedDocument.confidence).color}>
                        {getConfidenceDisplay(selectedDocument.confidence).label}
                      </Tag>
                    </Space>
                  </Descriptions.Item>
                </Descriptions>

                <Divider style={{ margin: '12px 0' }} />
                
                <div>
                  <Text strong style={{ fontSize: 13 }}>AI提取信息:</Text>
                  <div style={{ marginTop: 8, background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                    <Descriptions size="small" column={1}>
                      <Descriptions.Item label="患者姓名">
                        {selectedDocument.documentMetadata?.name ?? '--'}
                      </Descriptions.Item>
                      <Descriptions.Item label="性别">
                        {selectedDocument.documentMetadata?.gender ?? '--'}
                      </Descriptions.Item>
                      <Descriptions.Item label="年龄">
                        {(selectedDocument.documentMetadata?.age && selectedDocument.documentMetadata?.age !== '--') ? `${selectedDocument.documentMetadata.age}岁` : (selectedDocument.documentMetadata?.age ?? '--')}
                      </Descriptions.Item>
                      <Descriptions.Item label="报告日期">
                        {selectedDocument.extractedInfo.reportDate}
                      </Descriptions.Item>
                      <Descriptions.Item label="报告类型">
                        {selectedDocument.documentSubType || selectedDocument.documentType || selectedDocument.extractedInfo.reportType || '--'}
                      </Descriptions.Item>
                    </Descriptions>
                  </div>
                </div>

                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => openDocumentPreview(selectedDocument.id, selectedDocument.name)}
                  >
                    查看原文档
                  </Button>
                </div>
              </Card>
            </Col>

            {/* 右侧：候选患者 */}
            <Col span={14}>
              <Card size="small" title="候选患者列表">
                {/* 如果是自动归档的文档，显示当前归档患者信息 */}
                {selectedDocument?.isFromAutoArchived && selectedDocument?.archivedPatientId && (
                  <Alert
                    message={
                      <span>
                        ✅ 当前归档: <strong>{selectedDocument.candidates.find(c => c.id === selectedDocument.archivedPatientId)?.name || '未知患者'}</strong>
                        {selectedDocument.candidates.find(c => c.id === selectedDocument.archivedPatientId)?.patientCode && (
                          <Text type="secondary" style={{ marginLeft: 8 }}>
                            ({selectedDocument.candidates.find(c => c.id === selectedDocument.archivedPatientId)?.patientCode})
                          </Text>
                        )}
                      </span>
                    }
                    type="success"
                    showIcon
                    style={{ marginBottom: 12 }}
                  />
                )}
                
                {/* 如果不是自动归档的文档，显示AI推荐 */}
                {!selectedDocument?.isFromAutoArchived && selectedDocument.aiRecommendation && (
                  <Alert
                    message={
                      <span>
                        🤖 AI推荐匹配: <strong>{selectedDocument.candidates.find(c => c.id === selectedDocument.aiRecommendation)?.name || '未知患者'}</strong>
                        <Text type="secondary" style={{ marginLeft: 8 }}>
                          ({selectedDocument.matchScore || selectedDocument.candidates.find(c => c.id === selectedDocument.aiRecommendation)?.similarity || 0}% 匹配度)
                        </Text>
                      </span>
                    }
                    description={
                      selectedDocument.aiReason ? (
                        <div style={{ marginTop: 4 }}>
                          <Button
                            type="link"
                            size="small"
                            style={{ padding: 0, height: 'auto' }}
                            onClick={() => {
                              Modal.info({
                                title: 'AI 匹配分析',
                                width: 700,
                                content: (
                                  <div style={{ maxHeight: '60vh', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                                    {selectedDocument.aiReason}
                                  </div>
                                ),
                                okText: '关闭'
                              })
                            }}
                          >
                            <EyeOutlined /> 查看AI分析
                          </Button>
                        </div>
                      ) : null
                    }
                    type="info"
                    showIcon
                    style={{ marginBottom: 12 }}
                    action={
                      <Button 
                        size="small" 
                        type="primary"
                        onClick={() => handleSmartRecommend(selectedDocument)}
                      >
                        采用推荐
                      </Button>
                    }
                  />
                )}

                <List
                  dataSource={selectedDocument.candidates}
                  renderItem={candidate => {
                    // 判断是否是当前归档的患者（自动归档文档）或AI推荐的患者（非自动归档文档）
                    const isCurrentArchived = selectedDocument?.isFromAutoArchived && candidate.id === selectedDocument?.archivedPatientId
                    const isAiRecommended = !selectedDocument?.isFromAutoArchived && candidate.id === selectedDocument.aiRecommendation
                    const isHighlighted = isCurrentArchived || isAiRecommended
                    
                    return (
                    <List.Item
                      style={{
                        background: isHighlighted ? (isCurrentArchived ? '#e6f7ff' : '#f6ffed') : 'transparent',
                        border: isHighlighted ? (isCurrentArchived ? '1px solid #91d5ff' : '1px solid #b7eb8f') : 'none',
                        borderRadius: 4,
                        margin: '4px 0',
                        padding: '8px 12px',
                        position: 'relative'
                      }}
                    >
                      <List.Item.Meta
                        avatar={
                          <div style={{ position: 'relative' }}>
                          <Avatar 
                            icon={<TeamOutlined />} 
                            style={{ 
                              backgroundColor: candidate.id === selectedDocument.aiRecommendation ? '#52c41a' : '#1677ff' 
                            }}
                          />
                            {isCurrentArchived && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  marginTop: 4,
                                  whiteSpace: 'nowrap',
                                  zIndex: 1,
                                  backgroundColor: 'transparent',
                                  color: '#1677ff',
                                  fontSize: '10px',
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  fontWeight: 500,
                                  border: '1px solid #1677ff'
                                }}
                              >
                                当前归档
                              </div>
                            )}
                            {isAiRecommended && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  marginTop: 4,
                                  whiteSpace: 'nowrap',
                                  zIndex: 1,
                                  backgroundColor: 'transparent',
                                  color: '#1677ff',
                                  fontSize: '10px',
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  fontWeight: 500,
                                  border: '1px solid #1677ff'
                                }}
                              >
                                AI推荐
                              </div>
                            )}
                          </div>
                        }
                        title={
                          <Space wrap>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: '200px', flexShrink: 0 }}>
                              <Text strong style={{ whiteSpace: 'nowrap' }}>{candidate.name || '未知患者'}</Text>
                              {candidate.patientCode && (
                                <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>({candidate.patientCode})</Text>
                              )}
                            </div>
                            {candidate.gender && (
                              <Text type="secondary">{candidate.gender}</Text>
                            )}
                            <Tag 
                              color={candidate.similarity > 90 ? 'green' : candidate.similarity > 70 ? 'orange' : 'default'}
                              size="small"
                            >
                              相似度 {candidate.similarity}%
                            </Tag>
                          </Space>
                        }
                        description={
                          <div>
                            {/* 匹配理由 */}
                            {candidate.matchReasoning && (
                            <div style={{ marginBottom: 4 }}>
                                <Text style={{ fontSize: 12, color: '#666' }}>
                                  {candidate.matchReasoning}
                              </Text>
                            </div>
                            )}
                            {/* 匹配特征标签 */}
                            {candidate.matchFeatures && candidate.matchFeatures.length > 0 && (
                            <div>
                                <Space wrap size={[4, 4]}>
                                  {candidate.matchFeatures.slice(0, 5).map((feature, idx) => (
                                    <Tag key={idx} size="small" color="geekblue">
                                    {feature}
                                  </Tag>
                                ))}
                                  {candidate.matchFeatures.length > 5 && (
                                    <Tag size="small">+{candidate.matchFeatures.length - 5}</Tag>
                                  )}
                              </Space>
                            </div>
                            )}
                          </div>
                        }
                      />
                      <Button 
                        type={isHighlighted ? 'primary' : 'default'}
                        size="small"
                        onClick={() => handleConfirmMatch(selectedDocument.id, candidate.id)}
                        disabled={isCurrentArchived}  // 当前归档的患者按钮禁用
                      >
                        {selectedDocument?.isFromAutoArchived ? '更换' : '选择'}
                      </Button>
                    </List.Item>
                    )
                  }}
                />
                
                <Divider />
                <div style={{ position: 'relative' }}>
                  <Input
                    placeholder={
                      selectedMatchPatient 
                        ? `${selectedMatchPatient.gender || ''} ${selectedMatchPatient.age ? selectedMatchPatient.age + '岁' : ''}`
                        : "搜索患者姓名、ID或诊断"
                    }
                    size="small"
                    prefix={<SearchOutlined style={{ color: '#999', fontSize: 13 }} />}
                    value={patientSearchValue}
                    onChange={(e) => {
                      handlePatientSearch(e.target.value)
                      // 清空选中的患者（用户重新输入时）
                      if (e.target.value !== selectedMatchPatient?.name) {
                        setSelectedMatchPatient(null)
                      }
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                    style={{ fontSize: 13 }}
                    allowClear
                    onClear={() => setSelectedMatchPatient(null)}
                  />
                  
                  {/* 搜索结果下拉框 */}
                  {showSearchResults && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: '#fff',
                      border: '1px solid #d9d9d9',
                      borderRadius: 4,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      maxHeight: 200,
                      overflowY: 'auto',
                      zIndex: 1000,
                      marginTop: 4
                    }}>
                      {patientSearchLoading ? (
                        <div style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <Text style={{ fontSize: 13, color: '#999' }}>搜索中...</Text>
                        </div>
                      ) : patientSearchResults.length > 0 ? (
                        patientSearchResults.map(patient => (
                          <div
                            key={patient.id}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid #f0f0f0',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                            onMouseLeave={(e) => e.target.style.background = '#fff'}
                            onMouseDown={() => handleSelectSearchPatient(patient)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Text strong style={{ fontSize: 13, color: '#1677ff' }}>
                                {patient.patient_code || patient.patientCode}
                              </Text>
                              <Text style={{ fontSize: 13 }}>{patient.name}</Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {patient.gender} {patient.age}岁
                              </Text>
                            </div>
                            {patient.diagnosis && patient.diagnosis.length > 0 && (
                              <div style={{ marginTop: 4 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  诊断: {patient.diagnosis.slice(0, 2).join('、')}
                                  {patient.diagnosis.length > 2 && '...'}
                                </Text>
                              </div>
                            )}
                          </div>
                        ))
                      ) : patientSearchValue ? (
                        <div style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <Text style={{ fontSize: 13, color: '#999' }}>未找到匹配的患者</Text>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          </Row>
        )}
      </Modal>

      {/* 原文档 / 提取数据预览抽屉（zIndex 高于患者匹配详情弹窗，避免被遮住） */}
      <Drawer
        title={
          <Space>
            <EyeOutlined />
            <Text>查看原文档 - {docPreviewName}</Text>
          </Space>
        }
        open={docPreviewVisible}
        onClose={() => setDocPreviewVisible(false)}
        width={900}
        destroyOnHidden
        zIndex={2100}
      >
        {docPreviewLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="加载预览..." />
          </div>
        ) : (
          <Tabs
            activeKey={docPreviewTab}
            onChange={setDocPreviewTab}
            items={[
              {
                key: 'original',
                label: '原文档',
                children: (
                  <div>
                    {!docPreviewTempUrl ? (
                      <Alert
                        type="warning"
                        showIcon
                        message="无法获取文档临时访问链接"
                        description="可能是文档未上传到对象存储或缺少 object_key。你仍可尝试 OCR 溯源页查看解析内容。"
                        action={
                          docPreviewDocumentId ? (
                            <Button size="small" onClick={() => navigate(`/document/ocr-viewer/${docPreviewDocumentId}`)}>
                              打开 OCR 溯源
                            </Button>
                          ) : null
                        }
                      />
                    ) : (
                      <div>
                        <div style={{ marginBottom: 12 }}>
                          <Space>
                            <Button
                              type="primary"
                              onClick={() => window.open(docPreviewTempUrl, '_blank', 'noopener,noreferrer')}
                            >
                              新窗口打开
                            </Button>
                            {docPreviewDocumentId && (
                              <Button onClick={() => navigate(`/document/ocr-viewer/${docPreviewDocumentId}`)}>
                                OCR 溯源
                              </Button>
                            )}
                          </Space>
                        </div>

                        {String(docPreviewFileType).toLowerCase() === 'pdf' ? (
                          <iframe
                            title="document-preview"
                            src={docPreviewTempUrl}
                            style={{ width: '100%', height: '70vh', border: '1px solid #f0f0f0', borderRadius: 8 }}
                          />
                        ) : ['image', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(String(docPreviewFileType).toLowerCase()) ? (
                          <img
                            alt="document-preview"
                            src={docPreviewTempUrl}
                            style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', border: '1px solid #f0f0f0', borderRadius: 8 }}
                          />
                        ) : (
                          <Alert
                            type="info"
                            showIcon
                            message="该文件类型不支持内嵌预览"
                            description={
                              <span>
                                请点击上方「新窗口打开」查看/下载原文件。
                              </span>
                            }
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              },
              {
                key: 'extracted',
                label: '提取数据',
                children: docPreviewExtractionRecord?.extracted_ehr_data ? (
                  <div style={{ 
                    background: '#1e1e1e', 
                    borderRadius: 8, 
                    padding: 16, 
                    maxHeight: '70vh', 
                    overflow: 'auto',
                    fontFamily: 'Consolas, Monaco, \"Courier New\", monospace'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#d4d4d4', 
                      fontSize: 13,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}>
                      {JSON.stringify(docPreviewExtractionRecord.extracted_ehr_data, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <Empty description="暂无抽取数据" />
                )
              }
            ]}
          />
        )}
      </Drawer>

      {/* 批量确认弹窗 */}
      <Modal
        title="批量智能确认"
        open={batchConfirmVisible}
        onCancel={() => setBatchConfirmVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setBatchConfirmVisible(false)}>
            取消
          </Button>,
          <Button key="confirm" type="primary">
            确认批量操作
          </Button>
        ]}
        width={600}
      >
        <Alert
          message="批量操作确认"
          description={`即将对 ${selectedDocs.length} 个文档执行智能匹配确认`}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        <div>
          <Text strong>操作预览:</Text>
          <List
            size="small"
            dataSource={selectedDocs.slice(0, 5)}
            renderItem={docId => {
              const doc = needsReviewDocs.find(d => d.id === docId)
              return doc ? (
                <List.Item>
                  <Space>
                    <FileTextOutlined />
                    <Text>{doc.name}</Text>
                    <Text type="secondary">→</Text>
                    <Text>{doc.aiRecommendation}</Text>
                    <Tag color="blue" size="small">AI推荐</Tag>
                  </Space>
                </List.Item>
              ) : null
            }}
          />
          {selectedDocs.length > 5 && (
            <Text type="secondary">...还有 {selectedDocs.length - 5} 个文档</Text>
          )}
        </div>
      </Modal>

      {/* 质量检查弹窗 */}
      <Modal
        title="AI处理质量检查"
        open={qualityCheckVisible}
        onCancel={() => setQualityCheckVisible(false)}
        footer={[
          <Button key="close" onClick={() => setQualityCheckVisible(false)}>
            关闭
          </Button>,
          <Button key="fix" type="primary">
            修复问题
          </Button>
        ]}
        width={700}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Card size="small" title="处理统计">
              <Statistic
                title="总体准确率"
                value={statistics.accuracy}
                suffix="%"
                valueStyle={{ color: '#52c41a' }}
              />
              <div style={{ marginTop: 12 }}>
                <Text strong>置信度分布:</Text>
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>高置信度</Text>
                    <Text style={{ color: '#52c41a' }}>{statistics.confidence.high}%</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>中置信度</Text>
                    <Text style={{ color: '#faad14' }}>{statistics.confidence.medium}%</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>低置信度</Text>
                    <Text style={{ color: '#ff4d4f' }}>{statistics.confidence.low}%</Text>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" title="质量问题">
              <Timeline
                size="small"
                items={[
                  {
                    color: 'green',
                    children: (
                      <div>
                        <Text strong>处理成功</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {statistics.autoProcessed}份文档自动处理成功
                        </Text>
                      </div>
                    )
                  },
                  {
                    color: 'orange',
                    children: (
                      <div>
                        <Text strong>需要确认</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {statistics.needsReview}份文档需要人工确认
                        </Text>
                      </div>
                    )
                  },
                  {
                    color: 'blue',
                    children: (
                      <div>
                        <Text strong>新患者识别</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          识别出{statistics.newPatients}名新患者
                        </Text>
                      </div>
                    )
                  }
                ]}
              />
            </Card>
          </Col>
        </Row>
      </Modal>

      {/* AI 抽取结果 JSON 查看弹窗 */}
      <Modal
        title={
          <Space>
            <CodeOutlined style={{ color: '#f59e0b' }} />
            <Text>AI 抽取结果 - {extractionDocName}</Text>
          </Space>
        }
        open={extractionResultVisible}
        onCancel={() => setExtractionResultVisible(false)}
        width={900}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyJson}>
            复制 JSON
          </Button>,
          <Button key="close" onClick={() => setExtractionResultVisible(false)}>
            关闭
          </Button>
        ]}
      >
        {extractionResultLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="加载抽取结果..." />
          </div>
        ) : extractionResultData ? (
          <div>
            {/* 元信息 */}
            <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
              <Space split={<Divider type="vertical" />}>
                <span>
                  <Text type="secondary">抽取时间：</Text>
                  <Text>{extractionResultData.created_at ? new Date(extractionResultData.created_at).toLocaleString() : '--'}</Text>
                </span>
                <span>
                  <Text type="secondary">字段数：</Text>
                  <Text strong style={{ color: '#1677ff' }}>{extractionResultData.fields_count || Object.keys(extractionResultData.extracted_ehr_data || {}).length}</Text>
                </span>
                <span>
                  <Text type="secondary">已合并：</Text>
                  <Tag color={extractionResultData.is_merged ? 'green' : 'orange'}>
                    {extractionResultData.is_merged ? '是' : '否'}
                  </Tag>
                </span>
                {extractionResultData.conflict_count > 0 && (
                  <span>
                    <Text type="secondary">冲突：</Text>
                    <Tag color="red">{extractionResultData.conflict_count}</Tag>
                  </span>
                )}
              </Space>
            </div>
            
            {/* JSON 展示 */}
            <div style={{ 
              background: '#1e1e1e', 
              borderRadius: 8, 
              padding: 16, 
              maxHeight: 500, 
              overflow: 'auto',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace'
            }}>
              <pre style={{ 
                margin: 0, 
                color: '#d4d4d4', 
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>
                {JSON.stringify(extractionResultData.extracted_ehr_data, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <Empty description="暂无抽取结果" />
        )}
      </Modal>

      {/* 创建新患者抽屉（复用组件，与“归档及审核”一致） */}
      <CreatePatientDrawer
        open={editPatientVisible}
        documentIds={
          editingPatientItem?.isBatch
            ? (editingPatientItem.documentIds || [])
            : (editingPatientItem?.id ? [editingPatientItem.id] : [])
        }
        onClose={handleCloseEditPatient}
        onSuccess={({ documentIds, patientData }) => {
          // 添加到已处理列表，触发消失动画
          if (documentIds?.length) {
            setProcessedDocs(prev => [...prev, ...documentIds])
            promptBatchMatchForSamePerson(patientData, documentIds)
          }
          // 清空选中
          setSelectedNewPatientDocs([])
          // 刷新列表
          setTimeout(() => {
            fetchNeedsReviewDocs()
            fetchNewPatientDocs()
            fetchAutoArchivedDocs()
          }, 300)
        }}
      />
    </div>
  )
}

export default AIProcessing