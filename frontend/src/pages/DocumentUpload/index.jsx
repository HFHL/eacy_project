import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { uploadDocument, getDocumentList, getDocumentsByIds, deleteDocument } from '../../api/document'
import {
  Card,
  Typography,
  Upload,
  Button,
  Space,
  Progress,
  Divider,
  Row,
  Col,
  Tooltip,
  message,
  Popconfirm,
  Empty,
  Badge
} from 'antd'
import {
  UploadOutlined,
  InboxOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  ReloadOutlined,
  FolderOpenOutlined,
  CloudUploadOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileWordOutlined,
  FileExcelOutlined
} from '@ant-design/icons'
import DocumentDetailModal from '../PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal';

const { Text, Title } = Typography
const { Dragger } = Upload

// ─── 常量定义 ─────────────────────────────────────────────────────────────────

const SUPPORTED_TYPES = [
  'application/pdf',
  'image/jpg',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

const POLL_INTERVAL = 3000 // 3秒

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getFileIcon(mimeType) {
  if (!mimeType) return <FileTextOutlined />
  if (mimeType.includes('pdf')) return <FilePdfOutlined />
  if (mimeType.includes('image')) return <FileImageOutlined />
  if (mimeType.includes('word')) return <FileWordOutlined />
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv') || mimeType.includes('excel'))
    return <FileExcelOutlined />
  return <FileTextOutlined />
}

/** 判断一个文件是否已经处于终态（所有流水线阶段都完成或失败） */
function isTerminal(fileItem) {
  // 上传还没完成的
  if (fileItem.uploadStatus === 'uploading' || fileItem.uploadStatus === 'pending') return false
  if (fileItem.uploadStatus === 'failed') return true
  // 上传成功后看后端流水线状态
  const s = fileItem.serverStatus
  if (!s) return false
  const ocrDone = s === 'ocr_succeeded' || s === 'ocr_failed'
  if (s === 'ocr_failed') return true
  if (!ocrDone) return false
  const metaDone = fileItem.metaStatus === 'completed' || fileItem.metaStatus === 'failed'
  return metaDone
}

// ─── 单个阶段进度条组件 ──────────────────────────────────────────────────────

function StageProgress({ label, status, percent }) {
  /**
   * status: 'waiting' | 'running' | 'success' | 'failed'
   */
  const colorMap = {
    waiting: '#d9d9d9',
    running: '#6366f1',
    success: '#10b981',
    failed: '#ef4444',
  }

  const labelMap = {
    waiting: '等待中',
    running: '运行中',
    success: '完成',
    failed: '失败',
  }

  const iconMap = {
    waiting: <span style={{ color: '#bbb', fontSize: 12 }}>⏸</span>,
    running: <LoadingOutlined spin style={{ color: '#6366f1', fontSize: 12 }} />,
    success: <CheckCircleOutlined style={{ color: '#10b981', fontSize: 12 }} />,
    failed: <CloseCircleOutlined style={{ color: '#ef4444', fontSize: 12 }} />,
  }

  const pct = status === 'success' ? 100 : status === 'failed' ? 100 : (percent ?? 0)

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        {iconMap[status]}
        <Text style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>{label}</Text>
        <Text style={{ fontSize: 11, color: colorMap[status], marginLeft: 'auto' }}>
          {labelMap[status]}
        </Text>
      </div>
      <Progress
        percent={pct}
        size="small"
        showInfo={false}
        strokeColor={colorMap[status]}
        trailColor="#f0f0f0"
        style={{ margin: 0 }}
        status={status === 'failed' ? 'exception' : status === 'running' ? 'active' : 'normal'}
      />
    </div>
  )
}

// ─── 单个文件行组件 ──────────────────────────────────────────────────────────

