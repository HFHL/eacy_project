import React, { useMemo } from 'react'
import {
  Button,
  Checkbox,
  Dropdown,
  Modal,
  Popover,
  Progress,
  Tooltip,
} from 'antd'
import {
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import RepeatableGroupPreviewCell from '../modules/RepeatableGroupPreviewCell'
import { renderProjectFieldCell } from '../modules/fieldCellRenderer'

export const useProjectPenetrationColumns = ({
  confirmAndStartExtraction,
  getCompletenessColor,
  handleNavigatePatientDetail,
  handleViewFieldGroupDetail,
  isAllCurrentPageSelected,
  isSomeCurrentPageSelected,
  onViewFieldSource,
  renderSourcePopover,
  selectedPatients,
  setSelectedPatients,
  templateFieldGroups,
  templateFieldMapping,
  templateSchemaJson,
  token,
  toggleSelectAllCurrentPage,
}) => useMemo(() => {
  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'high': return token.colorSuccess
      case 'medium': return token.colorWarning
      case 'low': return token.colorError
      default: return token.colorBorder
    }
  }

  const renderFieldCell = (fieldData, fieldName, record) => renderProjectFieldCell({
    fieldData,
    fieldName,
    record,
    token,
    getConfidenceColor,
    onViewFieldSource,
  })

  const baseColumns = [
    {
      title: (
        <Checkbox
          checked={isAllCurrentPageSelected}
          indeterminate={isSomeCurrentPageSelected}
          onChange={(event) => toggleSelectAllCurrentPage(event.target.checked)}
        />
      ),
      dataIndex: 'selection',
      key: 'selection',
      width: 50,
      render: (_, record) => (
        <Checkbox
          checked={selectedPatients.includes(record.patient_id)}
          onChange={(event) => {
            if (event.target.checked) {
              setSelectedPatients([...selectedPatients, record.patient_id])
            } else {
              setSelectedPatients(selectedPatients.filter(id => id !== record.patient_id))
            }
          }}
        />
      ),
    },
    {
      title: '编号',
      dataIndex: 'subject_id',
      key: 'subject_id',
      width: 120,
      fixed: 'left',
      render: (subjectId, record) => {
        const statusMap = {
          done: { color: token.colorSuccess, dot: '●', tip: `已抽取（${record.extractedAt ? new Date(record.extractedAt).toLocaleDateString('zh-CN') : ''}）` },
          partial: { color: token.colorWarning, dot: '●', tip: '已抽取（含错误）' },
          empty: { color: token.colorBorder, dot: '○', tip: '已运行但无数据' },
          pending: { color: token.colorBorder, dot: '○', tip: '未抽取' },
        }
        const status = statusMap[record.extractionStatus] || statusMap.pending
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Tooltip title={status.tip}>
              <span style={{ color: status.color, fontSize: 12, lineHeight: 1, flexShrink: 0 }}>{status.dot}</span>
            </Tooltip>
            <Button
              type="link"
              size="small"
              onClick={() => handleNavigatePatientDetail(record.patient_id)}
              style={{ padding: 0, height: 'auto', fontWeight: 'bold' }}
            >
              {subjectId || '-'}
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'incremental',
                    label: '增量续抽',
                    icon: <PlayCircleOutlined />,
                    onClick: () => confirmAndStartExtraction([record.patient_id], 'incremental'),
                  },
                  {
                    key: 'full',
                    label: '全量重抽',
                    icon: <ReloadOutlined />,
                    danger: true,
                    onClick: () => {
                      Modal.confirm({
                        title: `确认对患者 ${record.subject_id || record.name} 全量重抽？`,
                        content: '如果该患者已有抽取记录，重新抽取会清空历史记录并重新抽取。',
                        okText: '确认重抽',
                        okButtonProps: { danger: true },
                        cancelText: '取消',
                        onOk: () => confirmAndStartExtraction([record.patient_id], 'full'),
                      })
                    },
                  },
                ],
              }}
            >
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                style={{ color: token.colorTextTertiary, padding: '0 2px', fontSize: 12 }}
                onClick={event => event.stopPropagation()}
              />
            </Dropdown>
          </div>
        )
      },
    },
  ]

  const dynamicGroupColumns = []

  if (templateFieldGroups.length > 0) {
    templateFieldGroups.forEach((group) => {
      const dbFields = group.db_fields || []
      const groupSources = group.sources || group['x-sources'] || { primary: [], secondary: [] }

      if (dbFields.length > 0 && !group.is_repeatable) {
        const children = dbFields.map((fieldId) => {
          const fieldLabel = templateFieldMapping[fieldId] || (typeof fieldId === 'string' ? fieldId.split('/').slice(-1)[0] : String(fieldId))
          return {
            title: (
              <Popover
                placement="bottom"
                content={renderSourcePopover({
                  groupLabel: group.group_name,
                  includeUnmatched: true,
                  sources: groupSources,
                  title: fieldLabel,
                })}
                overlayStyle={{ maxWidth: 460 }}
                trigger="hover"
              >
                <span style={{ cursor: 'pointer' }}>{fieldLabel}</span>
              </Popover>
            ),
            dataIndex: ['crfGroups', group.group_id, 'fields', fieldId],
            key: `${group.group_id}_${fieldId}`,
            width: 220,
            ellipsis: false,
            render: (fieldData, record) => renderFieldCell(fieldData, fieldId, record),
          }
        })

        dynamicGroupColumns.push({
          title: (
            <Popover
              placement="bottom"
              content={renderSourcePopover({
                includeUnmatched: true,
                sources: groupSources,
                title: group.group_name,
              })}
              overlayStyle={{ maxWidth: 460 }}
              trigger="hover"
            >
              <span style={{ cursor: 'pointer' }}>{group.group_name}</span>
            </Popover>
          ),
          key: `group_${group.group_id}`,
          children,
        })
      } else if (group.is_repeatable) {
        dynamicGroupColumns.push({
          title: (
            <Popover
              placement="bottom"
              content={renderSourcePopover({
                includeUnmatched: true,
                sources: groupSources,
                title: group.group_name,
              })}
              overlayStyle={{ maxWidth: 460 }}
              trigger="hover"
            >
              <span style={{ cursor: 'pointer' }}>{group.group_name}</span>
            </Popover>
          ),
          dataIndex: ['crfGroups', group.group_id],
          key: `group_${group.group_id}`,
          width: 320,
          render: (groupData, record) => (
            <RepeatableGroupPreviewCell
              group={group}
              groupData={groupData}
              onViewDetail={handleViewFieldGroupDetail}
              record={record}
              templateSchemaJson={templateSchemaJson}
              token={token}
            />
          ),
        })
      }
    })
  }

  const completenessColumn = {
    title: '完整度',
    dataIndex: 'overallCompleteness',
    key: 'completeness',
    width: 160,
    fixed: 'right',
    render: (completeness) => (
      <Progress
        percent={completeness}
        size="small"
        strokeColor={getCompletenessColor(completeness)}
        format={percent => `${percent}%`}
      />
    ),
  }

  return [...baseColumns, ...dynamicGroupColumns, completenessColumn]
}, [
  confirmAndStartExtraction,
  getCompletenessColor,
  handleNavigatePatientDetail,
  handleViewFieldGroupDetail,
  isAllCurrentPageSelected,
  isSomeCurrentPageSelected,
  onViewFieldSource,
  renderSourcePopover,
  selectedPatients,
  setSelectedPatients,
  templateFieldGroups,
  templateFieldMapping,
  templateSchemaJson,
  token,
  toggleSelectAllCurrentPage,
])
