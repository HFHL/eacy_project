import React from 'react'
import { Badge, Space, Spin, Tabs } from 'antd'
import {
  ExperimentOutlined,
  FileTextOutlined,
  HistoryOutlined,
} from '@ant-design/icons'
import ExtractedFieldsPanel from './ExtractedFieldsPanel'
import MetadataFieldsPanel from './MetadataFieldsPanel'
import OcrContentPanel from './OcrContentPanel'
import OperationHistoryPanel from './OperationHistoryPanel'

const DocumentDetailTabs = ({
  activeTab,
  boundPatientId,
  canStartExtract,
  detailLoading,
  document,
  documentDetail,
  editedFields,
  extractDisabledReason,
  extractInProgress,
  extractStage,
  extracting,
  extractingMetadata,
  getFieldConfidence,
  getFieldValue,
  historyLoading,
  merging,
  metadataInProgress,
  metadataStage,
  ocrDisplayMode,
  ocrImageLoading,
  ocrMarkdown,
  ocrMarkdownLoading,
  onChange,
  onConflictClick,
  onDisplayModeChange,
  onExtract,
  onExtractMetadata,
  onFieldSave,
  onImageLoadingChange,
  onMergeToPatient,
  onRefreshHistory,
  onViewArrayField,
  operationHistory,
}) => {
  const tabItems = [
    {
      key: 'metadata',
      label: (
        <Space size={4}>
          <span>文档信息</span>
          {metadataInProgress ? <Spin size="small" /> : null}
        </Space>
      ),
      children: (
        <MetadataFieldsPanel
          detailLoading={detailLoading}
          document={document}
          documentDetail={documentDetail}
          editedFields={editedFields}
          extractingMetadata={extractingMetadata}
          getFieldConfidence={getFieldConfidence}
          getFieldValue={getFieldValue}
          metadataInProgress={metadataInProgress}
          metadataStage={metadataStage}
          onExtractMetadata={onExtractMetadata}
          onFieldSave={onFieldSave}
        />
      ),
    },
    {
      key: 'ocr',
      label: (
        <Space size={4}>
          <FileTextOutlined />
          <span>OCR 内容</span>
        </Space>
      ),
      children: (
        <OcrContentPanel
          loading={detailLoading}
          contentList={documentDetail?.content_list || []}
          isParsed={document.isParsed}
          displayMode={ocrDisplayMode}
          markdown={ocrMarkdown}
          markdownLoading={ocrMarkdownLoading}
          imageLoadingMap={ocrImageLoading}
          onDisplayModeChange={onDisplayModeChange}
          onImageLoadingChange={onImageLoadingChange}
        />
      ),
    },
    {
      key: 'extracted',
      label: (
        <Space size={4}>
          <ExperimentOutlined />
          <span>抽取记录</span>
          {detailLoading || extractInProgress ? (
            <Spin size="small" style={{ marginLeft: 4 }} />
          ) : (documentDetail?.extraction_count || 0) > 0 ? (
            <Badge count={documentDetail?.extraction_count || 0} size="small" style={{ marginLeft: 4 }} />
          ) : null}
        </Space>
      ),
      children: (
        <ExtractedFieldsPanel
          boundPatientId={boundPatientId}
          canStartExtract={canStartExtract}
          detailLoading={detailLoading}
          documentDetail={documentDetail}
          extractDisabledReason={extractDisabledReason}
          extractInProgress={extractInProgress}
          extractStage={extractStage}
          extracting={extracting}
          merging={merging}
          onConflictClick={onConflictClick}
          onExtract={onExtract}
          onMergeToPatient={onMergeToPatient}
          onViewArrayField={onViewArrayField}
        />
      ),
    },
    {
      key: 'history',
      label: (
        <Space size={4}>
          <HistoryOutlined />
          <span>操作历史</span>
          {historyLoading ? (
            <Spin size="small" style={{ marginLeft: 4 }} />
          ) : null}
        </Space>
      ),
      children: (
        <OperationHistoryPanel
          loading={historyLoading}
          history={operationHistory}
          onRefresh={onRefreshHistory}
        />
      ),
    },
  ]

  return (
    <Tabs
      destroyInactiveTabPane
      activeKey={activeTab}
      onChange={onChange}
      items={tabItems}
      size="small"
      style={{ height: '100%' }}
      tabBarStyle={{ marginBottom: 16, flexShrink: 0 }}
    />
  )
}

export default DocumentDetailTabs
