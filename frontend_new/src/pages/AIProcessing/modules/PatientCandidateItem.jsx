import React from 'react'
import { Avatar, Button, List, Space, Tag, Typography } from 'antd'
import { TeamOutlined } from '@ant-design/icons'

const { Text } = Typography

const markerStyle = {
  position: 'absolute',
  top: '100%',
  left: '50%',
  transform: 'translateX(-50%)',
  marginTop: 4,
  whiteSpace: 'nowrap',
  zIndex: 1,
  backgroundColor: 'transparent',
  color: '#1677ff',
  fontSize: 10,
  padding: '1px 4px',
  borderRadius: 3,
  fontWeight: 500,
  border: '1px solid #1677ff'
}

const CandidateMarker = ({ children }) => (
  <div style={markerStyle}>
    {children}
  </div>
)

const PatientCandidateItem = ({
  candidate,
  selectedDocument,
  onConfirm,
}) => {
  const isCurrentArchived = selectedDocument?.isFromAutoArchived && candidate.id === selectedDocument?.archivedPatientId
  const isAiRecommended = !selectedDocument?.isFromAutoArchived && candidate.id === selectedDocument?.aiRecommendation
  const isHighlighted = isCurrentArchived || isAiRecommended

  return (
    <List.Item
      style={{
        background: isHighlighted ? (isCurrentArchived ? '#e6f7ff' : '#f6ffed') : 'transparent',
        border: isHighlighted ? (isCurrentArchived ? '1px solid #91d5ff' : '1px solid #b7eb8f') : 'none',
        borderRadius: 4,
        margin: '4px 0',
        padding: '8px 12px',
        position: 'relative'
      }}
    >
      <List.Item.Meta
        avatar={
          <div style={{ position: 'relative' }}>
            <Avatar
              icon={<TeamOutlined />}
              style={{
                backgroundColor: candidate.id === selectedDocument?.aiRecommendation ? '#52c41a' : '#1677ff'
              }}
            />
            {isCurrentArchived && <CandidateMarker>当前归档</CandidateMarker>}
            {isAiRecommended && <CandidateMarker>AI推荐</CandidateMarker>}
          </div>
        }
        title={
          <Space wrap>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200, flexShrink: 0 }}>
              <Text strong style={{ whiteSpace: 'nowrap' }}>{candidate.name || '未知患者'}</Text>
              {candidate.patientCode && (
                <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>({candidate.patientCode})</Text>
              )}
            </div>
            {candidate.gender && (
              <Text type="secondary">{candidate.gender}</Text>
            )}
            <Tag
              color={candidate.similarity > 90 ? 'green' : candidate.similarity > 70 ? 'orange' : 'default'}
              size="small"
            >
              相似度 {candidate.similarity}%
            </Tag>
          </Space>
        }
        description={
          <div>
            {candidate.matchReasoning && (
              <div style={{ marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: '#666' }}>
                  {candidate.matchReasoning}
                </Text>
              </div>
            )}
            {candidate.matchFeatures && candidate.matchFeatures.length > 0 && (
              <div>
                <Space wrap size={[4, 4]}>
                  {candidate.matchFeatures.slice(0, 5).map((feature, idx) => (
                    <Tag key={idx} size="small" color="geekblue">
                      {feature}
                    </Tag>
                  ))}
                  {candidate.matchFeatures.length > 5 && (
                    <Tag size="small">+{candidate.matchFeatures.length - 5}</Tag>
                  )}
                </Space>
              </div>
            )}
          </div>
        }
      />
      <Button
        type={isHighlighted ? 'primary' : 'default'}
        size="small"
        onClick={() => onConfirm(candidate.id)}
        disabled={isCurrentArchived}
      >
        {selectedDocument?.isFromAutoArchived ? '更换' : '选择'}
      </Button>
    </List.Item>
  )
}

export default PatientCandidateItem
