import React from 'react'
import {
  Button,
  Col,
  Modal,
  Row,
  Space,
  Typography,
} from 'antd'
import {
  CloseOutlined,
  DeleteOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import DocumentDetailTabs from './DocumentDetailTabs'
import DocumentPreviewArea from './DocumentPreviewArea'
import PatientBindingTag from './PatientBindingTag'
import StatusIndicator from './StatusIndicator'

const { Title } = Typography

const DocumentDetailShell = ({
  actions,
  activeTab,
  boundPatientId,
  detail,
  document,
  documentDetail,
  history,
  metadataEditor,
  ocrContent,
  onArchivePatient,
  onChangePatient,
  onClose,
  onConflictClick,
  onRefresh,
  onTabChange,
  onViewPatient,
  onViewArrayField,
  polling,
  preview,
  showTaskStatus,
  visible,
}) => (
  <Modal
    title={
      <div className="modal-header" style={{ width: '100%', paddingRight: 24 }}>
        <Row gutter={16} style={{ width: '100%' }} align="middle">
          <Col span={10}>
            <div className="modal-title">
              <Title level={4} style={{ margin: 0 }}>
                文档详情
              </Title>
            </div>
          </Col>
          <Col span={14} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size="middle">
              <StatusIndicator
                status={
                  showTaskStatus
                    ? (detail.detailLoading ? 'loading' : (detail.currentStatus || 'pending_confirm_review'))
                    : (document.status || 'pending')
                }
                extractedFieldsCount={document.extractedFields?.length || 0}
              />
              <PatientBindingTag
                document={document}
                documentDetail={documentDetail}
                onArchivePatient={onArchivePatient}
                onChangePatient={onChangePatient}
                onRefresh={onRefresh}
                onRefetchDocument={detail.fetchDocumentDetail}
                onViewPatient={onViewPatient}
              />
            </Space>
          </Col>
        </Row>
      </div>
    }
    open={visible}
    onCancel={onClose}
    destroyOnClose
    width="90%"
    centered
    footer={
      <div className="modal-footer">
        <div className="footer-left">
          <Space>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={actions.handleDelete}
              disabled={actions.deleting}
              loading={actions.deleting}
            >
              删除
            </Button>
          </Space>
        </div>
        <div className="footer-right">
          <Space>
            <Button onClick={onClose}>
              关闭
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={metadataEditor.handleSaveAll}
              disabled={!metadataEditor.hasChanges || metadataEditor.savingMetadata}
              loading={metadataEditor.savingMetadata}
            >
              保存修改
            </Button>
          </Space>
        </div>
      </div>
    }
    closeIcon={<CloseOutlined />}
  >
    <div className="document-detail-content" style={{ height: '75vh', overflow: 'hidden' }}>
      <Row gutter={16} style={{ height: '100%' }}>
        <Col span={10} style={{ height: '100%' }}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <DocumentPreviewArea
              {...preview}
              detailLoading={detail.detailLoading}
              document={document}
              documentDetail={documentDetail}
            />
          </div>
        </Col>

        <Col span={14} style={{ height: '100%' }}>
          <div className="document-fields" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <DocumentDetailTabs
              activeTab={activeTab}
              boundPatientId={boundPatientId}
              canStartExtract={polling.canStartExtract}
              detailLoading={detail.detailLoading}
              document={document}
              documentDetail={documentDetail}
              editedFields={metadataEditor.editedFields}
              extractDisabledReason={polling.extractDisabledReason}
              extractInProgress={polling.extractInProgress}
              extractStage={polling.extractStage}
              extracting={polling.extracting}
              extractingMetadata={polling.extractingMetadata}
              getFieldConfidence={metadataEditor.getFieldConfidence}
              getFieldValue={metadataEditor.getFieldValue}
              historyLoading={history.historyLoading}
              merging={actions.merging}
              metadataInProgress={polling.metadataInProgress}
              metadataStage={polling.metadataStage}
              ocrDisplayMode={ocrContent.ocrDisplayMode}
              ocrImageLoading={ocrContent.ocrImageLoading}
              ocrMarkdown={ocrContent.ocrMarkdown}
              ocrMarkdownLoading={ocrContent.ocrMarkdownLoading}
              onChange={onTabChange}
              onConflictClick={onConflictClick}
              onDisplayModeChange={ocrContent.onOcrDisplayModeChange}
              onExtract={polling.handleExtract}
              onExtractMetadata={polling.handleExtractMetadata}
              onFieldSave={metadataEditor.handleFieldSave}
              onImageLoadingChange={ocrContent.updateOcrImageLoading}
              onMergeToPatient={actions.handleMergeToPatient}
              onRefreshHistory={history.refreshOperationHistory}
              onViewArrayField={onViewArrayField}
              operationHistory={history.operationHistory}
            />
          </div>
        </Col>
      </Row>
    </div>
  </Modal>
)

export default DocumentDetailShell
