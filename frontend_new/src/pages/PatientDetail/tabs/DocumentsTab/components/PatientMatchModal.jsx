import React from 'react'
import { Alert, Avatar, Button, Card, Col, Descriptions, Divider, Input, List, Modal, Progress, Row, Space, Spin, Tag, Typography } from 'antd'
import { CheckOutlined, FileTextOutlined, TeamOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../../../styles/themeTokens'
import PatientSearchResults from './PatientSearchResults'

const { Text } = Typography

const ExtractedInfo = ({ info = {}, document }) => {
  if (!info || Object.keys(info).length === 0) return null

  return (
    <div>
      <Text strong style={{ fontSize: 14 }}>AI提取信息:</Text>
      <div style={{ marginTop: 8, background: appThemeToken.colorFillTertiary, padding: 12, borderRadius: 4 }}>
        <Descriptions size="small" column={1}>
          {info.name && <Descriptions.Item label="患者姓名">{info.name}</Descriptions.Item>}
          {info.gender && <Descriptions.Item label="性别">{info.gender}</Descriptions.Item>}
          {info.age && <Descriptions.Item label="年龄">{info.age}岁</Descriptions.Item>}
          {info.report_date && <Descriptions.Item label="报告日期">{info.report_date}</Descriptions.Item>}
          {(document.documentSubType || document.documentType) && (
            <Descriptions.Item label="报告类型">
              {document.documentSubType || document.documentType || '--'}
            </Descriptions.Item>
          )}
        </Descriptions>
      </div>
    </div>
  )
}

const CurrentArchiveAlert = ({ document, patientInfo }) => {
  if (!document?.isFromAutoArchived || !document?.archivedPatientId) return null

  const currentArchivedCandidate = document.candidates.find(candidate => candidate.id === document.archivedPatientId)
  const patientCode = currentArchivedCandidate?.patientCode || patientInfo?.patientCode
  const patientName = currentArchivedCandidate?.name || patientInfo?.name || '当前患者'

  return (
    <Alert
      message={
        <span>
          当前归档: <strong>{patientName}</strong>
          {patientCode ? (
            <Text type="secondary" style={{ marginLeft: 8 }}>
              ({patientCode})
            </Text>
          ) : null}
        </span>
      }
      type="success"
      showIcon
      style={{ marginBottom: 12 }}
    />
  )
}

const CandidateItem = ({
  archivingLoading,
  candidate,
  document,
  matchInfoLoading,
  mode,
  onConfirmCandidate,
}) => {
  const isCurrentArchived = candidate.id === document?.archivedPatientId

  return (
    <List.Item
      style={{
        background: isCurrentArchived ? appThemeToken.colorPrimaryBg : 'transparent',
        border: isCurrentArchived ? `1px solid ${appThemeToken.colorPrimaryBorder}` : 'none',
        borderRadius: 4,
        margin: '4px 0',
        padding: '8px 12px',
        position: 'relative',
      }}
    >
      <List.Item.Meta
        avatar={
          <div style={{ position: 'relative' }}>
            <Avatar icon={<TeamOutlined />} style={{ backgroundColor: appThemeToken.colorPrimary }} />
            {isCurrentArchived && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: 4,
                  whiteSpace: 'nowrap',
                  zIndex: 1,
                  backgroundColor: 'transparent',
                  color: appThemeToken.colorPrimary,
                  fontSize: '10px',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  fontWeight: 500,
                  border: `1px solid ${appThemeToken.colorPrimary}`,
                }}
              >
                当前归档
              </div>
            )}
          </div>
        }
        title={
          <Space wrap>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: '200px', flexShrink: 0 }}>
              <Text strong style={{ whiteSpace: 'nowrap' }}>{candidate.name || '未知患者'}</Text>
              {candidate.patientCode && <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>({candidate.patientCode})</Text>}
            </div>
            {candidate.gender && <Text type="secondary">{candidate.gender}</Text>}
            <Tag color={candidate.similarity > 90 ? 'green' : candidate.similarity > 70 ? 'orange' : 'default'} size="small">
              相似度 {candidate.similarity}%
            </Tag>
          </Space>
        }
        description={
          <div>
            {candidate.matchReasoning && (
              <div style={{ marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: appThemeToken.colorTextSecondary }}>{candidate.matchReasoning}</Text>
              </div>
            )}
            {candidate.matchFeatures?.length > 0 && (
              <Space wrap size={[4, 4]}>
                {candidate.matchFeatures.slice(0, 5).map((feature, idx) => (
                  <Tag key={idx} size="small" color="geekblue">{feature}</Tag>
                ))}
                {candidate.matchFeatures.length > 5 && <Tag size="small">+{candidate.matchFeatures.length - 5}</Tag>}
              </Space>
            )}
          </div>
        }
      />
      <Button
        type={isCurrentArchived ? 'primary' : 'default'}
        size="small"
        onClick={() => onConfirmCandidate(document.id, candidate.id)}
        disabled={isCurrentArchived || archivingLoading || matchInfoLoading}
        loading={archivingLoading}
      >
        {mode === 'archive' ? '选择' : '更换'}
      </Button>
    </List.Item>
  )
}

