import React from 'react'
import { Avatar, Button, Card, Col, Divider, Row, Space, Tabs, Tag, Tooltip, Typography } from 'antd'
import {
  DatabaseOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  HistoryOutlined,
  LoadingOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { PAGE_LAYOUT_HEIGHTS } from '@/constants/pageLayout'
import { maskName } from '@/utils/sensitiveUtils'
import TimelineTab from '../tabs/TimelineTab'
import DocumentsTab from '../tabs/DocumentsTab'
import AiSummaryTab from '../tabs/AiSummaryTab'
import SchemaEhrTab from '../tabs/SchemaEhrTab'

const { Text } = Typography

const PatientDetailPanel = ({
  activeTab,
  aiSummary,
  documents,
  documentsLoading,
  fetchPatientDocuments,
  getConfidenceTag,
  getDocumentIcon,
  handleDeleteDocument,
  handleDocumentClick,
  handleEditSummary,
  handleExportData,
  handleRegenerateSummary,
  handleReExtract,
  handleSaveSummary,
  handleViewSourceDocument,
  loading,
  navigate,
  onEditPatient,
  patientId,
  patientInfo,
  renderSummaryWithFootnotes,
  setActiveTab,
  setSummaryEditMode,
  setUploadVisible,
  summaryEditMode,
  summaryForm,
  summaryGenerating,
  token,
}) => (
  <Card
    size="small"
    style={{ marginBottom: 16 }}
    bodyStyle={{
      padding: 16,
      minHeight: PAGE_LAYOUT_HEIGHTS.patientDetail.cardMinHeight,
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <Row gutter={24} align="middle" style={{ flexShrink: 0 }}>
      <Col>
        <Avatar size={64} icon={<UserOutlined />} />
      </Col>
      <Col flex={1}>
        <Row gutter={[24, 12]}>
          <Col span={6}>
            <div>
              <Text type="secondary">姓名:</Text>
              <Text strong style={{ marginLeft: 8, fontSize: 16 }}>{patientInfo.name ? maskName(patientInfo.name) : '-'}</Text>
              {loading && (
                <LoadingOutlined spin style={{ marginLeft: 8, color: token.colorPrimary }} />
              )}
            </div>
          </Col>
          <Col span={6}>
            <div>
              <Text type="secondary">性别/年龄:</Text>
              <Text strong style={{ marginLeft: 8 }}>
                {patientInfo.gender || '-'} / {patientInfo.age ? `${patientInfo.age}岁` : '-'}
              </Text>
            </div>
          </Col>
          <Col span={6}>
            <div>
              <Text type="secondary">科室:</Text>
              <Text strong style={{ marginLeft: 8 }}>{patientInfo.department || '-'}</Text>
            </div>
          </Col>
          <Col span={6}>
            <div>
              <Text type="secondary">主治医生:</Text>
              <Text strong style={{ marginLeft: 8 }}>{patientInfo.doctor || '-'}</Text>
            </div>
          </Col>
          <Col span={12}>
            <div>
              <Text type="secondary">主要诊断:</Text>
              <div style={{ marginLeft: 8, marginTop: 4 }}>
                <Space wrap>
                  {(patientInfo.diagnosis || []).length > 0 ? (
                    patientInfo.diagnosis.map(d => (
                      <Tag key={d} color="blue">{d}</Tag>
                    ))
                  ) : (
                    <Text type="secondary">暂无</Text>
                  )}
                </Space>
              </div>
            </div>
          </Col>
          <Col span={12} style={{ minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <Text type="secondary">关联项目:</Text>
              <div style={{ marginLeft: 8, marginTop: 4 }}>
                <Space wrap size={[4, 4]}>
                  {(patientInfo.projects || []).length > 0 ? (
                    patientInfo.projects.map(project => {
                      const projectId = typeof project === 'object' ? project.id : project
                      const projectName = (typeof project === 'object' ? project.name : project) || ''
                      const maxLen = 10
                      const displayName = projectName.length > maxLen ? `${projectName.slice(0, maxLen)}…` : projectName
                      return (
                        <Tooltip key={projectId} title={projectName || undefined}>
                          <Button
                            type="link"
                            size="small"
                            onClick={() => navigate(`/research/projects/${projectId}`)}
                            style={{ padding: '2px 8px', height: 'auto', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {displayName}
                          </Button>
                        </Tooltip>
                      )
                    })
                  ) : (
                    <Text type="secondary">暂无关联项目</Text>
                  )}
                </Space>
              </div>
            </div>
          </Col>
        </Row>
      </Col>
      <Col>
        <Space direction="vertical">
          <Button type="primary" icon={<EditOutlined />} onClick={onEditPatient}>
            编辑信息
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportData}>
            导出数据
          </Button>
        </Space>
      </Col>
    </Row>

    <Divider style={{ margin: '12px -16px 12px' }} />

    <div style={{ flex: 1, minHeight: 0 }}>
      <Tabs
        destroyInactiveTabPane
        defaultActiveKey="ehr-schema"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'ehr-schema',
            label: (
              <Space>
                <DatabaseOutlined />
                电子病历_V2.0
              </Space>
            ),
            children: (
              <SchemaEhrTab
                key={`schema-ehr-${patientId || 'empty'}`}
                patientId={patientId}
                patientDocuments={documents}
                onSave={async (data, type) => console.log('Schema保存', type, data)}
                onDataChange={(data) => console.log('Schema数据变更', data)}
              />
            ),
          },
          {
            key: 'documents',
            label: (
              <Space>
                <FileTextOutlined />
                文档（{documents.length || patientInfo.documentCount || 0}）
              </Space>
            ),
            children: (
              <DocumentsTab
                key={`documents-${patientId || 'empty'}`}
                patientId={patientId}
                patientInfo={patientInfo}
                documents={documents}
                loading={documentsLoading}
                getDocumentIcon={getDocumentIcon}
                getConfidenceTag={getConfidenceTag}
                handleDocumentClick={handleDocumentClick}
                handleReExtract={handleReExtract}
                handleDeleteDocument={handleDeleteDocument}
                setUploadVisible={setUploadVisible}
                onRefresh={fetchPatientDocuments}
              />
            ),
          },
          {
            key: 'ai-summary',
            label: (
              <Space>
                <UserOutlined />
                AI病情综述
              </Space>
            ),
            children: (
              <AiSummaryTab
                aiSummary={aiSummary}
                summaryEditMode={summaryEditMode}
                setSummaryEditMode={setSummaryEditMode}
                summaryGenerating={summaryGenerating}
                handleEditSummary={handleEditSummary}
                handleSaveSummary={handleSaveSummary}
                handleRegenerateSummary={handleRegenerateSummary}
                handleViewSourceDocument={handleViewSourceDocument}
                renderSummaryWithFootnotes={renderSummaryWithFootnotes}
                summaryForm={summaryForm}
              />
            ),
          },
          {
            key: 'timeline',
            label: (
              <Space>
                <HistoryOutlined />
                时间线
              </Space>
            ),
            children: <TimelineTab />,
          },
        ]}
      />
    </div>
  </Card>
)

export default PatientDetailPanel
