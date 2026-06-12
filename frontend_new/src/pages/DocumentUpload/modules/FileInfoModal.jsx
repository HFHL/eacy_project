import React from 'react'
import { Alert, Button, Col, Descriptions, Form, Input, Modal, Row, Select, Space, Typography } from 'antd'
import { DownloadOutlined, FileTextOutlined } from '@ant-design/icons'

import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'
import { formatFileSize } from './documentUploadUtils'

const { Text } = Typography

export const FileInfoModal = ({
  downloading,
  getFileStatusIcon,
  getFileStatusTooltip,
  handleDownloadFile,
  handleSaveFileInfo,
  selectedFile,
  setVisible,
  token,
  visible,
}) => (
  <Modal
    title={`编辑文件信息 - ${selectedFile?.name}`}
    open={visible}
    onCancel={() => setVisible(false)}
    footer={null}
    width={modalWidthPreset.wide}
    styles={modalBodyPreset}
  >
    {selectedFile && (
      <Form
        layout="vertical"
        initialValues={{
          category: selectedFile.category,
          patientName: selectedFile.extractedInfo?.patientName || '',
          reportDate: selectedFile.extractedInfo?.reportDate || '',
          reportType: selectedFile.extractedInfo?.reportType || '',
        }}
        onFinish={handleSaveFileInfo}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="文件名">{selectedFile.name}</Descriptions.Item>
              <Descriptions.Item label="文件大小">{formatFileSize(selectedFile.size)}</Descriptions.Item>
              <Descriptions.Item label="文件类型">{selectedFile.type}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Space>
                  {getFileStatusIcon(selectedFile)}
                  <Text>{getFileStatusTooltip(selectedFile)}</Text>
                </Space>
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <div style={{ background: token.colorBgLayout, padding: 16, borderRadius: 8, height: '100%' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>可编辑信息</Text>

              <Form.Item label="文档类别" name="category">
                <Select placeholder="选择文档类别">
                  <Select.Option value="检验报告">检验报告</Select.Option>
                  <Select.Option value="影像检查">影像检查</Select.Option>
                  <Select.Option value="病理检查">病理检查</Select.Option>
                  <Select.Option value="用药记录">用药记录</Select.Option>
                  <Select.Option value="患者信息">患者信息</Select.Option>
                  <Select.Option value="其他文档">其他文档</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item label="患者姓名" name="patientName">
                <Input placeholder="请输入患者姓名" />
              </Form.Item>
              <Form.Item label="报告日期" name="reportDate">
                <Input placeholder="请输入报告日期 (如: 2024-01-15)" />
              </Form.Item>
              <Form.Item label="报告类型" name="reportType">
                <Input placeholder="请输入报告类型 (如: 血常规)" />
              </Form.Item>
            </div>
          </Col>
        </Row>

        {selectedFile.error && (
          <Alert
            message="文件错误"
            description={selectedFile.error}
            type="error"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}

        {selectedFile.previewUrl ? (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>文件预览</Text>
            <img
              src={selectedFile.previewUrl}
              alt="文件预览"
              style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8 }}
            />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 20, background: token.colorBgLayout, borderRadius: 8, marginTop: 16 }}>
            <FileTextOutlined style={{ fontSize: 32, color: token.colorTextSecondary }} />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                {selectedFile.type === 'application/pdf' ? 'PDF文件预览功能开发中' : '该文件类型暂不支持预览'}
              </Text>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'right', marginTop: 24 }}>
          <Space>
            <Button onClick={() => setVisible(false)}>取消</Button>
            <Button
              icon={<DownloadOutlined />}
              loading={downloading}
              onClick={() => handleDownloadFile(selectedFile)}
              disabled={!selectedFile?.documentId && !selectedFile?.id}
            >
              下载原文件
            </Button>
            <Button type="primary" htmlType="submit">
              保存修改
            </Button>
          </Space>
        </div>
      </Form>
    )}
  </Modal>
)
