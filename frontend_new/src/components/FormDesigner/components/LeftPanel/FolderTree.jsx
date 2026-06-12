/**
 * FolderTree - 文件夹树形组件
 * 左侧面板：显示 Schema 的文件夹（访视）层级结构
 */

import React, { useCallback, useMemo } from 'react'
import { Button, Empty } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

import { TreeView } from '@/components/ui/tree-view'
import { appThemeToken } from '../../../../styles/themeTokens'
import { buildFolderTreeNodes } from './folderTree/buildFolderTreeNodes'
import { findTreeNodeById, getFolderKey, getGroupKey } from './folderTree/folderTreeKeys'
import { useFolderTreeDragDrop } from './folderTree/useFolderTreeDragDrop'
import { useFolderTreeEditing } from './folderTree/useFolderTreeEditing'
import { useFolderTreeExpansion } from './folderTree/useFolderTreeExpansion'

const FolderTree = ({
  folders = [],
  selectedFolderId = null,
  selectedGroupId = null,
  onSelect = null,
  onAddFolder = null,
  onAddGroup = null,
  onEditFolder = null,
  onCopyFolder = null,
  onDeleteFolder = null,
  onEditGroupName = null,
  onDeleteGroup = null,
  onBatchAddGroups = null,
  onReorderFolders = null,
  onReorderGroups = null,
  onMoveGroup = null,
  expandAllSignal = 0,
  collapseAllSignal = 0,
  onExpandStateChange = null,
  readonly = false,
  version = 0,
}) => {
  const editing = useFolderTreeEditing({
    folders,
    onEditFolder,
    onEditGroupName,
    selectedFolderId,
    selectedGroupId,
  })
  const { expandedKeys, setExpandedKeys } = useFolderTreeExpansion({
    collapseAllSignal,
    expandAllSignal,
    folders,
    onExpandStateChange,
    selectedFolderId,
  })
  const { allowDrop, handleDrop } = useFolderTreeDragDrop({
    folders,
    onMoveGroup,
    onReorderFolders,
    onReorderGroups,
  })

  const treeNodes = useMemo(
    () => buildFolderTreeNodes({
      editing,
      expandedKeys,
      folders,
      onAddGroup,
      onBatchAddGroups,
      onCopyFolder,
      onDeleteFolder,
      onDeleteGroup,
      readonly,
    }),
    [
      editing,
      expandedKeys,
      folders,
      onAddGroup,
      onBatchAddGroups,
      onCopyFolder,
      onDeleteFolder,
      onDeleteGroup,
      readonly,
      version,
    ],
  )

  const selectedKeys = useMemo(() => {
    if (selectedGroupId) {
      return [getGroupKey(selectedFolderId, selectedGroupId)]
    }
    if (selectedFolderId) {
      return [getFolderKey(selectedFolderId)]
    }
    return []
  }, [selectedFolderId, selectedGroupId])

  const handleSelectionChange = useCallback(
    (ids) => {
      if (!onSelect || !ids.length) return
      const node = findTreeNodeById(treeNodes, ids[0])
      if (!node?.data) return
      const { type, id, folderId } = node.data
      if (type === 'folder') {
        onSelect({ folderId: id, groupId: null, fieldId: null })
      } else if (type === 'group') {
        onSelect({ folderId, groupId: id, fieldId: null })
      }
    },
    [onSelect, treeNodes],
  )

  return (
    <div
      className="folder-tree"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {!readonly && onAddFolder && (
        <div style={{ marginBottom: 12, flexShrink: 0, textAlign: 'center' }}>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={onAddFolder}
          >
            新建分类
          </Button>
        </div>
      )}

      {folders.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: appThemeToken.colorBgContainer,
            borderRadius: 4,
          }}
        >
          <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <div
          className="hover-scrollbar"
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
        >
          <TreeView
            data={treeNodes}
            className="design-tree"
            bordered={false}
            showLines={false}
            indent={16}
            animateExpand
            expandedIds={expandedKeys}
            onExpandedChange={setExpandedKeys}
            selectedIds={selectedKeys}
            onSelectionChange={handleSelectionChange}
            draggable={!readonly}
            onDrop={!readonly ? handleDrop : undefined}
            allowDrop={!readonly ? allowDrop : undefined}
          />
        </div>
      )}
    </div>
  )
}

export default FolderTree
