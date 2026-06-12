import React from 'react'
import { AimOutlined, FolderOpenOutlined, ProjectOutlined } from '@ant-design/icons'

export const statusColors = {
  active: 'green',
  inactive: 'default',
  suspended: 'red',
  draft: 'orange',
  published: 'green',
  running: 'processing',
  completed: 'success',
  failed: 'error',
  pending: 'default',
  cancelled: 'warning',
}

export const statusLabels = {
  active: '活跃',
  inactive: '未激活',
  suspended: '已停用',
  draft: '草稿',
  published: '已发布',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  pending: '等待中',
  cancelled: '已取消',
}

export const extractionStatusMeta = {
  pending: { color: 'default', label: '等待中', progressStatus: 'normal' },
  running: { color: 'processing', label: '运行中', progressStatus: 'active' },
  completed: { color: 'success', label: '已完成', progressStatus: 'success' },
  completed_with_errors: { color: 'warning', label: '部分成功', progressStatus: 'exception' },
  failed: { color: 'error', label: '失败', progressStatus: 'exception' },
  timeout: { color: 'orange', label: '已超时', progressStatus: 'exception' },
  cancelled: { color: 'warning', label: '已取消', progressStatus: 'normal' },
  stale: { color: 'warning', label: '已停滞', progressStatus: 'exception' },
  idle: { color: 'default', label: '空闲', progressStatus: 'normal' },
}

export const taskTypeMeta = {
  all: { label: '全部', icon: null, color: '' },
  project_crf: { label: '科研 CRF', icon: <ProjectOutlined />, color: 'geekblue' },
  patient_ehr: { label: '电子病历夹', icon: <FolderOpenOutlined />, color: 'cyan' },
  targeted: { label: '靶向抽取', icon: <AimOutlined />, color: 'purple' },
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

export const getCurrentUserId = () => {
  try {
    const raw = localStorage.getItem('user_info')
    if (!raw) return null
    const info = JSON.parse(raw)
    return info?.id || info?.user_id || null
  } catch {
    return null
  }
}
