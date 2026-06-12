import React from 'react'
import { Badge, Button, Spin, Tag, Typography } from 'antd'
import {
  ClockCircleOutlined,
  DatabaseOutlined,
  EditOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HistoryOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'
import { useModificationHistory } from './useModificationHistory'

const { Text } = Typography

const isExtractAction = (changeType) => (
  ['extract', 'merge', 'merge_append', 'merge_dedupe', 'initial_extract'].includes(changeType)
)

const getFallbackSelectedCandidateId = (fieldMeta) => {
  const candidates = fieldMeta.candidates || []
  const selectedCandidateId = fieldMeta.selectedCandidateId
  const hasSelectedIdInList = selectedCandidateId && candidates.some((item) => item?.id === selectedCandidateId)
  const selectedValueKey = fieldMeta.selectedValue != null ? JSON.stringify(fieldMeta.selectedValue) : null
  if (hasSelectedIdInList || !selectedValueKey) return null
  return candidates.find((item) => JSON.stringify(item?.value) === selectedValueKey)?.id
}

const ModificationHistory = ({
  fieldPath,
  rowUid = null,
  recordInstanceId = null,
  patientId,
  projectId,
  refreshKey = 0,
  onViewSource,
  onHistoryLoaded,
  onCandidateApplied,
  isSensitive = false,
  candidateDocuments = [],
}) => {
  const {
    extractSubFieldValues,
    fieldMeta,
    formatValue,
    getCandidateDisplayValue,
    handleSelectCandidate,
    loading,
    resolveCandidateSourceDocName,
    selectingCandidateId,
    visibleHistory,
  } = useModificationHistory({
    fieldPath,
    rowUid,
    recordInstanceId,
    patientId,
    projectId,
    refreshKey,
    onHistoryLoaded,
    onCandidateApplied,
    isSensitive,
    candidateDocuments,
  })

  const renderHistoryValue = (item) => {
    const sub = extractSubFieldValues(item)
    const displayOld = sub ? sub.oldSub : item.old_value
    const displayNew = sub ? sub.newSub : item.new_value
    if (sub && formatValue(displayOld) === formatValue(displayNew)) {
      return <div style={{ fontSize: 12, color: appThemeToken.colorTextTertiary }}>（此字段未变更）</div>
    }
    if (displayOld !== null && displayOld !== undefined) {
      return (
        <div style={{ fontSize: 12 }}>
          <span style={{ color: appThemeToken.colorError, textDecoration: 'line-through' }}>{formatValue(displayOld)}</span>
          <span style={{ margin: '0 6px', color: appThemeToken.colorTextTertiary }}>→</span>
          <span style={{ color: appThemeToken.colorSuccess, fontWeight: 500 }}>{formatValue(displayNew)}</span>
        </div>
      )
    }
    return (
      <div style={{ fontSize: 12 }}>
        <span style={{ color: appThemeToken.colorPrimary }}>新值: </span>
        <span style={{ fontWeight: 500 }}>{formatValue(displayNew)}</span>
      </div>
    )
  }

  const renderHistoryList = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin size="small" />
          <div style={{ marginTop: 8, fontSize: 12, color: appThemeToken.colorTextTertiary }}>加载中...</div>
        </div>
      )
    }
    if (visibleHistory.length === 0) {
      return <div style={{ textAlign: 'center', padding: 16, color: appThemeToken.colorTextTertiary, fontSize: 12 }}>暂无修改记录</div>
    }
    return (
      <div style={{ paddingLeft: 8, maxHeight: 300, overflowY: 'auto' }} className="schema-form-scrollable hover-scrollbar">
        {visibleHistory.map((item, index) => (
          <div key={item.id} style={{ position: 'relative', paddingLeft: 16, paddingBottom: index < visibleHistory.length - 1 ? 12 : 0, borderLeft: index < visibleHistory.length - 1 ? `1px solid ${appThemeToken.colorBorder}` : 'none' }}>
            <div style={{ position: 'absolute', left: -4, top: 4, width: 8, height: 8, borderRadius: '50%', background: isExtractAction(item.change_type) ? appThemeToken.colorPrimary : appThemeToken.colorSuccess, border: `2px solid ${appThemeToken.colorBgContainer}`, boxShadow: '0 0 0 1px ' + (isExtractAction(item.change_type) ? appThemeToken.colorPrimary : appThemeToken.colorSuccess) }} />
            <div style={{ background: appThemeToken.colorBgContainer, padding: '8px 10px', borderRadius: 4, border: `1px solid ${appThemeToken.colorBorder}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                </Text>
                <Text style={{ fontSize: 12, color: appThemeToken.colorTextSecondary }}>
                  <UserOutlined style={{ marginRight: 4 }} />
                  {item.operator_name || (item.operator_type === 'ai' ? 'AI系统' : '未知')}
                </Text>
              </div>
              <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Tag color={isExtractAction(item.change_type) ? 'blue' : 'green'} style={{ fontSize: 12, padding: '0 4px', lineHeight: '16px' }}>
                  {item.change_type_display || item.change_type}
                </Tag>
                {item.source_document_id && typeof onViewSource === 'function' && (
                  <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }} icon={<FileSearchOutlined />} onClick={() => onViewSource(item)}>
                    查看溯源
                  </Button>
                )}
              </div>
              {renderHistoryValue(item)}
              {item.source_document_name && (
                <div style={{ marginTop: 4, color: appThemeToken.colorTextSecondary, fontSize: 12 }}>
                  <FileTextOutlined style={{ marginRight: 4 }} />
                  来源: {item.source_document_name}
                </div>
              )}
              {item.remark && (
                <div style={{ marginTop: 4, color: appThemeToken.colorTextSecondary, fontSize: 12 }}>
                  <EditOutlined style={{ marginRight: 4 }} />
                  备注: {item.remark}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderCandidates = () => {
    if (loading || fieldMeta.candidates.length === 0) return null
    const fallbackSelectedCandidateId = getFallbackSelectedCandidateId(fieldMeta)

    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, padding: '6px 8px', background: appThemeToken.colorFillTertiary, borderRadius: 4 }}>
          <DatabaseOutlined style={{ color: appThemeToken.colorPrimary, marginRight: 6 }} />
          <Text strong style={{ fontSize: 12 }}>候选值</Text>
          {fieldMeta.hasValueConflict && (
            <Tag color="orange" style={{ marginLeft: 8 }}>
              多值差异 {fieldMeta.distinctValueCount}
            </Tag>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(fieldMeta.candidates || []).map((candidate) => {
            const candidateId = candidate?.id
            const isSelected = !!candidateId && (
              candidateId === fieldMeta.selectedCandidateId ||
              candidateId === fallbackSelectedCandidateId
            )
            return (
              <div
                key={candidateId}
                style={{
                  border: `1px solid ${isSelected ? appThemeToken.colorPrimary : appThemeToken.colorBorder}`,
                  borderRadius: 6,
                  padding: 8,
                  background: isSelected ? appThemeToken.colorPrimaryBg : appThemeToken.colorBgContainer,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: 500 }}>{formatValue(getCandidateDisplayValue(candidate))}</Text>
                  <Button
                    type={isSelected ? 'default' : 'primary'}
                    size="small"
                    disabled={isSelected}
                    loading={selectingCandidateId === candidateId}
                    onClick={() => handleSelectCandidate(candidateId)}
                  >
                    {isSelected ? '当前值' : '采用此值'}
                  </Button>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: appThemeToken.colorTextSecondary }}>
                  <div>来源文档: {resolveCandidateSourceDocName(candidate) || (candidate?.source_document_id ? `文档 ${String(candidate.source_document_id).slice(0, 8)}` : '—')}</div>
                  <div>页码: {candidate?.source_page ?? '—'}</div>
                  {candidate?.source_text ? <div>原文片段: {candidate.source_text}</div> : null}
                  {candidate?.confidence != null ? <div>置信度: {candidate.confidence}</div> : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, padding: '6px 8px', background: appThemeToken.colorFillTertiary, borderRadius: 4 }}>
        <HistoryOutlined style={{ color: appThemeToken.colorPrimary, marginRight: 6 }} />
        <Text strong style={{ fontSize: 12 }}>修改历史</Text>
        {loading ? (
          <Spin size="small" style={{ marginLeft: 8 }} />
        ) : (
          <Badge count={visibleHistory.length} size="small" style={{ marginLeft: 8, backgroundColor: visibleHistory.length > 0 ? appThemeToken.colorPrimary : appThemeToken.colorTextTertiary }} />
        )}
      </div>
      {renderHistoryList()}
      {renderCandidates()}
    </div>
  )
}

export default ModificationHistory
