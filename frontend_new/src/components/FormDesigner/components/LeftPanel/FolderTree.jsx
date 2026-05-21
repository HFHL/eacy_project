/**
 * FolderTree - 文件夹树形组件
 * 左侧面板：显示 Schema 的文件夹（访视）层级结构
 */

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Empty, Tag, Button, Dropdown, Tooltip, Input, message } from 'antd';
import {
  PlusOutlined,
  MoreOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  AppstoreAddOutlined,
} from '@ant-design/icons';
import { Folder, FolderOpen, FileText } from 'lucide-react';
import { TreeView } from '@/components/ui/tree-view';
import { appThemeToken } from '../../../../styles/themeTokens';

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
  const [hoveredFolderId, setHoveredFolderId] = useState(null);
  const [hoveredGroupKey, setHoveredGroupKey] = useState(null);
  const [editingGroupKey, setEditingGroupKey] = useState(null);
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [activeDropdownFolderId, setActiveDropdownFolderId] = useState(null);
  const [activeDropdownGroupKey, setActiveDropdownGroupKey] = useState(null);

  const inputRef = useRef(null);
  const folderInputRef = useRef(null);
  const isComposingRef = useRef(false);

  const getFolderKey = (folderId) => `folder-${folderId}`;
  const getAllFolderKeys = (folderList = folders) =>
    folderList.map((folder) => getFolderKey(folder.id));

  useEffect(() => {
    if (editingGroupKey && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingGroupKey]);

  useEffect(() => {
    if (editingFolderId && folderInputRef.current) {
      folderInputRef.current.focus();
      folderInputRef.current.select();
    }
  }, [editingFolderId]);

  useEffect(() => {
    folders.forEach((folder) => {
      if (folder.isNew && selectedFolderId === folder.id) {
        setEditingFolderId(folder.id);
        setEditingName(folder.name);
      }
    });
  }, [folders, selectedFolderId]);

  useEffect(() => {
    folders.forEach((folder) => {
      (folder.groups || []).forEach((group) => {
        if (group.isNew && selectedGroupId === group.id) {
          const key = `group-${folder.id}-${group.id}`;
          setEditingGroupKey(key);
          setEditingName(group.name);
        }
      });
    });
  }, [folders, selectedGroupId]);

  const handleAddGroupClick = (e, folderId) => {
    e.stopPropagation();
    onAddGroup?.(folderId);
  };

  const startEditingFolder = (folderId, currentName) => {
    setEditingFolderId(folderId);
    setEditingName(currentName);
  };

  const finishEditingFolder = (folderId) => {
    if (editingName?.trim()) {
      onEditFolder?.(folderId, editingName.trim());
    }
    setEditingFolderId(null);
    setEditingName('');
  };

  const startEditingGroup = (folderId, groupId, currentName) => {
    const key = `group-${folderId}-${groupId}`;
    setEditingGroupKey(key);
    setEditingName(currentName);
  };

  const finishEditingGroup = (folderId, groupId) => {
    if (editingName?.trim()) {
      onEditGroupName?.(folderId, groupId, editingName.trim());
    }
    setEditingGroupKey(null);
    setEditingName('');
  };

  const cancelEditing = () => {
    setEditingGroupKey(null);
    setEditingFolderId(null);
    setEditingName('');
  };

  const getFolderMenuItems = (folderId, folderName) => [
    {
      key: 'batchAdd',
      icon: <AppstoreAddOutlined />,
      label: '批量新建表单',
      onClick: () => {
        if (onBatchAddGroups) {
          onBatchAddGroups(folderId);
        } else {
          message.info('批量新建表单功能开发中');
        }
      },
    },
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: '修改名称',
      onClick: () => startEditingFolder(folderId, folderName),
    },
    {
      key: 'copy',
      icon: <CopyOutlined />,
      label: '复制',
      onClick: () => onCopyFolder?.(folderId),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => onDeleteFolder?.(folderId),
    },
  ];

  const getGroupMenuItems = (folderId, groupId, groupName) => [
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: '修改名称',
      onClick: () => startEditingGroup(folderId, groupId, groupName),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => onDeleteGroup?.(folderId, groupId),
    },
  ];

  const renderFolderTitle = (folder) => {
    const isHovered = hoveredFolderId === folder.id;
    const isEditing = editingFolderId === folder.id;
    const isDropdownOpen = activeDropdownFolderId === folder.id;

    if (isEditing) {
      return (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            ref={folderInputRef}
            size="small"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onPressEnter={() => {
              if (!isComposingRef.current) finishEditingFolder(folder.id);
            }}
            onBlur={() => finishEditingFolder(folder.id)}
            onKeyDown={(e) => {
              if (isComposingRef.current) return;
              if (e.key === 'Escape') cancelEditing();
            }}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
            style={{ width: 140 }}
          />
        </div>
      );
    }

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
        onMouseEnter={() => setHoveredFolderId(folder.id)}
        onMouseLeave={() => setHoveredFolderId(null)}
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
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown
              menu={{ items: getFolderMenuItems(folder.id, folder.name) }}
              trigger={['click']}
              placement="bottomRight"
              onOpenChange={(open) =>
                setActiveDropdownFolderId(open ? folder.id : null)
              }
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
                onClick={(e) => e.stopPropagation()}
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
                onClick={(e) => handleAddGroupClick(e, folder.id)}
              />
            </Tooltip>
          </div>
        )}
      </div>
    );
  };

  const renderGroupTitle = (folder, group) => {
    const key = `group-${folder.id}-${group.id}`;
    const isHovered = hoveredGroupKey === key;
    const isEditing = editingGroupKey === key;
    const isDropdownOpen = activeDropdownGroupKey === key;

    if (isEditing) {
      return (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            ref={inputRef}
            size="small"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onPressEnter={() => {
              if (!isComposingRef.current) finishEditingGroup(folder.id, group.id);
            }}
            onBlur={() => finishEditingGroup(folder.id, group.id)}
            onKeyDown={(e) => {
              if (isComposingRef.current) return;
              if (e.key === 'Escape') cancelEditing();
            }}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
            style={{ width: 120 }}
          />
        </div>
      );
    }

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
        onMouseEnter={() => setHoveredGroupKey(key)}
        onMouseLeave={() => setHoveredGroupKey(null)}
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
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown
              menu={{ items: getGroupMenuItems(folder.id, group.id, group.name) }}
              trigger={['click']}
              placement="bottomRight"
              onOpenChange={(open) =>
                setActiveDropdownGroupKey(open ? key : null)
              }
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
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          </div>
        )}
      </div>
    );
  };

  const [expandedKeys, setExpandedKeys] = useState(() => getAllFolderKeys());

  const treeNodes = useMemo(
    () =>
      folders.map((folder) => {
        const folderKey = getFolderKey(folder.id);
        const isExpanded = expandedKeys.includes(folderKey);
        return {
          id: folderKey,
          label: renderFolderTitle(folder),
          icon: isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />,
          data: { type: 'folder', id: folder.id },
          children: (folder.groups || []).map((group) => ({
            id: `group-${folder.id}-${group.id}`,
            label: renderGroupTitle(folder, group),
            icon: <FileText size={16} />,
            data: { type: 'group', folderId: folder.id, id: group.id },
          })),
        };
      }),
    [
      folders,
      expandedKeys,
      hoveredFolderId,
      hoveredGroupKey,
      editingGroupKey,
      editingFolderId,
      editingName,
      readonly,
      version,
      activeDropdownFolderId,
      activeDropdownGroupKey,
    ],
  );

  const selectedKeys = useMemo(() => {
    if (selectedGroupId) {
      return [`group-${selectedFolderId}-${selectedGroupId}`];
    }
    if (selectedFolderId) {
      return [getFolderKey(selectedFolderId)];
    }
    return [];
  }, [selectedFolderId, selectedGroupId]);

  useEffect(() => {
    if (selectedFolderId) {
      const folderKey = getFolderKey(selectedFolderId);
      setExpandedKeys((prev) =>
        prev.includes(folderKey) ? prev : [...prev, folderKey],
      );
    }
  }, [selectedFolderId]);

  useEffect(() => {
    const allFolderKeys = getAllFolderKeys(folders);
    setExpandedKeys((prev) => {
      const newKeys = allFolderKeys.filter((k) => !prev.includes(k));
      return newKeys.length > 0 ? [...prev, ...newKeys] : prev;
    });
  }, [folders.length]);

  useEffect(() => {
    if (expandAllSignal <= 0) return;
    setExpandedKeys(getAllFolderKeys(folders));
  }, [expandAllSignal, folders]);

  useEffect(() => {
    if (collapseAllSignal <= 0) return;
    setExpandedKeys([]);
  }, [collapseAllSignal]);

  useEffect(() => {
    if (!onExpandStateChange) return;
    const allFolderKeys = getAllFolderKeys(folders);
    const isAllExpanded =
      allFolderKeys.length > 0 &&
      allFolderKeys.every((key) => expandedKeys.includes(key));
    onExpandStateChange(isAllExpanded, allFolderKeys.length);
  }, [expandedKeys, folders, onExpandStateChange]);

  const findTreeNodeById = useCallback((nodes, nodeId) => {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      if (node.children?.length) {
        const found = findTreeNodeById(node.children, nodeId);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const handleSelectionChange = useCallback(
    (ids) => {
      if (!onSelect || !ids.length) return;
      const node = findTreeNodeById(treeNodes, ids[0]);
      if (!node?.data) return;
      const { type, id, folderId } = node.data;
      if (type === 'folder') {
        onSelect({ folderId: id, groupId: null, fieldId: null });
      } else if (type === 'group') {
        onSelect({ folderId, groupId: id, fieldId: null });
      }
    },
    [onSelect, treeNodes, findTreeNodeById],
  );

  const handleDrop = (info) => {
    const dragData = info.dragNode.data;
    const dropData = info.dropNode.data;
    const { dropPosition, dropToGap } = info;

    if (dragData.type === 'folder') {
      if (dropData.type === 'folder') {
        const dragIndex = folders.findIndex((f) => f.id === dragData.id);
        let dropIndex = folders.findIndex((f) => f.id === dropData.id);
        if (dragIndex === -1 || dropIndex === -1) return;
        if (!dropToGap) {
          dropIndex = 0;
        } else if (dropPosition > dropIndex) {
          dropIndex += 1;
        }
        const newOrder = [...folders];
        const [removed] = newOrder.splice(dragIndex, 1);
        newOrder.splice(
          dropIndex > dragIndex ? dropIndex - 1 : dropIndex,
          0,
          removed,
        );
        onReorderFolders?.(newOrder.map((f) => f.id));
      }
      return;
    }

    if (dragData.type === 'group') {
      const sourceFolderId = dragData.folderId;
      const groupId = dragData.id;

      if (dropData.type === 'folder') {
        const targetFolderId = dropData.id;
        if (sourceFolderId === targetFolderId) {
          const folder = folders.find((f) => f.id === sourceFolderId);
          if (!folder) return;
          const newOrder = folder.groups.filter((g) => g.id !== groupId);
          const group = folder.groups.find((g) => g.id === groupId);
          if (group) {
            newOrder.unshift(group);
            onReorderGroups?.(sourceFolderId, newOrder.map((g) => g.id));
          }
        } else {
          onMoveGroup?.(sourceFolderId, groupId, targetFolderId, 0);
        }
        return;
      }

      if (dropData.type === 'group') {
        const targetFolderId = dropData.folderId;
        const targetGroupId = dropData.id;

        if (sourceFolderId === targetFolderId) {
          const folder = folders.find((f) => f.id === sourceFolderId);
          if (!folder) return;
          const dragIndex = folder.groups.findIndex((g) => g.id === groupId);
          let dropIndex = folder.groups.findIndex((g) => g.id === targetGroupId);
          if (dragIndex === -1 || dropIndex === -1) return;
          if (dropPosition > dropIndex && dropToGap) {
            dropIndex += 1;
          }
          const newOrder = [...folder.groups];
          const [removed] = newOrder.splice(dragIndex, 1);
          newOrder.splice(
            dropIndex > dragIndex ? dropIndex - 1 : dropIndex,
            0,
            removed,
          );
          onReorderGroups?.(sourceFolderId, newOrder.map((g) => g.id));
        } else {
          const targetFolder = folders.find((f) => f.id === targetFolderId);
          if (!targetFolder) return;
          const dropIndex = targetFolder.groups.findIndex(
            (g) => g.id === targetGroupId,
          );
          const targetIndex =
            dropToGap && dropPosition > dropIndex ? dropIndex + 1 : dropIndex;
          onMoveGroup?.(sourceFolderId, groupId, targetFolderId, targetIndex);
        }
      }
    }
  };

  const allowDrop = ({ dragNode, dropNode }) => {
    const dragData = dragNode.data;
    const dropData = dropNode.data;
    if (dragData.type === 'folder') {
      return dropData.type === 'folder';
    }
    if (dragData.type === 'group') {
      return true;
    }
    return false;
  };

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
  );
};

export default FolderTree;
