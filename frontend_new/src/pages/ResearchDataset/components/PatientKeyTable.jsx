import React, { useMemo } from 'react'
import { Button, Checkbox, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { FileTextOutlined, LoadingOutlined, PlayCircleOutlined } from '@ant-design/icons'

const { Text } = Typography

/**
 * 简单脱敏姓名。
 *
 * @param {string} name 原始姓名。
 * @returns {string}
 */
const maskPatientName = (name) => {
  const text = String(name || '').trim()
  if (!text) return '-'
  if (text.length <= 1) return `${text}*`
  if (text.length === 2) return `${text[0]}*`
  return `${text[0]}${'*'.repeat(Math.max(text.length - 2, 1))}${text[text.length - 1]}`
}

/**
 * 患者主索引表。
 *
 * @param {{
 *  patients: Array<Record<string, any>>;
 *  selectedPatientIds: string[];
 *  isAllCurrentPageSelected: boolean;
 *  isSomeCurrentPageSelected: boolean;
 *  onToggleSelectAll: (checked: boolean) => void;
 *  onToggleSelectPatient: (patientId: string, checked: boolean) => void;
 *  onNavigatePatient: (patientId: string) => void;
 *  onExtractPatient: (patient: Record<string, any>) => void;
 *  patientExtractionById?: Record<string, { status?: string; progress?: number; label?: string; modeLabel?: string }>;
 *  pagination: Record<string, any>;
 *  onPageChange: (page: number, pageSize: number) => void;
 *  loading: boolean;
 *  scrollY: number;
 * }} props 组件参数。
 * @returns {JSX.Element}
 */
const PatientKeyTable = ({
  patients,
  selectedPatientIds,
  isAllCurrentPageSelected,
  isSomeCurrentPageSelected,
  onToggleSelectAll,
  onToggleSelectPatient,
  onNavigatePatient,
  onExtractPatient,
  patientExtractionById = {},
  pagination,
  onPageChange,
  loading,
  scrollY,
}) => {
  const columns = useMemo(() => {
    /**
     * 当前行的合并单元格配置（用于患者多行对齐）。
     *
     * @param {Record<string, any>} record 行记录。
     * @returns {{rowSpan:number}|undefined}
     */
    const buildMergedCell = (record) => {
      const total = Number(record?.__groupRowCount || 1)
      const index = Number(record?.__groupRowIndex || 0)
      if (total <= 1) return { rowSpan: 1 }
      return { rowSpan: index === 0 ? total : 0 }
    }

    /**
     * 是否为患者展开首行。
     *
     * @param {Record<string, any>} record 行记录。
     * @returns {boolean}
     */
    const isFirstExpandedRow = (record) => Number(record?.__groupRowIndex || 0) === 0

    return [
      {
        title: (
          <Checkbox
            checked={isAllCurrentPageSelected}
            indeterminate={isSomeCurrentPageSelected}
            onChange={(event) => onToggleSelectAll(event.target.checked)}
          />
        ),
        key: 'selection',
        dataIndex: 'selection',
        width: 40,
        onCell: (record) => buildMergedCell(record),
        render: (_unused, record) => (
          isFirstExpandedRow(record) ? (
          <Checkbox
            checked={selectedPatientIds.includes(record.patient_id)}
            onChange={(event) => onToggleSelectPatient(record.patient_id, event.target.checked)}
          />
          ) : null
        ),
      },
      {
        title: '患者信息',
        key: 'patientInfo',
        dataIndex: 'patientInfo',
        width: 100,
        onCell: (record) => buildMergedCell(record),
        render: (_unused, record) => (
          isFirstExpandedRow(record) ? (
          <div className="project-dataset-v2-patient-cell">
            <div className="project-dataset-v2-patient-main-line">
              <Button
                type="link"
                size="small"
                style={{ padding: 0, height: 'auto', fontWeight: 600 }}
                onClick={() => onNavigatePatient(record.patient_id)}
              >
                {maskPatientName(record.name)}
              </Button>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.patient_gender || '-'} / {record.patient_age ? `${record.patient_age}岁` : '--'}
              </Text>
            </div>
          </div>
          ) : null
        ),
      },
      {
        title: '完整度',
        key: 'overallCompleteness',
        dataIndex: 'overallCompleteness',
        width: 46,
        onCell: (record) => buildMergedCell(record),
        render: (value, record) => (
          isFirstExpandedRow(record) ? (
          <Tooltip title={`完整度 ${Math.round(Number(value) || 0)}%`}>
            <Progress
              percent={Math.round(Number(value) || 0)}
              size={[34, 5]}
              showInfo={false}
            />
          </Tooltip>
          ) : null
        ),
      },
      {
        title: '文档操作',
        key: 'actions',
        dataIndex: 'actions',
        width: 88,
        onCell: (record) => buildMergedCell(record),
        render: (_unused, record) => (
          isFirstExpandedRow(record) ? (
          <div className="project-dataset-v2-extract-cell">
            <Space size={0}>
              <Text type="secondary" style={{ fontSize: 12, minWidth: 10, textAlign: 'right' }}>
                {record.document_count}
              </Text>
              <Tooltip title="查看文档">
                <Button
                  type="text"
                  size="small"
                  icon={<FileTextOutlined />}
                  onClick={() => onNavigatePatient(record.patient_id)}
                />
              </Tooltip>
              {(() => {
                const rowStatus = patientExtractionById[record.patient_id]
                const isSubmitting = rowStatus?.status === 'submitting'
                const isRunning = rowStatus && ['submitting', 'running', 'queued', 'pending'].includes(rowStatus.status)
                const tooltipTitle = rowStatus?.label
                  ? `${rowStatus.modeLabel || '抽取'} · ${rowStatus.label}`
                  : '抽取患者数据'
                return (
                  <Tooltip title={tooltipTitle}>
                    <Button
                      type="text"
                      size="small"
                      disabled={isSubmitting || isRunning}
                      icon={isSubmitting || isRunning
                        ? <LoadingOutlined spin />
                        : <PlayCircleOutlined />}
                      onClick={(event) => {
                        event.stopPropagation()
                        onExtractPatient(record)
                      }}
                    />
                  </Tooltip>
                )
              })()}
            </Space>
            {patientExtractionById[record.patient_id] ? (
              <div style={{ marginTop: 4, minWidth: 72 }}>
                <Progress
                  percent={Math.max(8, Math.round(Number(patientExtractionById[record.patient_id].progress) || 0))}
                  size="small"
                  showInfo={false}
                  status={
                    patientExtractionById[record.patient_id].status === 'failed' ? 'exception'
                      : patientExtractionById[record.patient_id].status === 'completed' ? 'success'
                        : 'active'
                  }
                />
                <Tag
                  bordered={false}
                  color={
                    patientExtractionById[record.patient_id].status === 'submitting' ? 'processing'
                      : patientExtractionById[record.patient_id].status === 'failed' ? 'error'
                        : patientExtractionById[record.patient_id].status === 'completed' ? 'success'
                          : 'blue'
                  }
                  style={{ marginTop: 2, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                >
                  {patientExtractionById[record.patient_id].label || '抽取中'}
                </Tag>
              </div>
            ) : null}
          </div>
          ) : null
        ),
      },
      {
        title: '',
        key: '__rowAnchor',
        dataIndex: '__rowAnchor',
        width: 1,
        className: 'project-dataset-v2-row-anchor-col',
        render: () => <span className="project-dataset-v2-row-anchor" aria-hidden="true" />,
      },
    ]
  }, [
    isAllCurrentPageSelected,
    isSomeCurrentPageSelected,
    onExtractPatient,
    patientExtractionById,
    onNavigatePatient,
    onToggleSelectAll,
    onToggleSelectPatient,
    selectedPatientIds,
  ])

  return (
    <Table
      size="small"
      bordered
      rowKey={(row) => row.__rowKey || row.patient_id}
      columns={columns}
      dataSource={patients}
      loading={loading}
      tableLayout="fixed"
      pagination={{
        ...pagination,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`,
        onChange: onPageChange,
      }}
      scroll={{ y: scrollY }}
      style={{ width: '100%' }}
      rowClassName={() => 'project-dataset-v2-row'}
      className="project-dataset-table project-dataset-v2-table table-scrollbar-unified"
    />
  )
}

export default PatientKeyTable

