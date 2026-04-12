/**
 * 置信度指示器组件
 * 使用圆点+文字标记的简洁方式显示置信度
 */
import React from 'react'
import { Tooltip } from 'antd'
import './ConfidenceIndicator.css'

const ConfidenceIndicator = ({ confidence }) => {
  // 获取置信度配置
  const getConfidenceConfig = (confidence) => {
    if (!confidence && confidence !== 0) {
      return {
        level: '未知',
        color: '#d9d9d9',
        bgColor: '#f5f5f5',
        description: '置信度未知'
      }
    }

    if (confidence >= 0.9) {
      return { 
        level: '高', 
        color: '#10b981', 
        bgColor: '#f0fdf4',
        description: '高置信度 (≥90%)' 
      }
    } else if (confidence >= 0.7) {
      return { 
        level: '中', 
        color: '#f59e0b', 
        bgColor: '#fffbeb',
        description: '中置信度 (70-89%)' 
      }
    } else {
      return { 
        level: '低', 
        color: '#ef4444', 
        bgColor: '#fef2f2',
        description: '低置信度 (<70%)' 
      }
    }
  }

  const config = getConfidenceConfig(confidence)
  const percentage = confidence ? (confidence * 100).toFixed(1) : '未知'
  
  return (
    <Tooltip title={`${config.description}: ${percentage}%`}>
      <span className="confidence-indicator">
        <span 
          className="confidence-dot"
          style={{ backgroundColor: config.color }}
        />
        <span 
          className="confidence-text"
          style={{ color: config.color }}
        >
          {config.level}
        </span>
      </span>
    </Tooltip>
  )
}

export default ConfidenceIndicator