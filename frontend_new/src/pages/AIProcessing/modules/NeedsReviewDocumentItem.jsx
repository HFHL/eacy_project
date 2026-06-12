import React from 'react'
import { Button, Checkbox, List, Space, Tag, Tooltip, Typography } from 'antd'
import { CodeOutlined, ThunderboltOutlined } from '@ant-design/icons'

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

const RECOMMEND_BUTTON_STYLE = {
  ...ACTION_BUTTON_STYLE,
  backgroundColor: '#6366f1',
  borderColor: '#6366f1',
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

const getFileTypeLabel = (fileType) => {
  if (fileType === 'image') return '图片'
  if (fileType === 'pdf') return 'PDF'
  return fileType
}

const NeedsReviewDocumentItem = ({
  item,
  onConfirmMatch,
  onDocumentClick,
  onPatientMatch,
  onSelectChange,
  onViewExtractionResult,
  processed,
  selected,
}) => (
  <List.Item
    style={{
      ...CARD_STYLE,
      opacity: processed ? 0 : 1,
      transform: processed ? 'translateX(100px)' : 'translateX(0)',
    }}
    className="review-card"
  >
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
          {item.aiRecommendation && (
            <Checkbox
              checked={selected}
              onChange={(event) => {
                event.stopPropagation()
                onSelectChange(item.id, event.target.checked)
              }}
            />
          )}
        </div>

        <div style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: '#6b7280' }}>
            👤 {item.documentMetadata?.name ?? '--'} {item.documentMetadata?.gender ?? '--'} {(item.documentMetadata?.age && item.documentMetadata?.age !== '--') ? `${item.documentMetadata.age}岁` : (item.documentMetadata?.age ?? '--')}
          </Text>
          {item.fileType && (
            <Tag size="small" style={{ marginLeft: 8 }}>
              {getFileTypeLabel(item.fileType)}
            </Tag>
          )}
        </div>

        {item.aiRecommendation && (
          <div style={{ background: '#6366f110', padding: '6px 8px', borderRadius: 4, marginBottom: 12, border: '1px solid #6366f120' }}>
            <Text style={{ fontSize: 12, color: '#6366f1' }}>
              🤖 推荐匹配: {item.candidates.find(candidate => candidate.id === item.aiRecommendation)?.name || item.aiRecommendation}
              <Text style={{ color: '#6b7280', marginLeft: 4 }}>
                ({item.candidates.find(candidate => candidate.id === item.aiRecommendation)?.similarity || item.matchScore || 0}%匹配)
              </Text>
            </Text>
          </div>
        )}

        {item.matchResult && (
          <div style={{ marginBottom: 8 }}>
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
      </div>

      <div className="detailed-info" style={{ opacity: 0, maxHeight: 0, overflow: 'hidden', transition: 'all 0.3s ease', background: '#f8fafc', borderRadius: 4, padding: 0, marginBottom: 8 }}>
        <div style={{ padding: '8px 12px' }}>
          {item.candidates && item.candidates.length > 0 ? (
            <>
              <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>
                候选患者:
              </Text>
              {item.candidates.map(candidate => (
                <div key={candidate.id} style={{ fontSize: 11, marginBottom: 4, padding: '4px 6px', borderRadius: 4, background: candidate.id === item.aiRecommendation ? '#6366f120' : 'transparent', color: candidate.id === item.aiRecommendation ? '#6366f1' : '#6b7280' }}>
                  <div>
                    <strong>{candidate.name || '未知'}</strong>
                    {candidate.patientCode && <span style={{ marginLeft: 4 }}>({candidate.patientCode})</span>}
                    <span style={{ marginLeft: 8 }}>{candidate.similarity || 0}%匹配</span>
                    {candidate.id === item.aiRecommendation && ' ⭐推荐'}
                  </div>
                  {candidate.matchReasoning && (
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                      {candidate.matchReasoning}
                    </div>
                  )}
                </div>
              ))}
            </>
          ) : (
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>暂无候选患者</Text>
          )}

          {item.aiReason && (
            <div style={{ marginTop: 8, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
              <Text style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>
                AI分析:
              </Text>
              <Text style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'pre-wrap' }}>
                {item.aiReason.length > 200 ? item.aiReason.substring(0, 200) + '...' : item.aiReason}
              </Text>
            </div>
          )}
        </div>
      </div>

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
          icon={<ThunderboltOutlined />}
          onClick={(event) => {
            event.stopPropagation()
            onConfirmMatch(item.id, item.aiRecommendation)
          }}
          disabled={!item.aiRecommendation}
          style={RECOMMEND_BUTTON_STYLE}
        >
          采用推荐
        </Button>
      </div>
    </div>
  </List.Item>
)

export default NeedsReviewDocumentItem
