/**
 * EHR 抽取状态徽标组件
 * 显示文档是否已完成电子病历夹抽取
 */
import React from 'react'
import { Tag, Tooltip, Space } from 'antd'
import {
  CheckCircleOutlined,
  SyncOutlined,
  MinusCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'

/**
 * 根据 extract_status 判断 EHR 抽取状态
 * extract_status 来自 ehr_extraction_jobs 表，job_type='extract'
 * 取值: pending / running / completed / succeeded / failed / timeout
 */
const getEhrExtractionConfig = (extractStatus) => {
  const status = (extractStatus || '').toLowerCase()

  if (!status || status === 'pending') {
    return {
      icon: <MinusCircleOutlined />,
      color: '#d9d9d9',        // 灰色
      bgColor: '#f5f5f5',
      text: '未抽取',
      description: '尚未进行电子病历夹抽取',
    }
  }

  if (status === 'running') {
    return {
      icon: <SyncOutlined spin />,
      color: '#1677ff',        // 蓝色
      bgColor: '#e6f4ff',
      text: '抽取中',
      description: '正在执行电子病历夹抽取，请稍候',
    }
  }

  if (status === 'completed' || status === 'succeeded') {
    return {
      icon: <CheckCircleOutlined />,
      color: '#52c41a',        // 绿色
      bgColor: '#f6ffed',
      text: '已抽取',
      description: '电子病历夹抽取已完成',
    }
  }

  if (status === 'failed' || status === 'timeout') {
    return {
      icon: <CloseCircleOutlined />,
      color: '#ff4d4f',        // 红色
      bgColor: '#fff2f0',
      text: status === 'timeout' ? '抽取超时' : '抽取失败',
      description: status === 'timeout' ? '电子病历夹抽取超时' : '电子病历夹抽取失败',
    }
  }

  // 兜底未知状态
  return {
    icon: <MinusCircleOutlined />,
    color: '#d9d9d9',
    bgColor: '#f5f5f5',
    text: '未抽取',
    description: `未知抽取状态: ${extractStatus}`,
  }
}

/**
 * EHR 抽取状态徽标
 * @param {object} props
 * @param {string|null} props.extractStatus - extract_status 字段值
 * @param {string|null} props.materializeStatus - 可选：物化状态
 */
const EhrExtractionBadge = ({ extractStatus, materializeStatus }) => {
  const config = getEhrExtractionConfig(extractStatus)

  return (
    <Tooltip title={config.description} placement="top">
      <Tag
        icon={config.icon}
        style={{
          color: config.color,
          backgroundColor: config.bgColor,
          borderColor: config.color,
          fontSize: 12,
          fontWeight: 500,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          margin: 0,
          cursor: 'default',
        }}
      >
        {config.text}
      </Tag>
    </Tooltip>
  )
}

export default EhrExtractionBadge