const PatientMatchModal = ({
  archivingLoading,
  document,
  getConfidenceStyle,
  matchInfoLoading,
  mode,
  onCancel,
  onConfirmCandidate,
  onConfirmSelectedPatient,
  onSearchPatient,
  onSelectSearchPatient,
  patientInfo,
  searchLoading,
  searchResults,
  searchValue,
  selectedPatient,
  showSearchResults,
}) => {
  const confidence = getConfidenceStyle(document?.confidence)

  return (
    <Modal
      title={
        <Space>
          <FileTextOutlined />
          <Text>{mode === 'archive' ? '选择患者归档' : '患者匹配详情'} - {document?.name}</Text>
        </Space>
      }
      open={Boolean(document)}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={archivingLoading || matchInfoLoading}>取消</Button>,
        <Button
          key="confirm"
          type="primary"
          icon={<CheckOutlined />}
          onClick={onConfirmSelectedPatient}
          disabled={!selectedPatient || archivingLoading || matchInfoLoading}
          loading={archivingLoading}
        >
          {mode === 'archive' ? '确认选择' : '确认更换'}
        </Button>,
      ]}
      width={900}
      zIndex={2000}
      maskClosable={!archivingLoading && !matchInfoLoading}
    >
      <Spin spinning={matchInfoLoading} tip="正在加载患者匹配信息..." size="large" style={{ minHeight: '400px' }}>
        {document ? (
          <Row gutter={24}>
            <Col span={10}>
              <Card size="small" title="文档信息">
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="文档名称">{document.name}</Descriptions.Item>
                  <Descriptions.Item label="上传时间">{document.createdAt ? new Date(document.createdAt).toLocaleString('zh-CN') : '--'}</Descriptions.Item>
                  <Descriptions.Item label="AI置信度">
                    <Space>
                      <Progress percent={typeof document.confidence === 'number' ? document.confidence : (document.matchScore || 0)} size="small" strokeColor={confidence.color} format={percent => `${percent}%`} />
                      <Tag color={confidence.color}>{confidence.label}</Tag>
                    </Space>
                  </Descriptions.Item>
                </Descriptions>
                <Divider style={{ margin: '12px 0' }} />
                <ExtractedInfo info={document.extractedInfo} document={document} />
              </Card>
            </Col>
            <Col span={14}>
              <Card size="small" title="候选患者列表">
                <CurrentArchiveAlert document={document} patientInfo={patientInfo} />
                <List
                  dataSource={document.candidates || []}
                  renderItem={candidate => (
                    <CandidateItem
                      archivingLoading={archivingLoading}
                      candidate={candidate}
                      document={document}
                      matchInfoLoading={matchInfoLoading}
                      mode={mode}
                      onConfirmCandidate={onConfirmCandidate}
                    />
                  )}
                />
                <Divider />
                <div style={{ position: 'relative' }}>
                  <Input.Search
                    placeholder="搜索患者姓名或编号"
                    value={searchValue}
                    onChange={(event) => onSearchPatient(event.target.value)}
                    onSearch={onSearchPatient}
                    loading={searchLoading}
                    allowClear
                  />
                  <PatientSearchResults
                    loading={searchLoading}
                    onSelectPatient={onSelectSearchPatient}
                    results={searchResults}
                    searchValue={searchValue}
                    visible={showSearchResults}
                  />
                </div>
              </Card>
            </Col>
          </Row>
        ) : null}
      </Spin>
    </Modal>
  )
}

export default PatientMatchModal
