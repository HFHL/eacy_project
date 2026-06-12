import React, { useEffect, useState } from 'react'
import { Button, Input, Modal, Space, Tag, Typography } from 'antd'
import {
  ClearOutlined,
  RobotOutlined,
  SendOutlined,
} from '@ant-design/icons'

import { appThemeToken } from '../../../../styles/themeTokens'

const { Text } = Typography

const getChatTime = () => new Date().toLocaleTimeString('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
})

const QUICK_PROMPTS = [
  '数据完善建议',
  '质量检查报告',
  '抽取优化建议',
]

const ProjectAiAssistantModal = ({ patientName, projectName }) => {
  const [visible, setVisible] = useState(false)
  const [chatHistory, setChatHistory] = useState([])
  const [input, setInput] = useState('')
  const [modalPosition, setModalPosition] = useState({ x: 20, y: 80 })
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    setChatHistory([
      {
        type: 'ai',
        content: `您好！我是项目AI助手。目前正在查看患者 ${patientName || '未知患者'} 在项目中的数据。有什么可以帮助您的吗？`,
        timestamp: getChatTime(),
      },
    ])
  }, [patientName])

  const handleDragStart = (e) => {
    e.preventDefault()
    setIsDragging(true)

    const startX = e.clientX
    const startY = e.clientY
    const startPosX = modalPosition.x
    const startPosY = modalPosition.y

    const handleMouseMove = (moveEvent) => {
      const newX = startPosX + moveEvent.clientX - startX
      const newY = startPosY + moveEvent.clientY - startY
      const maxX = window.innerWidth - 450
      const maxY = window.innerHeight - 400

      setModalPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleSendMessage = () => {
    if (!input.trim()) return
    const newMessage = {
      type: 'user',
      content: input,
      timestamp: getChatTime(),
    }

    setChatHistory([...chatHistory, newMessage])
    setInput('')

    setTimeout(() => {
      setChatHistory((prev) => [
        ...prev,
        {
          type: 'ai',
          content: '我正在分析患者的项目数据，请稍等...',
          timestamp: getChatTime(),
        },
      ])
    }, 1000)
  }

  return (
    <Modal
      title={
        <div
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            padding: '4px 0',
          }}
          onMouseDown={handleDragStart}
        >
          <Space>
            <RobotOutlined style={{ color: appThemeToken.colorPrimary }} />
            <Text strong>项目AI助手</Text>
            <Tag size="small">{projectName}</Tag>
          </Space>
        </div>
      }
      open={visible}
      onCancel={() => setVisible(false)}
      footer={null}
      width={450}
      style={{
        position: 'fixed',
        top: modalPosition.y,
        left: modalPosition.x,
        margin: 0,
        paddingBottom: 0,
      }}
      mask={false}
      getContainer={false}
    >
      <div style={{ height: 300, overflowY: 'auto', marginBottom: 16, border: `1px solid ${appThemeToken.colorBorder}`, borderRadius: 4, padding: 12 }}>
        {chatHistory.map((message, index) => (
          <div key={index} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: 8,
                background: message.type === 'user' ? appThemeToken.colorPrimary : appThemeToken.colorFillTertiary,
                color: message.type === 'user' ? 'white' : 'rgba(0,0,0,0.88)',
              }}>
                <div style={{ fontSize: 12 }}>{message.type === 'user' ? '💬 您' : '🤖 AI'}</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>{message.content}</div>
                <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7, textAlign: 'right' }}>
                  {message.timestamp}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Input.Group compact>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入项目相关问题..."
          onPressEnter={handleSendMessage}
          style={{ width: 'calc(100% - 80px)' }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSendMessage}
          style={{ width: 60 }}
        />
        <Button
          icon={<ClearOutlined />}
          onClick={() => setChatHistory([])}
          style={{ width: 20 }}
        />
      </Input.Group>

      <div style={{ marginTop: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>💡 快速提问:</Text>
        <div style={{ marginTop: 4 }}>
          <Space size="small" wrap>
            {QUICK_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                type="link"
                size="small"
                style={{ padding: '2px 6px', height: 'auto', fontSize: 12 }}
                onClick={() => setInput(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </Space>
        </div>
      </div>
    </Modal>
  )
}

export default ProjectAiAssistantModal
