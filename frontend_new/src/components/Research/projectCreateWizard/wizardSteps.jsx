import React from 'react'
import { FileTextOutlined, InfoCircleOutlined, TeamOutlined } from '@ant-design/icons'

export const projectCreateStepItems = [
  {
    title: '项目信息',
    description: '填写基本信息',
    icon: <InfoCircleOutlined />,
  },
  {
    title: 'CRF模版',
    description: '选择数据模版',
    icon: <FileTextOutlined />,
  },
  {
    title: '患者筛选',
    description: '选择研究对象',
    icon: <TeamOutlined />,
  },
]
