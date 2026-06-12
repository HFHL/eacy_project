import React from 'react'
import { Empty, Modal, Tag, Typography } from 'antd'
import {
  formatDocumentUploadedAt,
  getDocumentDisplayName,
  getDocumentTypeLabel,
} from '../utils/documentCandidateUtils'

const { Text } = Typography

const TargetedExtractionModal = ({
  documents,
  extractConfirming,
  onCancel,
  onSelectDocument,
  open,
  patientId,
  projectId,
  selectedDocumentId,
  targetFormKey,
  targetSection,
}) => (
  <Modal
    title="从已有文档抽取"
    open={open}
    onCancel={onCancel}
    footer={null}
    width={720}
  >
    <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Text type="secondary">当前字段组：</Text>
      <Tag color={targetSection ? 'blue' : 'default'}>{targetSection || '未选择'}</Tag>
      <Text type="secondary">患者ID：{patientId || '-'}</Text>
      {projectId && <Text type="secondary">项目ID：{projectId}</Text>}
    </div>
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        选择一份已有文档后将立即按当前表单（{targetSection || targetFormKey}）提交靶向抽取。
      </Text>
      {documents.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="该患者暂无关联文档，请使用工具栏「上传文档」"
          style={{ margin: '28px 0' }}
        />
      ) : (
        <div className="schema-form-scrollable hover-scrollbar" style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8 }}>
          {documents.map((doc) => {
            const docId = String(doc?.id ?? '')
            const active = String(selectedDocumentId) === docId
            return (
              <button
                key={docId || `${getDocumentDisplayName(doc)}_${formatDocumentUploadedAt(doc)}`}
                type="button"
                disabled={extractConfirming}
                onClick={() => onSelectDocument(doc)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  borderBottom: '1px solid #f5f5f5',
                  background: active ? '#e6f7ff' : '#fff',
                  padding: '10px 12px',
                  cursor: extractConfirming ? 'wait' : 'pointer',
                  opacity: extractConfirming ? 0.7 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <Text strong style={{ color: active ? '#1677ff' : '#1f1f1f' }}>{getDocumentDisplayName(doc)}</Text>
                  <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>{formatDocumentUploadedAt(doc)}</Text>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>{getDocumentTypeLabel(doc)}</Text>
              </button>
            )
          })}
        </div>
      )}
    </>
  </Modal>
)

export default TargetedExtractionModal
