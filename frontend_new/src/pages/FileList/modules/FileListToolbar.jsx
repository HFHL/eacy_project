import React from 'react'
import { Button, Input, Segmented, Space, Typography } from 'antd'
import {
  CloseOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UploadOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

export const FileListToolbar = ({
  batchConfirmArchiveLoading,
  batchDeleteLoading,
  batchReidentifyLoading,
  columnFilters,
  handleBatchConfirmRecommendedArchive,
  handleBatchCreatePatientFromSelection,
  handleBatchDelete,
  handleBatchParseArchive,
  handleViewModeChange,
  message,
  refreshAll,
  selectedRowKeys,
  setBatchManualArchiveVisible,
  setBatchPatientSearchLoading,
  setBatchPatientSearchResults,
  setBatchPatientSearchValue,
  setColumnFilters,
  setPagination,
  setSelectedBatchPatient,
  setSelectedRowKeys,
  setUploadModalVisible,
  token,
  treeLoading,
  viewMode,
}) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    position: 'relative',
  }}>
    <Space size={12}>
      <Segmented
        size="middle"
        value={viewMode}
        onChange={handleViewModeChange}
        options={[
          { label: '患者视图', value: 'patient' },
          { label: '表格视图', value: 'table' },
        ]}
      />
    </Space>
    <Space size={12}>
      <Input
        placeholder="搜索文件名、患者、标题、类型、日期..."
        prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
        allowClear
        value={columnFilters.fileName}
        onChange={(e) => setColumnFilters((prev) => ({ ...prev, fileName: e.target.value }))}
        onPressEnter={() => {
          setPagination((prev) => ({ ...prev, current: 1 }))
        }}
        style={{ width: 240 }}
      />
      <Button icon={<ReloadOutlined />} onClick={() => refreshAll({ forceTree: true })} loading={treeLoading}>
        刷新
      </Button>
      <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadModalVisible(true)}>
        上传
      </Button>
    </Space>

    {selectedRowKeys.length > 0 && (
      <div style={{
        position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', zIndex: 10,
        background: appThemeToken.colorBgContainer, padding: '6px 16px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        border: `1px solid ${token.colorBorder}`,
      }}>
        <Space size={8}>
          <Text strong style={{ whiteSpace: 'nowrap' }}>已选中: {selectedRowKeys.length}</Text>
          <div style={{ width: 1, height: 20, background: token.colorBorder }} />
          <Button
            icon={<ReloadOutlined />}
            loading={batchReidentifyLoading}
            onClick={handleBatchParseArchive}
          >
            重新识别
          </Button>
          <Button
            type="primary"
            icon={<FolderOpenOutlined />}
            onClick={handleBatchConfirmRecommendedArchive}
            loading={batchConfirmArchiveLoading}
          >
            确认推荐
          </Button>
          <Button
            icon={<UserAddOutlined />}
            onClick={handleBatchCreatePatientFromSelection}
          >
            新建患者
          </Button>
          <Button
            icon={<TeamOutlined />}
            onClick={() => {
              if (!selectedRowKeys.length) return message.warning('请先选择文档')
              setSelectedBatchPatient(null)
              setBatchPatientSearchValue('')
              setBatchPatientSearchResults([])
              setBatchPatientSearchLoading(true)
              setBatchManualArchiveVisible(true)
            }}
          >
            手动选择
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete} loading={batchDeleteLoading}>
            删除
          </Button>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setSelectedRowKeys([])}
            style={{ color: token.colorTextSecondary }}
          />
        </Space>
      </div>
    )}
  </div>
)
