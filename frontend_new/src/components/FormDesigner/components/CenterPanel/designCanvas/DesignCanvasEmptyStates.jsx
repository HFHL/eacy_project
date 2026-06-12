import React from 'react'
import { Button, Empty, Space } from 'antd'
import { AppstoreAddOutlined, PlusOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../../../styles/themeTokens'

const centeredCanvasStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  background: appThemeToken.colorFillTertiary,
}

export const NoFolderState = ({
  folders,
  onAddFolder,
  onLoadExample,
  readonly,
}) => {
  const hasNoData = folders.length === 0

  return (
    <div className="design-canvas hover-scrollbar" style={centeredCanvasStyle}>
      <Empty
        description={
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 16, color: appThemeToken.colorTextSecondary }}>
              {hasNoData ? '暂无数据，开始创建您的CRF模版' : '请从左侧选择一个访视'}
            </p>
            <Space>
              {!readonly && hasNoData && onLoadExample && (
                <Button type="primary" icon={<PlusOutlined />} onClick={onLoadExample}>
                  加载示例数据
                </Button>
              )}
              {!readonly && onAddFolder && (
                <Button icon={<PlusOutlined />} onClick={onAddFolder}>
                  创建访视
                </Button>
              )}
            </Space>
          </div>
        }
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    </div>
  )
}

export const NoGroupSelectedState = ({
  currentFolder,
  groups,
  handleDragOver,
  handleDrop,
  onAddGroup,
  readonly,
  selectedFolderId,
}) => (
  <div
    className="design-canvas hover-scrollbar"
    onDragOver={handleDragOver}
    onDrop={handleDrop}
    style={centeredCanvasStyle}
  >
    {groups.length === 0 ? (
      <Empty
        description={
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 16, color: appThemeToken.colorTextSecondary }}>该访视下暂无表单</p>
            {!readonly && onAddGroup && (
              <Button type="primary" icon={<AppstoreAddOutlined />} onClick={() => onAddGroup(selectedFolderId)}>
                添加表单
              </Button>
            )}
          </div>
        }
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    ) : (
      <Empty
        description={
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 8, color: appThemeToken.colorTextSecondary }}>请从左侧目录树选择一个表单</p>
            <p style={{ color: appThemeToken.colorTextTertiary, fontSize: 12 }}>
              {currentFolder.name} · {groups.length} 个表单
            </p>
          </div>
        }
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )}
  </div>
)
