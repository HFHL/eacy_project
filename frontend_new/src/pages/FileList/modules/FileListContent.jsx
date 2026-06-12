import React from 'react'
import { Table, Typography } from 'antd'
import { appThemeToken } from '../../../styles/themeTokens'
import {
  FILE_LIST_GROUP_PANEL_MAX_WIDTH,
  FILE_LIST_GROUP_PANEL_MIN_WIDTH,
  FILE_LIST_GROUP_PANEL_SPLITTER_WIDTH,
} from './constants'

const { Text } = Typography

export const FileListContent = ({
  columns,
  displayDataSource,
  fileListLoading,
  fileListTableScrollY,
  fileListTableVirtual,
  getTableRowProps,
  handleGroupPanelResizeMouseDown,
  isGroupSplitterDragging,
  isGroupSplitterHover,
  patientGroupList,
  patientGroupPanelWidth,
  renderPatientGroupCard,
  setIsGroupSplitterHover,
  tablePagination,
  tableRowSelection,
  tableScrollX,
  token,
  viewMode,
}) => (
  <>
    <div style={{ borderTop: `1px solid ${appThemeToken.colorBorder}`, marginTop: 10, marginInline: -14 }} />

    {viewMode === 'patient' ? (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          paddingTop: 10,
          display: 'flex',
          gap: 0,
        }}
      >
        <div
          style={{
            width: patientGroupPanelWidth,
            minWidth: FILE_LIST_GROUP_PANEL_MIN_WIDTH,
            maxWidth: FILE_LIST_GROUP_PANEL_MAX_WIDTH,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: 8,
            background: token.colorBgContainer,
            padding: 10,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {patientGroupList.length ? (
            patientGroupList.map((record) => renderPatientGroupCard(record))
          ) : (
            <Text type="secondary" style={{ padding: 8 }}>当前筛选条件下暂无可选分组</Text>
          )}
        </div>
        <div
          role="separator"
          aria-label="调整患者分组栏宽度"
          aria-orientation="vertical"
          onMouseDown={handleGroupPanelResizeMouseDown}
          onMouseEnter={() => setIsGroupSplitterHover(true)}
          onMouseLeave={() => setIsGroupSplitterHover(false)}
          style={{
            width: FILE_LIST_GROUP_PANEL_SPLITTER_WIDTH,
            cursor: 'col-resize',
            borderRadius: 999,
            background: isGroupSplitterDragging ? token.colorPrimaryBorder : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 2,
              height: 48,
              borderRadius: 999,
              background: isGroupSplitterDragging
                ? token.colorPrimary
                : (isGroupSplitterHover ? token.colorBorderSecondary : token.colorBorder),
              opacity: isGroupSplitterDragging || isGroupSplitterHover ? 1 : 0.45,
              transition: 'all 0.2s ease',
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Table
            columns={columns}
            dataSource={displayDataSource}
            rowKey="key"
            size="middle"
            loading={fileListLoading}
            pagination={tablePagination}
            rowSelection={tableRowSelection}
            onRow={getTableRowProps}
            scroll={{ x: tableScrollX, y: fileListTableScrollY }}
            virtual={fileListTableVirtual}
            listItemHeight={54}
            sticky
            className="table-scrollbar-unified"
            style={{ background: 'transparent' }}
          />
        </div>
      </div>
    ) : (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          paddingTop: 10,
        }}
      >
        <Table
          columns={columns}
          dataSource={displayDataSource}
          rowKey="key"
          size="middle"
          loading={fileListLoading}
          pagination={tablePagination}
          rowSelection={tableRowSelection}
          onRow={getTableRowProps}
          scroll={{ x: tableScrollX, y: fileListTableScrollY }}
          virtual={fileListTableVirtual}
          listItemHeight={54}
          sticky
          className="table-scrollbar-unified"
          style={{ background: 'transparent' }}
        />
      </div>
    )}
  </>
)
