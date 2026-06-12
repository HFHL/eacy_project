import React from 'react'
import { Button, Dropdown, Tag } from 'antd'
import { DeleteOutlined, EditOutlined, MoreOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../../../styles/themeTokens'
import { getGroupKey } from './folderTreeKeys'
import { TreeTitleInput } from './TreeTitleInput'

export const GroupTitle = ({
  editing,
  folder,
  group,
  onDeleteGroup,
  readonly,
}) => {
  const key = getGroupKey(folder.id, group.id)
  const isHovered = editing.hoveredGroupKey === key
  const isEditing = editing.editingGroupKey === key
  const isDropdownOpen = editing.activeDropdownGroupKey === key

  if (isEditing) {
    return (
      <TreeTitleInput
        inputRef={editing.inputRef}
        isComposingRef={editing.isComposingRef}
        onCancel={editing.cancelEditing}
        onFinish={() => editing.finishEditingGroup(folder.id, group.id)}
        setValue={editing.setEditingName}
        value={editing.editingName}
        width={120}
      />
    )
  }

  const menuItems = [
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: '修改名称',
      onClick: () => editing.startEditingGroup(folder.id, group.id, group.name),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => onDeleteGroup?.(folder.id, group.id),
    },
  ]

  return (
    <div
      className="group-title-wrapper"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        minWidth: 0,
      }}
      onMouseEnter={() => editing.setHoveredGroupKey(key)}
      onMouseLeave={() => editing.setHoveredGroupKey(null)}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {group.name}
        </span>
        {group.fields?.length > 0 && (
          <Tag style={{ marginLeft: 4, flexShrink: 0 }} color="blue">
            {group.fields.length}
          </Tag>
        )}
      </span>
      {!readonly && (isHovered || isDropdownOpen) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            marginLeft: 8,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <Dropdown
            menu={{ items: menuItems }}
            trigger={['click']}
            placement="bottomRight"
            onOpenChange={(open) => editing.setActiveDropdownGroupKey(open ? key : null)}
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
        </div>
      )}
    </div>
  )
}
