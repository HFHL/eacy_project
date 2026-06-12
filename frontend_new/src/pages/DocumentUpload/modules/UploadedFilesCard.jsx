import React from 'react'
import { Badge, Button, Card, Divider, List, Popconfirm, Progress, Space, Tag, Tooltip, Typography } from 'antd'
import {
  CloseCircleOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SettingOutlined,
  WarningOutlined,
} from '@ant-design/icons'

import { formatFileSize } from './documentUploadUtils'
import { buildFileActions, FileStatusIcon, getFileStatusTooltip } from './fileStatus'

const { Text } = Typography

export const UploadedFilesCard = ({
  allFiles,
  deletingFileId,
  handleClearFiles,
  handleEditFile,
  handleIgnoreAllFailed,
  handleIgnoreFile,
  handleParseDocument,
  handleRemoveFile,
  handleRetryUpload,
  parsingFileId,
  setSettingsModalVisible,
  token,
  unparsedLoading,
  unparsedPagination,
  uploadStats,
  uploading,
  onRefresh,
}) => (
  <Card
    title={(
      <Space>
        <FileTextOutlined />
        <Text strong>我的上传</Text>
        <Badge count={unparsedPagination.total} size="small" style={{ marginLeft: 8 }} />
      </Space>
    )}
    extra={(
      <Space>
        <Button icon={<ReloadOutlined />} size="small" onClick={onRefresh}>
          刷新
        </Button>
        {uploadStats.failedFiles > 0 && (
          <Popconfirm
            title="确定要忽略所有失败的文件吗？"
            description={`将移除 ${uploadStats.failedFiles} 个失败的文件`}
            onConfirm={handleIgnoreAllFailed}
            okText="确定忽略"
            cancelText="取消"
          >
            <Button size="small" danger icon={<CloseCircleOutlined />}>
              全部忽略
            </Button>
          </Popconfirm>
        )}
      </Space>
    )}
  >
    {allFiles.length === 0 && !unparsedLoading ? (
      <div style={{ textAlign: 'center', padding: 40, color: token.colorTextSecondary }}>
        <FileTextOutlined style={{ fontSize: 48 }} />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">暂无文件，请选择或拖拽文件到上传区域</Text>
        </div>
      </div>
    ) : (
      <>
        <List
          loading={unparsedLoading}
          dataSource={allFiles}
          renderItem={(file) => (
            <List.Item
              style={{
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                padding: '12px 16px',
                borderRadius: '8px',
              }}
              className="file-list-item"
              onClick={() => handleEditFile(file)}
              actions={buildFileActions({
                deletingFileId,
                file,
                handleIgnoreFile,
                handleParseDocument,
                handleRemoveFile,
                handleRetryUpload,
                parsingFileId,
                token,
              })}
            >
              <List.Item.Meta
                avatar={(
                  <Tooltip title={getFileStatusTooltip(file)}>
                    <div style={{ position: 'relative' }}>
                      <FileStatusIcon file={file} token={token} />
                      {file.uploadProgress > 0 && file.uploadProgress < 100 && (
                        <Progress
                          type="circle"
                          percent={file.uploadProgress}
                          size={20}
                          style={{ position: 'absolute', top: -10, left: -10 }}
                        />
                      )}
                    </div>
                  </Tooltip>
                )}
                title={(
                  <div>
                    <Text strong style={{ fontSize: 14 }}>{file.name}</Text>
                    {file.category && (
                      <Tag color="blue" size="small" style={{ marginLeft: 8 }}>
                        {file.category}
                      </Tag>
                    )}
                  </div>
                )}
                description={(
                  <div>
                    <Space split={<Divider type="vertical" />}>
                      <Text type="secondary">{formatFileSize(file.size)}</Text>
                      <Text type="secondary">{file.type.split('/')[1]?.toUpperCase()}</Text>
                      {file.extractedInfo && (
                        <Text type="secondary">
                          患者: {file.extractedInfo.patientName} | 日期: {file.extractedInfo.reportDate}
                        </Text>
                      )}
                    </Space>
                    {file.error && (
                      <div style={{ marginTop: 4 }}>
                        <Text type="danger" style={{ fontSize: 12 }}>
                          <WarningOutlined /> {file.error}
                        </Text>
                      </div>
                    )}
                  </div>
                )}
              />
            </List.Item>
          )}
        />

        <Divider />

        <div style={{ textAlign: 'center' }}>
          <Space size="large">
            <Button size="large" icon={<SettingOutlined />} onClick={() => setSettingsModalVisible(true)}>
              上传设置
            </Button>
            <Button size="large" onClick={handleClearFiles} disabled={uploading}>
              重置
            </Button>
          </Space>
        </div>
      </>
    )}
  </Card>
)
