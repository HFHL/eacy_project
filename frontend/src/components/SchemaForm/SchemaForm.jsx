/**
 * Schema表单主组件
 * 组合CategoryTree和FormPanel，提供完整的Schema驱动表单体验
 * 支持三栏布局：左侧目录树 + 中间表单 + 右侧文档溯源
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  Layout,
  Button,
  Space,
  message,
  Modal,
  Spin,
  Typography,
  Tooltip,
  Badge,
  Empty,
  Tag,
  Divider,
  Progress
} from 'antd'
import {
  SaveOutlined,
  UndoOutlined,
  CloudSyncOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  RightOutlined,
  LeftOutlined,
  PushpinOutlined,
  PushpinFilled,
  FileSearchOutlined,
  HistoryOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  ClockCircleOutlined,
  UserOutlined,
  EditOutlined,
  UploadOutlined,
  CloudUploadOutlined,
  ThunderboltOutlined,
  UpOutlined,
  DownOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  RotateRightOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  DragOutlined,
  AimOutlined
} from '@ant-design/icons'
import { Upload } from 'antd'
import { SchemaFormProvider, useSchemaForm } from './SchemaFormContext'
import CategoryTree from './CategoryTree'
import FormPanel from './FormPanel'
import { getDocumentDetail, getDocumentTempUrl, getDocumentPdfStreamUrl, uploadAndArchiveAsync, getDocumentTaskProgress } from '../../api/document'
import { getEhrFieldHistoryV2, getFieldConflicts, resolveFieldConflict } from '../../api/patient'
import PdfPageWithHighlight from '../PdfPageWithHighlight'
import { getProjectCrfFieldHistory } from '../../api/project'
import { upsertTask, getTasksByScope } from '../../utils/taskStore'
import { maskSensitiveField } from '../../utils/sensitiveUtils'
import {
  toAuditPath as _toAuditPath,
  toAuditPathWithoutIndex as _toAuditPathWithoutIndex,
  normalizePathKey as _normalizePathKey,
  getNestedValue as _getNestedValue,
  hasNestedKey as _hasNestedKey,
  formatAuditDisplayValue as _formatAuditDisplayValue,
  resolveFieldAudit,
  collectPatientAuditFieldMaps,
} from '../../utils/auditResolver'
import DocumentDetailModal from '../../pages/PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal'

const { Sider, Content } = Layout
const { Text, Paragraph } = Typography

function _resolveFieldAuditFromExtractionMetadata(data, dotPath) {
  if (!dotPath) return null
  const fieldMaps = collectPatientAuditFieldMaps(data)
  if (fieldMaps.length === 0) return null
  return resolveFieldAudit(fieldMaps, dotPath)
}

function _buildSourceLocationFromAudit(audit) {
  if (!audit || typeof audit !== 'object') return null
  if (audit.source_location) return audit.source_location
  if (Array.isArray(audit.bbox) && audit.bbox.length >= 4) {
    return {
      bbox: audit.bbox,
      page: typeof audit.page_idx === 'number' ? audit.page_idx + 1 : 1,
    }
  }
  return null
}

function useAutoSave(enabled, interval, onSave) {
  const timerRef = useRef(null)
  const { isDirty, draftData } = useSchemaForm()
  useEffect(() => {
    if (!enabled || !isDirty) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { if (onSave) onSave(draftData, 'auto') }, interval)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [enabled, isDirty, draftData, interval, onSave])
}

const Toolbar = ({ onSave, onReset, saving, autoSaveEnabled, onToggleAutoSave }) => {
  const { isDirty } = useSchemaForm()
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '10px 16px', background: '#fff', borderBottom: '1px solid #f0f0f0', borderRadius: '8px 8px 0 0' }}>
      <Space>
        <Tooltip title={autoSaveEnabled ? '关闭自动保存' : '开启自动保存'}>
          <Button type={autoSaveEnabled ? 'primary' : 'default'} ghost={autoSaveEnabled} size="small" icon={<CloudSyncOutlined />} onClick={onToggleAutoSave}>自动保存 {autoSaveEnabled ? '开' : '关'}</Button>
        </Tooltip>
        <Button size="small" icon={<UndoOutlined />} onClick={onReset} disabled={!isDirty}>重置</Button>
        <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => onSave('manual')} loading={saving} disabled={!isDirty}>保存</Button>
      </Space>
    </div>
  )
}

/** 从 8 点 position [x1,y1,x2,y2,x3,y3,x4,y4] 得到包围矩形 [minX, minY, maxX, maxY]（0–1000 归一化）。
 * 若提供 pageWidth、pageHeight，按页面宽高分别归一化，避免框偏移；
 * 否则若坐标明显为像素（max > 1000），则用单一比例缩放到 0–1000。 */
function _positionToBbox(position, pageWidth, pageHeight) {
  if (!Array.isArray(position) || position.length < 8) return null
  const xs = [position[0], position[2], position[4], position[6]]
  const ys = [position[1], position[3], position[5], position[7]]
  let minX = Math.min(...xs)
  let minY = Math.min(...ys)
  let maxX = Math.max(...xs)
  let maxY = Math.max(...ys)
  const hasPageSize = typeof pageWidth === 'number' && pageWidth > 0 && typeof pageHeight === 'number' && pageHeight > 0
  if (hasPageSize) {
    minX = (minX / pageWidth) * 1000
    minY = (minY / pageHeight) * 1000
    maxX = (maxX / pageWidth) * 1000
    maxY = (maxY / pageHeight) * 1000
  } else {
    const maxCoord = Math.max(maxX, maxY)
    if (maxCoord > 1000 && maxCoord > 0) {
      const scale = 1000 / maxCoord
      minX *= scale
      minY *= scale
      maxX *= scale
      maxY *= scale
    }
  }
  return [minX, minY, maxX, maxY]
}

/** 将 history 接口的 source_location 转为预览组件用的 activeCoordinates（支持单个或多个区块）。
 * 优先使用 content_list 的 position（8 点），无则使用 bbox（4 点）。 */
function _sourceLocationToCoordinates(loc) {
  if (!loc) return null

  const toCoord = (item) => {
    if (!item || typeof item !== 'object') return null

    // 如果传入的是外层的 audit item，自动解包 source_location
    const locItem = item.source_location || item

    // 优先使用 position（8 点），再回退到 bbox（4 点）
    let bbox = locItem.bbox
    if ((!bbox || bbox.length < 4) && Array.isArray(locItem.position) && locItem.position.length >= 8) {
      bbox = _positionToBbox(
        locItem.position,
        locItem.page_width,
        locItem.page_height
      )
    }
    if (!Array.isArray(bbox) || bbox.length < 4) return null
    let [x1, y1, x2, y2] = bbox
    const maxCoord = Math.max(x1, y1, x2, y2)
    const isAbsolute = maxCoord > 1000
    
    // 如果超过 1000，不要硬生生均匀压缩，那会破坏宽高比导致变窄或变长！直接原样返回并打标签
    const page = locItem.page != null ? Number(locItem.page) : 1
    return {
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
      pageWidth: 1000,
      pageHeight: 1000,
      pageIdx: Math.max(0, page - 1),
      isAbsolute
    }
  }

  // 多个区块：loc 为数组
  if (Array.isArray(loc)) {
    const coords = loc.map(toCoord).filter(Boolean)
    return coords.length ? coords : null
  }

  // 单个区块：loc 为对象
  if (typeof loc === 'object') {
    return toCoord(loc)
  }
  return null
}

