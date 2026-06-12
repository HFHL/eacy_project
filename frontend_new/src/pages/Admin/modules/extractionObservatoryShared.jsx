import React from 'react'
import { Typography } from 'antd'

const { Text } = Typography

export const STAGE_META = {
  worker_started: { label: 'Worker 启动', color: 'processing' },
  queued: { label: '已进入队列', color: 'default' },
  load_context: { label: '加载上下文', color: 'blue' },
  load_document: { label: '读取文档', color: 'blue' },
  call_extractor: { label: 'LLM 抽取', color: 'geekblue' },
  validate_output: { label: '校验结果', color: 'purple' },
  persist_values: { label: '写入落库', color: 'purple' },
  completed: { label: '完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

export const extractionTraceStatusMeta = {
  pending: { color: 'default', label: '等待中' },
  running: { color: 'processing', label: '运行中' },
  completed: { color: 'success', label: '已完成' },
  succeeded: { color: 'success', label: '已完成' },
  failed: { color: 'error', label: '失败' },
  stale: { color: 'warning', label: '已停滞' },
}

export const planStatusMeta = {
  planned: { color: 'processing', label: '已规划' },
  skipped: { color: 'warning', label: '未匹配' },
  already_extracted: { color: 'default', label: '已抽取' },
  not_planned: { color: 'default', label: '未规划' },
}

export const formatTime = (value) => {
  if (!value) return '-'
  try {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
  } catch {
    return value
  }
}

export const renderJSON = (value) => {
  if (value == null) return <Text type="secondary">—</Text>
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return (
    <pre style={{ margin: 0, maxHeight: 360, overflow: 'auto', fontSize: 12, background: '#fafafa', padding: 8 }}>
      {text}
    </pre>
  )
}
