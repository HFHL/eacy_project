import React from 'react'
import { Button, Input, Modal, Space, Tag, Typography } from 'antd'
import { ClearOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'
import { maskName } from '@/utils/sensitiveUtils'

const { Text } = Typography

const QUICK_PROMPTS = [
  { label: '血常规结果', value: '患者最近的血常规结果如何？' },
  { label: '用药情况', value: '患者的用药情况怎么样？' },
  { label: '异常指标', value: '有哪些异常指标需要关注？' },
  { label: '数据完整性', value: '数据完整性检查' },
]

const AiAssistantModal = ({
  aiInput,
  aiMessages,
  aiModalPosition,
  isDragging,
  onCancel,
  onDragEnd,
  onDragStart,
  onInputChange,
  onSend,
  open,
  patientInfo,
  setAiInput,
  setAiMessages,
  token,
}) => (
  <Modal
    title={(
      <div
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          padding: '4px 0',
        }}
        onMouseDown={(event) => {
          event.preventDefault()
          onDragStart()

          const startX = event.clientX
          const startY = event.clientY
          const startPosX = aiModalPosition.x
          const startPosY = aiModalPosition.y

          const handleMouseMove = (moveEvent) => {
            const newX = startPosX + moveEvent.clientX - startX
            const newY = startPosY + moveEvent.clientY - startY
            const maxX = window.innerWidth - 450
            const maxY = window.innerHeight - 400

            onDragEnd({
              x: Math.max(0, Math.min(newX, maxX)),
              y: Math.max(0, Math.min(newY, maxY)),
              dragging: true,
            })
          }

          const handleMouseUp = () => {
            onDragEnd({ dragging: false })
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
          }

          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)
        }}
      >
        <Space>
          <RobotOutlined style={{ color: token.colorPrimary }} />
          <Text strong>AI智能助手</Text>
          <Tag size="small">基于患者: {patientInfo.name ? maskName(patientInfo.name) : '-'}</Tag>
        </Space>
      </div>
    )}
    open={open}
    onCancel={onCancel}
    footer={null}
    width={modalWidthPreset.narrow}
    styles={modalBodyPreset}
    style={{
      position: 'fixed',
      top: aiModalPosition.y,
      left: aiModalPosition.x,
      margin: 0,
      paddingBottom: 0,
    }}
    mask={false}
    getContainer={false}
  >
    <div style={{ height: 300, overflowY: 'auto', marginBottom: 16, border: `1px solid ${token.colorBorder}`, borderRadius: 4, padding: 12 }}>
      {aiMessages.map((message, index) => (
        <div key={`${message.timestamp}-${index}`} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%',
              padding: '8px 12px',
              borderRadius: 8,
              background: message.type === 'user' ? token.colorPrimary : token.colorBgLayout,
              color: message.type === 'user' ? 'rgb(255, 255, 255)' : token.colorText,
            }}>
              <div style={{ fontSize: 12 }}>
                {message.type === 'user' ? '💬 您' : '🤖 AI'}
              </div>
              <div style={{ fontSize: 14, marginTop: 4 }}>
                {message.content}
              </div>
              <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7, textAlign: 'right' }}>
                {message.timestamp}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>

    <div>
      <Input.Group compact>
        <Input
          value={aiInput}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="输入患者相关问题..."
          onPressEnter={onSend}
          style={{ width: 'calc(100% - 80px)' }}
        />
        <Button type="primary" icon={<SendOutlined />} onClick={onSend} style={{ width: 60 }} />
        <Button icon={<ClearOutlined />} onClick={() => setAiMessages([aiMessages[0]])} style={{ width: 20 }} />
      </Input.Group>

      <div style={{ marginTop: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>💡 快速提问:</Text>
        <div style={{ marginTop: 4 }}>
          <Space size="small" wrap>
            {QUICK_PROMPTS.map(prompt => (
              <Button
                key={prompt.value}
                type="link"
                size="small"
                style={{ padding: '2px 6px', height: 'auto', fontSize: 12 }}
                onClick={() => setAiInput(prompt.value)}
              >
                {prompt.label}
              </Button>
            ))}
          </Space>
        </div>
      </div>
    </div>
  </Modal>
)

export default AiAssistantModal
