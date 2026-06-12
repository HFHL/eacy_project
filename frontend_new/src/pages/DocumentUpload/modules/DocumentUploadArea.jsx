import React from 'react'
import { Button, Card, Col, Collapse, Row, Space, Tooltip, Typography, Upload, message } from 'antd'
import {
  FolderOpenOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
  UploadOutlined,
} from '@ant-design/icons'

import {
  MAX_UPLOAD_FILE_SIZE_MB,
  MAX_UPLOAD_FILES_PER_BATCH,
  UPLOAD_FILE_ACCEPT,
  validateUploadBatch,
  validateUploadFile,
} from '../../../constants/uploadLimits'

const { Text } = Typography
const { Dragger } = Upload

export const DocumentUploadArea = ({
  fileInputRef,
  folderInputRef,
  handleDroppedFiles,
  handleFileUpload,
  markProcessedFile,
  setShowProcessSteps,
  showProcessSteps,
  token,
  uploadStats,
}) => {
  const uploadProps = {
    name: 'file',
    multiple: true,
    showUploadList: false,
    accept: UPLOAD_FILE_ACCEPT,
    fileList: [],
    beforeUpload: (file) => {
      if (!markProcessedFile(file)) return false
      handleFileUpload([file])
      return false
    },
    onDrop: (event) => {
      event.preventDefault()
      handleDroppedFiles(Array.from(event.dataTransfer.files))
    },
  }

  const handleFolderChange = (event) => {
    if (event.target.files.length > 0) {
      const files = Array.from(event.target.files)
      const batchCheck = validateUploadBatch(files)
      if (!batchCheck.ok) {
        message.error(batchCheck.message)
        event.target.value = ''
        return
      }

      const validFiles = []
      batchCheck.validFiles.forEach((file) => {
        const result = validateUploadFile(file)
        if (result.ok) validFiles.push(file)
      })

      if (validFiles.length === 0) {
        message.warning('文件夹中没有找到支持的文件格式')
        return
      }
      if (validFiles.length < files.length) {
        message.info(`文件夹中共 ${files.length} 个文件，筛选出 ${validFiles.length} 个支持的文件`)
      }

      handleFileUpload(validFiles)
    }
    event.target.value = ''
  }

  return (
    <Card
      title={(
        <Space>
          <InboxOutlined />
          <Text strong>文档上传区域</Text>
        </Space>
      )}
      extra={(
        <Space>
          <Tooltip title="查看处理流程">
            <Button
              icon={<QuestionCircleOutlined />}
              onClick={() => setShowProcessSteps(!showProcessSteps)}
            >
              处理流程
            </Button>
          </Tooltip>
        </Space>
      )}
      style={{ marginBottom: 24 }}
    >
      <Collapse
        ghost
        size="small"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'upload-notice',
            label: (
              <Space>
                <InfoCircleOutlined style={{ color: token.colorPrimary }} />
                <Text type="secondary">医疗文档上传须知</Text>
              </Space>
            ),
            children: (
              <div style={{ paddingLeft: 24 }}>
                <p>• 支持格式: PDF, JPG, PNG, DOCX, XLSX, CSV | 单文件≤{MAX_UPLOAD_FILE_SIZE_MB}MB | 单次最多 {MAX_UPLOAD_FILES_PER_BATCH} 个</p>
                <p>• 请确保文档清晰可读，模糊或损坏的文档会影响AI识别准确率</p>
                <p>• 系统会自动检测患者信息并进行智能分类，请确保文档包含患者姓名等关键信息</p>
              </div>
            ),
          },
        ]}
      />

      <Dragger {...uploadProps} style={{ marginBottom: 16 }}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined style={{ color: token.colorPrimary }} />
        </p>
        <p className="ant-upload-text">
          <Text strong>点击或拖拽文件到此处上传</Text>
        </p>
        <p className="ant-upload-hint">
          支持单个或批量上传。可以直接拖拽整个文件夹，系统会自动筛选支持的格式
        </p>
      </Dragger>

      <Row gutter={[16, 16]}>
        <Col>
          <Space>
            <Button type="primary" icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
              选择文件
            </Button>
            <Button icon={<FolderOpenOutlined />} onClick={() => folderInputRef.current?.click()}>
              选择文件夹
            </Button>
          </Space>
        </Col>
        <Col flex={1}>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Text type="secondary">已上传 {uploadStats.uploadedFiles} 个文件</Text>
              {uploadStats.uploadingFiles > 0 && <Text type="warning">正在上传 {uploadStats.uploadingFiles} 个文件</Text>}
              {uploadStats.failedFiles > 0 && <Text type="danger">{uploadStats.failedFiles} 个文件有错误</Text>}
            </Space>
          </div>
        </Col>
      </Row>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(event) => {
          if (event.target.files.length > 0) {
            handleFileUpload(Array.from(event.target.files))
          }
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        style={{ display: 'none' }}
        onChange={handleFolderChange}
      />
    </Card>
  )
}