function FileRow({ file, onDelete, onRetry, deletingId, onClick }) {
  const isDeleting = deletingId === file.id

  // 计算三个阶段的状态
  const uploadStage = (() => {
    if (file.uploadStatus === 'pending') return { status: 'waiting', percent: 0 }
    if (file.uploadStatus === 'uploading') return { status: 'running', percent: file.uploadProgress || 0 }
    if (file.uploadStatus === 'failed') return { status: 'failed', percent: 100 }
    return { status: 'success', percent: 100 }
  })()

  const ocrStage = (() => {
    if (file.uploadStatus !== 'success') return { status: 'waiting', percent: 0 }
    const s = file.serverStatus
    if (!s || s === 'pending_upload' || s === 'uploaded') return { status: 'waiting', percent: 0 }
    if (s === 'ocr_pending') return { status: 'waiting', percent: 0 }
    if (s === 'ocr_running') return { status: 'running', percent: 50 }
    if (s === 'ocr_succeeded') return { status: 'success', percent: 100 }
    if (s === 'ocr_failed') return { status: 'failed', percent: 100 }
    // 后续状态说明 OCR 已完成
    return { status: 'success', percent: 100 }
  })()

  const metaStage = (() => {
    if (ocrStage.status !== 'success') return { status: 'waiting', percent: 0 }
    const m = file.metaStatus || 'pending'
    if (m === 'pending') return { status: 'waiting', percent: 0 }
    if (m === 'running') return { status: 'running', percent: 50 }
    if (m === 'completed') return { status: 'success', percent: 100 }
    if (m === 'failed') return { status: 'failed', percent: 100 }
    return { status: 'waiting', percent: 0 }
  })()

  // 错误信息
  const errorMessage = file.uploadError || file.ocrError || file.metaError || null

  return (
    <div
      style={{
        padding: '16px 20px',
        borderBottom: '1px solid #f0f0f0',
        transition: 'background 0.2s',
        cursor: file.documentId ? 'pointer' : 'default'
      }}
      className="file-row-hover"
      onClick={() => {
        if (file.documentId && onClick) {
          onClick(file)
        }
      }}
    >
      {/* 文件信息 + 操作 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#6366f1', fontSize: 18, flexShrink: 0,
        }}>
          {getFileIcon(file.mimeType)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ fontSize: 14, display: 'block' }} ellipsis>
            {file.name}
          </Text>
          <Space size={4} style={{ marginTop: 2 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{formatFileSize(file.size)}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>·</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {(file.mimeType || '').split('/').pop()?.toUpperCase() || ''}
            </Text>
          </Space>
        </div>

        {/* 操作按钮 */}
        <Space size={4}>
          {file.uploadStatus === 'failed' && file.originFile && (
            <Tooltip title="重新上传">
              <Button
                type="text" size="small" icon={<ReloadOutlined />}
                onClick={(e) => { e.stopPropagation(); onRetry(file); }}
                style={{ color: '#6366f1' }}
              />
            </Tooltip>
          )}
          {file.uploadStatus === 'success' && (
            <div onClick={e => e.stopPropagation()}>
              <Popconfirm
                title="确定删除此文件？"
                description="将从服务器永久删除"
                onConfirm={() => onDelete(file)}
                okText="删除" cancelText="取消"
              >
                <Tooltip title="删除">
                  <Button
                    type="text" size="small" icon={<DeleteOutlined />}
                    danger loading={isDeleting}
                  />
                </Tooltip>
              </Popconfirm>
            </div>
          )}
          {file.uploadStatus === 'failed' && (
            <Tooltip title="移除">
              <Button
                type="text" size="small" icon={<CloseCircleOutlined />}
                danger
                onClick={(e) => { e.stopPropagation(); onDelete(file); }}
              />
            </Tooltip>
          )}
        </Space>
      </div>

      {/* 三段流水线进度条 */}
      <div style={{ display: 'flex', gap: 16, paddingLeft: 48 }}>
        <StageProgress label="上传" {...uploadStage} />
        <StageProgress label="OCR" {...ocrStage} />
        <StageProgress label="元数据提取" {...metaStage} />
      </div>

      {/* 错误信息 */}
      {errorMessage && (
        <div style={{ paddingLeft: 48, marginTop: 6 }}>
          <Text type="danger" style={{ fontSize: 12 }}>
            <WarningOutlined /> {errorMessage}
          </Text>
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 主组件
// ═════════════════════════════════════════════════════════════════════════════

const DocumentUpload = () => {
  // fileItems: 合并了本地上传状态和服务器流水线状态的列表
  // 结构: { id, name, size, mimeType, uploadStatus, uploadProgress, uploadError,
  //         documentId, serverStatus, metaStatus, extractStatus, originFile, ... }
  const [fileItems, setFileItems] = useState([])
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  
  // DocumentDetailModal states
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)
  
  const handleRowClick = useCallback((file) => {
    setSelectedDocument({
      id: file.documentId,
      name: file.name,
      fileName: file.name,
      status: file.serverStatus
    })
    setDetailModalVisible(true)
  }, [])

  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)
  const pollingRef = useRef(null)
  const processedFilesRef = useRef(new Set())

  // ─── 组件挂载：从后端加载已有文档 ──────────────────────────────────────────

  useEffect(() => {
    getDocumentList()
      .then(res => {
        if (!res.success || !Array.isArray(res.data)) return
        const items = res.data.map(doc => ({
          id: doc.id,                    // 直接用服务器 ID
          name: doc.file_name,
          size: doc.file_size,
          mimeType: doc.mime_type,
          uploadStatus: 'success',       // 已在服务器上
          uploadProgress: 100,
          uploadError: null,
          documentId: doc.id,
          serverStatus: doc.status,
          metaStatus: doc.meta_status ?? 'pending',
          extractStatus: doc.extract_status ?? 'pending',
          ocrError: doc.status === 'ocr_failed' ? (doc.error_message || 'OCR 失败') : null,
          metaError: doc.meta_status === 'failed' ? (doc.meta_error_message || '元数据提取失败') : null,
          originFile: null,              // 刷新后无法重试上传
        }))
        setFileItems(items)
      })
      .catch(err => console.error('加载文档列表失败:', err))
  }, [])

  // ─── 轮询后端状态 ────────────────────────────────────────────────────────

  const pollStatus = useCallback(async () => {
    setFileItems(prev => {
      // 找出已上传成功但还没到终态的文件
      const idsToCheck = prev
        .filter(f => f.uploadStatus === 'success' && f.documentId && !isTerminal(f))
        .map(f => f.documentId)

      if (idsToCheck.length === 0) return prev // 没有需要轮询的

      // 发起异步请求（不在 setState 回调里 await，而是作为副作用）
      getDocumentsByIds(idsToCheck)
        .then(res => {
          if (!res.success) return
          const docMap = {}
          for (const doc of res.data) {
            docMap[doc.id] = doc
          }
          setFileItems(current =>
            current.map(f => {
              if (!f.documentId || !docMap[f.documentId]) return f
              const doc = docMap[f.documentId]
              return {
                ...f,
                serverStatus: doc.status,
                metaStatus: doc.meta_status,
                extractStatus: doc.extract_status,
                ocrError: doc.status === 'ocr_failed' ? (doc.error_message || 'OCR 失败') : null,
                metaError: doc.meta_status === 'failed' ? (doc.meta_error_message || '元数据提取失败') : null,
              }
            })
          )
        })
        .catch(err => {
          console.error('[轮询] 获取文档状态失败:', err)
        })

      return prev // 返回旧值，实际更新在异步回调里
    })
  }, [])

  // 管理轮询生命周期
  useEffect(() => {
    const hasActiveDocs = fileItems.some(
      f => f.uploadStatus === 'success' && f.documentId && !isTerminal(f)
    )

    if (hasActiveDocs && !pollingRef.current) {
      pollingRef.current = setInterval(pollStatus, POLL_INTERVAL)
    }

    if (!hasActiveDocs && pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [fileItems, pollStatus])

  // ─── 文件上传 ────────────────────────────────────────────────────────────

  const handleUploadFiles = useCallback(async (files) => {
    // 重置 input
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''

    // 过滤 & 构建本地项
    const newItems = files
      .filter(f => {
        const key = `${f.name}_${f.size}_${f.lastModified}`
        if (processedFilesRef.current.has(key)) return false
        processedFilesRef.current.add(key)
        setTimeout(() => processedFilesRef.current.delete(key), 5000)
        return true
      })
      .map(f => {
        const isValid = SUPPORTED_TYPES.includes(f.type) && f.size <= MAX_FILE_SIZE
        // 处理文件名：去掉路径前缀（文件夹上传时 webkitRelativePath）
        const name = f.name.split('/').pop() || f.name
        return {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          name,
          size: f.size,
          mimeType: f.type,
          uploadStatus: isValid ? 'pending' : 'failed',
          uploadProgress: 0,
          uploadError: isValid ? null : '不支持的文件格式或超过 50MB',
          documentId: null,
          serverStatus: null,
          metaStatus: null,
          extractStatus: null,
          ocrError: null,
          metaError: null,
          originFile: isValid ? f : null,
        }
      })

    if (newItems.length === 0) {
      message.warning('没有可上传的文件')
      return
    }

    // 先添加到列表
    setFileItems(prev => [...newItems, ...prev])

    // 筛出有效文件逐个上传
    const validItems = newItems.filter(f => f.uploadStatus === 'pending')
    if (validItems.length === 0) {
      message.warning('没有有效文件可上传')
      return
    }

    message.info(`正在上传 ${validItems.length} 个文件...`)
    setUploading(true)
    let successCount = 0
    let failedCount = 0

    for (const item of validItems) {
      // 标记为上传中
      setFileItems(prev =>
        prev.map(f => (f.id === item.id ? { ...f, uploadStatus: 'uploading' } : f))
      )

      try {
        const resp = await uploadDocument(item.originFile, (percent) => {
          setFileItems(prev =>
            prev.map(f => (f.id === item.id ? { ...f, uploadProgress: percent } : f))
          )
        })

        if (resp.success) {
          successCount++
          setFileItems(prev =>
            prev.map(f =>
              f.id === item.id
                ? {
                    ...f,
                    uploadStatus: 'success',
                    uploadProgress: 100,
                    documentId: resp.data.id,
                    serverStatus: resp.data.status,
                    metaStatus: resp.data.meta_status || 'pending',
                    extractStatus: resp.data.extract_status || 'pending',
                  }
                : f
            )
          )
        }
      } catch (err) {
        failedCount++
        setFileItems(prev =>
          prev.map(f =>
            f.id === item.id
              ? {
                  ...f,
                  uploadStatus: 'failed',
                  uploadError: err.response?.data?.message || err.message || '上传失败',
                }
              : f
          )
        )
      }
    }

    setUploading(false)

    if (failedCount === 0 && successCount > 0) {
      message.success(`全部 ${successCount} 个文件上传成功`)
    } else if (successCount > 0) {
      message.warning(`上传完成：${successCount} 成功，${failedCount} 失败`)
    } else {
      message.error('所有文件上传失败')
    }
  }, [])

  // ─── 删除/移除 ──────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (file) => {
    // 上传失败的直接从列表移除
    if (file.uploadStatus === 'failed' || !file.documentId) {
      setFileItems(prev => prev.filter(f => f.id !== file.id))
      return
    }

    setDeletingId(file.id)
    try {
      const resp = await deleteDocument(file.documentId)
      if (resp.success) {
        setFileItems(prev => prev.filter(f => f.id !== file.id))
        message.success('文件已删除')
      }
    } catch (err) {
      message.error(err.response?.data?.message || '删除失败')
    } finally {
      setDeletingId(null)
    }
  }, [])

  // ─── 重试上传 ────────────────────────────────────────────────────────────

  const handleRetry = useCallback(async (file) => {
    if (!file.originFile) {
      message.error('无法重试：原始文件不存在')
      return
    }

    setFileItems(prev =>
      prev.map(f =>
        f.id === file.id
          ? { ...f, uploadStatus: 'uploading', uploadProgress: 0, uploadError: null }
          : f
      )
    )

    try {
      const resp = await uploadDocument(file.originFile, (percent) => {
        setFileItems(prev =>
          prev.map(f => (f.id === file.id ? { ...f, uploadProgress: percent } : f))
        )
      })

      if (resp.success) {
        setFileItems(prev =>
          prev.map(f =>
            f.id === file.id
              ? {
                  ...f,
                  uploadStatus: 'success',
                  uploadProgress: 100,
                  uploadError: null,
                  documentId: resp.data.id,
                  serverStatus: resp.data.status,
                  metaStatus: resp.data.meta_status || 'pending',
                  extractStatus: resp.data.extract_status || 'pending',
                }
              : f
          )
        )
        message.success(`文件 "${file.name}" 上传成功`)
      }
    } catch (err) {
      setFileItems(prev =>
        prev.map(f =>
          f.id === file.id
            ? {
                ...f,
                uploadStatus: 'failed',
                uploadError: err.response?.data?.message || err.message || '上传失败',
              }
            : f
        )
      )
      message.error(`文件 "${file.name}" 上传失败`)
    }
  }, [])

  // ─── 拖拽上传配置 ─────────────────────────────────────────────────────────

  const uploadProps = {
    name: 'file',
    multiple: true,
    showUploadList: false,
    fileList: [],
    beforeUpload: (file) => {
      handleUploadFiles([file])
      return false
    },
    onDrop: (e) => {
      e.preventDefault()
      handleUploadFiles(Array.from(e.dataTransfer.files))
    },
  }

  // ─── 统计 ────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = fileItems.length
    const uploaded = fileItems.filter(f => f.uploadStatus === 'success').length
    const processing = fileItems.filter(
      f => f.uploadStatus === 'success' && !isTerminal(f)
    ).length
    const completed = fileItems.filter(
      f => f.uploadStatus === 'success' && isTerminal(f) && f.metaStatus === 'completed'
    ).length
    const failed = fileItems.filter(
      f =>
        f.uploadStatus === 'failed' ||
        f.serverStatus === 'ocr_failed' ||
        f.metaStatus === 'failed'
    ).length
    return { total, uploaded, processing, completed, failed }
  }, [fileItems])

  // ─── 渲染 ────────────────────────────────────────────────────────────────

  return (
    <div className="page-container fade-in">
      {/* 上传统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { label: '文件总数', value: stats.total, color: '#6366f1', icon: <FileTextOutlined /> },
          { label: '已上传', value: stats.uploaded, color: '#3b82f6', icon: <CloudUploadOutlined /> },
          { label: '处理中', value: stats.processing, color: '#f59e0b', icon: <LoadingOutlined /> },
          { label: '已完成', value: stats.completed, color: '#10b981', icon: <CheckCircleOutlined /> },
        ].map(({ label, value, color, icon }) => (
          <Col xs={12} sm={6} key={label}>
            <Card
              style={{
                height: 100,
                background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                border: 'none', borderRadius: 12,
              }}
              styles={{ body: { padding: '16px 20px', height: '100%' } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', height: '100%' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginBottom: 6 }}>{label}</div>
                  <div style={{ color: '#fff', fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 22 }}>{icon}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 上传区域 */}
      <Card
        title={
          <Space>
            <InboxOutlined style={{ color: '#6366f1' }} />
            <Text strong>文档上传区域</Text>
          </Space>
        }
        style={{ marginBottom: 24, borderRadius: 12 }}
        styles={{ header: { borderBottom: '1px solid #f0f0f0' } }}
      >
        {/* 提示信息 */}
        <div style={{
          background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <InfoCircleOutlined style={{ color: '#6366f1' }} />
          <Text type="secondary" style={{ fontSize: 13 }}>
            支持 PDF, JPG, PNG, DOCX, XLSX, CSV | 单文件 ≤ 50MB | 选择文件后自动上传并进入处理流水线
          </Text>
        </div>

        {/* 拖拽区域 */}
        <Dragger {...uploadProps} style={{ marginBottom: 16 }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ color: '#6366f1', fontSize: 48 }} />
          </p>
          <p className="ant-upload-text">
            <Text strong style={{ fontSize: 16 }}>点击或拖拽文件到此处上传</Text>
          </p>
          <p className="ant-upload-hint">
            支持单个或批量上传，也可以直接拖入整个文件夹
          </p>
        </Dragger>

        {/* 按钮 */}
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={() => fileInputRef.current?.click()}
                style={{ background: '#6366f1', borderColor: '#6366f1' }}
                loading={uploading}
              >
                选择文件
              </Button>
              <Button
                icon={<FolderOpenOutlined />}
                onClick={() => folderInputRef.current?.click()}
                loading={uploading}
              >
                选择文件夹
              </Button>
            </Space>
          </Col>
          <Col>
            {uploading && (
              <Text type="secondary">
                <LoadingOutlined spin style={{ marginRight: 6 }} />
                上传中...
              </Text>
            )}
          </Col>
        </Row>

        {/* 隐藏 input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv"
          onChange={(e) => {
            if (e.target.files.length > 0) {
              handleUploadFiles(Array.from(e.target.files))
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
              // 文件夹里筛选支持的格式
              const all = Array.from(e.target.files)
              const valid = all.filter(f => SUPPORTED_TYPES.includes(f.type) && f.size <= MAX_FILE_SIZE)
              if (valid.length === 0) {
                message.warning('文件夹中没有找到支持的文件格式')
              } else if (valid.length < all.length) {
                message.info(`文件夹共 ${all.length} 个文件，筛选出 ${valid.length} 个支持的文件`)
              }
              if (valid.length > 0) handleUploadFiles(valid)
            }
            e.target.value = ''
          }}
        />
      </Card>

      {/* 文件处理状态列表 */}
      <Card
        title={
          <Space>
            <FileTextOutlined style={{ color: '#6366f1' }} />
            <Text strong>文件处理状态</Text>
            {stats.total > 0 && <Badge count={stats.total} style={{ backgroundColor: '#6366f1' }} />}
          </Space>
        }
        extra={
          <Space>
            {stats.processing > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                <LoadingOutlined spin style={{ marginRight: 4 }} />
                {stats.processing} 个文件处理中
              </Text>
            )}
            <Button
              icon={<ReloadOutlined />}
              size="small"
              onClick={pollStatus}
            >
              刷新
            </Button>
            {fileItems.length > 0 && (
              <Popconfirm
                title="清空所有文件记录？"
                description="仅清除本页面显示，不会删除服务器文件"
                onConfirm={() => setFileItems([])}
                okText="清空" cancelText="取消"
              >
                <Button size="small" danger>清空列表</Button>
              </Popconfirm>
            )}
          </Space>
        }
        style={{ borderRadius: 12 }}
        styles={{ body: { padding: 0 } }}
      >
        {fileItems.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无文件，请选择或拖拽文件到上传区域"
            style={{ padding: '60px 0' }}
          />
        ) : (
          fileItems.map(file => (
            <FileRow
              key={file.id}
              file={file}
              onDelete={handleDelete}
              onRetry={handleRetry}
              deletingId={deletingId}
              onClick={handleRowClick}
            />
          ))
        )}
      </Card>

      <DocumentDetailModal
        visible={detailModalVisible}
        document={selectedDocument}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedDocument(null);
        }}
      />

      {/* 内嵌样式 */}
      <style>{`
        .file-row-hover:hover {
          background: #fafafa !important;
        }
      `}</style>
    </div>
  )
}

export default DocumentUpload