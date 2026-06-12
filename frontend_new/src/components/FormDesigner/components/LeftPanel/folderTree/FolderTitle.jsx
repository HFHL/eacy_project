import React from 'react'
import { Button, Dropdown, message, Tooltip } from 'antd'
import {
  AppstoreAddOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
} from '@ant-design/icons'

import { appThemeToken } from '../../../../../styles/themeTokens'
import { TreeTitleInput } from './TreeTitleInput'

export const FolderTitle = ({
  editing,
  folder,
  onAddGroup,
  onBatchAddGroups,
  onCopyFolder,
  onDeleteFolder,
  readonly,
}) => {
  const isHovered = editing.hoveredFolderId === folder.id
  const isEditing = editing.editingFolderId === folder.id
  const isDropdownOpen = editing.activeDropdownFolderId === folder.id

  if (isEditing) {
    return (
      <TreeTitleInput
        inputRef={editing.folderInputRef}
        isComposingRef={editing.isComposingRef}
        onCancel={editing.cancelEditing}
        onFinish={() => editing.finishEditingFolder(folder.id)}
        setValue={editing.setEditingName}
        value={editing.editingName}
        width={140}
      />
    )
  }

  const menuItems = [
    {
      key: 'batchAdd',
      icon: <AppstoreAddOutlined />,
      label: '批量新建表单',
      onClick: () => {
        if (onBatchAddGroups) {
          onBatchAddGroups(folder.id)
        } else {
          message.info('批量新建表单功能开发中')
        }
      },
    },
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: '修改名称',
      onClick: () => editing.startEditingFolder(folder.id, folder.name),
    },
    {
      key: 'copy',
      icon: <CopyOutlined />,
      label: '复制',
      onClick: () => onCopyFolder?.(folder.id),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => onDeleteFolder?.(folder.id),
    },
  ]

  return (
    <div
      className="folder-title-wrapper"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        minWidth: 0,
        paddingRight: 4,
      }}
      onMouseEnter={() => editing.setHoveredFolderId(folder.id)}
      onMouseLeave={() => editing.setHoveredFolderId(null)}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {folder.name}
      </span>
      {!readonly && (isHovered || isDropdownOpen) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
            marginLeft: 8,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <Dropdown
            menu={{ items: menuItems }}
            trigger={['click']}
            placement="bottomRight"
            onOpenChange={(open) => editing.setActiveDropdownFolderId(open ? folder.id : null)}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              style={{
                padding: '0 4px',
                height: 20,
                minWidth: 20,
                color: appThemeToken.colorTextSecondary,
              }}
              onClick={(event) => event.stopPropagation()}
            />
          </Dropdown>
          <Tooltip title="新建表单">
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              style={{
                padding: '0 4px',
                height: 20,
                minWidth: 20,
                color: appThemeToken.colorPrimary,
              }}
              onClick={(event) => {
                event.stopPropagation()
                onAddGroup?.(folder.id)
              }}
            />
          </Tooltip>
        </div>
      )}
    </div>
  )
}
