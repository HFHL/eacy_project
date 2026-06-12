import React from 'react'
import { Button, Progress, Space, Tag, Tooltip, Typography } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import { getProjectStatusMeta as getProjectStatusDisplayMeta } from '../../../constants/projectStatusMeta'
import { appThemeToken } from '../../../styles/themeTokens'
import { maskName } from '../../../utils/sensitiveUtils'

const { Text } = Typography

const getCompletenessColor = (completeness) => {
  if (completeness >= 90) return appThemeToken.colorSuccess
  if (completeness >= 70) return appThemeToken.colorWarning
  return appThemeToken.colorError
}

const renderDiagnosisTags = (diagnosis) => (
  <Space wrap style={{ marginBottom: 4 }}>
    {diagnosis.slice(0, 2).map(item => (
      <Tag key={item} color="blue" size="small">{item}</Tag>
    ))}
    {diagnosis.length > 2 && (
      <Tooltip title={diagnosis.slice(2).join(', ')}>
        <Tag size="small" color="default">+{diagnosis.length - 2}</Tag>
      </Tooltip>
    )}
    {diagnosis.length === 0 && (
      <Text type="secondary" style={{ fontSize: 12 }}>暂无诊断</Text>
    )}
  </Space>
)

const renderProjectTags = (projects = []) => {
  if (projects.length === 0) {
    return <Tag size="small" color="default">未关联</Tag>
  }

  return (
    <Space direction="vertical" size="small">
      {projects.slice(0, 2).map(project => {
        const statusMeta = getProjectStatusDisplayMeta(project.status)

        return (
          <Tooltip
            key={project.id}
            title={`${project.project_code}: ${project.project_name}（${project.status_label || statusMeta.label}）`}
          >
            <Tag
              size="small"
              color={project.status_color || statusMeta.color}
              style={{ cursor: 'pointer', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {project.project_name.length > 10 ? `${project.project_name.substring(0, 10)}...` : project.project_name}
            </Tag>
          </Tooltip>
        )
      })}
      {projects.length > 2 && (
        <Tooltip title={projects.slice(2).map(project => project.project_name).join(', ')}>
          <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer' }}>
            +{projects.length - 2}个项目
          </Text>
        </Tooltip>
      )}
    </Space>
  )
}

export const createPatientColumns = ({ onOpenPatient }) => [
  {
    title: '患者ID',
    dataIndex: 'id',
    key: 'id',
    width: 160,
    minWidth: 120,
    fixed: 'left',
    sorter: true,
    resizable: true,
    render: (id) => <Text strong style={{ fontSize: 12 }}>{id}</Text>
  },
  {
    title: '姓名',
    dataIndex: 'name',
    key: 'name',
    width: 120,
    minWidth: 100,
    resizable: true,
    render: (name, record) => (
      <Button
        type="link"
        onClick={() => onOpenPatient(record)}
        style={{ padding: 0, height: 'auto', fontWeight: 'bold' }}
      >
        {name ? maskName(name) : '-'}
      </Button>
    )
  },
  {
    title: '基本信息',
    key: 'basicInfo',
    width: 140,
    minWidth: 120,
    resizable: true,
    render: (_, record) => (
      <div>
        <div style={{ marginBottom: 2 }}>
          <Text strong>{record.gender} {record.age}岁</Text>
        </div>
      </div>
    )
  },
  {
    title: '主要诊断',
    dataIndex: 'diagnosis',
    key: 'diagnosis',
    width: 220,
    minWidth: 180,
    resizable: true,
    render: (diagnosis) => <div>{renderDiagnosisTags(diagnosis)}</div>
  },
  {
    title: '文档数量',
    dataIndex: 'documentCount',
    key: 'documentCount',
    width: 100,
    minWidth: 80,
    sorter: true,
    resizable: true,
    render: (count) => (
      <Space>
        <FileTextOutlined />
        <Text>{count || 0}份</Text>
      </Space>
    )
  },
  {
    title: '数据完整度',
    dataIndex: 'completeness',
    key: 'completeness',
    width: 130,
    minWidth: 110,
    sorter: true,
    resizable: true,
    render: (completeness) => (
      <Progress
        percent={completeness}
        size="small"
        strokeColor={getCompletenessColor(completeness)}
        format={percent => `${percent}%`}
      />
    )
  },
  {
    title: '字段冲突',
    dataIndex: 'pendingFieldConflictCount',
    key: 'conflicts',
    width: 120,
    minWidth: 100,
    resizable: true,
    render: (count, record) => (
      record.hasPendingFieldConflicts ? (
        <Tooltip title="该患者存在待解决字段冲突">
          <Tag color="error">{`待处理 ${count}`}</Tag>
        </Tooltip>
      ) : (
        <Tag color="success">无冲突</Tag>
      )
    )
  },
  {
    title: '主治医生',
    dataIndex: 'doctor',
    key: 'doctor',
    width: 100,
    minWidth: 80,
    resizable: true,
    render: (doctor) => <Text style={{ fontSize: 12 }}>{doctor || '未分配'}</Text>
  },
  {
    title: '关联项目',
    dataIndex: 'projects',
    key: 'projects',
    width: 160,
    minWidth: 120,
    resizable: true,
    render: (projects) => <div>{renderProjectTags(projects)}</div>
  },
  {
    title: '最近更新',
    dataIndex: 'lastUpdate',
    key: 'lastUpdate',
    width: 100,
    minWidth: 80,
    sorter: true,
    resizable: true,
    render: (date) => (
      <Text type="secondary" style={{ fontSize: 12 }}>
        {date}
      </Text>
    )
  }
]
