import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Row,
  Col,
  Card,
  Typography,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Checkbox,
  Spin,
  Alert,
  Radio,
  Badge,
  Table,
  Tooltip,
  Divider,
  Popover,
} from 'antd'
import {
  ArrowLeftOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DownloadOutlined,
  RobotOutlined,
  SendOutlined,
  ClearOutlined,
  UpOutlined,
  DownOutlined,
  ExperimentOutlined,
  TeamOutlined,
  LoadingOutlined,
} from '@ant-design/icons'

import ProjectSchemaEhrTab from '../PatientDetail/tabs/SchemaEhrTab/ProjectSchemaEhrTab'
import { getNestedValue } from '../../components/SchemaForm'

// 导入数据 Hook
import useProjectPatientData from './hooks/useProjectPatientData'
import {
  updateProjectPatientCrfFields,
  getProjectPatientCrfConflicts,
  resolveProjectPatientCrfConflict,
  resolveAllProjectPatientCrfConflicts,
  startCrfExtraction,
  getCrfExtractionProgress,
} from '@/api/project'
import { message } from 'antd'
import { FieldSourceModal } from '@/components/FieldSourceViewer'

const { Text } = Typography

const ProjectPatientDetail = () => {
  const { projectId, patientId } = useParams()
  const navigate = useNavigate()
  
  // 使用 Hook 获取真实数据
  const {
    loading,
    projectLoading,
    projectError,
    patientError,
    patientInfo,
    projectInfo,
    crfData,
    documents,
    ehrFieldGroups,
    refresh,
  } = useProjectPatientData(projectId, patientId)

  const projectName =
    projectInfo?.project_name ||
    projectInfo?.projectName ||
    projectInfo?.name ||
    '未知项目'
  
  // 状态管理
  const [extractionModalVisible, setExtractionModalVisible] = useState(false)
  const [extractionModalGroups, setExtractionModalGroups] = useState([])
  const [extractionModalMode, setExtractionModalMode] = useState('incremental')
  const [isExtracting, setIsExtracting] = useState(false)
  const [aiAssistantVisible, setAiAssistantVisible] = useState(false)
  const [aiChatHistory, setAiChatHistory] = useState([])
  const [aiInput, setAiInput] = useState('')
  const [statisticsCollapsed, setStatisticsCollapsed] = useState(false)
  const [aiModalPosition, setAiModalPosition] = useState({ x: 20, y: 80 })
  const [isDragging, setIsDragging] = useState(false)

  // 冲突解决（科研项目 CRF）
  const [conflictModalVisible, setConflictModalVisible] = useState(false)
  const [conflictsLoading, setConflictsLoading] = useState(false)
  const [pendingConflictCount, setPendingConflictCount] = useState(0)
  const [conflicts, setConflicts] = useState([])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewAudit, setPreviewAudit] = useState(null)

  function normalizePathWithSchema(rootSchema, rawPath) {
    if (!rootSchema || !Array.isArray(rawPath) || rawPath.length === 0) return rawPath

    const normalized = []
    let currentSchema = rootSchema
    let idx = 0

    while (idx < rawPath.length) {
      const seg = String(rawPath[idx])

      if (
        currentSchema?.type === 'array' &&
        currentSchema?.items?.type === 'object' &&
        currentSchema?.items?.properties &&
        !/^\d+$/.test(seg)
      ) {
        normalized.push('0')
        currentSchema = currentSchema.items
        continue
      }

      if (currentSchema?.properties?.[seg]) {
        normalized.push(seg)
        currentSchema = currentSchema.properties[seg]
        idx += 1
        continue
      }

      if (currentSchema?.items?.properties?.[seg]) {
        normalized.push(seg)
        currentSchema = currentSchema.items.properties[seg]
        idx += 1
        continue
      }

      normalized.push(seg)
      currentSchema = null
      idx += 1
    }

    return normalized
  }

  function setNestedValueByPath(target, path, value) {
    if (!target || !Array.isArray(path) || path.length === 0) return
    let current = target
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i]
      const nextSeg = path[i + 1]
      const nextIsIndex = /^\d+$/.test(String(nextSeg))
      if (current[seg] == null) {
        current[seg] = nextIsIndex ? [] : {}
      }
      current = current[seg]
    }
    current[path[path.length - 1]] = value
  }

  // 将 crf_data 的 groups 重建为 SchemaForm 可消费的数据树，并附带抽取元信息
  const schemaData = useMemo(() => {
    const data = crfData?.data && typeof crfData.data === 'object' ? { ...crfData.data } : {}
    const taskResults = crfData?._task_results || []
    const documents = crfData?._documents || {}
    const groups = crfData?.groups || {}
    const projectSchema = projectInfo?.schema_json && typeof projectInfo.schema_json === 'object'
      ? projectInfo.schema_json
      : null
    
    // 合并所有溯源信息到统一的 _extraction_metadata
    const allFields = {}
    
    // 1. 从 _task_results 中提取 audit.fields
    for (const task of taskResults) {
      const auditFields = task?.audit?.fields
      if (auditFields && typeof auditFields === 'object') {
        Object.assign(allFields, auditFields)
      }
    }
    
    // 2. 从 groups 中提取字段级别的溯源信息
    // groups 结构: { group_id: { fields: { field_key: { document_id, bbox, raw, source_id, page_idx, ... } } } }
    for (const [groupId, groupData] of Object.entries(groups)) {
      const fields = groupData?.fields
      if (fields && typeof fields === 'object') {
        for (const [fieldKey, fieldData] of Object.entries(fields)) {
          if (fieldData?.document_id || fieldData?.bbox || fieldData?.raw || fieldData?.source_id || fieldData?.document_type) {
            // 构建完整路径作为 key（与 SchemaForm 期望的格式一致）
            const fullPath = `${groupId} / ${fieldKey}`
            // 如果 allFields 中还没有这个字段的溯源信息，或者 groups 中的信息更完整
            if (!allFields[fullPath] || (!allFields[fullPath].bbox && fieldData.bbox)) {
              allFields[fullPath] = {
                document_id: fieldData.document_id,
                document_type: fieldData.document_type,
                raw: fieldData.raw,
                source_id: fieldData.source_id,
                bbox: fieldData.bbox,
                page_idx: fieldData.page_idx,
                value: fieldData.value,
              }
            }
            // 也用简单的 fieldKey 作为备用查找 key
            if (!allFields[fieldKey] || (!allFields[fieldKey].bbox && fieldData.bbox)) {
              allFields[fieldKey] = {
                document_id: fieldData.document_id,
                document_type: fieldData.document_type,
                raw: fieldData.raw,
                source_id: fieldData.source_id,
                bbox: fieldData.bbox,
                page_idx: fieldData.page_idx,
                value: fieldData.value,
              }
            }
          }
        }
      }
    }
    
    // 3. 从 groups 的 field_path/value 还原出 SchemaForm 需要的嵌套 patientData
    for (const [groupId, groupData] of Object.entries(groups)) {
      const fields = groupData?.fields
      if (!fields || typeof fields !== 'object') continue
      for (const [fieldKey, fieldData] of Object.entries(fields)) {
        if (fieldKey.startsWith('_') || !fieldData || typeof fieldData !== 'object') continue
        const val = fieldData.value
        if (val === undefined || val === null || val === '') continue

        const parts = [groupId, ...String(fieldKey).split('/').filter(Boolean)]
        const normalizedParts = normalizePathWithSchema(projectSchema, parts)
        setNestedValueByPath(data, normalizedParts, val)
      }
    }

    // 构造 SchemaForm 期望的 _extraction_metadata 结构
    return {
      ...data,
      _extraction_metadata: {
        audit: { fields: allFields },
        documents,
        extracted_at: crfData?._extracted_at,
        edited_at: crfData?._edited_at,
        edited_by: crfData?._edited_by,
        stats: crfData?._stats
      },
      // 将 _change_logs 透传给 SchemaForm，供修改历史面板直接读取（无需额外 API）
      _change_logs: Array.isArray(crfData?._change_logs) ? crfData._change_logs : [],
    }
  }, [crfData, projectInfo])

  const documentsMap = useMemo(() => crfData?._documents || {}, [crfData])
  const schemaRenderKey = useMemo(() => {
    const groupKeys = Object.keys(crfData?.groups || {}).sort().join('|')
    const extractedAt = crfData?._extracted_at || 'none'
    return `${projectId || 'project'}:${patientId || 'patient'}:${groupKeys}:${extractedAt}`
  }, [projectId, patientId, crfData])

  const fetchConflicts = useCallback(async () => {
    if (!projectId || !patientInfo?.patientId) return
    setConflictsLoading(true)
    try {
      const res = await getProjectPatientCrfConflicts(projectId, patientInfo?.patientId, { status: 'pending', limit: 200 })
      if (res?.success) {
        const list = res?.data?.conflicts || []
        setConflicts(list)
        setPendingConflictCount(res?.data?.pending || list.length || 0)
      } else {
        setConflicts([])
        setPendingConflictCount(0)
      }
    } catch (e) {
      console.error('获取冲突失败:', e)
      setConflicts([])
      setPendingConflictCount(0)
    } finally {
      setConflictsLoading(false)
    }
  }, [projectId, patientInfo?.patientId])

  useEffect(() => {
    fetchConflicts()
  }, [fetchConflicts])

  const openConflictModal = useCallback(() => {
    setConflictModalVisible(true)
    fetchConflicts()
  }, [fetchConflicts])

  const closeConflictModal = useCallback(() => {
    setConflictModalVisible(false)
  }, [])

  const openPreview = useCallback((title, audit) => {
    setPreviewTitle(title)
    setPreviewAudit(audit || null)
    setPreviewVisible(true)
  }, [])

  const closePreview = useCallback(() => {
    setPreviewVisible(false)
    setPreviewAudit(null)
  }, [])

  const handleResolveConflict = useCallback(async (conflictId, action) => {
    if (!projectId || !patientInfo?.patientId) return
    try {
      const res = await resolveProjectPatientCrfConflict(projectId, patientInfo?.patientId, conflictId, { action })
      if (res?.success) {
        message.success(action === 'adopt' ? '已采用新值' : (action === 'keep' ? '已保留旧值' : '已忽略'))
        await fetchConflicts()
        // adopt 会写入 CRF 数据，需要刷新详情以更新表单显示
        if (action === 'adopt') {
          await refresh()
        }
      } else {
        message.error(res?.message || '解决冲突失败')
      }
    } catch (e) {
      message.error(e?.message || '解决冲突失败')
    }
  }, [projectId, patientInfo?.patientId, fetchConflicts, refresh])

  const handleResolveAll = useCallback(async (action) => {
    if (!projectId || !patientInfo?.patientId) return
    try {
      const res = await resolveAllProjectPatientCrfConflicts(projectId, patientInfo?.patientId, { action })
      if (res?.success) {
        message.success('批量处理完成')
        await fetchConflicts()
        if (action === 'adopt') {
          await refresh()
        }
      } else {
        message.error(res?.message || '批量处理失败')
      }
    } catch (e) {
      message.error(e?.message || '批量处理失败')
    }
  }, [projectId, patientInfo?.patientId, fetchConflicts, refresh])

  /**
   * 渲染值的简短形式（用于表格单元格）
   */
  const renderValueBrief = (v, maxLen = 60) => {
    if (v === null || v === undefined) return '—'
    if (typeof v === 'string') return v.length > maxLen ? `${v.slice(0, maxLen)}...` : (v || '—')
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (Array.isArray(v)) {
      if (v.length === 0) return '—'
      // 数组：渲染为简洁列表
      const preview = v.slice(0, 3).map((item, idx) => 
        typeof item === 'object' 
          ? `[${idx + 1}] ${Object.values(item).filter(x => x != null).slice(0, 2).join(', ') || '...'}`
          : `[${idx + 1}] ${item}`
      ).join('; ')
      return v.length > 3 ? `${preview}; (+${v.length - 3})` : preview
    }
    if (typeof v === 'object') {
      // 对象：渲染为 key: value 形式
      const entries = Object.entries(v).filter(([_, val]) => val != null && val !== '')
      if (entries.length === 0) return '—'
      const preview = entries.slice(0, 3).map(([k, val]) => 
        `${k}: ${typeof val === 'object' ? '...' : String(val).slice(0, 20)}`
      ).join('; ')
      return entries.length > 3 ? `${preview}; (+${entries.length - 3})` : preview
    }
    return String(v)
  }

  /**
   * 渲染值的完整形式（用于弹窗/详情）
   */
  const renderValueFull = (v) => {
    if (v === null || v === undefined) return <Text type="secondary">—</Text>
    if (typeof v === 'string') return <Text>{v || '—'}</Text>
    if (typeof v === 'number' || typeof v === 'boolean') return <Text>{String(v)}</Text>
    
    if (Array.isArray(v)) {
      if (v.length === 0) return <Text type="secondary">（空数组）</Text>
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {v.map((item, idx) => (
            <div key={idx} style={{ background: '#fafafa', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>
              <Text type="secondary" style={{ marginRight: 4 }}>#{idx + 1}</Text>
              {typeof item === 'object' ? (
                <span>
                  {Object.entries(item).filter(([_, val]) => val != null && val !== '').slice(0, 4).map(([k, val]) => (
                    <span key={k} style={{ marginRight: 8 }}>
                      <Text type="secondary">{k}:</Text> <Text>{String(val).slice(0, 30)}</Text>
                    </span>
                  ))}
                </span>
              ) : (
                <Text>{String(item)}</Text>
              )}
            </div>
          ))}
        </div>
      )
    }
    
    if (typeof v === 'object') {
      const entries = Object.entries(v).filter(([_, val]) => val != null && val !== '')
      if (entries.length === 0) return <Text type="secondary">（空对象）</Text>
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {entries.map(([k, val]) => (
            <div key={k} style={{ fontSize: 12 }}>
              <Text type="secondary">{k}: </Text>
              <Text>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</Text>
            </div>
          ))}
        </div>
      )
    }
    
    return <Text>{String(v)}</Text>
  }

  const getSchemaFieldPath = (fieldKey, field) => {
    const raw = field?.field_path || field?.db_field || fieldKey
    if (!raw) return raw
    return raw
      .replace(/\[\*\]/g, '')
      .split('/')
      .filter(Boolean)
      .join('.')
  }

  const normalizeValue = (value) => (value === undefined ? null : value)

  const isValueEqual = (a, b) => {
    const left = normalizeValue(a)
    const right = normalizeValue(b)
    if (left === right) return true
    if (typeof left !== typeof right) return false
    if (typeof left === 'object') {
      return JSON.stringify(left) === JSON.stringify(right)
    }
    return false
  }

  const handleProjectSchemaSave = useCallback(async (draftData) => {
    if (!projectId || !patientInfo?.patientId) {
      message.warning('保存失败：未找到患者信息')
      return
    }

    const groups = crfData?.groups || {}
    const updates = []

    Object.entries(groups).forEach(([groupId, group]) => {
      const fields = group?.fields || {}
      Object.entries(fields).forEach(([fieldKey, field]) => {
        const fieldPath = getSchemaFieldPath(fieldKey, field)
        if (!fieldPath) return
        const newValue = getNestedValue(draftData, fieldPath)
        const oldValue = getNestedValue(schemaData, fieldPath)
        if (!isValueEqual(newValue, oldValue)) {
          updates.push({
            group_id: groupId,
            field_key: fieldKey,
            value: newValue,
          })
        }
      })
    })

    if (updates.length === 0) {
      message.info('没有需要保存的修改')
      return
    }

    try {
      const res = await updateProjectPatientCrfFields(projectId, patientInfo?.patientId, {
        fields: updates,
      })
      if (res.success) {
        message.success('保存成功')
        refresh?.()
      } else {
        message.error(res.message || '保存失败')
      }
    } catch (e) {
      console.error('保存项目 CRF 字段失败:', e)
      message.error(e?.message || '保存失败')
    }
  }, [projectId, patientInfo?.patientId, crfData, schemaData, refresh])

  // 初始化AI聊天历史
  useEffect(() => {
    setAiChatHistory([
      {
        type: 'ai',
        content: `您好！我是项目AI助手。目前正在查看患者 ${patientInfo?.name || '未知患者'} 在项目中的数据。有什么可以帮助您的吗？`,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }
    ])
  }, [patientInfo?.name])

  const handleUploadProjectDocument = () => {
    console.log('上传项目文档')
  }

  const handleSendAiMessage = () => {
    if (!aiInput.trim()) return
    
    const newMessage = {
      type: 'user',
      content: aiInput,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    
    setAiChatHistory([...aiChatHistory, newMessage])
    setAiInput('')
    
    // 模拟AI回复
    setTimeout(() => {
      const aiReply = {
        type: 'ai',
        content: '我正在分析患者的项目数据，请稍等...',
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }
      setAiChatHistory(prev => [...prev, aiReply])
    }, 1000)
  }

  const handleClearChat = () => {
    setAiChatHistory([])
  }

  // 计算统计数据
  const completedGroups = useMemo(() => {
    return ehrFieldGroups.filter(g => g.status === 'completed').length
  }, [ehrFieldGroups])

  const extractedDocuments = useMemo(() => {
    return documents.filter(d => d.status === 'extracted').length
  }, [documents])

  // 加载状态
  if (loading || projectLoading) {
    return (
      <div className="page-container fade-in" style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: 400 
      }}>
        <Spin 
          indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />}
          tip="正在加载患者数据..."
        />
      </div>
    )
  }

  const handleOpenExtractionModal = () => {
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
    setIsExtracting(true)
    try {
      const response = await startCrfExtraction(
        projectId,
        [patientId],
        extractionModalMode,
        extractionModalGroups
      )
      if (response.success) {
        message.success('专项抽取任务已启动')
        const taskId = response.data?.active_task?.task_id || response.data?.task_id
        if (!taskId) {
          setIsExtracting(false)
          message.error('启动专项抽取失败：未返回任务标识')
          return
        }
        const poll = async () => {
          try {
            const res = await getCrfExtractionProgress(projectId, taskId)
            const progress = res?.data || res
            if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(progress.status)) {
              setIsExtracting(false)
              if (progress.status === 'completed' || progress.status === 'completed_with_errors') {
                message.success('专项抽取完成')
              } else {
                message.warning(`抽取${progress.status === 'failed' ? '失败' : '已取消'}`)
              }
              refresh()
              return
            }
            setTimeout(poll, 2000)
          } catch {
            setIsExtracting(false)
          }
        }
        poll()
      } else {
        message.error(response.message || '启动专项抽取失败')
        setIsExtracting(false)
      }
    } catch (error) {
      console.error('专项抽取失败:', error)
      message.error('启动专项抽取失败')
      setIsExtracting(false)
    }
  }

  return (
    <div className="page-container fade-in">
      {/* 页面导航 */}
      <div style={{ marginBottom: 16 }}>
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate(`/research/projects/${projectId}`)}
        >
          返回项目
        </Button>
      </div>

      {/* 患者项目统计 */}
      <Card 
        size="small" 
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <Text strong>患者项目概览</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {projectName} - {patientInfo.name} ({patientInfo.subjectId || patientInfo.patientCode || patientInfo.patientId})
            </Text>
          </Space>
        }
        extra={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <Button onClick={openConflictModal}>
              <Space size={6}>
                <span>⚠️ 解决冲突</span>
                <Badge count={pendingConflictCount} size="small" />
              </Space>
            </Button>
            <div style={{ width: '1px', height: '20px', backgroundColor: '#d9d9d9', margin: '0 4px' }} />
            <Button 
              type="text" 
              icon={statisticsCollapsed ? <DownOutlined /> : <UpOutlined />}
              onClick={() => setStatisticsCollapsed(!statisticsCollapsed)}
            >
              {statisticsCollapsed ? '展开' : '收起'}
            </Button>
          </div>
        }
        styles={{ body: { padding: statisticsCollapsed ? 0 : undefined, display: statisticsCollapsed ? 'none' : 'block' } }}
      >
        {(projectError || patientError) && (
          <Alert
            type="error"
            showIcon
            message="项目/患者数据加载失败"
            description={
              <div>
                {projectError && (
                  <div>项目详情失败：{projectError}</div>
                )}
                {patientError && (
                  <div>患者详情失败：{patientError}</div>
                )}
                <div style={{ marginTop: 8, opacity: 0.8 }}>
                  Debug: projectId={projectId}，patientId={patientId}
                </div>
              </div>
            }
            style={{ marginBottom: 12 }}
          />
        )}
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
                  <CheckCircleOutlined style={{ fontSize: 18, marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>数据完整度</Text>
                </div>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                  {Math.round(patientInfo.crfCompleteness || 0)}%
                </div>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  目标: 90% 以上
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
                  <FileTextOutlined style={{ fontSize: 18, marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>项目文档</Text>
                </div>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                  {documents.length || 0}
                </div>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  已处理: {extractedDocuments}份
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
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>受试者状态</Text>
                </div>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                  {patientInfo.status === 'enrolled' ? '已入组' : patientInfo.status || '未知'}
                </div>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  入组日期: {patientInfo.enrollmentDate || '未知'}
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
                  <TeamOutlined style={{ fontSize: 18, marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>字段组</Text>
                </div>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                  {ehrFieldGroups.length || 0}
                </div>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  已完成: {completedGroups}个
                </Text>
              </div>
            </Col>
          </Row>
        )}
      </Card>

      {/* 冲突解决弹窗 */}
      <Modal
        title={
          <Space>
            <span>⚠️ 字段冲突解决</span>
            <Tag color={pendingConflictCount > 0 ? 'red' : 'green'}>
              待处理 {pendingConflictCount}
            </Tag>
          </Space>
        }
        open={conflictModalVisible}
        onCancel={closeConflictModal}
        footer={null}
        width={1100}
        destroyOnClose
      >
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">冲突只会在“再抽取/重复抽取”时产生：系统不会覆盖旧值，而是等待你选择。</Text>
          <Space>
            <Tooltip title="把所有 pending 冲突都标记为“保留旧值”（不改 CRF 数据）">
              <Button disabled={pendingConflictCount === 0} onClick={() => handleResolveAll('keep')}>全部保留旧值</Button>
            </Tooltip>
            <Tooltip title="把所有 pending 冲突都标记为“采用新值”（会写入 CRF 数据）">
              <Button type="primary" disabled={pendingConflictCount === 0} onClick={() => handleResolveAll('adopt')}>全部采用新值</Button>
            </Tooltip>
          </Space>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <Table
          rowKey="id"
          loading={conflictsLoading}
          dataSource={conflicts}
          pagination={{ pageSize: 8 }}
          size="small"
          columns={[
            {
              title: '字段',
              dataIndex: 'field_path',
              key: 'field_path',
              width: 220,
              render: (v) => <Text code>{v}</Text>
            },
            {
              title: '旧值',
              dataIndex: 'old_value',
              key: 'old_value',
              width: 280,
              render: (v, record) => (
                <div>
                  <Popover 
                    title="旧值详情" 
                    content={<div style={{ maxWidth: 300, maxHeight: 200, overflow: 'auto' }}>{renderValueFull(v)}</div>}
                    trigger="hover"
                  >
                    <div style={{ cursor: 'pointer', borderBottom: '1px dashed #d9d9d9' }}>
                      {renderValueBrief(v, 40)}
                    </div>
                  </Popover>
                  <div style={{ marginTop: 6 }}>
                    <Button size="small" onClick={() => openPreview('旧值来源', record.old_field || { value: v })}>预览来源</Button>
                  </div>
                </div>
              )
            },
            {
              title: '新值',
              dataIndex: 'new_value',
              key: 'new_value',
              width: 280,
              render: (v, record) => (
                <div>
                  <Popover 
                    title="新值详情" 
                    content={<div style={{ maxWidth: 300, maxHeight: 200, overflow: 'auto' }}>{renderValueFull(v)}</div>}
                    trigger="hover"
                  >
                    <div style={{ cursor: 'pointer', borderBottom: '1px dashed #1890ff' }}>
                      {renderValueBrief(v, 40)}
                    </div>
                  </Popover>
                  <div style={{ marginTop: 6 }}>
                    <Button size="small" type="primary" ghost onClick={() => openPreview('新值来源', record.new_field || { value: v })}>预览来源</Button>
                  </div>
                </div>
              )
            },
            {
              title: '操作',
              key: 'actions',
              width: 230,
              render: (_, record) => (
                <Space>
                  <Button type="primary" onClick={() => handleResolveConflict(record.id, 'adopt')}>采用新值</Button>
                  <Button onClick={() => handleResolveConflict(record.id, 'keep')}>保留旧值</Button>
                  <Button danger onClick={() => handleResolveConflict(record.id, 'ignore')}>忽略</Button>
                </Space>
              )
            }
          ]}
        />
      </Modal>

      {/* 来源预览（复用 FieldSourceModal：audit 直接传字段对象即可） */}
      <FieldSourceModal
        visible={previewVisible}
        onClose={closePreview}
        fieldName={previewTitle}
        fieldValue={previewAudit?.value}
        fieldData={previewAudit}
        audit={previewAudit}
        documents={documentsMap}
      />

      <Card
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: 0, overflow: 'hidden' } }}
      >
        <ProjectSchemaEhrTab
          key={schemaRenderKey}
          projectId={projectId}
          projectName={projectName}
          schemaData={projectInfo?.schema_json || null}
          patientData={schemaData}
          patientId={patientInfo?.patientId}
          projectDocuments={documents}
          onSave={handleProjectSchemaSave}
          onUploadDocument={handleUploadProjectDocument}
        />
      </Card>

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
        width={600}
      >
        <Alert
          message="专项抽取任务"
          description={`患者: ${patientInfo.name} (${patientInfo.subjectId || patientInfo.patientCode || patientInfo.patientId}) | 已选字段组: ${extractionModalGroups.length} 个`}
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
                  onClick={() => setExtractionModalGroups(ehrFieldGroups.map(g => g.key))}
                >
                  全选
                </Button>
                <Button
                  size="small"
                  type="link"
                  style={{ padding: 0 }}
                  onClick={() => setExtractionModalGroups(
                    ehrFieldGroups.filter(g => g.status !== 'completed').map(g => g.key)
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
                {ehrFieldGroups.map(group => (
                  <Col span={24} key={group.key} style={{ marginBottom: 8 }}>
                    <Checkbox value={group.key}>
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
          

        </Form>
      </Modal>

      {/* AI助手可拖动悬浮窗 */}
      <Modal
        title={
          <div 
            style={{ 
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              padding: '4px 0'
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              setIsDragging(true)
              
              const startX = e.clientX
              const startY = e.clientY
              const startPosX = aiModalPosition.x
              const startPosY = aiModalPosition.y

              const handleMouseMove = (moveEvent) => {
                const deltaX = moveEvent.clientX - startX
                const deltaY = moveEvent.clientY - startY
                
                const newX = startPosX + deltaX
                const newY = startPosY + deltaY
                
                const maxX = window.innerWidth - 450
                const maxY = window.innerHeight - 400
                
                const boundedX = Math.max(0, Math.min(newX, maxX))
                const boundedY = Math.max(0, Math.min(newY, maxY))
                
                setAiModalPosition({ x: boundedX, y: boundedY })
              }

              const handleMouseUp = () => {
                setIsDragging(false)
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
              }

              document.addEventListener('mousemove', handleMouseMove)
              document.addEventListener('mouseup', handleMouseUp)
            }}
          >
            <Space>
              <RobotOutlined style={{ color: '#1677ff' }} />
              <Text strong>项目AI助手</Text>
              <Tag size="small">{projectName}</Tag>
            </Space>
          </div>
        }
        open={aiAssistantVisible}
        onCancel={() => setAiAssistantVisible(false)}
        footer={null}
        width={450}
        style={{ 
          position: 'fixed',
          top: aiModalPosition.y,
          left: aiModalPosition.x,
          margin: 0,
          paddingBottom: 0
        }}
        mask={false}
        getContainer={false}
      >
        {/* 聊天历史 */}
        <div style={{ height: 300, overflowY: 'auto', marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, padding: 12 }}>
          {aiChatHistory.map((message, index) => (
            <div key={index} style={{ marginBottom: 12 }}>
              <div style={{
                display: 'flex',
                justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start'
              }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: message.type === 'user' ? '#1677ff' : '#f5f5f5',
                  color: message.type === 'user' ? 'white' : 'rgba(0,0,0,0.88)'
                }}>
                  <div style={{ fontSize: 12 }}>
                    {message.type === 'user' ? '💬 您' : '🤖 AI'}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {message.content}
                  </div>
                  <div style={{ 
                    fontSize: 10, 
                    marginTop: 4, 
                    opacity: 0.7,
                    textAlign: 'right'
                  }}>
                    {message.timestamp}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 输入区域 */}
        <div>
          <Input.Group compact>
            <Input
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="输入项目相关问题..."
              onPressEnter={handleSendAiMessage}
              style={{ width: 'calc(100% - 80px)' }}
            />
            <Button 
              type="primary" 
              icon={<SendOutlined />}
              onClick={handleSendAiMessage}
              style={{ width: 60 }}
            />
            <Button 
              icon={<ClearOutlined />}
              onClick={handleClearChat}
              style={{ width: 20 }}
            />
          </Input.Group>
          
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>💡 快速提问:</Text>
            <div style={{ marginTop: 4 }}>
              <Space size="small" wrap>
                <Button 
                  type="link" 
                  size="small" 
                  style={{ padding: '2px 6px', height: 'auto', fontSize: 11 }}
                  onClick={() => setAiInput('数据完善建议')}
                >
                  数据完善建议
                </Button>
                <Button 
                  type="link" 
                  size="small" 
                  style={{ padding: '2px 6px', height: 'auto', fontSize: 11 }}
                  onClick={() => setAiInput('质量检查报告')}
                >
                  质量检查报告
                </Button>
                <Button 
                  type="link" 
                  size="small" 
                  style={{ padding: '2px 6px', height: 'auto', fontSize: 11 }}
                  onClick={() => setAiInput('抽取优化建议')}
                >
                  抽取优化建议
                </Button>
              </Space>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ProjectPatientDetail
