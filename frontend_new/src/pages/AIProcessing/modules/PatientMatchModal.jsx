import React from 'react'
import { Alert, Button, Card, Col, Descriptions, Divider, List, Modal, Progress, Row, Space, Tag, Typography } from 'antd'
import { CheckOutlined, EyeOutlined, FileTextOutlined, UserAddOutlined } from '@ant-design/icons'
import PatientCandidateItem from './PatientCandidateItem'
import PatientSearchBox from './PatientSearchBox'

const { Text } = Typography

const PatientMatchModal = ({
  open,
  selectedDocument,
  selectedMatchPatient,
  archivingLoading,
  patientSearchValue,
  patientSearchLoading,
  patientSearchResults,
  showSearchResults,
  getConfidenceDisplay,
  onCancel,
  onCreatePatient,
  onConfirmPatientMatch,
  onPreviewDocument,
  onSmartRecommend,
  onConfirmMatch,
  onPatientSearchChange,
  onSearchFocus,
  onSearchBlur,
  onSearchClear,
  onSelectSearchPatient,
}) => {
  const candidates = selectedDocument?.candidates || []
  const archivedPatient = candidates.find(candidate => candidate.id === selectedDocument?.archivedPatientId)
  const recommendedPatient = candidates.find(candidate => candidate.id === selectedDocument?.aiRecommendation)
  const confidence = getConfidenceDisplay(selectedDocument?.confidence)

  const showAiReason = () => {
    Modal.info({
      title: 'AI 匹配分析',
      width: 700,
      content: (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          {selectedDocument.aiReason}
        </div>
      ),
      okText: '关闭'
    })
  }

  return (
    <Modal
      title={
        <Space>
          <FileTextOutlined />
          <Text>患者匹配详情 - {selectedDocument?.name}</Text>
        </Space>
      }
      open={open}
      zIndex={2000}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button key="create" icon={<UserAddOutlined />} onClick={onCreatePatient}>
          {selectedDocument?.isFromAutoArchived ? '创建并更换新患者' : '创建新患者'}
        </Button>,
        <Button
          key="confirm"
          type="primary"
          icon={<CheckOutlined />}
          onClick={onConfirmPatientMatch}
          disabled={!selectedMatchPatient}
          loading={archivingLoading}
        >
          {selectedDocument?.isFromAutoArchived ? '确认更换' : '确认匹配'}
        </Button>
      ]}
      width={900}
    >
      {selectedDocument && (
        <Row gutter={24}>
          <Col span={10}>
            <Card size="small" title="文档信息">
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="文档名称">
                  {selectedDocument.name}
                </Descriptions.Item>
                <Descriptions.Item label="上传时间">
                  {selectedDocument.createdAt ? new Date(selectedDocument.createdAt).toLocaleString('zh-CN') : '--'}
                </Descriptions.Item>
                <Descriptions.Item label="AI置信度">
                  <Space>
                    <Progress
                      percent={typeof selectedDocument.confidence === 'number' ? selectedDocument.confidence : (selectedDocument.matchScore || 0)}
                      size="small"
                      strokeColor={confidence.color}
                      format={percent => `${percent}%`}
                    />
                    <Tag color={confidence.color}>
                      {confidence.label}
                    </Tag>
                  </Space>
                </Descriptions.Item>
              </Descriptions>

              <Divider style={{ margin: '12px 0' }} />

              <div>
                <Text strong style={{ fontSize: 13 }}>AI提取信息:</Text>
                <div style={{ marginTop: 8, background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="患者姓名">
                      {selectedDocument.documentMetadata?.name ?? '--'}
                    </Descriptions.Item>
                    <Descriptions.Item label="性别">
                      {selectedDocument.documentMetadata?.gender ?? '--'}
                    </Descriptions.Item>
                    <Descriptions.Item label="年龄">
                      {(selectedDocument.documentMetadata?.age && selectedDocument.documentMetadata?.age !== '--') ? `${selectedDocument.documentMetadata.age}岁` : (selectedDocument.documentMetadata?.age ?? '--')}
                    </Descriptions.Item>
                    <Descriptions.Item label="报告日期">
                      {selectedDocument.extractedInfo?.reportDate}
                    </Descriptions.Item>
                    <Descriptions.Item label="报告类型">
                      {selectedDocument.documentSubType || selectedDocument.documentType || selectedDocument.extractedInfo?.reportType || '--'}
                    </Descriptions.Item>
                  </Descriptions>
                </div>
              </div>

              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => onPreviewDocument(selectedDocument.id, selectedDocument.name)}
                >
                  查看原文档
                </Button>
              </div>
            </Card>
          </Col>

          <Col span={14}>
            <Card size="small" title="候选患者列表">
              {selectedDocument?.isFromAutoArchived && selectedDocument?.archivedPatientId && (
                <Alert
                  message={
                    <span>
                      ✅ 当前归档: <strong>{archivedPatient?.name || '未知患者'}</strong>
                      {archivedPatient?.patientCode && (
                        <Text type="secondary" style={{ marginLeft: 8 }}>
                          ({archivedPatient.patientCode})
                        </Text>
                      )}
                    </span>
                  }
                  type="success"
                  showIcon
                  style={{ marginBottom: 12 }}
                />
              )}

              {!selectedDocument?.isFromAutoArchived && selectedDocument.aiRecommendation && (
                <Alert
                  message={
                    <span>
                      🤖 AI推荐匹配: <strong>{recommendedPatient?.name || '未知患者'}</strong>
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        ({selectedDocument.matchScore || recommendedPatient?.similarity || 0}% 匹配度)
                      </Text>
                    </span>
                  }
                  description={selectedDocument.aiReason ? (
                    <div style={{ marginTop: 4 }}>
                      <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={showAiReason}>
                        <EyeOutlined /> 查看AI分析
                      </Button>
                    </div>
                  ) : null}
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  action={
                    <Button size="small" type="primary" onClick={() => onSmartRecommend(selectedDocument)}>
                      采用推荐
                    </Button>
                  }
                />
              )}

              <List
                dataSource={candidates}
                renderItem={candidate => (
                  <PatientCandidateItem
                    candidate={candidate}
                    selectedDocument={selectedDocument}
                    onConfirm={(patientId) => onConfirmMatch(selectedDocument.id, patientId)}
                  />
                )}
              />

              <Divider />
              <PatientSearchBox
                selectedPatient={selectedMatchPatient}
                value={patientSearchValue}
                loading={patientSearchLoading}
                results={patientSearchResults}
                showResults={showSearchResults}
                onSearchChange={onPatientSearchChange}
                onFocus={onSearchFocus}
                onBlur={onSearchBlur}
                onClear={onSearchClear}
                onSelectPatient={onSelectSearchPatient}
              />
            </Card>
          </Col>
        </Row>
      )}
    </Modal>
  )
}

export default PatientMatchModal
