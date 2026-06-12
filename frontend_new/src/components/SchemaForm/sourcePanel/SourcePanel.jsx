import React, { useCallback, useEffect, useState } from 'react'
import { Button, Empty, Space, Tooltip, Typography } from 'antd'
import {
  EyeOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { useSchemaForm } from '../SchemaFormContext'
import ModificationHistory from '../history/ModificationHistory'
import SourceDocumentPreview from '../preview/SourceDocumentPreview'
import DocumentDetailModal from '../../../pages/PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal'
import { useSourcePanelLayout } from './useSourcePanelLayout'
import { useSourcePanelPreview } from './useSourcePanelPreview'
import { useSourcePanelSource } from './useSourcePanelSource'

const { Text } = Typography

const HEADER_ICON_BUTTON_STYLE = {
  width: 28,
  height: 28,
  borderRadius: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const getWindowWidth = () => (typeof window !== 'undefined' ? window.innerWidth : 1440)

const SourcePanel = ({
  collapsed,
  onToggle,
  selectedField,
  width: widthProp,
  patientId = null,
  projectId = null,
  historyRefreshKey = 0,
  onCandidateApplied,
  fallbackDocuments = [],
  preferredDocument = null,
  contentAdaptive = false,
}) => {
  const width = widthProp || Math.round(getWindowWidth() * 0.25)
  const { draftData } = useSchemaForm()
  const isPinned = true
  const [docModalOpen, setDocModalOpen] = useState(false)
  const [docModalDoc, setDocModalDoc] = useState(null)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null)
  const [suppressAutoSourceDoc, setSuppressAutoSourceDoc] = useState(false)

  const {
    effectivePanelWidth,
    panelStyle,
  } = useSourcePanelLayout({ contentAdaptive, isPinned, width })

  const {
    candidateDocuments,
    displaySource,
    effectiveCoordinates,
    fallbackDoc,
    isCurrentFieldSensitive,
    sourceDocId,
    sourceDocumentName,
    sourcePageIdx,
  } = useSourcePanelSource({
    draftData,
    fallbackDocuments,
    preferredDocument,
    projectId,
    selectedField,
    selectedHistoryItem,
    suppressAutoSourceDoc,
  })

  const {
    ocrPageAngles,
    previewDocument,
    previewLoading,
    previewRequested,
    setPreviewRequested,
  } = useSourcePanelPreview({
    collapsed,
    displaySource,
    fallbackDoc,
    sourceDocId,
    sourcePageIdx,
  })

  useEffect(() => {
    setSelectedHistoryItem(null)
    setPreviewRequested(false)
  }, [patientId, selectedField?.path, setPreviewRequested])

  const handleHistoryLoaded = useCallback((historyList) => {
    if (!Array.isArray(historyList) || !patientId) return
    const firstItem = historyList[0] || null
    setSelectedHistoryItem((prev) => {
      if (!firstItem) return null
      if (prev && historyList.some((item) => item.id === prev.id)) return prev
      return firstItem
    })
    setSuppressAutoSourceDoc(firstItem?.change_type === 'revoke')
  }, [patientId])

  const handleCandidateApplied = useCallback((appliedPath, appliedValue, appliedRowUid, appliedCandidate) => {
    if (appliedCandidate?.source_document_id) {
      setSuppressAutoSourceDoc(false)
      setPreviewRequested(true)
      setSelectedHistoryItem({
        id: appliedCandidate.id,
        field_path: appliedPath,
        matched_field_path: appliedCandidate.field_path || appliedPath,
        new_value: appliedValue,
        change_type: appliedCandidate.created_by === 'ai' ? 'extract' : 'manual_edit',
        change_type_display: appliedCandidate.created_by === 'ai' ? 'AI 抽取' : '手动修改',
        operator_type: appliedCandidate.created_by || null,
        operator_name: appliedCandidate.created_by === 'ai' ? 'AI系统' : '用户',
        source_document_id: appliedCandidate.source_document_id || null,
        source_document_name: appliedCandidate.source_document_name || null,
        source_page: appliedCandidate.source_page ?? null,
        source_location: appliedCandidate.source_location || null,
        source_text: appliedCandidate.source_text || null,
        confidence: appliedCandidate.confidence ?? null,
        created_at: appliedCandidate.created_at || null,
      })
    }
    onCandidateApplied?.(appliedPath, appliedValue, appliedRowUid, appliedCandidate)
  }, [onCandidateApplied, setPreviewRequested])

  const handleViewSource = useCallback((item) => {
    setSuppressAutoSourceDoc(false)
    setSelectedHistoryItem(item)
    setPreviewRequested(true)
  }, [setPreviewRequested])

  if (collapsed) {
    return (
      <div style={{ width: 32, height: '100%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12 }}>
        <Tooltip title="展开溯源面板" placement="left"><Button type="text" size="small" icon={<LeftOutlined />} onClick={onToggle} /></Tooltip>
        <div style={{ writingMode: 'vertical-rl', color: '#666', fontSize: 12, marginTop: 16 }}>文档溯源</div>
      </div>
    )
  }

  return (
    <div style={panelStyle} data-source-panel>
      <div style={{ height: 41, padding: '0 12px', borderBottom: '1px solid #f0f0f0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1, marginRight: 8 }}>
          <Space size={6} style={{ minWidth: 0 }}>
            <FileTextOutlined style={{ color: '#1890ff' }} />
            <Text strong style={{ fontSize: 14, flexShrink: 0 }}>文档溯源</Text>
            {sourceDocumentName ? (
              <Tooltip title={sourceDocumentName}>
                <Text type="secondary" style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                  {sourceDocumentName}
                </Text>
              </Tooltip>
            ) : null}
          </Space>
        </div>
        <Space size={4} style={{ flexShrink: 0 }}>
          {sourceDocId && (
            <Tooltip title="查看原文档">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                loading={previewLoading}
                style={HEADER_ICON_BUTTON_STYLE}
                onClick={() => {
                  setDocModalDoc({ id: sourceDocId, fileName: previewDocument.fileName })
                  setDocModalOpen(true)
                }}
              />
            </Tooltip>
          )}
          <Tooltip title="收起面板">
            <Button type="text" size="small" aria-label="收起文档溯源面板" icon={<RightOutlined />} onClick={onToggle} style={HEADER_ICON_BUTTON_STYLE} />
          </Tooltip>
        </Space>
      </div>
      <div className="schema-form-scrollable hover-scrollbar scroll-edge-hint" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {sourceDocId && !previewRequested ? (
          <div style={{ padding: '12px 12px 0' }}>
            <Button type="default" size="small" icon={<FileSearchOutlined />} block onClick={() => setPreviewRequested(true)}>
              加载文档预览
            </Button>
          </div>
        ) : (
          <SourceDocumentPreview
            documentInfo={previewDocument}
            activeCoordinates={effectiveCoordinates}
            panelWidth={effectivePanelWidth}
            loading={previewLoading}
            initialRotation={ocrPageAngles[sourcePageIdx] || 0}
          />
        )}
        <div style={{ padding: 12 }}>
          {selectedField ? (
            <ModificationHistory
              fieldPath={selectedField.path}
              rowUid={selectedField.rowUid}
              recordInstanceId={selectedField.recordInstanceId}
              patientId={patientId}
              projectId={projectId}
              refreshKey={historyRefreshKey}
              onCandidateApplied={handleCandidateApplied}
              onViewSource={patientId ? handleViewSource : undefined}
              onHistoryLoaded={patientId ? handleHistoryLoaded : undefined}
              isSensitive={isCurrentFieldSensitive}
              candidateDocuments={candidateDocuments}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary" style={{ fontSize: 12 }}>点击表单中的字段卡片<br />查看数据来源</Text>} />
          )}
        </div>
      </div>
      {docModalDoc && (
        <DocumentDetailModal
          visible={docModalOpen}
          document={docModalDoc}
          onClose={() => {
            setDocModalOpen(false)
            setDocModalDoc(null)
          }}
        />
      )}
    </div>
  )
}

export default SourcePanel