const ModificationHistory = ({ fieldPath, patientId, projectId, refreshKey = 0, onViewSource, onHistoryLoaded, isSensitive = false, onApplyValue = null }) => {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  const subFieldMatch = /\.(\d+)\.(.+)$/.exec(fieldPath)
  const rowMatch = !subFieldMatch ? /\.(\d+)$/.exec(fieldPath) : null
  const arrayIdx = subFieldMatch ? parseInt(subFieldMatch[1], 10) : rowMatch ? parseInt(rowMatch[1], 10) : null
  const subFieldPath = subFieldMatch ? subFieldMatch[2] : null

  useEffect(() => {
    let cancelled = false
    async function fetchHistory() {
      if (!fieldPath) {
        setHistory([])
        if (typeof onHistoryLoaded === 'function') onHistoryLoaded([])
        return
      }
      if (projectId && patientId) {
        // 科研项目模式：调用项目专用历史 API（后端会做路径归一化）
        setLoading(true)
        try {
          const res = await getProjectCrfFieldHistory(projectId, patientId, fieldPath)
          const list = !cancelled && res?.data?.history ? res.data.history : []
          if (!cancelled) {
            setHistory(list)
            if (typeof onHistoryLoaded === 'function') onHistoryLoaded(list)
          }
        } catch (e) {
          console.error('Failed to fetch project field history:', e)
          if (!cancelled) {
            setHistory([])
            if (typeof onHistoryLoaded === 'function') onHistoryLoaded([])
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      } else if (patientId) {
        // 患者数据池模式：调用 EHR V2 历史 API
        setLoading(true)
        try {
          const res = await getEhrFieldHistoryV2(patientId, fieldPath)
          const list = !cancelled && res?.data?.history ? res.data.history : []
          if (!cancelled) {
            setHistory(list)
            if (typeof onHistoryLoaded === 'function') onHistoryLoaded(list)
          }
        } catch (e) {
          console.error('Failed to fetch field history:', e)
          if (!cancelled) {
            setHistory([])
            if (typeof onHistoryLoaded === 'function') onHistoryLoaded([])
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      } else {
        setHistory([])
        if (typeof onHistoryLoaded === 'function') onHistoryLoaded([])
      }
    }
    fetchHistory()
    return () => { cancelled = true }
  }, [patientId, projectId, fieldPath, refreshKey, onHistoryLoaded])

  // 从候选值记录中提取可直接 apply 的值
  // new_value 是后端返回的已 JSON.parse 后的 JS 值（数字/字符串/数组/对象）
  const extractDisplayValue = (item) => {
    const val = item.new_value
    if (arrayIdx === null) return val
    const arr = Array.isArray(val) ? val : null
    if (!arr) return val
    const row = arr[arrayIdx]
    if (subFieldPath && row != null) {
      return _getNestedValue(row, subFieldPath)
    }
    return row
  }

  // 格式化值的显示（敏感字段自动脱敏）
  const formatValue = (val) => {
    if (val === null || val === undefined || val === '') return '—'
    let str
    if (typeof val === 'object') {
      try {
        // 对象类型：展示 key=value 对
        const entries = Object.entries(val)
        str = entries.map(([k, v]) => `${k}: ${v || '—'}`).join('，')
        if (str.length > 80) str = str.substring(0, 80) + '...'
      } catch {
        str = String(val)
      }
    } else {
      str = String(val)
      if (str.length > 80) str = str.substring(0, 80) + '...'
    }
    if (isSensitive && str && str !== '—') {
      return maskSensitiveField(str, fieldPath)
    }
    return str
  }

  // 置信度颜色
  const getConfidenceColor = (conf) => {
    if (conf == null) return '#d9d9d9'
    if (conf >= 0.9) return '#52c41a'
    if (conf >= 0.75) return '#1890ff'
    if (conf >= 0.6) return '#faad14'
    return '#ff4d4f'
  }

  // 操作类型颜色和标签
  const getTypeInfo = (item) => {
    if (item.change_type === 'manual_edit' || item.operator_type === 'user') {
      return { color: 'green', label: '手动修改' }
    }
    if (item.change_type === 'initial_extract' || item.operator_type === 'system') {
      return { color: 'default', label: '系统初始化' }
    }
    return { color: 'blue', label: 'AI 抽取' }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, padding: '6px 8px', background: '#f5f5f5', borderRadius: 4 }}>
        <DatabaseOutlined style={{ color: '#1890ff', marginRight: 6 }} />
        <Text strong style={{ fontSize: 12 }}>抽取历史</Text>
        {loading ? (
          <Spin size="small" style={{ marginLeft: 8 }} />
        ) : (
          <Badge count={history.length} size="small" style={{ marginLeft: 8, backgroundColor: history.length > 0 ? '#1890ff' : '#d9d9d9' }} />
        )}
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /><div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>加载中...</div></div>
      ) : history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 16, color: '#999', fontSize: 11 }}>暂无抽取记录</div>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto' }} className="schema-form-scrollable">
          {history.map((item, index) => {
            const displayVal = extractDisplayValue(item)
            const typeInfo = getTypeInfo(item)
            const confColor = getConfidenceColor(item.confidence)
            const hasSource = !!(item.source_document_id && typeof onViewSource === 'function')
            const hasBbox = !!(item.source_location?.position)
            return (
              <div
                key={item.id}
                onClick={() => hasSource && onViewSource(item)}
                style={{
                  padding: '8px 10px',
                  marginBottom: 6,
                  borderRadius: 6,
                  border: index === 0 ? '1.5px solid #1890ff' : '1px solid #f0f0f0',
                  background: index === 0 ? '#f0f7ff' : '#fff',
                  transition: 'all 0.15s',
                  cursor: hasSource ? 'pointer' : 'default',
                  outline: 'none',
                }}
                onMouseEnter={e => { if (hasSource) e.currentTarget.style.borderColor = '#69b1ff' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = index === 0 ? '#1890ff' : '#f0f0f0' }}
              >
                {/* 值 */}
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: '#262626', wordBreak: 'break-all' }}>
                  {formatValue(displayVal)}
                </div>
                {/* 标签行：类型 + 置信度 + 当前值 + 坐标标记 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                  <Tag color={typeInfo.color} style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0 }}>
                    {typeInfo.label}
                  </Tag>
                  {item.confidence != null && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#666' }}>
                      <span style={{ display: 'inline-block', width: 32, height: 4, borderRadius: 2, background: '#f0f0f0', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${Math.round(item.confidence * 100)}%`, background: confColor, borderRadius: 2 }} />
                      </span>
                      {Math.round(item.confidence * 100)}%
                    </span>
                  )}
                  {index === 0 && <Tag color="gold" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0 }}>当前值</Tag>}
                  {hasBbox && (
                    <Tag color="cyan" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0 }}>
                      <AimOutlined style={{ marginRight: 2 }} />
                      P{item.source_location.page} ({item.source_location.position.x}, {item.source_location.position.y})
                    </Tag>
                  )}
                </div>
                {/* 来源文档（无单独溯源按钮，整张卡片可点） */}
                {item.source_document_name && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <FileTextOutlined style={{ fontSize: 10, color: '#8c8c8c' }} />
                    <Text type="secondary" style={{ fontSize: 10 }}>{item.source_document_name}</Text>
                    {hasSource && <FileSearchOutlined style={{ fontSize: 10, color: '#1890ff', marginLeft: 2 }} />}
                  </div>
                )}
                {/* 备注 */}
                {item.remark && (
                  <div style={{ fontSize: 10, color: '#8c8c8c', marginBottom: 2 }}>
                    {item.remark}
                  </div>
                )}
                {/* 时间 + 操作者 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    <ClockCircleOutlined style={{ marginRight: 3 }} />
                    {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#8c8c8c' }}>
                    <UserOutlined style={{ marginRight: 3 }} />
                    {item.operator_name || '未知'}
                  </Text>
                </div>
                {/* 采用此值按钮（非第一条才显示） */}
                {index > 0 && typeof onApplyValue === 'function' && (
                  <Button
                    type="primary"
                    ghost
                    size="small"
                    style={{ marginTop: 6, width: '100%', fontSize: 11, height: 24 }}
                    icon={<CheckCircleOutlined />}
                    onClick={(e) => { e.stopPropagation(); onApplyValue(displayVal, fieldPath) }}
                  >
                    采用此值
                  </Button>
                )}
              </div>
            )
          })}
        </div>

      )}
    </div>
  )
}

