import React from 'react'
import { Button, Checkbox, List, Space, Tag, Tooltip, Typography } from 'antd'
import { CheckCircleOutlined, CodeOutlined } from '@ant-design/icons'
import { getConfidenceDisplay, getConfidenceStyle } from './confidenceDisplay'

const { Text } = Typography

const CARD_STYLE = {
  padding: '16px 12px',
  borderBottom: '1px solid #f0f0f0',
  borderRadius: '8px',
  margin: '8px 0',
  background: '#ffffff',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  transition: 'all 0.3s ease',
}

const ACTION_BUTTON_STYLE = {
  fontSize: 12,
  height: '24px',
  lineHeight: '24px',
}

const JSON_BUTTON_STYLE = {
  ...ACTION_BUTTON_STYLE,
  backgroundColor: '#f59e0b',
  borderColor: '#f59e0b',
  color: '#fff',
}

const CONFIRM_BUTTON_STYLE = {
  ...ACTION_BUTTON_STYLE,
  backgroundColor: '#10b981',
  borderColor: '#10b981',
}

const getMatchResultLabel = (matchResult) => {
  if (matchResult === 'matched') return '已匹配'
  if (matchResult === 'new') return '新患者'
  if (matchResult === 'uncertain') return '缺信息'
  return '待确认'
}

const getMatchResultColor = (matchResult) => {
  if (matchResult === 'matched') return 'green'
  if (matchResult === 'new') return 'blue'
  return 'orange'
}

const AutoArchivedDocumentItem = ({
  confirming,
  item,
  onConfirmArchive,
  onDocumentClick,
  onPatientMatch,
  onSelectChange,
  onViewExtractionResult,
  selected,
}) => {
  const confidenceStyle = getConfidenceStyle(item.confidence)
  const patientCode = item.patientId
    ? item.candidates?.find(candidate => candidate.id === item.patientId)?.patientCode
    : null

  return (
    <List.Item style={CARD_STYLE} className="processed-card">
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Space>
              <Text style={{ fontSize: 12, color: '#6b7280' }}>
                📄 {item.name}
              </Text>
              <Text
                style={{ fontSize: 12, color: '#1677ff', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={(event) => {
                  event.stopPropagation()
                  onDocumentClick(item)
                }}
              >
                查看
              </Text>
            </Space>
            <Checkbox
              checked={selected}
              onChange={(event) => {
                event.stopPropagation()
                onSelectChange(item.id, event.target.checked)
              }}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: '#6b7280' }}>
              ✅ 归档至 {item.patientName || '未知患者'}
              {patientCode && ` (${patientCode})`}
            </Text>
          </div>

          {(item.documentMetadata?.name || item.documentMetadata?.gender || item.documentMetadata?.age) && (
            <div style={{ background: '#6366f110', padding: '6px 8px', borderRadius: 4, marginTop: 8, marginBottom: 12, border: '1px solid #6366f120' }}>
              <Text style={{ fontSize: 12, color: '#6366f1' }}>
                🤖 元数据: {item.documentMetadata?.name && `姓名:${item.documentMetadata.name}`}
                {item.documentMetadata?.gender && item.documentMetadata.gender !== '--' && ` 性别:${item.documentMetadata.gender}`}
                {item.documentMetadata?.age && item.documentMetadata.age !== '--' && ` 年龄:${item.documentMetadata.age}`}
              </Text>
            </div>
          )}
        </div>

        <div className="detailed-info" style={{ opacity: 0, maxHeight: 0, overflow: 'hidden', transition: 'all 0.3s ease', background: '#f8fafc', borderRadius: 4, padding: 0, marginBottom: 0 }}>
          <div style={{ padding: '8px 12px' }}>
            <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>
              处理详情:
            </Text>
            <div style={{ fontSize: 11, marginBottom: 2, color: '#6b7280' }}>
              置信度: {confidenceStyle.icon} {getConfidenceDisplay(item.confidence).label}
            </div>
            {item.createdAt && (
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                上传时间: {new Date(item.createdAt).toLocaleString('zh-CN')}
              </div>
            )}
          </div>
        </div>

        {item.matchResult && (
          <div style={{ marginBottom: 18 }}>
            <Tag color={getMatchResultColor(item.matchResult)}>
              {getMatchResultLabel(item.matchResult)}
            </Tag>
            {item.matchScore > 0 && (
              <Text style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>
                置信度: {item.matchScore}%
              </Text>
            )}
          </div>
        )}

        <div style={{ textAlign: 'right', marginTop: 8, display: 'flex', gap: 6, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              size="small"
              onClick={(event) => {
                event.stopPropagation()
                onPatientMatch(item)
              }}
              style={ACTION_BUTTON_STYLE}
            >
              匹配详情
            </Button>
            <Tooltip title="查看AI抽取的JSON结果">
              <Button
                size="small"
                icon={<CodeOutlined />}
                onClick={(event) => {
                  event.stopPropagation()
                  onViewExtractionResult(item.id, item.name)
                }}
                style={JSON_BUTTON_STYLE}
              >
                JSON
              </Button>
            </Tooltip>
          </div>
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={confirming}
            onClick={(event) => {
              event.stopPropagation()
              onConfirmArchive(item.id)
            }}
            style={CONFIRM_BUTTON_STYLE}
          >
            确认
          </Button>
        </div>
      </div>
    </List.Item>
  )
}

export default AutoArchivedDocumentItem
