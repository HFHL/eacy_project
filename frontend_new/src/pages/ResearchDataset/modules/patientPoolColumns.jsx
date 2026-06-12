import React from 'react'
import { Space, Tag, Tooltip, Typography } from 'antd'
import { maskName } from '../../../utils/sensitiveUtils'

const { Text } = Typography

export const buildPatientPoolColumns = ({ token, projectId }) => [
  {
    title: '患者编号',
    dataIndex: 'patient_code',
    key: 'patient_code',
    width: 120
  },
  {
    title: '姓名',
    dataIndex: 'name',
    key: 'name',
    width: 80,
    render: (name) => name ? maskName(name) : '-'
  },
  {
    title: '性别',
    dataIndex: 'gender',
    key: 'gender',
    width: 60
  },
  {
    title: '年龄',
    dataIndex: 'age',
    key: 'age',
    width: 60,
    render: (age) => age ? `${age}岁` : '-'
  },
  {
    title: '诊断',
    dataIndex: 'diagnosis',
    key: 'diagnosis',
    render: (diagnosis) => (
      <Space wrap size={4}>
        {diagnosis && diagnosis.length > 0 ? diagnosis.map((item, index) => (
          <Tag key={index} size="small">{item}</Tag>
        )) : <Text type="secondary">-</Text>}
      </Space>
    )
  },
  {
    title: '完整度',
    dataIndex: 'completeness',
    key: 'completeness',
    width: 80,
    render: (completeness) => (
      <Text style={{
        color: completeness >= 90 ? token.colorSuccess : completeness >= 70 ? token.colorWarning : token.colorError
      }}>
        {completeness}%
      </Text>
    )
  },
  {
    title: '项目状态',
    dataIndex: 'projects',
    key: 'projects',
    width: 200,
    render: (projects, record) => {
      if (!projects || projects.length === 0) {
        return <Tag color="green">未关联</Tag>
      }

      return (
        <Space wrap size={4}>
          {projects.map((project) => {
            const isCurrentProject = project.id === projectId
            const isWithdrawn = isCurrentProject && project.enrollment_status === 'withdrawn'
            return (
              <Tooltip key={project.id} title={project.project_name + (isWithdrawn ? '（已退出，可重新选择入组）' : '')}>
                <Tag
                  color={isCurrentProject ? (isWithdrawn ? 'orange' : 'red') : 'blue'}
                  style={isCurrentProject ? { fontWeight: 'bold' } : {}}
                >
                  {isCurrentProject ? (isWithdrawn ? '本项目(已退出)' : '本项目') : (
                    project.project_name.length > 8
                      ? `${project.project_name.substring(0, 8)}...`
                      : project.project_name
                  )}
                </Tag>
              </Tooltip>
            )
          })}
        </Space>
      )
    }
  }
]