const SourceDocumentPreview = ({ documentInfo, sourceDocId = null, activeCoordinates, collapsed, onToggleCollapse, panelWidth = 480, loading = false }) => {
  const containerRef = useRef(null)
  const imgRef = useRef(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 })
  const [scale, setScale] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const isPdf = documentInfo?.fileType === 'pdf'
  const effectiveMaxW = Math.max(panelWidth - 32, 200)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfPageCount, setPdfPageCount] = useState(null)
  const handleImageLoad = useCallback((e) => {
    const { naturalWidth, naturalHeight } = e.target
    setImageDimensions({ width: naturalWidth, height: naturalHeight })
    const displayW = Math.min(naturalWidth, effectiveMaxW)
    const displayH = Math.round(displayW * (naturalHeight / naturalWidth))
    setDisplayDimensions({ width: displayW, height: displayH })
    setImageLoaded(true)
    setScale(100)
  }, [effectiveMaxW])
  useEffect(() => {
    if (!imageLoaded || !imageDimensions.width || !imageDimensions.height) return
    const { width: nw, height: nh } = imageDimensions
    const displayW = Math.min(nw, effectiveMaxW)
    const displayH = Math.round(displayW * (nh / nw))
    setDisplayDimensions({ width: displayW, height: displayH })
  }, [effectiveMaxW, imageLoaded, imageDimensions])
  const handleZoomIn = useCallback(() => setScale(s => Math.min(s + 25, 300)), [])
  const handleZoomOut = useCallback(() => setScale(s => Math.max(s - 25, 25)), [])
  const handleRotate = useCallback(() => setRotation(r => (r + 90) % 360), [])
  const handleReset = useCallback(() => {
    setScale(100)
    setRotation(0)
    setImgOffset({ x: 0, y: 0 })
  }, [])
  // 计算高亮坐标列表（可能为多块）
  const coordsList = Array.isArray(activeCoordinates)
    ? activeCoordinates.filter(Boolean)
    : activeCoordinates
      ? [activeCoordinates]
      : []
  const hasHighlight = coordsList.length > 0
  const highlightLocations = hasHighlight
    ? coordsList.map((c) => ({
        page: (c.pageIdx != null ? c.pageIdx : 0) + 1,
        bbox: [c.x, c.y, c.x + (c.width || 0), c.y + (c.height || 0)],
      }))
    : []

  // 文档或高亮源变化时，重置当前页
  useEffect(() => {
    if (isPdf) {
      const initial = highlightLocations[0]?.page || 1
      setPdfPage(initial)
    }
  }, [isPdf, documentInfo?.fileUrl, JSON.stringify(highlightLocations)])

  const locationsForCurrentPage = highlightLocations.filter((loc) => loc.page === pdfPage)

  const handlePdfLoaded = useCallback((total) => {
    if (typeof total === 'number' && total > 0) {
      setPdfPageCount(total)
      setPdfPage((p) => Math.min(Math.max(1, p), total))
    }
  }, [])
  if (collapsed) {
    return (
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', flexShrink: 0 }} onClick={onToggleCollapse}>
        <Space size={6}><FileImageOutlined style={{ color: '#1890ff' }} /><Text style={{ fontSize: 12 }}>文档预览</Text>{documentInfo?.fileName && <Text type="secondary" style={{ fontSize: 11 }}>({documentInfo.fileName})</Text>}</Space>
        <DownOutlined style={{ fontSize: 10, color: '#999' }} />
      </div>
    )
  }
  const renderHighlight = (opts = {}) => {
    const { baseWidth = null, baseHeight = null, requireImageLoaded = true, applyTransform = true } = opts
    if (!activeCoordinates || isPdf) {
      return null
    }
    if (requireImageLoaded && !imageLoaded) {
      return null
    }
    const coordsList = Array.isArray(activeCoordinates) ? activeCoordinates : [activeCoordinates]
    if (!coordsList.length) return null
    const { pageWidth, pageHeight } = coordsList[0] || {}
    // 用显示尺寸（displayDimensions）而不是原始尺寸，这样 SVG 才能与实际渲染的图片对齐
    const w0 = baseWidth || displayDimensions.width || imageDimensions.width
    const h0 = baseHeight || displayDimensions.height || imageDimensions.height
    if (!w0 || !h0) {
      return null
    }
    // 从 pageCoordinates (0-1000 或实际页面尺寸) 映射到 SVG 尺寸
    const pw = coordsList[0]?.isAbsolute ? imageDimensions.width : (pageWidth || 1000)
    const ph = coordsList[0]?.isAbsolute ? imageDimensions.height : (pageHeight || 1000)
    const scaleX = w0 / pw
    const scaleY = h0 / ph
    const svgTransform = applyTransform ? `scale(${scale / 100}) rotate(${rotation}deg)` : undefined
    return (
      <svg 
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: w0, 
          height: h0, 
          ...(svgTransform ? { transform: svgTransform, transformOrigin: 'center center' } : {}),
          pointerEvents: 'none', 
          zIndex: 10 
        }} 
        viewBox={`0 0 ${w0} ${h0}`}
      >
        {coordsList.map((c, idx) => {
          if (!c) return null
          const { x, y, width: w, height: h } = c
          const rectX = x * scaleX
          const rectY = y * scaleY
          const rectW = w * scaleX
          const rectH = h * scaleY
          return (
            <rect
              key={idx}
              x={rectX}
              y={rectY}
              width={Math.max(rectW, 2)}
              height={Math.max(rectH, 2)}
              fill="none"
              stroke="#ff0000"
              strokeWidth="1"
              rx="0"
            />
          )
        })}
      </svg>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #f0f0f0', background: '#fafafa', flexShrink: 0 }}>
      <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }} onClick={onToggleCollapse}>
        <Space size={6}><FileImageOutlined style={{ color: '#1890ff', fontSize: 12 }} /><Text style={{ fontSize: 12 }}>{documentInfo?.fileName || '文档预览'}</Text></Space>
        <Space size={4}><Text type="secondary" style={{ fontSize: 10 }}>{scale}%</Text><UpOutlined style={{ fontSize: 10, color: '#999' }} /></Space>
      </div>
      <div style={{ padding: '4px 8px', background: '#fff', display: 'flex', justifyContent: 'center', gap: 2 }}>
        <Tooltip title="缩小"><Button type="text" size="small" icon={<ZoomOutOutlined />} onClick={handleZoomOut} disabled={scale <= 25} /></Tooltip>
        <Tooltip title="放大"><Button type="text" size="small" icon={<ZoomInOutlined />} onClick={handleZoomIn} disabled={scale >= 300} /></Tooltip>
        <Tooltip title="旋转"><Button type="text" size="small" icon={<RotateRightOutlined />} onClick={handleRotate} /></Tooltip>
        <Tooltip title="重置"><Button type="text" size="small" icon={<ReloadOutlined />} onClick={handleReset} /></Tooltip>
      </div>
      <div
        ref={containerRef}
        style={{
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          background: '#f5f5f5',
          padding: 8,
          cursor: scale > 100 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          userSelect: isDragging ? 'none' : 'auto'
        }}
        onMouseDown={(e) => {
          if (scale <= 100) return
          setIsDragging(true)
          setDragStart({ x: e.clientX - imgOffset.x, y: e.clientY - imgOffset.y })
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
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
            <Spin size="large" tip="加载溯源文档..." />
          </div>
        ) : documentInfo?.fileUrl ? (
        isPdf ? (
          <div style={{ width: '100%', maxWidth: effectiveMaxW }}>
            <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
              <Space size={4}>
                <Button
                  size="small"
                  onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                  disabled={pdfPage <= 1}
                >
                  上一页
                </Button>
                <Button
                  size="small"
                  onClick={() =>
                    setPdfPage((p) =>
                      pdfPageCount ? Math.min(pdfPageCount, p + 1) : p + 1
                    )
                  }
                  disabled={pdfPageCount != null && pdfPage >= pdfPageCount}
                >
                  下一页
                </Button>
              </Space>
              <span>
                第 {pdfPage}
                {pdfPageCount ? ` / ${pdfPageCount}` : ''} 页
              </span>
            </div>
            <div
              style={{
                position: 'relative',
                display: 'inline-block',
                transform: `translate(${imgOffset.x}px, ${imgOffset.y}px) scale(${scale / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.2s',
              }}
            >
              <PdfPageWithHighlight
                pdfUrl={documentInfo.fileUrl}
                pageNumber={pdfPage}
                locations={locationsForCurrentPage}
                maxWidth={effectiveMaxW}
                loading={false}
                bboxScale={1000}
                onLoaded={handlePdfLoaded}
              />
            </div>
          </div>
        ) : (
            <div
              style={{
                position: 'relative',
                display: 'inline-block',
                transform: `translate(${imgOffset.x}px, ${imgOffset.y}px) scale(${scale / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.2s',
              }}
            >
              <img 
                ref={imgRef}
                src={documentInfo.fileUrl} 
                alt={documentInfo.fileName} 
                style={{ 
                  display: 'block',
                  width: displayDimensions.width || 'auto',
                  height: displayDimensions.height || 'auto',
                  maxWidth: effectiveMaxW,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)', 
                  borderRadius: 4, 
                  opacity: imageLoaded ? 1 : 0.3,
                  pointerEvents: 'none',
                  userSelect: 'none'
                }} 
                onLoad={handleImageLoad} 
                draggable={false}
              />
              {renderHighlight({ requireImageLoaded: true, applyTransform: false })}
            </div>
          )
        ) : (
          <div style={{ textAlign: 'center', color: '#999', padding: 24 }}><FileTextOutlined style={{ fontSize: 32, marginBottom: 8 }} /><div style={{ fontSize: 12 }}>暂无文档</div></div>
        )}
      </div>
    </div>
  )
}

