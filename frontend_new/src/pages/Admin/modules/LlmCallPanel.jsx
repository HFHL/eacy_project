import React, { useState } from 'react'
import { Alert, Button, Space, Spin, Tabs, Tag, Typography, message } from 'antd'

import { getAdminLlmCallDetail } from '../../../api/admin'
import { appThemeToken } from '../../../styles/themeTokens'
import { renderJSON } from './extractionObservatoryShared'

const { Text } = Typography

export const LlmCallPanel = ({ calls = [], onLoadFull }) => {
  const [activeId, setActiveId] = useState(null)
  const [fullCall, setFullCall] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadFull = async (callId) => {
    setActiveId(callId)
    setLoading(true)
    try {
      const res = await getAdminLlmCallDetail(callId)
      setFullCall(res?.data || null)
      onLoadFull?.(res?.data)
    } catch {
      message.error('加载 LLM 调用详情失败')
    } finally {
      setLoading(false)
    }
  }

  if (!calls.length) return <Alert type="info" showIcon message="无 LLM 调用记录（可能为规则抽取或未执行到模型）" />

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        {calls.map((call) => (
          <div key={call.call_id} style={{ border: `1px solid ${appThemeToken.colorBorderSecondary}`, borderRadius: 6, padding: 8 }}>
            <Space wrap>
              <Tag color={call.status === 'success' ? 'success' : 'error'}>{call.status}</Tag>
              <Text strong>retry {call.retry_no ?? 0}</Text>
              <Text type="secondary">{call.model_name}</Text>
              <Text type="secondary">{call.elapsed_ms != null ? `${call.elapsed_ms} ms` : ''}</Text>
              <Button size="small" type="link" onClick={() => loadFull(call.call_id)}>查看完整 I/O</Button>
            </Space>
          </div>
        ))}
      </Space>
      {activeId && (
        <div style={{ marginTop: 12 }}>
          {loading ? <Spin /> : (
            <Tabs
              size="small"
              items={[
                { key: 'sys', label: 'System', children: renderJSON(fullCall?.instruction) },
                { key: 'user', label: 'User', children: renderJSON(fullCall?.user_message) },
                { key: 'raw', label: 'Raw', children: renderJSON(fullCall?.extracted_raw) },
                { key: 'parsed', label: 'Parsed', children: renderJSON(fullCall?.parsed) },
              ]}
            />
          )}
        </div>
      )}
    </div>
  )
}
