import React, { useMemo, useState } from 'react'
import { Alert, Button, Divider, Modal, Progress, Typography, Upload, message } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { uploadAndArchiveAsync } from '@/api/document'
import { upsertTask } from '@/utils/taskStore'
import {
  MAX_UPLOAD_FILE_SIZE_MB,
  MAX_UPLOAD_FILES_PER_BATCH,
  UPLOAD_FILE_ACCEPT,
  validateUploadBatch,
  validateUploadFile,
} from '@/constants/uploadLimits'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'

const { Text } = Typography

const getUploadFileKey = (file) => file?.uid || file?.name

const UploadDocumentModal = ({
  loadTaskItems,
  onClose,
  open,
  patientId,
  pollUploadArchiveTask,
}) => {
  const [fileList, setFileList] = useState([])
  const [progressByFile, setProgressByFile] = useState({})
  const [uploading, setUploading] = useState(false)

  const uploadableFileList = useMemo(() => (
    fileList.filter((file) => {
      const fileKey = getUploadFileKey(file)
      const status = progressByFile[fileKey]?.status
      return !status || status === 'error'
    })
  ), [fileList, progressByFile])

  const hasUploadableFiles = uploadableFileList.length > 0

  const resetAndClose = () => {
    onClose()
    setFileList([])
    setProgressByFile({})
  }

  const updateProgress = (fileKey, nextProgress) => {
    setProgressByFile(prev => ({
      ...prev,
      [fileKey]: nextProgress,
    }))
  }

  const handleUpload = async () => {
    if (!hasUploadableFiles) {
      message.warning('请先选择要上传的文件')
      return
    }

    const batchCheck = validateUploadBatch(
      uploadableFileList.map((item) => item.originFileObj || item)
    )
    if (!batchCheck.ok) {
      message.error(batchCheck.message)
      return
    }

    setUploading(true)

    let queuedCount = 0
    let failCount = 0

    for (const file of uploadableFileList) {
      const fileKey = getUploadFileKey(file)

      try {
        updateProgress(fileKey, { status: 'uploading', percent: 0, message: '正在上传...' })

        const result = await uploadAndArchiveAsync(
          file.originFileObj || file,
          patientId,
          { autoMergeEhr: true },
          (percent) => {
            updateProgress(fileKey, {
              status: 'uploading',
              percent: Math.min(percent * 0.3, 30),
              message: '正在上传文件…',
            })
          }
        )

        const documentId = result?.data?.document_id || result?.data?.id
        if (!documentId) {
          throw new Error('未获取到文档 ID')
        }

        upsertTask({
          task_id: documentId,
          patient_id: patientId,
          document_id: documentId,
          file_name: file.name,
          type: 'upload_archive',
          status: 'processing',
          percentage: 30,
          message: '上传完成，等待 OCR…',
          created_at: new Date().toISOString(),
        })
        loadTaskItems()

        updateProgress(fileKey, { status: 'uploading', percent: 32, message: '等待 OCR…' })
        pollUploadArchiveTask({ documentId, fileName: file.name, fileKey })
        queuedCount += 1
      } catch (error) {
        console.error('上传失败:', error)
        updateProgress(fileKey, { status: 'error', percent: 100, message: error.message || '上传失败' })
        failCount += 1
      }
    }

    setUploading(false)

    if (failCount === 0) {
      message.success(`已上传 ${queuedCount} 个文档，后台正在解析归档（可在任务中心查看）`)
    } else {
      message.warning(`上传完成：成功 ${queuedCount} 个，失败 ${failCount} 个（成功项后台继续处理）`)
    }
  }

  return (
    <Modal
      title="上传新文档"
      open={open}
      onCancel={resetAndClose}
      maskClosable
      closable
      footer={[
        <Button key="cancel" onClick={resetAndClose}>
          取消
        </Button>,
        <Button
          key="upload"
          type="primary"
          loading={uploading}
          disabled={uploading || !hasUploadableFiles}
          onClick={handleUpload}
        >
          {uploading ? '上传中...' : '开始上传'}
        </Button>,
      ]}
      width={modalWidthPreset.standard}
      styles={modalBodyPreset}
    >
      <Alert
        message="上传说明"
        description="文档上传后将自动进行OCR解析、AI抽取病历数据，并归档到当前患者名下。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Upload.Dragger
        multiple
        fileList={fileList}
        beforeUpload={(file) => {
          const validation = validateUploadFile(file)
          if (!validation.ok) {
            message.error(validation.message)
            return Upload.LIST_IGNORE
          }
          return false
        }}
        onChange={({ fileList: nextFileList }) => {
          if (nextFileList.length > MAX_UPLOAD_FILES_PER_BATCH) {
            message.error(`单次最多上传 ${MAX_UPLOAD_FILES_PER_BATCH} 个文件`)
            return
          }
          setFileList(nextFileList)
        }}
        onRemove={(file) => {
          if (uploading) return false
          const fileKey = getUploadFileKey(file)
          setProgressByFile(prev => {
            const nextProgress = { ...prev }
            delete nextProgress[fileKey]
            return nextProgress
          })
          return true
        }}
        disabled={uploading}
        showUploadList={{
          showRemoveIcon: !uploading,
        }}
        accept={UPLOAD_FILE_ACCEPT}
      >
        <p className="ant-upload-drag-icon">
          <UploadOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
        <p className="ant-upload-hint">
          支持 PDF、JPG、PNG、DOCX 等格式，单个文件最大 {MAX_UPLOAD_FILE_SIZE_MB}MB，单次最多 {MAX_UPLOAD_FILES_PER_BATCH} 个
        </p>
      </Upload.Dragger>

      {Object.keys(progressByFile).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Divider>上传进度</Divider>
          {fileList.map(file => {
            const fileKey = getUploadFileKey(file)
            const progress = progressByFile[fileKey]
            if (!progress) return null

            return (
              <div key={fileKey} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text ellipsis style={{ maxWidth: 300 }}>{file.name}</Text>
                  <Text type={progress.status === 'success' ? 'success' : progress.status === 'error' ? 'danger' : 'secondary'}>
                    {progress.message}
                  </Text>
                </div>
                <Progress
                  percent={progress.percent}
                  status={progress.status === 'error' ? 'exception' : progress.status === 'success' ? 'success' : 'active'}
                  size="small"
                />
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

export default UploadDocumentModal
