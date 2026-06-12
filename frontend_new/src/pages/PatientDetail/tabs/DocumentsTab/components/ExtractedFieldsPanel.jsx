import React from 'react'
import { Alert, Button, Empty, Progress, Spin, Tooltip, Typography } from 'antd'
import { ExperimentOutlined } from '@ant-design/icons'
import ExtractionRecord from './ExtractionRecord'

const { Text, Title } = Typography

const ExtractedFieldsPanel = ({
  boundPatientId,
  canStartExtract,
  detailLoading,
  documentDetail,
  extractDisabledReason,
  extractInProgress,
  extractStage,
  extracting,
  merging,
  onConflictClick,
  onExtract,
  onMergeToPatient,
  onViewArrayField,
}) => {
  if (detailLoading) {
    return (
      <div className="extracted-fields">
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">正在加载抽取记录...</Text>
          </div>
        </div>
      </div>
    )
  }

  const extractionRecords = documentDetail?.extraction_records || []
  const extractionCount = documentDetail?.extraction_count || 0
  const hasExtractionRecords = extractionRecords.length > 0
  const extractProgressAlert = extractStage && (extractInProgress || extractStage.kind === 'error') ? (
    <Alert
      type={extractStage.kind === 'error' ? 'error' : 'info'}
      showIcon
      message={extractStage.message}
      description={(
        <Progress
          percent={extractStage.percent}
          size="small"
          status={
            extractStage.kind === 'error'
              ? 'exception'
              : extractInProgress
                ? 'active'
                : 'success'
          }
        />
      )}
      style={{ marginBottom: 16 }}
    />
  ) : null

  const renderExtractActionButton = (primary = false) => (
    <Tooltip title={extractDisabledReason || (hasExtractionRecords ? '重新抽取病历结构化字段' : '开始抽取病历结构化字段')}>
      <Button
        type={primary ? 'primary' : 'default'}
        size={primary ? 'middle' : 'small'}
        style={primary ? { marginTop: 16 } : undefined}
        icon={extractInProgress ? <Spin size="small" /> : <ExperimentOutlined />}
        onClick={onExtract}
        loading={extracting || extractInProgress}
        disabled={!canStartExtract}
      >
        {extractInProgress ? '抽取中' : (hasExtractionRecords ? '重新抽取' : '开始抽取')}
      </Button>
    </Tooltip>
  )

  return (
    <div className="extracted-fields">
      {extractProgressAlert}
      {!hasExtractionRecords ? (
        <div className="ocr-content-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={boundPatientId ? '文档尚未进行 AI 抽取' : '文档尚未绑定患者，请先归档后再抽取'}
          />
          {renderExtractActionButton(true)}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Title level={5} style={{ margin: 0 }}>抽取记录 ({extractionCount})</Title>
            {renderExtractActionButton(false)}
          </div>
          <div className="extraction-records-list">
            {extractionRecords.map((record, index) => (
              <ExtractionRecord
                key={record.extraction_id || `record-${index}`}
                index={index}
                merging={merging}
                onConflictClick={onConflictClick}
                onMergeToPatient={onMergeToPatient}
                onViewArrayField={onViewArrayField}
                record={record}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default ExtractedFieldsPanel
