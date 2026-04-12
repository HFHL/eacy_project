/**
 * LeftPanel组件测试页面
 * 用于验证LeftPanel组件和useEhrFieldGroups Hook的功能
 */
import React from 'react'
import { Card, Button, Space, Typography } from 'antd'
import { CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import LeftPanel from './components/LeftPanel'
import { useEhrFieldGroups } from './hooks/useEhrFieldGroups'

const { Text } = Typography

const LeftPanelTest = () => {
  const {
    selectedEhrGroup,
    expandedGroups,
    handleEhrGroupSelect,
    handleGroupToggle,
    expandAllGroups,
    collapseAllGroups,
    resetExpandedGroups
  } = useEhrFieldGroups()

  // 模拟字段组数据
  const mockEhrFieldGroups = [
    {
      key: 'basicInfo',
      name: '基本信息',
      status: 'completed',
      extractedCount: 8,
      fieldCount: 10,
      children: [
        { key: 'personalInfo', name: '个人信息', status: 'completed', extractedCount: 5, fieldCount: 5 },
        { key: 'contactInfo', name: '联系信息', status: 'partial', extractedCount: 2, fieldCount: 3 }
      ]
    },
    {
      key: 'medicalHistory',
      name: '病史信息',
      status: 'partial',
      extractedCount: 12,
      fieldCount: 20,
      children: [
        { key: 'pastMedical', name: '既往史', status: 'completed', extractedCount: 8, fieldCount: 8 },
        { key: 'familyHistory', name: '家族史', status: 'pending', extractedCount: 0, fieldCount: 5 }
      ]
    },
    {
      key: 'clinicalInfo',
      name: '临床信息',
      status: 'pending',
      extractedCount: 0,
      fieldCount: 15
    }
  ]

  // 模拟状态图标函数
  const getEhrStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
      case 'partial':
        return <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 12 }} />
      case 'pending':
        return <ExclamationCircleOutlined style={{ color: '#d9d9d9', fontSize: 12 }} />
      default:
        return null
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <Card title="LeftPanel组件测试" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text>当前选中: {selectedEhrGroup}</Text>
          <Button onClick={() => expandAllGroups(mockEhrFieldGroups)}>展开所有</Button>
          <Button onClick={collapseAllGroups}>收起所有</Button>
          <Button onClick={resetExpandedGroups}>重置展开状态</Button>
        </Space>
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">展开状态: {JSON.stringify(expandedGroups)}</Text>
        </div>
      </Card>
      
      <div style={{ width: '350px' }}>
        <LeftPanel
          ehrFieldGroups={mockEhrFieldGroups}
          selectedEhrGroup={selectedEhrGroup}
          expandedGroups={expandedGroups}
          getEhrStatusIcon={getEhrStatusIcon}
          onGroupSelect={handleEhrGroupSelect}
          onGroupToggle={handleGroupToggle}
        />
      </div>
    </div>
  )
}

export default LeftPanelTest