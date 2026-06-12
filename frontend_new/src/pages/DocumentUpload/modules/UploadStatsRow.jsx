import React from 'react'
import { Card, Col, Row } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudUploadOutlined,
  FileTextOutlined,
} from '@ant-design/icons'

import { formatFileSize } from './documentUploadUtils'

const StatCard = ({ title, value, icon, color, suffix = '' }) => (
  <Card
    style={{
      height: 100,
      background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
      border: 'none',
      borderRadius: 12,
    }}
  >
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      height: '100%',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{
          color: 'rgba(255, 255, 255, 0.8)',
          fontSize: 12,
          marginBottom: 6,
          fontWeight: 400,
        }}>
          {title}
        </div>
        <div style={{
          color: 'rgb(255, 255, 255)',
          fontSize: 24,
          fontWeight: 600,
          lineHeight: 1.2,
        }}>
          {typeof value === 'string' ? value : value.toLocaleString()}{suffix}
        </div>
      </div>
      <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 20 }}>
        {icon}
      </div>
    </div>
  </Card>
)

export const UploadStatsRow = ({ token, uploadStats }) => (
  <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
    <Col xs={24} sm={6}>
      <StatCard
        title="文件总数"
        value={uploadStats.totalFiles}
        icon={<FileTextOutlined />}
        color={token.colorPrimary}
      />
    </Col>
    <Col xs={24} sm={6}>
      <StatCard
        title="已上传"
        value={uploadStats.uploadedFiles}
        icon={<CheckCircleOutlined />}
        color={token.colorSuccess}
      />
    </Col>
    <Col xs={24} sm={6}>
      <StatCard
        title="上传失败"
        value={uploadStats.failedFiles}
        icon={<CloseCircleOutlined />}
        color={token.colorError}
      />
    </Col>
    <Col xs={24} sm={6}>
      <StatCard
        title="总大小"
        value={formatFileSize(uploadStats.totalSize)}
        icon={<CloudUploadOutlined />}
        color={token.colorPrimary}
      />
    </Col>
  </Row>
)
