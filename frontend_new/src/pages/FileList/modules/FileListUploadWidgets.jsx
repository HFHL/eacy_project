import React from 'react'
import { Button, Modal, Typography } from 'antd'
import { FileTextOutlined, FolderOpenOutlined } from '@ant-design/icons'
import UploadPanel from '../../../components/UploadPanel'
import UploadFloatingButton from '../../../components/UploadPanel/UploadFloatingButton'
import { MAX_UPLOAD_FILE_SIZE_MB, UPLOAD_FILE_ACCEPT } from '../../../constants/uploadLimits'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'

const { Text } = Typography

export const FileListUploadWidgets = ({
  fileInputRef,
  folderInputRef,
  handleFileInputChange,
  handleFolderInputChange,
  setUploadModalVisible,
  uploadManager,
  uploadModalVisible,
}) => (
  <>
    <Modal
      title="上传文件"
      open={uploadModalVisible}
      onCancel={() => setUploadModalVisible(false)}
      footer={null}
      width={modalWidthPreset.narrow}
      styles={modalBodyPreset}
      centered
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 0' }}>
        <Button block size="large" icon={<FileTextOutlined />} onClick={() => fileInputRef.current?.click()}>
          选择文件
        </Button>
        <Button block size="large" icon={<FolderOpenOutlined />} onClick={() => folderInputRef.current?.click()}>
          选择文件夹
        </Button>
        <Text type="secondary" style={{ textAlign: 'center', fontSize: 12 }}>
          支持 PDF、JPG、JPEG、PNG、DOCX、XLSX、CSV，单个文件最大 {MAX_UPLOAD_FILE_SIZE_MB}MB
        </Text>
      </div>
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept={UPLOAD_FILE_ACCEPT} multiple onChange={handleFileInputChange} />
      <input ref={folderInputRef} type="file" style={{ display: 'none' }} onChange={handleFolderInputChange} {...{ webkitdirectory: '', directory: '' }} />
    </Modal>

    <UploadPanel
      visible={uploadManager.panelVisible}
      onClose={() => uploadManager.setPanelVisible(false)}
      tasks={uploadManager.tasks}
      stats={uploadManager.stats}
      isUploading={uploadManager.isUploading}
      isPaused={uploadManager.isPaused}
      onStartUpload={uploadManager.startUpload}
      onPauseUpload={uploadManager.pauseUpload}
      onResumeUpload={uploadManager.resumeUpload}
      onRetryTask={uploadManager.retryTask}
      onCancelTask={uploadManager.cancelTask}
      onRemoveTask={uploadManager.removeTask}
      onRetryAllFailed={uploadManager.retryAllFailed}
      onClearCompleted={uploadManager.clearCompleted}
      onClearAll={uploadManager.clearAll}
    />

    {!uploadManager.panelVisible && (
      <UploadFloatingButton
        tasks={uploadManager.tasks}
        stats={uploadManager.stats}
        isUploading={uploadManager.isUploading}
        isPaused={uploadManager.isPaused}
        onClick={() => uploadManager.setPanelVisible(true)}
      />
    )}
  </>
)
