/**
 * 状态指示器组件
 * 显示文档处理状态
 */
import React from 'react'
import { Tooltip } from 'antd'
import { 
  CheckCircleOutlined, 
  ExclamationCircleOutlined, 
  LoadingOutlined,
  CloseCircleOutlined 
} from '@ant-design/icons'

const StatusIndicator = ({ status, extractedFieldsCount = 0 }) => {
  // 获取状态配置（支持 task_status 的所有状态）
  const getStatusConfig = (status) => {
    // 加载中状态
    if (status === 'loading') {
      return {
        icon: <LoadingOutlined spin />,
        color: '#1890ff',
        text: '...',
        description: '正在加载状态...'
      }
    }

    // 如果状态是 task_status 格式，使用对应的配置
    const taskStatusConfigs = {
      uploaded: {
        icon: <ExclamationCircleOutlined />,
        color: '#d9d9d9',
        text: '已上传',
        description: '文档已上传，等待解析'
      },
      parsing: {
        icon: <LoadingOutlined spin />,
        color: '#1890ff',
        text: '解析中',
        description: '正在进行 OCR 解析，请稍候'
      },
      parsed: {
        icon: <CheckCircleOutlined />,
        color: '#1890ff',
        text: '已解析',
        description: 'OCR 解析完成'
      },
      parse_failed: {
        icon: <CloseCircleOutlined />,
        color: '#ff4d4f',
        text: '解析失败',
        description: 'OCR 解析失败，请重新解析'
      },
      ai_matching: {
        icon: <LoadingOutlined spin />,
        color: '#1890ff',
        text: 'AI匹配中',
        description: '正在进行 AI 患者匹配'
      },
      pending_confirm_new: {
        icon: <ExclamationCircleOutlined />,
        color: '#722ed1',
        text: '待确认-新患者',
        description: 'AI 识别为新患者，等待确认'
      },
      pending_confirm_review: {
        icon: <ExclamationCircleOutlined />,
        color: '#fa8c16',
        text: '待确认-审核',
        description: '等待审核确认'
      },
      pending_confirm_uncertain: {
        icon: <ExclamationCircleOutlined />,
        color: '#faad14',
        text: '待确认-不确定',
        description: '匹配结果不确定，需要人工确认'
      },
      auto_archived: {
        icon: <CheckCircleOutlined />,
        color: '#13c2c2',
        text: '待确认-自动归档',
        description: '已自动归档，等待确认'
      },
      archived: {
        icon: <CheckCircleOutlined />,
        color: '#52c41a',
        text: '已归档',
        description: '文档已归档'
      }
    }

    // 优先使用 task_status 配置
    if (taskStatusConfigs[status]) {
      return taskStatusConfigs[status]
    }

    // 兼容旧的状态格式
    switch (status) {
      case 'extracted':
        return {
          icon: <CheckCircleOutlined />,
          color: '#10b981',
          text: '已抽取',
          description: `已完成数据抽取，共抽取 ${extractedFieldsCount} 个字段`
        }
      case 'pending':
        return {
          icon: <ExclamationCircleOutlined />,
          color: '#f59e0b',
          text: '待抽取',
          description: '等待进行 AI 数据抽取'
        }
      case 'processing':
        return {
          icon: <LoadingOutlined spin />,
          color: '#6366f1',
          text: '处理中',
          description: '正在进行数据抽取，请稍候'
        }
      case 'error':
        return {
          icon: <CloseCircleOutlined />,
          color: '#ef4444',
          text: '处理失败',
          description: '数据抽取失败，请重新处理'
        }
      default:
        return {
          icon: <ExclamationCircleOutlined />,
          color: '#d9d9d9',
          text: status || '未知状态',
          description: '状态未知'
        }
    }
  }

  const config = getStatusConfig(status)
  
  return (
    <Tooltip title={config.description}>
      <span 
        className="status-indicator"
        style={{ 
          color: config.color,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '12px',
          fontWeight: 500
        }}
      >
        {config.icon}
        <span>{config.text}</span>
      </span>
    </Tooltip>
  )
}

export default StatusIndicator