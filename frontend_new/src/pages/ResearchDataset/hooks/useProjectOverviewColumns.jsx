import React, { useMemo } from 'react'
import {
  Button,
  Checkbox,
  Dropdown,
  Modal,
  Popover,
  Progress,
  Tag,
  Tooltip,
} from 'antd'
import {
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { maskName } from '../../../utils/sensitiveUtils'

export const useProjectOverviewColumns = ({
  confirmAndStartExtraction,
  getCompletenessColor,
  handleNavigatePatientDetail,
  isAllCurrentPageSelected,
  isSomeCurrentPageSelected,
  renderSourcePopover,
  selectedPatients,
  setSelectedPatients,
  templateFieldGroups,
  token,
  toggleSelectAllCurrentPage,
}) => useMemo(() => {
  const selectionCol = {
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
    fixed: 'left',
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
  }

  const subjectCol = {
    title: '编号 / 姓名',
    dataIndex: 'subject_id',
    key: 'subject_id',
    width: 160,
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
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Tooltip title={status.tip}>
              <span style={{ color: status.color, fontSize: 12, lineHeight: 1, flexShrink: 0 }}>{status.dot}</span>
            </Tooltip>
            <Button
              type="link"
              size="small"
              onClick={() => handleNavigatePatientDetail(record.patient_id)}
              style={{ padding: 0, height: 'auto', fontWeight: 600 }}
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
          {record.name ? (
            <div style={{ fontSize: 12, color: token.colorTextSecondary, paddingLeft: 14, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {maskName(record.name)}
            </div>
          ) : null}
        </div>
      )
    },
  }

  const statusCol = {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 110,
    render: (status) => {
      const map = {
        screening: { color: 'default', text: '筛选中' },
        enrolled: { color: 'processing', text: '已入组' },
        completed: { color: 'success', text: '已完成' },
        withdrawn: { color: 'error', text: '退出' },
      }
      const config = map[status] || { color: 'default', text: status || '-' }
      return <Tag color={config.color}>{config.text}</Tag>
    },
  }

  const overallCol = {
    title: '总体完整度',
    dataIndex: 'overallCompleteness',
    key: 'overallCompleteness',
    width: 160,
    render: (completeness) => (
      <Progress
        percent={Number(completeness || 0)}
        size="small"
        strokeColor={getCompletenessColor(Number(completeness || 0))}
        format={percent => `${percent}%`}
      />
    ),
  }

  const groupCols = (templateFieldGroups || []).map((group) => {
    const groupId = group.group_id
    const groupName = group.group_name || groupId
    const sources = group.sources || group['x-sources'] || { primary: [], secondary: [] }
    return {
      title: (
        <Popover
          placement="bottom"
          overlayStyle={{ maxWidth: 460 }}
          content={renderSourcePopover({
            maxDocLinkWidth: 240,
            sources,
            title: groupName,
          })}
          trigger="hover"
        >
          <span style={{ cursor: 'pointer' }}>{groupName}</span>
        </Popover>
      ),
      dataIndex: ['crfGroups', groupId, 'completeness'],
      key: `group_${groupId}`,
      width: 120,
      render: (percent, record) => {
        const value = Number(percent || 0)
        const groupData = record?.crfGroups?.[groupId]
        const filled = groupData?.filled_count
        const total = groupData?.total_count
        return (
          <div style={{ textAlign: 'center' }}>
            <Tooltip
              title={
                <div>
                  <div>{groupName}</div>
                  <div>完成度：{value}%</div>
                  {typeof filled === 'number' && typeof total === 'number' ? (
                    <div>填写：{filled}/{total}</div>
                  ) : null}
                </div>
              }
            >
              <Progress
                type="circle"
                percent={value}
                size={42}
                strokeColor={getCompletenessColor(value)}
                format={displayValue => <span style={{ fontSize: 12 }}>{displayValue}%</span>}
              />
            </Tooltip>
          </div>
        )
      },
    }
  })

  return [selectionCol, subjectCol, statusCol, overallCol, ...groupCols]
}, [
  confirmAndStartExtraction,
  getCompletenessColor,
  handleNavigatePatientDetail,
  isAllCurrentPageSelected,
  isSomeCurrentPageSelected,
  renderSourcePopover,
  selectedPatients,
  setSelectedPatients,
  templateFieldGroups,
  token,
  toggleSelectAllCurrentPage,
])
