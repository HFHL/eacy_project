import React from 'react'
import { Button, Space, Tooltip } from 'antd'
import {
  CloudSyncOutlined,
  SaveOutlined,
  UndoOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'

const HEADER_ICON_BUTTON_STYLE = {
  height: 24,
  minWidth: 24,
  padding: '0 8px',
  borderRadius: 6,
  border: `1px solid ${appThemeToken.colorBorder}`,
}

const FormToolbar = ({ toolbarProps, onUploadDocument, beforeUploadActions = null }) => {
  if (!toolbarProps && !onUploadDocument && !beforeUploadActions) return null
  const { onSave, onReset, saving, autoSaveEnabled, onToggleAutoSave, isDirty } = toolbarProps || {}

  return (
    <Space size={6} style={{ flexShrink: 0 }}>
      {beforeUploadActions}
      {onUploadDocument && (
        <Button size="small" icon={<UploadOutlined />} onClick={onUploadDocument} style={HEADER_ICON_BUTTON_STYLE}>上传文档</Button>
      )}
      {toolbarProps && (
        <>
          <Tooltip title={autoSaveEnabled ? '关闭自动保存' : '开启自动保存'}>
            <Button
              type={autoSaveEnabled ? 'primary' : 'default'}
              ghost={autoSaveEnabled}
              size="small"
              icon={<CloudSyncOutlined />}
              onClick={onToggleAutoSave}
              style={HEADER_ICON_BUTTON_STYLE}
            >
              {autoSaveEnabled ? '自动' : '手动'}
            </Button>
          </Tooltip>
          <Button size="small" icon={<UndoOutlined />} onClick={onReset} disabled={!isDirty} style={HEADER_ICON_BUTTON_STYLE}>重置</Button>
          <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => onSave('manual')} loading={saving} disabled={!isDirty} style={HEADER_ICON_BUTTON_STYLE}>保存</Button>
        </>
      )}
    </Space>
  )
}

export default FormToolbar
