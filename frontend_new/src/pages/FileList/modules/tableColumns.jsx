import React from 'react'
import { Button, Dropdown, Space, Tooltip, Typography } from 'antd'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  DownloadOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
  MoreOutlined,
  ReloadOutlined,
  RobotOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'
import { FILE_LIST_COLUMN_DEFAULT_WIDTHS } from './constants'
import {
  formatDocumentMetadataTooltip,
  formatFileSize,
  formatPatientSummary,
  formatTime,
} from './formatters'
import { META_CHIP_TEXT_MAX_WIDTH, StatusProgressBar, getMetaChipStyle, getStatusInfoConfig, getStatusInfoTwoLineClampStyle } from './statusUi'

const { Text } = Typography

export const buildFileListColumns = ({
  columnFilters,
  columnWidths,
  FilterIcon,
  handleAiMatchPatient,
  handleArchivePatient,
  handleConfirmRecommendedArchive,
  handleCreatePatientFromDoc,
  handleDeleteDocument,
  handleDownload,
  handleParseDocument,
  handleUnbindDocument,
  matchingDocIds,
  pollingParseIds,
  renderGroupRow,
  renderResizableColumnTitle,
  SortIcon,
  startingParseIds,
  viewMode,
}) => {
    const COL_COUNT = viewMode === 'table' ? 8 : 6

    return [
      {
        title: renderResizableColumnTitle((
          <Space size={4}>
            <span>文件名</span>
            <SortIcon field="file_name" />
            <FilterIcon filterKey="fileName" hasFilter={!!columnFilters.fileName} />
          </Space>
        ), 'file_name'),
        dataIndex: 'file_name',
        key: 'file_name',
        width: columnWidths.file_name || FILE_LIST_COLUMN_DEFAULT_WIDTHS.file_name,
        ellipsis: true,
        onCell: (record) => {
          if (record._isGroup) return { colSpan: COL_COUNT }
          return {}
        },
        render: (name, record) => {
          if (record._isGroup) return renderGroupRow(record)
          const icon = record.file_type === 'pdf'
            ? <FilePdfOutlined style={{ color: appThemeToken.colorError, fontSize: 16 }} />
            : <FileImageOutlined style={{ color: appThemeToken.colorPrimary, fontSize: 16 }} />
          return (
            <Space size={8} style={{ paddingLeft: record._indent ? 24 : 0 }}>
              {icon}
              <div style={{ overflow: 'hidden' }}>
                <Tooltip title={name}>
                  <Text strong ellipsis style={{ display: 'block', fontSize: 14 }}>{name}</Text>
                </Tooltip>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {formatFileSize(record.file_size)}
                </Text>
              </div>
            </Space>
          )
        },
      },
      ...(viewMode === 'table'
        ? [
            {
              title: renderResizableColumnTitle('文档摘要', 'document_metadata_summary'),
              key: 'document_metadata_summary',
              width: columnWidths.document_metadata_summary || FILE_LIST_COLUMN_DEFAULT_WIDTHS.document_metadata_summary,
              onCell: (record) => (record._isGroup ? { colSpan: 0 } : {}),
              render: (_, record) => {
                if (record._isGroup) return null
                const summaryText = formatPatientSummary(record.document_metadata_summary)
                const tooltipText = formatDocumentMetadataTooltip(record)
                return (
                  <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{tooltipText}</span>}>
                    <Text ellipsis style={{ display: 'block', fontSize: 12 }}>
                      {summaryText}
                    </Text>
                  </Tooltip>
                )
              },
            },
            {
              title: renderResizableColumnTitle('绑定摘要', 'bound_patient_summary'),
              key: 'bound_patient_summary',
              width: columnWidths.bound_patient_summary || FILE_LIST_COLUMN_DEFAULT_WIDTHS.bound_patient_summary,
              onCell: (record) => (record._isGroup ? { colSpan: 0 } : {}),
              render: (_, record) => {
                if (record._isGroup) return null
                const boundSummary = formatPatientSummary(record.bound_patient_summary || record.patient_info)
                return (
                  <Tooltip title={boundSummary}>
                    <Text ellipsis style={{ display: 'block', fontSize: 12 }}>
                      {boundSummary}
                    </Text>
                  </Tooltip>
                )
              },
            },
          ]
        : []),
      {
        title: renderResizableColumnTitle((
          <Space size={4}>
            <span>文件类型</span>
            <FilterIcon filterKey="fileType" hasFilter={columnFilters.fileType.length > 0} />
          </Space>
        ), 'document_type'),
        dataIndex: 'document_sub_type',
        key: 'document_type',
        width: columnWidths.document_type || FILE_LIST_COLUMN_DEFAULT_WIDTHS.document_type,
        onCell: (record) => record._isGroup ? { colSpan: 0 } : {},
        render: (subType, record) => {
          if (record._isGroup) return null
          const typeText = subType || record.document_type || '未分类'
          return (
            <Tooltip title={typeText}>
              <span
                style={{
                  ...getMetaChipStyle('neutral', 'outline'),
                  maxWidth: META_CHIP_TEXT_MAX_WIDTH,
                }}
              >
                {typeText}
              </span>
            </Tooltip>
          )
        },
      },
      {
        title: renderResizableColumnTitle((
          <Space size={4}>
            <span>处理阶段</span>
            <FilterIcon filterKey="taskStatus" hasFilter={columnFilters.taskStatus.length > 0} />
          </Space>
        ), 'task_status'),
        dataIndex: 'task_status',
        key: 'task_status',
        width: columnWidths.task_status || FILE_LIST_COLUMN_DEFAULT_WIDTHS.task_status,
        onCell: (record) => record._isGroup ? { colSpan: 0 } : {},
        render: (status, record) => {
          if (record._isGroup) return null
          return <StatusProgressBar status={status} record={record} pollingParseIds={pollingParseIds} matchingDocIds={matchingDocIds} />
        },
      },
      {
        title: renderResizableColumnTitle((
          <Space size={4}>
            <span>状态信息</span>
            <FilterIcon filterKey="statusInfo" hasFilter={columnFilters.statusInfo.length > 0} />
          </Space>
        ), 'status_info'),
        key: 'status_info',
        width: columnWidths.status_info || FILE_LIST_COLUMN_DEFAULT_WIDTHS.status_info,
        onCell: (record) => record._isGroup ? { colSpan: 0 } : {},
        render: (_, record) => {
          if (record._isGroup) return null
          const ts = record.task_status
          const config = getStatusInfoConfig(record)
          if (config) return (
            <Tooltip title={config.text}>
              <span
                style={{
                  ...getMetaChipStyle(config.semantic, 'soft'),
                  maxWidth: META_CHIP_TEXT_MAX_WIDTH,
                  ...getStatusInfoTwoLineClampStyle(),
                }}
              >
                {config.text}
              </span>
            </Tooltip>
          )
          if (ts === 'uploading') return (
            <span
              style={{
                ...getMetaChipStyle('processing', 'soft'),
                maxWidth: META_CHIP_TEXT_MAX_WIDTH,
                ...getStatusInfoTwoLineClampStyle(),
              }}
            >
              上传中
            </span>
          )
          return <span style={{ color: appThemeToken.colorTextTertiary }}>--</span>
        },
      },
      {
        title: renderResizableColumnTitle((
          <Space size={4}>
            <span>上传时间</span>
            <SortIcon field="created_at" />
            <FilterIcon filterKey="dateRange" hasFilter={!!columnFilters.dateRange} />
          </Space>
        ), 'created_at'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: columnWidths.created_at || FILE_LIST_COLUMN_DEFAULT_WIDTHS.created_at,
        onCell: (record) => record._isGroup ? { colSpan: 0 } : {},
        render: (time, record) => {
          if (record._isGroup) return null
          return <Text style={{ fontSize: 12 }}>{formatTime(time)}</Text>
        },
      },
      {
        title: renderResizableColumnTitle('操作', 'actions'),
        key: 'actions',
        width: columnWidths.actions || FILE_LIST_COLUMN_DEFAULT_WIDTHS.actions,
        fixed: 'right',
        // 不再整列 stopPropagation；改由 getTableRowProps 内的 `.ant-btn` / `.ant-dropdown-trigger`
        // 短路逻辑判断"点击是否落在交互元素上"，这样操作列的空白处也能触发整行点击。
        onCell: (record) => record._isGroup ? { colSpan: 0 } : {},
        render: (_, record) => {
          if (record._isGroup) return null
          const isStarting = startingParseIds.has(record.id)
          const isPolling = pollingParseIds.has(record.id)
          const isMatching = matchingDocIds.has(record.id)
          const isParsingStatus = record.task_status === 'parsing' || isPolling
          const isMatchingStatus = isMatching || record.task_status === 'ai_matching'
          const canArchive = ['extracted', 'parsed', 'pending_confirm_new', 'pending_confirm_review',
            'pending_confirm_uncertain', 'auto_archived'].includes(record.task_status)
          const canAiMatch = ['parsed', 'extracted', 'pending_confirm_new', 'pending_confirm_review',
            'pending_confirm_uncertain', 'auto_archived'].includes(record.task_status) && !isMatchingStatus

          const isArchived = record.task_status === 'archived'

          const menuItems = [
            { key: 'reparse', icon: isParsingStatus ? <LoadingOutlined spin /> : <ReloadOutlined />, label: isParsingStatus ? '识别中...' : (isStarting ? '启动中...' : '重新识别'), disabled: isParsingStatus || isStarting, onClick: () => handleParseDocument(record.id) },
            { key: 'ai_match', icon: isMatchingStatus ? <LoadingOutlined spin /> : <RobotOutlined />, label: isMatchingStatus ? 'AI匹配中...' : 'AI匹配', disabled: !canAiMatch, onClick: () => handleAiMatchPatient(record.id) },
            { type: 'divider' },
            { key: 'archive', icon: <FolderOpenOutlined />, label: '归档', disabled: !canArchive && !isArchived, children: [
              { key: 'new_patient', icon: <UserAddOutlined />, label: '新建患者', disabled: !canArchive, onClick: () => handleCreatePatientFromDoc(record) },
              { key: 'confirm_rec', icon: <CheckCircleOutlined />, label: '确认推荐', disabled: !canArchive, onClick: () => handleConfirmRecommendedArchive(record) },
              { key: 'manual_select', icon: <TeamOutlined />, label: '手动选择', disabled: !canArchive, onClick: () => handleArchivePatient(record.id) },
            ]},
            { key: 'unbind', icon: <DisconnectOutlined />, label: '解绑', disabled: !isArchived, onClick: () => handleUnbindDocument(record.id, record.file_name) },
            { type: 'divider' },
            { key: 'download', icon: <DownloadOutlined />, label: '下载', onClick: () => handleDownload(record) },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              label: '删除',
              danger: true,
              onClick: ({ domEvent }) => {
                domEvent?.stopPropagation()
                handleDeleteDocument(record.id, record.file_name)
              },
            },
          ]
          return (
            <Dropdown
              menu={{
                items: menuItems,
                onClick: ({ domEvent }) => domEvent?.stopPropagation(),
              }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                onClick={(event) => event.stopPropagation()}
              />
            </Dropdown>
          )
        },
      },
    ]
}
