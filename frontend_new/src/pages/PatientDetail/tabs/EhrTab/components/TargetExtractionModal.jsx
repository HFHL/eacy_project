import React from 'react'
import { Button, Modal, Select, Space, Upload } from 'antd'

export const TargetExtractionModal = ({
  currentGroup,
  ehrDocuments,
  extracting,
  onSubmit,
  selectedEhrGroup,
  setTargetDocumentId,
  setTargetFileList,
  setTargetModalOpen,
  targetDocumentId,
  targetFileList,
  targetModalOpen,
}) => (
  <Modal
    title="表单专项抽取"
    open={targetModalOpen}
    onCancel={() => setTargetModalOpen(false)}
    onOk={onSubmit}
    okText="开始抽取"
    confirmLoading={extracting}
    destroyOnClose
  >
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div>当前表单：{currentGroup.name || selectedEhrGroup}</div>
      <Select
        allowClear
        style={{ width: '100%' }}
        placeholder="选择已有患者文档"
        value={targetDocumentId}
        onChange={setTargetDocumentId}
        disabled={targetFileList.length > 0}
        options={(ehrDocuments || []).map((doc) => ({
          value: doc.id,
          label: doc.name || doc.file_name || doc.original_filename || doc.id,
        }))}
      />
      <Upload
        beforeUpload={() => false}
        maxCount={1}
        fileList={targetFileList}
        onChange={({ fileList }) => {
          setTargetFileList(fileList.slice(-1))
          if (fileList.length > 0) setTargetDocumentId(null)
        }}
      >
        <Button>上传新文档并抽取</Button>
      </Upload>
    </Space>
  </Modal>
)
