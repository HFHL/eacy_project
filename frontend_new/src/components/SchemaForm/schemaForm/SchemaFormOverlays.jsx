import React from 'react'
import { Button, Modal } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import TargetedExtractionModal from '../extraction/TargetedExtractionModal'

const SchemaFormOverlays = ({
  extractCandidateDocuments,
  extractConfirming,
  handleCloseUploadExtractModal,
  handleLeaveConfirmCancel,
  handleLeaveConfirmDiscard,
  handleLeaveConfirmSave,
  handleSelectExistingDocumentForExtract,
  handleUploadExtractFile,
  leaveConfirmOpen,
  patientId,
  projectId,
  saving,
  selectedExtractDocId,
  targetFormKey,
  targetSection,
  uploadExtractModalOpen,
  uploadFileInputRef,
}) => (
  <>
    <Modal
      title="当前修改尚未保存"
      open={leaveConfirmOpen}
      onCancel={handleLeaveConfirmCancel}
      footer={[
        <Button key="cancel" onClick={handleLeaveConfirmCancel}>取消</Button>,
        <Button key="discard" onClick={handleLeaveConfirmDiscard}>不保存</Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleLeaveConfirmSave} icon={<SaveOutlined />}>保存</Button>,
      ]}
    >
      <p>当前修改尚未保存。请选择：保存、不保存离开，或取消。</p>
    </Modal>
    <input
      ref={uploadFileInputRef}
      type="file"
      style={{ display: 'none' }}
      accept=".pdf,.jpg,.jpeg,.png"
      onChange={handleUploadExtractFile}
    />
    <TargetedExtractionModal
      documents={extractCandidateDocuments}
      extractConfirming={extractConfirming}
      onCancel={handleCloseUploadExtractModal}
      onSelectDocument={handleSelectExistingDocumentForExtract}
      open={uploadExtractModalOpen}
      patientId={patientId}
      projectId={projectId}
      selectedDocumentId={selectedExtractDocId}
      targetFormKey={targetFormKey}
      targetSection={targetSection}
    />
  </>
)

export default SchemaFormOverlays
