import React from 'react'
import { HistoryOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons'

export const CHANGE_TYPE_MAP = {
  extract: { label: 'AI抽取', color: 'blue', icon: <RobotOutlined /> },
  manual_edit: { label: '手动编辑', color: 'green', icon: <UserOutlined /> },
  merge: { label: '合并', color: 'purple', icon: <HistoryOutlined /> },
  merge_append: { label: '累加合并', color: 'purple', icon: <HistoryOutlined /> },
  delete: { label: '删除', color: 'red', icon: <HistoryOutlined /> },
  conflict_resolve_adopt: { label: '采用新值', color: 'orange', icon: <HistoryOutlined /> },
  conflict_resolve_keep: { label: '保留原值', color: 'cyan', icon: <HistoryOutlined /> },
}