const SourcePanel = ({
  collapsed,
  onToggle,
  selectedField,
  width: widthProp,
  activeCoordinates = null,
  patientId = null,
  projectId = null,
  historyRefreshKey = 0,
  onRefreshHistory,
  fallbackDocuments = [],
  preferredDocument = null,
  contentAdaptive = false,
  onApplyValue = null,
}) => {
  const width = widthProp || Math.round(window.innerWidth * 0.25)
  const { draftData } = useSchemaForm()
  const isPinned = true
  const [previewCollapsed, setPreviewCollapsed] = useState(() => localStorage.getItem('sourcePreviewCollapsed') === 'true')
  const handleTogglePreview = useCallback(() => { const newState = !previewCollapsed; setPreviewCollapsed(newState); localStorage.setItem('sourcePreviewCollapsed', newState ? 'true' : 'false'); }, [previewCollapsed])
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewFileType, setPreviewFileType] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [docModalOpen, setDocModalOpen] = useState(false)
  const [docModalDoc, setDocModalDoc] = useState(null)
  // 从修改历史中选中的一条记录，用于展示该条对应的文档预览与 bbox（有 source_document_id 即可溯源）
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null)
  // 标记当前是否处于“自动选中首条 revoke 记录但不触发溯源请求”的抑制状态；
  // 一旦用户主动点击「查看溯源」，即关闭抑制，允许对该记录发起文档请求。
  const [suppressAutoSourceDoc, setSuppressAutoSourceDoc] = useState(false)

  const [floatingWidth, setFloatingWidth] = useState(() => {
    const saved = localStorage.getItem('sourcePanelFloatingWidth')
    return saved ? parseInt(saved, 10) : Math.round(window.innerWidth * 0.3)
  })
  const dragRef = useRef(null)

  // 浮动模式下支持拖拽移动位置
  const [floatingPos, setFloatingPos] = useState(() => {
    const saved = localStorage.getItem('sourcePanelFloatingPos')
    if (saved) {
      try { return JSON.parse(saved) } catch { /* ignore */ }
    }
    return { x: null, y: 0 } // x=null 表示使用默认 right:0 定位
  })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  // 拖拽移动面板位置
  const handlePanelDragStart = useCallback((e) => {
    if (isPinned) return
    e.preventDefault()
    setIsDragging(true)
    // 获取面板当前位置
    const panelEl = dragRef.current?.closest?.('[data-source-panel]') || dragRef.current?.parentElement
    if (!panelEl) return
    const rect = panelEl.getBoundingClientRect()
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }

    const onMouseMove = (ev) => {
      ev.preventDefault()
      const newX = Math.max(0, Math.min(window.innerWidth - 200, ev.clientX - dragOffsetRef.current.x))
      const newY = Math.max(0, Math.min(window.innerHeight - 100, ev.clientY - dragOffsetRef.current.y))
      setFloatingPos({ x: newX, y: newY })
    }
    const onMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'auto'
      setFloatingPos(pos => { localStorage.setItem('sourcePanelFloatingPos', JSON.stringify(pos)); return pos })
    }
    document.body.style.cursor = 'move'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [isPinned])

  // 拖拽调整宽度（从左边缘拖）
  const handleWidthDragStart = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = floatingWidth
    const startPosX = floatingPos.x !== null ? floatingPos.x : (window.innerWidth - floatingWidth)
    const onMouseMove = (ev) => {
      // 拖左边缘 → 向左拖增宽
      const maxWidth = Math.round(window.innerWidth * 0.75)
      const delta = startX - ev.clientX
      const newWidth = Math.min(Math.max(startWidth + delta, 300), maxWidth)
      setFloatingWidth(newWidth)
      // 同时更新位置，使面板向左扩展
      const newPosX = Math.max(0, startPosX - (newWidth - startWidth))
      setFloatingPos(prev => ({ ...prev, x: newPosX }))
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'auto'
      setFloatingWidth(w => { localStorage.setItem('sourcePanelFloatingWidth', String(w)); return w })
      setFloatingPos(pos => { localStorage.setItem('sourcePanelFloatingPos', JSON.stringify(pos)); return pos })
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [floatingWidth, floatingPos.x])

  // 计算当前有效面板宽度（固定模式用 width prop，浮动模式用 floatingWidth）
  const effectivePanelWidth = isPinned ? width : floatingWidth

  // 切换字段或患者时清空“从修改历史选中的记录”，避免预览错位
  useEffect(() => {
    setSelectedHistoryItem(null)
  }, [selectedField?.path, patientId])

  // 有 patientId 时：默认展示与字段摘要均由修改历史决定；默认选“第一条”历史记录
  const handleHistoryLoaded = useCallback((historyList) => {
    if (!Array.isArray(historyList) || !patientId) return
    const firstItem = historyList[0] || null
    setSelectedHistoryItem(prev => {
      if (!firstItem) return null
      if (prev && historyList.some(h => h.id === prev.id)) return prev
      return firstItem
    })
    // 如果首条是 revoke，则默认不触发文档溯源请求，直到用户手动点击「查看溯源」
    setSuppressAutoSourceDoc(firstItem?.change_type === 'revoke')
  }, [patientId])

  // 当前字段是否为敏感字段
  const isCurrentFieldSensitive = !!(selectedField?.schema?.['x-sensitive'])
  // 数组行级点击：schema 为对象类型且路径末段是数字索引，说明用户点的是整行而非单个字段
  const isArrayRowClick = !!(
    selectedField?.path &&
    (selectedField.schema?.type === 'object' || selectedField.schema?.properties) &&
    /\.\d+$/.test(selectedField.path)
  )
  // 默认仍优先使用修改历史；科研项目模式下，如果历史缺少文档/定位信息，
  // 再回退到 _extraction_metadata 的字段审计，和电子病历夹的字段来源规则保持一致。

  // 当 displaySource 来自变更历史（new_value 为整个数组）且路径含数组下标+子字段时，
  // 从 new_value[index][subField] 提取该字段的具体值，避免显示整个数组
  const displaySubFieldValue = (() => {
    if (!selectedHistoryItem || !selectedField?.path) return undefined
    const newVal = selectedHistoryItem.new_value
    if (!Array.isArray(newVal) || newVal.length === 0) return undefined
    const mSub = /\.(\d+)\.(.+)$/.exec(selectedField.path)
    const mRow = !mSub ? /\.(\d+)$/.exec(selectedField.path) : null
    if (!mSub && !mRow) return undefined
    const idx = parseInt((mSub || mRow)[1], 10)
    if (mSub) {
      const subPath = mSub[2]
      const elem = newVal[idx]
      if (!elem || typeof elem !== 'object') return undefined
      if (!_hasNestedKey(elem, subPath)) return null
      return _getNestedValue(elem, subPath)
    }
    return newVal[idx] !== undefined ? newVal[idx] : null
  })()

  // 将 documents（可能是对象映射或数组）统一为数组，便于规则匹配
  const normalizeDocuments = useCallback((docs) => {
    if (!docs) return []
    if (Array.isArray(docs)) return docs.filter(Boolean)
    if (typeof docs === 'object') {
      return Object.entries(docs).map(([id, doc]) => ({ id, ...(doc || {}) }))
    }
    return []
  }, [])

  const metadataDocuments = normalizeDocuments(draftData?._extraction_metadata?.documents)
  const candidateDocuments = metadataDocuments.length > 0 ? metadataDocuments : normalizeDocuments(fallbackDocuments)
  const metadataAudit = useMemo(() => {
    if (!selectedField?.path || !projectId) return null
    return _resolveFieldAuditFromExtractionMetadata(draftData, selectedField.path)
  }, [draftData, projectId, selectedField?.path])

  const getSchemaSourceRules = useCallback(() => {
    const src = selectedField?.schema?.['x-sources']
    if (!src || typeof src !== 'object') return { primary: [], secondary: [] }
    const normalize = (arr) =>
      (Array.isArray(arr) ? arr : [])
        .map(v => String(v || '').trim().toLowerCase())
        .filter(Boolean)
    return {
      primary: normalize(src.primary),
      secondary: normalize(src.secondary)
    }
  }, [selectedField])

  const docMatchesSourceRule = useCallback((doc, rule) => {
    const content = [
      doc?.file_name,
      doc?.fileName,
      doc?.name,
      doc?.document_type,
      doc?.document_sub_type
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    const r = String(rule || '').trim().toLowerCase()
    if (!content || !r) return false
    if (content.includes(r)) return true
    // 兼容“出院小结/记录”这类组合来源名：拆分后任一片段命中即可
    const tokens = r
      .split(/[\/、,，\s]+/)
      .map(t => t.trim())
      .filter(t => t.length >= 2)
    return tokens.some(t => content.includes(t))
  }, [])

  // 仅保留精确溯源：无 document_id 时不再做文档猜测匹配
  const resolveFallbackDocument = useCallback(() => {
    if (!selectedField || candidateDocuments.length === 0) return null
    const sourceRules = getSchemaSourceRules()

    if (sourceRules.primary.length > 0) {
      for (const doc of candidateDocuments) {
        if (sourceRules.primary.some(rule => docMatchesSourceRule(doc, rule))) {
          return doc
        }
      }
    }
    if (sourceRules.secondary.length > 0) {
      for (const doc of candidateDocuments) {
        if (sourceRules.secondary.some(rule => docMatchesSourceRule(doc, rule))) {
          return doc
        }
      }
    }

    // schema 未命中，回退到原有策略
    if (preferredDocument?.id) {
      const matchedPreferred = candidateDocuments.find(d => String(d.id) === String(preferredDocument.id))
      if (matchedPreferred) return matchedPreferred
    }

    const pathText = String(selectedField.path || selectedField.name || '').toLowerCase()
    const pathTokens = pathText
      .split(/[./_\-\s]+/)
      .map(t => t.trim())
      .filter(Boolean)

    const scored = candidateDocuments.map((doc, idx) => {
      const content = [
        doc.file_name,
        doc.fileName,
        doc.name,
        doc.document_type,
        doc.document_sub_type
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      let score = 0
      for (const token of pathTokens) {
        if (token && content.includes(token)) score += 2
      }
      return { doc, score, idx }
    })

    scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    return scored[0]?.doc || candidateDocuments[0]
  }, [selectedField, candidateDocuments, preferredDocument, getSchemaSourceRules, docMatchesSourceRule])

  const mergedDisplaySource = useMemo(() => {
    if (!selectedHistoryItem && !metadataAudit) return null
    if (!selectedHistoryItem) {
      const metaSourceLocation = _buildSourceLocationFromAudit(metadataAudit)
      return metaSourceLocation
        ? { ...metadataAudit, source_location: metaSourceLocation }
        : metadataAudit
    }

    if (!metadataAudit) return selectedHistoryItem

    const merged = {
      ...metadataAudit,
      ...selectedHistoryItem,
      source_document_id:
        selectedHistoryItem.source_document_id ||
        metadataAudit.source_document_id ||
        metadataAudit.document_id ||
        null,
      document_id:
        selectedHistoryItem.document_id ||
        metadataAudit.document_id ||
        selectedHistoryItem.source_document_id ||
        null,
      document_type: selectedHistoryItem.document_type || metadataAudit.document_type,
      raw: selectedHistoryItem.raw || metadataAudit.raw,
      page_idx:
        typeof selectedHistoryItem.page_idx === 'number'
          ? selectedHistoryItem.page_idx
          : metadataAudit.page_idx,
      bbox:
        selectedHistoryItem.bbox ||
        metadataAudit.bbox,
      trace_level:
        selectedHistoryItem.trace_level ||
        metadataAudit.trace_level,
    }

    if (!merged.source_location) {
      merged.source_location = _buildSourceLocationFromAudit(metadataAudit)
    }
    return merged
  }, [selectedHistoryItem, metadataAudit])

  const metadataCoordinates = useMemo(() => {
    const metaSourceLocation = _buildSourceLocationFromAudit(metadataAudit)
    return metaSourceLocation ? _sourceLocationToCoordinates(metaSourceLocation) : null
  }, [metadataAudit])

  const isHistorySourceSuppressed = !!(
    selectedHistoryItem &&
    selectedHistoryItem.change_type === 'revoke' &&
    suppressAutoSourceDoc
  )
  const historySourceDocId = isHistorySourceSuppressed
    ? null
    : (selectedHistoryItem?.source_document_id ?? null)

  const metadataSourceDocId = metadataAudit?.source_document_id || metadataAudit?.document_id || null
  const sourceDocId = isHistorySourceSuppressed
    ? null
    : (historySourceDocId || metadataSourceDocId || null)
  const fallbackDoc = !sourceDocId ? resolveFallbackDocument() : null
  const effectiveCoordinates = selectedHistoryItem
    ? (_sourceLocationToCoordinates(mergedDisplaySource?.source_location) || metadataCoordinates)
    : metadataCoordinates
  const displaySource = mergedDisplaySource
  const sourcePageIdx = Array.isArray(effectiveCoordinates)
    ? (effectiveCoordinates[0]?.pageIdx ?? 0)
    : (effectiveCoordinates?.pageIdx ?? 0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setPreviewUrl(null)
      setPreviewFileType(null)
      if (!sourceDocId) return
      setPreviewLoading(true)
      try {
        // 先请求文档详情获取 file_type，避免为 PDF 请求 temp-url（会走 OSS）；PDF 仅用 pdf-stream 同源接口
        const detailRes = await getDocumentDetail(sourceDocId, {
          include_content: false,
          include_versions: false,
          include_patients: false,
          include_extracted: false
        })
        if (cancelled) return
        const ft = (detailRes?.data?.file_type || '').toLowerCase()
        setPreviewFileType(ft || null)
        if (ft === 'pdf') {
          setPreviewUrl(null)
        } else {
          const res = await getDocumentTempUrl(sourceDocId, 3600)
          if (cancelled) return
          const url = res?.data?.url || res?.data?.temp_url || res?.data?.data?.url
          setPreviewUrl(url || null)
        }
      } catch (e) {
        if (!cancelled) {
          setPreviewFileType(null)
          setPreviewUrl(null)
        }
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [sourceDocId])

  if (collapsed) {
    return (
      <div style={{ width: 32, height: '100%', background: '#fafafa', borderLeft: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12 }}>
        <Tooltip title="展开溯源面板" placement="left"><Button type="text" size="small" icon={<LeftOutlined />} onClick={onToggle} /></Tooltip>
        <div style={{ writingMode: 'vertical-rl', color: '#666', fontSize: 12, marginTop: 16 }}>文档溯源</div>
      </div>
    )
  }
  const floatingLeft = floatingPos.x !== null ? floatingPos.x : (window.innerWidth - floatingWidth)
  const floatingTop = floatingPos.y || 0
  const panelStyle = isPinned
    ? (
        contentAdaptive
          // 患者详情 Schema 模式：右侧溯源区块随页面滚动，滚到顶部后吸附在视口顶部，始终可见
          ? {
              width,
              background: '#fafafa',
              borderLeft: '1px solid #f0f0f0',
              display: 'flex',
              flexDirection: 'column',
              position: 'sticky',
              top: 56,                 // 与 Schema 左侧树的 sticky 顶部对齐
              alignSelf: 'flex-start',
              maxHeight: 'calc(100vh - 56px)',
              overflowY: 'auto',
              overflowX: 'hidden',
              zIndex: 1,
            }
          // 其他场景保持原有“占满父容器高度”的固定布局
          : {
              width,
              height: '100%',
              background: '#fafafa',
              borderLeft: '1px solid #f0f0f0',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              overflowX: 'hidden',
            }
      )
    : {
        position: 'fixed',
        left: floatingLeft,
        top: floatingTop,
        width: floatingWidth,
        height: `calc(100vh - ${floatingTop}px)`,
        background: '#fff',
        borderRadius: '8px 0 0 8px',
        boxShadow: isDragging ? '0 8px 32px rgba(0, 0, 0, 0.25)' : '-4px 0 20px rgba(0, 0, 0, 0.12)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: isDragging ? 'none' : 'box-shadow 0.3s ease'
      }
  const previewFileUrl = previewUrl && previewFileType === 'pdf'
    ? `${previewUrl}${previewUrl.includes('#') ? '&' : '#'}page=${Math.max(0, sourcePageIdx) + 1}`
    : previewUrl
  // 只要是 PDF 且有 sourceDocId，就统一走同源 pdf-stream 接口，便于 PDF.js 渲染
  const usePdfStream = previewFileType === 'pdf' && sourceDocId
  const previewDocument = {
    fileName:
      displaySource?.document_type ?? displaySource?.source_document_name ??
      (sourceDocId ? `文档 ${String(sourceDocId).slice(0, 8)}` : '文档预览'),
    fileType: previewFileType || 'image',
    fileUrl: usePdfStream ? getDocumentPdfStreamUrl(sourceDocId) : (previewFileUrl || null)
  }
  return (
    <div style={panelStyle} data-source-panel>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Space><FileTextOutlined style={{ color: '#1890ff' }} /><Text strong style={{ fontSize: 14 }}>文档溯源</Text></Space>
        <Space size={4}>
          {sourceDocId && (
            <Tooltip title="查看原文档">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                loading={previewLoading}
                onClick={() => {
                  setDocModalDoc({
                    id: sourceDocId,
                    fileName: previewDocument.fileName
                  })
                  setDocModalOpen(true)
                }}
              />
            </Tooltip>
          )}
          <Tooltip title="收起面板"><Button type="text" size="small" icon={<RightOutlined />} onClick={onToggle} /></Tooltip>
        </Space>
      </div>
      <SourceDocumentPreview documentInfo={previewDocument} sourceDocId={sourceDocId} activeCoordinates={effectiveCoordinates} collapsed={previewCollapsed} onToggleCollapse={handleTogglePreview} panelWidth={effectivePanelWidth} loading={previewLoading} />
      <div style={{ padding: 12 }}>
        {selectedField ? (
          <>
            <div style={{ padding: '10px 10px', borderRadius: 8, border: '1px solid #f0f0f0', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <Text strong style={{ fontSize: 12 }}>{selectedField.path}</Text>
                {(displaySource?.document_type || (patientId && displaySource?.source_document_id)) && (
                  <Tag color="blue">{displaySource?.document_type ?? displaySource?.source_document_name ?? '修改历史'}</Tag>
                )}
              </div>
              <div style={{ fontSize: 12 }}>
                {displaySource ? (
                  <>
                    <div style={{ marginBottom: 4 }}><Text type="secondary">原文：</Text><Text>{(displaySource?.raw ?? '').toString() || '—'}</Text></div>
                    <div style={{ marginBottom: 4 }}>
                      <Text type="secondary">抽取值：</Text>
                      {displaySubFieldValue !== undefined ? (
                        displaySubFieldValue !== null && displaySubFieldValue !== '' ? (
                          <Text>{isCurrentFieldSensitive
                            ? maskSensitiveField(String(_formatAuditDisplayValue(displaySubFieldValue)), selectedField?.name || selectedField?.path)
                            : _formatAuditDisplayValue(displaySubFieldValue)}</Text>
                        ) : (
                          <Text type="secondary">（此字段在来源记录中未抽取到值）</Text>
                        )
                      ) : (
                        <Text>{(() => {
                          const raw = _formatAuditDisplayValue(displaySource?.value ?? displaySource?.new_value)
                          return isCurrentFieldSensitive
                            ? maskSensitiveField(String(raw), selectedField?.name || selectedField?.path)
                            : raw
                        })()}</Text>
                      )}
                    </div>
                    {(typeof displaySource?.page_idx === 'number' || displaySource?.source_location?.page != null) && (
                      <div><Text type="secondary">页码：</Text><Text>{typeof displaySource?.page_idx === 'number' ? displaySource.page_idx + 1 : displaySource.source_location?.page ?? '—'}</Text></div>
                    )}
                    {/* 溯源仅使用 position，不再展示 bbox */}
                    {Array.isArray(displaySource?.source_location?.position) && displaySource.source_location.position.length >= 8 ? (
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary">position：</Text>
                        <Text style={{ fontSize: 11 }}>{JSON.stringify(displaySource.source_location.position)}</Text>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div style={{ padding: '4px 0', color: '#999' }}>
                    <Text type="secondary">{patientId ? '请从下方修改历史中选择一条并点击「查看溯源」以查看文档与定位' : '无溯源记录'}</Text>
                  </div>
                )}
              {!sourceDocId && (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">溯源状态：</Text>
                  {patientId ? (
                    <Text type="secondary" style={{ marginLeft: 4 }}>在修改历史中点击「查看溯源」预览文档</Text>
                  ) : (
                    <>
                      <Tag color="orange">未关联文档</Tag>
                      {fallbackDoc?.file_name || fallbackDoc?.fileName || fallbackDoc?.name ? (
                        <Text type="secondary" style={{ marginLeft: 8 }}>
                          候选文档：{fallbackDoc.file_name || fallbackDoc.fileName || fallbackDoc.name}
                        </Text>
                      ) : null}
                    </>
                  )}
                </div>
              )}

              </div>
            </div>
            <ModificationHistory
              fieldPath={selectedField.path}
              patientId={patientId}
              projectId={projectId}
              refreshKey={historyRefreshKey}
              // 用户主动点击「查看溯源」时，允许对当前记录发起文档请求（包括 revoke 记录）
              onViewSource={
                patientId
                  ? (item) => {
                      setSuppressAutoSourceDoc(false)
                      setSelectedHistoryItem(item)
                    }
                  : undefined
              }
              onHistoryLoaded={patientId ? handleHistoryLoaded : undefined}
              isSensitive={isCurrentFieldSensitive}
              onApplyValue={onApplyValue}
            />
            <ConflictResolutionSection patientId={patientId} onResolve={onRefreshHistory} />
          </>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary" style={{ fontSize: 12 }}>点击表单中的字段卡片<br />查看数据来源</Text>} />
        )}
      </div>
      <UploadExtractSection 
        patientId={patientId} 
        projectId={projectId}
        onExtractComplete={onRefreshHistory} 
      />
      {docModalDoc && (
        <DocumentDetailModal
          visible={docModalOpen}
          document={docModalDoc}
          onClose={() => {
            setDocModalOpen(false)
            setDocModalDoc(null)
          }}
        />
      )}
    </div>
  )
}

const ACTIVE_TASK_STATUSES = new Set(['pending', 'processing'])

const UploadExtractSection = ({ patientId, projectId, onExtractComplete }) => {
  const { selectedPath } = useSchemaForm()
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [progressInfo, setProgressInfo] = useState(null)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('uploadSectionCollapsed') === 'true')
  const pollTimerRef = useRef(null)
  const activeTaskIdRef = useRef(null)
  
  const targetSection = useMemo(() => {
    if (!selectedPath) return null
    const parts = selectedPath.split('.')
    return parts.slice(0, Math.min(parts.length, 2)).join('.')
  }, [selectedPath])

  const taskContext = useMemo(() => projectId ? `project_${projectId}` : 'patient_pool', [projectId])
  
  const handleToggle = useCallback(() => { 
    const newState = !collapsed
    setCollapsed(newState)
    localStorage.setItem('uploadSectionCollapsed', newState ? 'true' : 'false')
  }, [collapsed])
  
  const finishTask = useCallback((taskId, status, msg) => {
    activeTaskIdRef.current = null
    setProcessing(false)
    setProgressInfo(null)
    upsertTask({ task_id: taskId, status, message: msg, updated_at: new Date().toISOString() })
  }, [])
  
  const pollTaskProgress = useCallback(async (taskId) => {
    if (activeTaskIdRef.current !== taskId) return
    try {
      const res = await getDocumentTaskProgress(taskId, { silent: true })
      if (!res?.success || !res?.data) {
        pollTimerRef.current = setTimeout(() => pollTaskProgress(taskId), 3000)
        return
      }
      const task = res.data
      const pct = task.progress || 0
      const step = task.current_step || '处理中...'
      setProgressInfo({ progress: pct, step, fileName: task.file_name })
      upsertTask({ task_id: taskId, status: task.status, percentage: pct, message: step })
      
      if (task.status === 'completed') {
        finishTask(taskId, 'completed', task.message || '完成')
        message.success(task.message || '文档上传归档完成，病历数据已更新')
        onExtractComplete?.()
        return
      }
      if (task.status === 'failed') {
        finishTask(taskId, 'failed', task.message || '失败')
        message.error(task.message || '处理失败')
        return
      }
      pollTimerRef.current = setTimeout(() => pollTaskProgress(taskId), 2000)
    } catch (e) {
      console.error('Poll task progress error:', e)
      pollTimerRef.current = setTimeout(() => pollTaskProgress(taskId), 3000)
    }
  }, [onExtractComplete, finishTask])
  
  const startPolling = useCallback((taskId) => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    activeTaskIdRef.current = taskId
    setProcessing(true)
    pollTimerRef.current = setTimeout(() => pollTaskProgress(taskId), 1000)
  }, [pollTaskProgress])
  
  // Recover active task scoped to this specific section + context
  useEffect(() => {
    if (!patientId || !targetSection) return
    const tasks = getTasksByScope(patientId, targetSection, taskContext)
    const activeTask = tasks.find(t => t.type === 'upload_archive' && ACTIVE_TASK_STATUSES.has(t.status))
    if (activeTask) {
      setProgressInfo({ progress: activeTask.percentage || 0, step: activeTask.message || '恢复任务中...', fileName: activeTask.file_name })
      startPolling(activeTask.task_id)
    } else {
      // No active task for this scope — clear any stale UI state
      if (activeTaskIdRef.current) {
        activeTaskIdRef.current = null
        setProcessing(false)
        setProgressInfo(null)
      }
    }
  }, [patientId, targetSection, taskContext, startPolling])
  
  useEffect(() => {
    return () => { 
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      activeTaskIdRef.current = null
    }
  }, [])
  
  const handleUpload = useCallback(async (file) => {
    if (!patientId) {
      message.warning('缺少患者信息')
      return false
    }
    setUploading(true)
    try {
      const res = await uploadAndArchiveAsync(file, patientId, { autoMergeEhr: true, targetSection, projectId })
      setUploading(false)
      const taskId = res?.data?.task_id
      if (taskId) {
        setProgressInfo({ progress: 0, step: '已上传，后台处理中...', fileName: file.name })
        message.info('文档上传成功，正在 OCR 解析和 AI 抽取...')
        upsertTask({
          task_id: taskId,
          patient_id: patientId,
          document_id: res.data.document_id,
          file_name: file.name,
          type: 'upload_archive',
          target_section: targetSection,
          context: taskContext,
          status: 'pending',
          percentage: 0,
          message: '后台处理中',
          created_at: new Date().toISOString()
        })
        startPolling(taskId)
      } else {
        message.error(res?.message || '启动任务失败')
      }
    } catch (e) {
      setUploading(false)
      message.error('上传失败: ' + (e.response?.data?.message || e.message || '未知错误'))
    }
    return false
  }, [patientId, targetSection, taskContext, startPolling])
  
  const uploadProps = { 
    name: 'file', 
    accept: '.pdf,.jpg,.jpeg,.png', 
    showUploadList: false, 
    beforeUpload: handleUpload,
    disabled: !patientId || !targetSection || uploading || processing
  }
  
  if (collapsed && !processing) {
    return (
      <div style={{ padding: '6px 12px', borderTop: '1px solid #f0f0f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={handleToggle}>
        <div style={{ display: 'flex', alignItems: 'center' }}><CloudUploadOutlined style={{ color: '#1890ff', marginRight: 6 }} /><Text strong style={{ fontSize: 12 }}>上传文档</Text></div>
        <DownOutlined style={{ fontSize: 10, color: '#999' }} />
      </div>
    )
  }
  
  return (
    <div style={{ borderTop: '1px solid #f0f0f0', background: '#fff' }}>
      <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }} onClick={!processing ? handleToggle : undefined}>
        <div style={{ display: 'flex', alignItems: 'center' }}><CloudUploadOutlined style={{ color: '#1890ff', marginRight: 6 }} /><Text strong style={{ fontSize: 12 }}>上传文档</Text></div>
        {!processing && <UpOutlined style={{ fontSize: 10, color: '#999' }} />}
      </div>
      <div style={{ padding: '8px 12px' }}>
        {processing && progressInfo ? (
          <div style={{ marginBottom: 8 }}>
            {progressInfo.fileName && <Text style={{ fontSize: 11, color: '#333', display: 'block', marginBottom: 4 }}>{progressInfo.fileName}</Text>}
            <Progress percent={Math.round(progressInfo.progress)} size="small" status="active" />
            <Text style={{ fontSize: 11, color: '#999' }}>{progressInfo.step}</Text>
          </div>
        ) : (
          <div style={{ marginBottom: 6, fontSize: 11, color: '#666' }}>
            {targetSection 
              ? <>抽取范围：<Text code style={{ fontSize: 10 }}>{targetSection}</Text></>
              : '请先在左侧选择表单分组'}
          </div>
        )}
        <Upload {...uploadProps}>
          <Button 
            type="primary" 
            icon={uploading ? null : processing ? <ThunderboltOutlined /> : <CloudUploadOutlined />} 
            loading={uploading || processing} 
            size="small" 
            style={{ borderRadius: 4, width: '100%' }}
            disabled={!patientId || !targetSection || uploading || processing}
          >
            {uploading ? '上传中...' : processing ? '处理中...' : '上传并抽取'}
          </Button>
        </Upload>
      </div>
    </div>
  )
}

// 冲突解决组件
const ConflictResolutionSection = ({ patientId, onResolve }) => {
  const [conflicts, setConflicts] = useState([])
  const [loading, setLoading] = useState(false)
  const [resolving, setResolving] = useState(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [currentConflict, setCurrentConflict] = useState(null)
  const [countReported, setCountReported] = useState(null)
  
  // 加载冲突列表
  const loadConflicts = useCallback(async () => {
    if (!patientId) return
    setLoading(true)
    try {
      const res = await getFieldConflicts(patientId, 'pending')
      if (res?.data?.conflicts) {
        setConflicts(res.data.conflicts)
      }
    } catch (e) {
      console.error('Load conflicts error:', e)
    } finally {
      setLoading(false)
    }
  }, [patientId])
  
  useEffect(() => {
    loadConflicts()
  }, [loadConflicts])

  // 将冲突数量上报给父级（用于仪表盘统计）
  useEffect(() => {
    if (countReported === conflicts.length) return
    setCountReported(conflicts.length)
    // eslint-disable-next-line no-unused-expressions
    onResolve?.(conflicts.length)
  }, [conflicts.length, countReported, onResolve])
  
  // 解决冲突
  const handleResolve = useCallback(async (conflictId, action) => {
    setResolving(conflictId)
    try {
      const res = await resolveFieldConflict(patientId, conflictId, action)
      if (res?.success) {
        message.success(action === 'adopt' ? '已采用新值' : '已保留旧值')
        setConflicts(prev => prev.filter(c => c.id !== conflictId))
        setModalVisible(false)
        setCurrentConflict(null)
        // onResolve 既可用于刷新，也可用于仪表盘计数；上面的 effect 会跟随 conflicts 更新
        onResolve?.()
      } else {
        message.error(res?.message || '解决冲突失败')
      }
    } catch (e) {
      message.error('解决冲突失败: ' + (e.message || '未知错误'))
    } finally {
      setResolving(null)
    }
  }, [patientId, onResolve])
  
  const openConflictModal = (conflict) => {
    setCurrentConflict(conflict)
    setModalVisible(true)
  }
  
  if (conflicts.length === 0) return null
  
  return (
    <>
      <div style={{ marginTop: 12 }}>
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            marginBottom: 8, 
            padding: '6px 8px', 
            background: '#fff2f0', 
            borderRadius: 4,
            border: '1px solid #ffccc7',
            cursor: 'pointer'
          }}
          onClick={() => conflicts.length > 0 && openConflictModal(conflicts[0])}
        >
          <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />
          <Text strong style={{ fontSize: 12, color: '#ff4d4f' }}>解决冲突</Text>
          <Badge count={conflicts.length} size="small" style={{ marginLeft: 8, backgroundColor: '#ff4d4f' }} />
        </div>
      </div>
      
      <Modal
        title={<><ExclamationCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />发现 {conflicts.length} 个字段冲突</>}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); setCurrentConflict(null) }}
        footer={null}
        width={600}
      >
        {currentConflict && (
          <div>
            <div style={{ marginBottom: 16, color: '#666', fontSize: 13 }}>
              请逐一解决字段冲突，确保数据准确性
            </div>
            
            <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <Text strong>字段: </Text>
                <Text code>{currentConflict.field_path}</Text>
              </div>
              <div style={{ marginBottom: 16 }}>
                <Tag color="orange">{currentConflict.conflict_type === 'date_diff' ? '日期差异' : currentConflict.conflict_type === 'numeric_diff' ? '数值差异' : '值不一致'}</Tag>
              </div>
              
              <div style={{ display: 'flex', gap: 16 }}>
                {/* 现有值 */}
                <div style={{ flex: 1, background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #d9d9d9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <FileTextOutlined style={{ marginRight: 6, color: '#666' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>现有值</Text>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 12, color: '#333' }}>
                    {currentConflict.old_value || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    <div>来源: {currentConflict.old_source?.document_name || '未知'}</div>
                    <div>录入时间: {currentConflict.old_source?.recorded_at ? new Date(currentConflict.old_source.recorded_at).toLocaleString('zh-CN') : '—'}</div>
                    <div>录入人: {currentConflict.old_source?.recorded_by || '未知'}</div>
                  </div>
                </div>
                
                {/* 新值 */}
                <div style={{ flex: 1, background: '#f6ffed', padding: 12, borderRadius: 6, border: '1px solid #b7eb8f' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <ThunderboltOutlined style={{ marginRight: 6, color: '#52c41a' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>新值</Text>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 12, color: '#52c41a' }}>
                    {currentConflict.new_value || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    <div>来源: {currentConflict.new_source?.document_name || '未知'}</div>
                    <div>AI置信度: {currentConflict.new_source?.confidence || '—'}</div>
                    {currentConflict.new_source?.raw && (
                      <div>原文: "{currentConflict.new_source.raw.substring(0, 30)}..."</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Button 
                onClick={() => handleResolve(currentConflict.id, 'keep')}
                loading={resolving === currentConflict.id}
              >
                保留旧值
              </Button>
              <Button 
                type="primary"
                onClick={() => handleResolve(currentConflict.id, 'adopt')}
                loading={resolving === currentConflict.id}
              >
                采用新值
              </Button>
            </div>
            
            {conflicts.length > 1 && (
              <div style={{ marginTop: 16, textAlign: 'center', color: '#999', fontSize: 12 }}>
                进度: {conflicts.findIndex(c => c.id === currentConflict.id) + 1}/{conflicts.length}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}


const globalScrollbarStyle = `
  .schema-form-scrollable::-webkit-scrollbar { width: 4px; }
  .schema-form-scrollable::-webkit-scrollbar-track { background: transparent; }
  .schema-form-scrollable::-webkit-scrollbar-thumb { background: #d9d9d9; border-radius: 2px; }
  .schema-form-scrollable::-webkit-scrollbar-thumb:hover { background: #bfbfbf; }
`

const RIGHT_PANEL_WIDTH_KEY = 'schemaFormRightPanelWidth'
const DEFAULT_RIGHT_PANEL_WIDTH = Math.round(typeof window !== 'undefined' ? window.innerWidth * 0.25 : 360)
const MIN_RIGHT_PANEL_WIDTH = 240
const MAX_RIGHT_PANEL_WIDTH = Math.round(typeof window !== 'undefined' ? window.innerWidth * 0.4 : 700)

const SchemaFormInner = ({ onSave, onReset, autoSaveInterval = 30000, siderWidth = 220, sourcePanelWidth, collapsible = true, showSourcePanel = true, projectMode = false, projectConfig = null, projectId = null, patientId = null, contentAdaptive = false, leftHeader = null }) => {
  const { state, actions, draftData, patientData, isDirty } = useSchemaForm()
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(true)
  const [saving, setSaving] = useState(false)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)
  const [selectedField, setSelectedField] = useState(null)
  const [activeCoordinates, setActiveCoordinates] = useState(null)
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0) // 用于触发修改历史刷新
  const leaveResolveRef = useRef(null)
  const pendingPathRef = useRef(null)
  // 右侧文档溯源面板宽度（可拖拽调整）
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const maxW = MAX_RIGHT_PANEL_WIDTH
    const saved = typeof window !== 'undefined' ? localStorage.getItem(RIGHT_PANEL_WIDTH_KEY) : null
    if (saved) {
      const n = parseInt(saved, 10)
      if (!Number.isNaN(n) && n >= MIN_RIGHT_PANEL_WIDTH && n <= maxW) return n
    }
    return Math.min(sourcePanelWidth ?? DEFAULT_RIGHT_PANEL_WIDTH, maxW)
  })
  const rightPanelResizeStart = useRef({ x: 0, w: 0 })
  const rightPanelLastWidthRef = useRef(rightPanelWidth)
  const handleRightPanelResizeStart = useCallback((e) => {
    e.preventDefault()
    rightPanelResizeStart.current = { x: e.clientX, w: rightPanelWidth }
    const onMouseMove = (ev) => {
      const delta = ev.clientX - rightPanelResizeStart.current.x
      const newW = Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, rightPanelResizeStart.current.w - delta))
      rightPanelLastWidthRef.current = newW
      setRightPanelWidth(newW)
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (typeof window !== 'undefined') localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(rightPanelLastWidthRef.current))
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [rightPanelWidth])
  const { documents: projectDocuments = [], selectedDocument = null, onDocumentSelect, onUploadDocument, onAddRepeatableInstance, repeatableNamingPattern = '{formName}_{index}' } = projectConfig || {}
  const handleSave = useCallback(async (type = 'manual') => {
    if (!isDirty && type === 'manual') { message.info('没有需要保存的修改'); return }
    setSaving(true)
    try {
      if (onSave) await onSave(draftData, type)
      actions.markSaved()
      setHistoryRefreshKey(k => k + 1) // 保存成功后触发历史刷新
      if (type === 'manual') message.success('保存成功')
      else message.info('自动保存成功', 1)
    } catch (error) { message.error('保存失败: ' + (error.message || '未知错误')) }
    finally { setSaving(false) }
  }, [isDirty, draftData, onSave, actions])
  const handleApplyValue = useCallback((value, fieldPath) => {
    if (!fieldPath) return
    actions.updateFieldValue(fieldPath, value)
    message.success('已采用该值，请点击保存以持久化')
  }, [actions])
  const handleReset = useCallback(() => {
    Modal.confirm({ title: '确认重置', icon: <ExclamationCircleOutlined />, content: '重置后将丢失所有未保存的修改，确定要重置吗？', okText: '确定重置', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => { actions.setPatientData(patientData); if (onReset) onReset(); message.success('已重置为原始数据') } })
  }, [patientData, actions, onReset])
  // 切换左侧目录前确认：有未保存修改时弹窗，返回 Promise<boolean>
  const onBeforeSelect = useCallback((nextPath) => {
    if (!isDirty) return Promise.resolve(true)
    pendingPathRef.current = nextPath
    setLeaveConfirmOpen(true)
    return new Promise((resolve) => {
      leaveResolveRef.current = resolve
    })
  }, [isDirty])
  // 清空其他表单前确认：有未保存修改时同「切换表单」逻辑（保存/不保存/取消）
  const onBeforeClearForm = useCallback(() => {
    if (!isDirty) return Promise.resolve(true)
    setLeaveConfirmOpen(true)
    return new Promise((resolve) => {
      leaveResolveRef.current = resolve
    })
  }, [isDirty])
  const handleLeaveConfirmSave = useCallback(async () => {
    setSaving(true)
    try {
      if (onSave) await onSave(draftData, 'manual')
      actions.markSaved()
      setHistoryRefreshKey(k => k + 1) // 保存成功后触发历史刷新
      message.success('保存成功')
      leaveResolveRef.current?.(true)
      leaveResolveRef.current = null
      setLeaveConfirmOpen(false)
      pendingPathRef.current = null
    } catch (error) {
      message.error('保存失败: ' + (error.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }, [draftData, onSave, actions])
  const handleLeaveConfirmDiscard = useCallback(() => {
    actions.setPatientData(patientData)
    leaveResolveRef.current?.(true)
    leaveResolveRef.current = null
    setLeaveConfirmOpen(false)
    pendingPathRef.current = null
  }, [patientData, actions])
  const handleLeaveConfirmCancel = useCallback(() => {
    leaveResolveRef.current?.(false)
    leaveResolveRef.current = null
    setLeaveConfirmOpen(false)
    pendingPathRef.current = null
  }, [])
  /** 删除可重复记录后立即调接口保存（无需再点保存） */
  const persistDataAfterChange = useCallback(async (data) => {
    setSaving(true)
    try {
      if (onSave) await onSave(data, 'manual')
      actions.setPatientData(data)
    } finally {
      setSaving(false)
    }
  }, [onSave, actions])
  const handleFieldSourceClick = useCallback((path, schema, name) => {
    setSelectedField({ path, schema, name })
    // 溯源完全由 ehr-v2/history 接口驱动，不再使用抽取 audit 的 bbox 定位；高亮仅在用户从修改历史选择一条后由 source_location.position 提供
    setActiveCoordinates(null)
    if (rightCollapsed) setRightCollapsed(false)
  }, [rightCollapsed])
  useAutoSave(autoSaveEnabled, autoSaveInterval, handleSave)
  useEffect(() => {
    const handleBeforeUnload = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])
  return (
    <div style={{
      height: contentAdaptive ? 'auto' : '100%',
      minHeight: contentAdaptive ? 500 : undefined,
      display: 'flex',
      flexDirection: 'column',
      background: '#f5f5f5',
      borderRadius: 8,
      overflow: contentAdaptive ? 'visible' : 'hidden'
    }}>
      <style>{globalScrollbarStyle}</style>
      {/* Toolbar moved to CategoryTree bottom */}
      <Modal
        title="当前修改尚未保存"
        open={leaveConfirmOpen}
        onCancel={handleLeaveConfirmCancel}
        footer={[
          <Button key="cancel" onClick={handleLeaveConfirmCancel}>取消</Button>,
          <Button key="discard" onClick={handleLeaveConfirmDiscard}>不保存</Button>,
          <Button key="save" type="primary" loading={saving} onClick={handleLeaveConfirmSave} icon={<SaveOutlined />}>保存</Button>
        ]}
      >
        <p>当前修改尚未保存。请选择：保存、不保存离开，或取消。</p>
      </Modal>
      <div style={{ flex: contentAdaptive ? 'none' : 1, minHeight: contentAdaptive ? 500 : 0, display: 'flex', overflow: contentAdaptive ? 'visible' : 'hidden', background: '#f5f5f5', position: 'relative', alignItems: 'flex-start' }}>
        <div style={{
          width: leftCollapsed ? 0 : siderWidth,
          transition: 'width 0.2s',
          overflow: 'hidden',
          padding: leftCollapsed ? 0 : '12px 0 12px 12px',
          flexShrink: 0,
          ...(contentAdaptive ? { position: 'sticky', top: 56, alignSelf: 'flex-start', zIndex: 2, display: 'flex', flexDirection: 'column' } : {})
        }}>
          {!leftCollapsed && (
            <div style={{
              height: contentAdaptive ? 'auto' : '100%',
              minHeight: contentAdaptive ? 0 : 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              flex: contentAdaptive ? 'none' : undefined
            }}>
              {contentAdaptive && leftHeader && <div style={{ flexShrink: 0 }}>{leftHeader}</div>}
              <div style={{ flex: contentAdaptive ? 'none' : 1, minHeight: contentAdaptive ? 0 : 0, overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <CategoryTree
                  defaultExpandAll
                  style={{ height: contentAdaptive ? 'auto' : '100%' }}
                  onBeforeSelect={onBeforeSelect}
                  onBeforeClearForm={onBeforeClearForm}
                  onPersistAfterChange={persistDataAfterChange}
                  projectMode={projectMode}
                  projectDocuments={projectDocuments}
                  selectedDocument={selectedDocument}
                  onDocumentSelect={onDocumentSelect}
                  onUploadDocument={onUploadDocument}
                  onAddRepeatableInstance={onAddRepeatableInstance}
                  repeatableNamingPattern={repeatableNamingPattern}
                  toolbarProps={{
                    onSave: handleSave,
                    onReset: handleReset,
                    saving,
                    autoSaveEnabled,
                    onToggleAutoSave: () => setAutoSaveEnabled(!autoSaveEnabled),
                    isDirty
                  }}
                  patientId={patientId}
                />
              </div>
            </div>
          )}
        </div>
        {collapsible && (
          <div onClick={() => setLeftCollapsed(!leftCollapsed)} style={{ position: 'absolute', left: leftCollapsed ? 0 : siderWidth, top: '50%', transform: 'translateY(-50%)', width: 14, height: 40, background: 'linear-gradient(90deg, #f0f0f0, #e8e8e8)', borderRadius: '0 6px 6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'left 0.2s', zIndex: 10, boxShadow: '2px 0 4px rgba(0, 0, 0, 0.08)' }}>
            <span style={{ fontSize: 11, color: '#666', fontWeight: 'bold', transform: leftCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>›</span>
          </div>
        )}
        <div style={{ flex: 1, padding: 12, overflow: contentAdaptive ? 'visible' : 'hidden', minWidth: 0 }}>
          <FormPanel style={{ height: contentAdaptive ? 'auto' : '100%' }} onFieldSelect={handleFieldSourceClick} />
        </div>
        {showSourcePanel && (
          <>
            {!rightCollapsed && (
              <div
                role="separator"
                aria-label="拖动调整文档溯源面板宽度"
                onMouseDown={handleRightPanelResizeStart}
                style={{
                  width: 6,
                  flexShrink: 0,
                  cursor: 'col-resize',
                  background: 'transparent',
                  alignSelf: 'stretch',
                  marginLeft: 4
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(24,144,255,0.2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              />
            )}
            <SourcePanel
              collapsed={rightCollapsed}
              onToggle={() => setRightCollapsed(!rightCollapsed)}
              selectedField={selectedField}
              width={rightPanelWidth}
              activeCoordinates={activeCoordinates}
              patientId={patientId}
              projectId={projectId}
              historyRefreshKey={historyRefreshKey}
              onRefreshHistory={() => setHistoryRefreshKey(k => k + 1)}
              fallbackDocuments={projectDocuments}
              preferredDocument={selectedDocument}
              contentAdaptive={contentAdaptive}
              onApplyValue={handleApplyValue}
            />
          </>
        )}
      </div>
    </div>
  )
}

const SchemaForm = ({ schema, enums = {}, patientData, patientId, projectId, onSave, onReset, loading = false, autoSaveInterval = 30000, siderWidth = 220, sourcePanelWidth, collapsible = true, showSourcePanel = true, projectMode = false, projectConfig = null, contentAdaptive = false, leftHeader = null, style }) => {
  const resolvedPatientId = patientId || patientData?.id || patientData?.patient_id || null
  
  if (loading) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}><Spin tip="加载中..." size="large" /></div>
  if (!schema) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', ...style }}>请提供Schema配置</div>
  return (
    <div style={{ height: contentAdaptive ? 'auto' : '100%', ...style }}>
      <SchemaFormProvider schema={schema} enums={enums} patientData={patientData}>
        <SchemaFormInner onSave={onSave} onReset={onReset} autoSaveInterval={autoSaveInterval} siderWidth={siderWidth} sourcePanelWidth={sourcePanelWidth} collapsible={collapsible} showSourcePanel={showSourcePanel} projectMode={projectMode} projectConfig={projectConfig} projectId={projectId} patientId={resolvedPatientId} contentAdaptive={contentAdaptive} leftHeader={leftHeader} />
      </SchemaFormProvider>
    </div>
  )
}

export default SchemaForm
