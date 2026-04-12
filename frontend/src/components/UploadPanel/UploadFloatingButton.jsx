/**
 * 上传悬浮球组件
 * 当有上传任务时悬浮在页面右下角，点击展开上传面板
 */
import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Badge, Tooltip, Progress } from 'antd'
import {
  CloudUploadOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  WarningOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons'
import { UploadStatus } from '../../hooks/useUploadManager'
import './UploadFloatingButton.css'

const UploadFloatingButton = ({ tasks, stats, isUploading, isPaused, onClick }) => {
  const [minimized, setMinimized] = useState(false)
  const [position, setPosition] = useState({ x: null, y: null })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0, moved: false })
  const buttonRef = useRef(null)

  const hasTasks = stats.total > 0
  const activeCount = stats.uploading + stats.pending
  const hasFailures = stats.failed > 0

  const totalProgress = useMemo(() => {
    if (stats.total === 0) return 0
    const weightedProgress = tasks.reduce((sum, t) => {
      if (t.status === UploadStatus.SUCCESS) return sum + 100
      if (t.status === UploadStatus.UPLOADING) return sum + (t.progress || 0)
      if (t.status === UploadStatus.FAILED || t.status === UploadStatus.CANCELLED) return sum + 100
      return sum
    }, 0)
    return Math.round(weightedProgress / stats.total)
  }, [tasks, stats])

  const phase = useMemo(() => {
    if (!hasTasks) return 'idle'
    if (isUploading && !isPaused && activeCount > 0) return 'uploading'
    if (isPaused) return 'paused'
    if (hasFailures && activeCount === 0) return 'failed'
    if (stats.success === stats.total) return 'allDone'
    if (activeCount > 0) return 'pending'
    return 'idle'
  }, [hasTasks, isUploading, isPaused, activeCount, hasFailures, stats])

  // Auto-collapse after all done
  useEffect(() => {
    if (phase === 'allDone' || phase === 'idle') {
      const timer = setTimeout(() => setMinimized(true), 5000)
      return () => clearTimeout(timer)
    }
    if (phase === 'uploading' || phase === 'failed') {
      setMinimized(false)
    }
  }, [phase])

  // Drag handling
  const handleMouseDown = (e) => {
    if (e.button !== 0) return
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x ?? rect.left,
      startPosY: position.y ?? rect.top,
      moved: false,
    }
    setDragging(true)
    e.preventDefault()
  }

  useEffect(() => {
    if (!dragging) return
    const handleMouseMove = (e) => {
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragRef.current.moved = true
      }
      setPosition({
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      })
    }
    const handleMouseUp = () => {
      setDragging(false)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging])

  const handleClick = () => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false
      return
    }
    onClick?.()
  }

  const phaseConfig = {
    uploading: { icon: <LoadingOutlined spin />, color: '#1677ff', tooltip: `正在上传 ${activeCount} 个文件...` },
    paused:    { icon: <PauseCircleOutlined />,  color: '#faad14', tooltip: '上传已暂停' },
    failed:    { icon: <WarningOutlined />,       color: '#ff4d4f', tooltip: `${stats.failed} 个文件上传失败` },
    allDone:   { icon: <CheckCircleOutlined />,   color: '#52c41a', tooltip: '全部上传完成' },
    pending:   { icon: <CloudUploadOutlined />,   color: '#1677ff', tooltip: `${activeCount} 个文件待上传` },
    idle:      { icon: <CloudUploadOutlined />,   color: '#8c8c8c', tooltip: '上传任务' },
  }

  const cfg = phaseConfig[phase] || phaseConfig.idle

  const posStyle = position.x != null
    ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
    : {}

  return (
    <div
      ref={buttonRef}
      className={`upload-floating-btn ${phase} ${minimized ? 'minimized' : ''} ${dragging ? 'dragging' : ''}`}
      style={posStyle}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <Tooltip title={cfg.tooltip} placement="left" open={dragging ? false : undefined}>
        <div className="upload-floating-btn-inner">
          {/* Progress ring */}
          <Progress
            type="circle"
            percent={totalProgress}
            size={minimized ? 40 : 52}
            strokeColor={cfg.color}
            trailColor="rgba(0,0,0,0.06)"
            strokeWidth={6}
            format={() => null}
            className="upload-floating-progress"
          />

          {/* Center icon */}
          <div className="upload-floating-icon" style={{ color: cfg.color }}>
            <Badge count={activeCount > 0 ? activeCount : 0} size="small" offset={[4, -4]}>
              {cfg.icon}
            </Badge>
          </div>

          {/* Expanded info */}
          {!minimized && (
            <div className="upload-floating-info">
              <span className="upload-floating-stats">
                {phase === 'uploading' && `${stats.success}/${stats.total}`}
                {phase === 'paused' && '已暂停'}
                {phase === 'failed' && `${stats.failed} 失败`}
                {phase === 'allDone' && '完成'}
                {phase === 'pending' && `${activeCount} 待传`}
                {phase === 'idle' && `${stats.total} 任务`}
              </span>
            </div>
          )}
        </div>
      </Tooltip>
    </div>
  )
}

export default UploadFloatingButton
