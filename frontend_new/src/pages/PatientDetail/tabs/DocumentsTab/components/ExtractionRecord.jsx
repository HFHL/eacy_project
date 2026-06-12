import React from 'react'
import { Button, Collapse, Space, Tag, Typography } from 'antd'
import {
  CalendarOutlined,
  CaretRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CoffeeOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  HistoryOutlined,
  MedicineBoxOutlined,
  MergeCellsOutlined,
  PhoneOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import StructuredDataView from '../../../../../components/Common/StructuredDataView'
import { appThemeToken } from '../../../../../styles/themeTokens'
import {
  convertEhrDataToFields,
  formatExtractionTime,
  getExtractionRecordKey,
  groupExtractedFields,
} from './extractedFieldUtils'

const { Panel } = Collapse
const { Text } = Typography

const getGroupIcon = (iconName) => {
  const icons = {
    UserOutlined: <UserOutlined />,
    PhoneOutlined: <PhoneOutlined />,
    TeamOutlined: <TeamOutlined />,
    CoffeeOutlined: <CoffeeOutlined />,
    HistoryOutlined: <HistoryOutlined />,
    CalendarOutlined: <CalendarOutlined />,
    MedicineBoxOutlined: <MedicineBoxOutlined />,
    ExperimentOutlined: <ExperimentOutlined />,
  }
  return icons[iconName] || <FileTextOutlined />
}

const renderFieldValue = (field) => {
  if (field?.isArray) {
    return <Text>{field.displayText}</Text>
  }
  if (typeof field?.value === 'object' && field?.value !== null) {
    return <StructuredDataView data={field.value} />
  }
  return <Text>{String(field?.value ?? '—')}</Text>
}

const ExtractionRecord = ({
  index,
  merging,
  onConflictClick,
  onMergeToPatient,
  onViewArrayField,
  record,
}) => {
  const extractedFields = convertEhrDataToFields(record.extracted_ehr_data || {})
  const activeGroups = groupExtractedFields(extractedFields)
  const conflictCount = record.conflict_count || 0
  const isMerged = record.is_merged
  const recordKey = getExtractionRecordKey(record, index)
  const defaultActiveKeys = activeGroups.length > 0 ? [activeGroups[0][0]] : []

  return (
    <div key={recordKey} className="extraction-record">
      <div className="extraction-record-header">
        <div className="extraction-time">
          <ClockCircleOutlined style={{ marginRight: 6 }} />
          <Text strong>{formatExtractionTime(record.created_at)}</Text>
          <Text type="secondary" style={{ marginLeft: 8 }}>
            （共 {extractedFields.length} 个字段）
          </Text>
        </div>
        <div className="extraction-status">
          {record.target_mode === 'targeted_section' && record.target_form_key ? (
            <Tag color="purple" style={{ marginRight: 8 }}>
              靶向 · {record.target_form_key}
            </Tag>
          ) : record.job_type ? (
            <Tag style={{ marginRight: 8 }}>{record.job_type}</Tag>
          ) : null}
          {conflictCount > 0 && (
            <Tag
              color="error"
              style={{ marginRight: 8, cursor: 'pointer' }}
              onClick={(event) => {
                event.stopPropagation()
                onConflictClick(record.extraction_id)
              }}
            >
              {conflictCount} 个冲突
            </Tag>
          )}
          {isMerged ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>已合并</Tag>
          ) : (
            <Tag color="warning" icon={<ClockCircleOutlined />}>未合并</Tag>
          )}
          {isMerged && record.merged_at && (
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              合并于 {formatExtractionTime(record.merged_at)}
            </Text>
          )}
        </div>
      </div>

      <div className="extraction-record-content">
        {extractedFields.length === 0 ? (
          <div style={{ padding: '16px 0', textAlign: 'center' }}>
            <Text type="secondary">无可展示的字段</Text>
          </div>
        ) : (
          <div className="extraction-grouped-content">
            <Collapse
              defaultActiveKey={defaultActiveKeys}
              expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
              ghost
              className="extraction-collapse"
            >
              {activeGroups.map(([groupKey, group]) => (
                <Panel
                  header={(
                    <Space>
                      {getGroupIcon(group.config.icon)}
                      <Text strong>{group.config.label}</Text>
                      <Tag style={{ marginLeft: 8, borderRadius: 10 }}>{group.fields.length}</Tag>
                    </Space>
                  )}
                  key={groupKey}
                  className="extraction-group-panel"
                >
                  <div className="extraction-group-grid">
                    {group.fields.map(field => (
                      <div key={field.fieldId} className={`extraction-field-card ${field.isArray ? 'full-width' : ''}`}>
                        {field.isArray ? (
                          <div className="extraction-array-field">
                            <div className="array-field-header">
                              <Text strong className="field-label">{field.fieldName}</Text>
                              <Button type="link" size="small" onClick={() => onViewArrayField(field)}>
                                查看全部 ({field.arrayLength})
                              </Button>
                            </div>
                            {field.arraySummary.length > 0 ? (
                              <div className="array-summary-list">
                                {field.arraySummary.map((item, itemIndex) => (
                                  <div key={itemIndex} className="array-summary-item">
                                    <Text style={{ fontSize: 14 }}>{itemIndex + 1}. {item.title}</Text>
                                    {item.sub && <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>{item.sub}</Text>}
                                  </div>
                                ))}
                                {field.arrayLength > 3 && (
                                  <Text type="secondary" style={{ fontSize: 12, display: 'block', paddingLeft: 12, paddingTop: 4 }}>
                                    ... 等 {field.arrayLength} 条记录
                                  </Text>
                                )}
                              </div>
                            ) : (
                              <Text type="secondary" style={{ fontSize: 12, display: 'block', padding: 8 }}>暂无明细</Text>
                            )}
                          </div>
                        ) : (
                          <div className="extraction-primitive-field">
                            <Text type="secondary" className="field-label">{field.fieldName}</Text>
                            <div className="field-value">{renderFieldValue(field)}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Panel>
              ))}
            </Collapse>
          </div>
        )}
      </div>

      {record.extracted_ehr_data?._extraction_metadata && (
        <Collapse ghost style={{ marginTop: 12 }}>
          <Panel
            header={<Text type="secondary" style={{ fontSize: 12 }}>抽取元数据 (Extraction metadata)</Text>}
            key="extraction-metadata"
          >
            <div
              style={{
                background: appThemeToken.colorFillTertiary,
                borderRadius: 6,
                padding: 12,
                maxHeight: 360,
                overflow: 'auto',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.5,
                  fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(record.extracted_ehr_data._extraction_metadata, null, 2)}
              </pre>
            </div>
          </Panel>
        </Collapse>
      )}

      <div className="extraction-record-actions">
        {!isMerged && (
          <Button
            type="primary"
            size="small"
            icon={<MergeCellsOutlined />}
            loading={merging}
            onClick={() => onMergeToPatient(record.extraction_id, record.extracted_ehr_data)}
          >
            合并到患者
          </Button>
        )}
      </div>
    </div>
  )
}

export default ExtractionRecord
