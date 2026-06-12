import React from 'react'
import { Button, Popover, Space, Tag, Tooltip, Typography } from 'antd'
import {
  CaretDownOutlined,
  CaretRightOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import { maskName } from '../../../utils/sensitiveUtils'
import { appThemeToken } from '../../../styles/themeTokens'
import {
  formatMatchScorePercent,
  getGroupRecommendedPatient,
} from './formatters'

const { Text } = Typography

export const renderFileGroupRow = (record, deps = {}) => {
  const {
    autoArchivingGroupIds,
    expandedGroups,
    getGroupActionNodes,
    handleGroupMouseEnter,
    hoveredGroupKey,
    navigate,
    setHoveredGroupKey,
    token,
    toggleGroup,
  } = deps

  if (!record._isGroup) return null
  const isExpanded = expandedGroups.includes(record.key)
  const isTodo = record._groupType === 'todo'
  const isHovered = hoveredGroupKey === record.key
  const isAutoArchiving = autoArchivingGroupIds.has(record._groupId)
  const statusSet = record._statusSet || []
  const hasAutoArchived = statusSet.includes('auto_archived')
  const hasPendingReview = statusSet.includes('pending_confirm_review')
  const isUncertainGroup = statusSet.includes('pending_confirm_uncertain')
  const matchInfo = record._matchInfo
  const { candidate: matchedCandidate } = getGroupRecommendedPatient(matchInfo)
  const matchedPatientNameRaw = matchedCandidate?.name || matchedCandidate?.patient_name
  const matchedPatientName = matchedPatientNameRaw ? maskName(matchedPatientNameRaw) : ''
  const hoverActions = getGroupActionNodes(record)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0',
        cursor: 'pointer',
        width: '100%',
      }}
      onClick={() => toggleGroup(record)}
      onMouseEnter={() => handleGroupMouseEnter(record)}
      onMouseLeave={() => setHoveredGroupKey(null)}
    >
      <Space size={8} style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
        {isExpanded
          ? <CaretDownOutlined style={{ fontSize: 12, color: token.colorTextSecondary }} />
          : <CaretRightOutlined style={{ fontSize: 12, color: token.colorTextSecondary }} />
        }
        <Tooltip title={record._badge?.tip}>
          <span style={{ fontSize: 14 }}>{record._badge?.icon}</span>
        </Tooltip>
        <Text strong style={{ fontSize: 14 }}>{record._label}</Text>
        <Tag style={{ marginLeft: 4 }}>{record._count}份</Tag>
        {record._loading && <LoadingOutlined spin style={{ fontSize: 12, color: token.colorPrimary }} />}
        {isHovered && isTodo && (hasAutoArchived || hasPendingReview || isUncertainGroup) && (
          matchedCandidate ? (
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
              推荐归档到：
              <Popover
                placement="bottomLeft"
                arrow={false}
                overlayInnerStyle={{ padding: 0 }}
                content={
                  <div style={{ width: 280, padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text strong style={{ fontSize: 14 }}>{matchedPatientName}</Text>
                      {matchInfo?.match_score != null && (
                        <Tag color="blue" style={{ marginLeft: 8 }}>匹配 {formatMatchScorePercent(matchInfo.match_score)}</Tag>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 12, color: token.colorTextSecondary, fontSize: 12, marginBottom: 8 }}>
                      {matchedCandidate.gender && <span>{matchedCandidate.gender}</span>}
                      {matchedCandidate.age && <span>{String(matchedCandidate.age).endsWith('岁') ? matchedCandidate.age : `${matchedCandidate.age}岁`}</span>}
                      {(matchedCandidate.patient_code || matchedCandidate.patientCode) && (
                        <span>编号: {matchedCandidate.patient_code || matchedCandidate.patientCode}</span>
                      )}
                    </div>
                    {(matchedCandidate.key_evidence?.length > 0 || matchedCandidate.keyEvidence?.length > 0) && (
                      <div style={{ fontSize: 12, color: appThemeToken.colorTextSecondary, marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>匹配依据：</Text>
                        {(matchedCandidate.key_evidence || matchedCandidate.keyEvidence || []).slice(0, 3).map((e, i) => (
                          <Tag key={i} style={{ fontSize: 12, marginTop: 4 }}>{e}</Tag>
                        ))}
                      </div>
                    )}
                    {matchedCandidate.id && (
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, fontSize: 12 }}
                        onClick={(e) => { e.stopPropagation(); navigate(`/patient/detail/${matchedCandidate.id}`) }}
                      >
                        查看患者病历 →
                      </Button>
                    )}
                  </div>
                }
              >
                <span
                  style={{ color: token.colorPrimary, cursor: 'pointer', borderBottom: `1px dashed ${token.colorPrimary}` }}
                  onClick={(e) => { e.stopPropagation(); if (matchedCandidate.id) navigate(`/patient/detail/${matchedCandidate.id}`) }}
                >
                  {matchedPatientName}
                </span>
              </Popover>
            </Text>
          ) : record._loading ? (
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
              <LoadingOutlined spin style={{ fontSize: 12, marginRight: 4 }} />加载匹配信息...
            </Text>
          ) : null
        )}
      </Space>
      {(isHovered || isAutoArchiving) && (
        <Space
          size={8}
          onClick={(e) => e.stopPropagation()}
          style={{ transition: 'opacity 0.2s', flexShrink: 0, marginLeft: 8 }}
        >
          {hoverActions}
        </Space>
      )}
    </div>
  )
}

export const renderPatientGroupCard = (record, deps = {}) => {
  const {
    activeGroupKey,
    getGroupActionNodes,
    handleGroupMouseEnter,
    hoveredGroupKey,
    setActiveGroupKey,
    setHoveredGroupKey,
    token,
  } = deps
  const isActive = activeGroupKey === record.key
  const isVirtualPendingGroup = record._groupType === 'pending_parse'
  const isHovered = hoveredGroupKey === record.key
  const actions = isVirtualPendingGroup
    ? []
    : getGroupActionNodes(record, { expandDetailLabel: isHovered })

  return (
    <div
      key={record.key}
      role="button"
      tabIndex={0}
      onClick={() => setActiveGroupKey(record.key)}
      onMouseEnter={() => handleGroupMouseEnter(record)}
      onMouseLeave={() => setHoveredGroupKey(null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setActiveGroupKey(record.key)
        }
      }}
      style={{
        border: `1px solid ${isActive ? token.colorPrimary : token.colorBorder}`,
        borderRadius: 8,
        padding: '10px 12px',
        background: isActive ? token.colorPrimaryBg : token.colorBgContainer,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <Space size={8} style={{ flexWrap: 'wrap' }}>
        <Tooltip title={record._badge?.tip}>
          <span style={{ fontSize: 14 }}>{record._badge?.icon}</span>
        </Tooltip>
        <Text strong ellipsis={{ tooltip: record._label }} style={{ fontSize: 14, maxWidth: '100%' }}>
          {record._label}
        </Text>
        <Tag style={{ marginInlineEnd: 0 }}>{record._count || 0}份</Tag>
        {record._loading && <LoadingOutlined spin style={{ fontSize: 12, color: token.colorPrimary }} />}
      </Space>
      {actions.length > 0 && (
        <Space size={8} wrap onClick={(event) => event.stopPropagation()}>
          {actions}
        </Space>
      )}
    </div>
  )
}
