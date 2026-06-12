import React from 'react'
import { Button, Popconfirm, Tooltip } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  FileTextOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons'

export const getFileStatusTooltip = (file) => {
  if (file.uploadStatus === 'uploading') return '上传中...'
  if (file.uploadStatus === 'success' || file.status === 'uploaded') return '已上传，待处理'
  if (file.uploadStatus === 'failed') return file.error || '上传失败'

  switch (file.status) {
    case 'valid':
      return '待上传'
    case 'invalid':
      return file.error || '格式错误'
    case 'needsConfig':
      return '需要设置'
    default:
      return '未知状态'
  }
}

export const FileStatusIcon = ({ file, token }) => {
  if (file.uploadStatus === 'uploading') {
    return <LoadingOutlined style={{ color: token.colorPrimary, fontSize: 16 }} spin />
  }
  if (file.uploadStatus === 'success' || file.status === 'uploaded') {
    return <CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 16 }} />
  }
  if (file.uploadStatus === 'failed') {
    return <CloseCircleOutlined style={{ color: token.colorError, fontSize: 16 }} />
  }

  switch (file.status) {
    case 'valid':
      return <FileTextOutlined style={{ color: token.colorPrimary, fontSize: 16 }} />
    case 'invalid':
      return <CloseCircleOutlined style={{ color: token.colorError, fontSize: 16 }} />
    case 'needsConfig':
      return <WarningOutlined style={{ color: token.colorWarning, fontSize: 16 }} />
    default:
      return <FileTextOutlined style={{ fontSize: 16 }} />
  }
}

export const buildFileActions = ({
  deletingFileId,
  file,
  handleIgnoreFile,
  handleParseDocument,
  handleRemoveFile,
  handleRetryUpload,
  parsingFileId,
  token,
}) => {
  if (file.uploadStatus === 'success' || file.status === 'uploaded') {
    const isDeleting = deletingFileId === file.id
    const isParsing = parsingFileId === file.id
    return [
      <Tooltip title="解析文档" key="parse">
        <Button
          type="link"
          size="small"
          icon={<PlayCircleOutlined />}
          loading={isParsing}
          disabled={isParsing || isDeleting}
          onClick={(event) => {
            event.stopPropagation()
            handleParseDocument(file)
          }}
          style={{ color: token.colorPrimary }}
        >
          解析
        </Button>
      </Tooltip>,
      <Tooltip title="删除文件" key="delete">
        <Popconfirm
          title="确定要删除这个文件吗？"
          description="此操作将从服务器永久删除该文件"
          onConfirm={(event) => {
            event?.stopPropagation()
            handleRemoveFile(file)
          }}
          okText="确定删除"
          cancelText="取消"
          disabled={isDeleting || isParsing}
        >
          <Button
            type="link"
            size="small"
            icon={<DeleteOutlined />}
            danger
            loading={isDeleting}
            disabled={isDeleting || isParsing}
            onClick={(event) => event.stopPropagation()}
          >
            删除
          </Button>
        </Popconfirm>
      </Tooltip>,
    ]
  }

  if (file.uploadStatus === 'failed' || file.status === 'invalid') {
    const actions = []
    if (file.uploadStatus === 'failed' && file.originFileObj) {
      actions.push(
        <Tooltip title="重新上传" key="retry">
          <Button
            type="link"
            size="small"
            icon={<ReloadOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              handleRetryUpload(file)
            }}
          >
            重试
          </Button>
        </Tooltip>,
      )
    }
    actions.push(
      <Tooltip title="忽略此文件" key="ignore">
        <Button
          type="link"
          size="small"
          icon={<CloseCircleOutlined />}
          danger
          onClick={(event) => {
            event.stopPropagation()
            handleIgnoreFile(file.id)
          }}
        >
          忽略
        </Button>
      </Tooltip>,
    )
    return actions
  }

  return []
}
