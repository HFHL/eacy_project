import React from 'react'
import { FileText, Folder, FolderOpen } from 'lucide-react'

import { FolderTitle } from './FolderTitle'
import { getFolderKey, getGroupKey } from './folderTreeKeys'
import { GroupTitle } from './GroupTitle'

export const buildFolderTreeNodes = ({
  editing,
  expandedKeys,
  folders,
  onAddGroup,
  onBatchAddGroups,
  onCopyFolder,
  onDeleteFolder,
  onDeleteGroup,
  readonly,
}) => folders.map((folder) => {
  const folderKey = getFolderKey(folder.id)
  const isExpanded = expandedKeys.includes(folderKey)
  return {
    id: folderKey,
    label: (
      <FolderTitle
        editing={editing}
        folder={folder}
        onAddGroup={onAddGroup}
        onBatchAddGroups={onBatchAddGroups}
        onCopyFolder={onCopyFolder}
        onDeleteFolder={onDeleteFolder}
        readonly={readonly}
      />
    ),
    icon: isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />,
    data: { type: 'folder', id: folder.id },
    children: (folder.groups || []).map((group) => ({
      id: getGroupKey(folder.id, group.id),
      label: (
        <GroupTitle
          editing={editing}
          folder={folder}
          group={group}
          onDeleteGroup={onDeleteGroup}
          readonly={readonly}
        />
      ),
      icon: <FileText size={16} />,
      data: { type: 'group', folderId: folder.id, id: group.id },
    })),
  }
})
