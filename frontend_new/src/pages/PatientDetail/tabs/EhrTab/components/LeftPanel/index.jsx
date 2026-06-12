/**
 * 左侧面板组件 - 字段组树形结构
 * 显示电子病历字段组的层级结构和选择状态
 * 支持项目模式，可显示文档管理Tab
 */
import React from 'react'
import {
  Card,
  List,
  Typography,
  Button,
  Tabs,
} from 'antd'
import {
  FileTextOutlined,
  PlusOutlined,
  MinusOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  ShrinkOutlined,
  ExpandOutlined,
} from '@ant-design/icons'
import { appThemeToken } from '@/styles/themeTokens'
import { ProjectDocumentsTab } from './ProjectDocumentsTab'

const { Text } = Typography

const LeftPanel = ({
  ehrFieldGroups,
  selectedEhrGroup,
  expandedGroups,
  getEhrStatusIcon,
  onGroupSelect,
  onGroupToggle,
  onExpandAll,
  onCollapseAll,
  // 项目模式相关props
  isProjectMode = false,
  projectDocuments = [],
  selectedDocument = null,
  onDocumentSelect = null,
  onUploadDocument = null
}) => {
  // 判断当前是否大部分字段组都已展开
  const isMostExpanded = () => {
    const expandableGroups = ehrFieldGroups.filter(group => group.children)
    if (expandableGroups.length === 0) return false
    const expandedCount = expandableGroups.filter(group => expandedGroups[group.key]).length
    return expandedCount > expandableGroups.length / 2
  }

  // 切换全部展开/收起
  const handleToggleAll = () => {
    if (isMostExpanded()) {
      onCollapseAll()
    } else {
      onExpandAll()
    }
  }

  const hasChildren = (node) => Array.isArray(node.children) && node.children.length > 0

  const renderNode = (node, depth = 0) => {
    const isExpandable = hasChildren(node)
    const isExpanded = !!expandedGroups[node.key]
    const isSelected = selectedEhrGroup === node.key
    const isLeaf = node.isLeaf === true || !isExpandable

    const paddingLeft = 12 + depth * 16

    return (
      <div key={node.key} style={{ width: '100%' }}>
        <div
          style={{
            padding: isLeaf ? '6px 10px' : '8px 12px',
            paddingLeft,
            cursor: 'pointer',
            background: isSelected ? appThemeToken.colorPrimaryBg : 'transparent',
            borderRadius: 4,
            border: isSelected ? `1px solid ${appThemeToken.colorPrimary}` : '1px solid transparent',
            marginBottom: 2,
            transition: 'all 0.2s ease'
          }}
          onClick={() => {
            // 非叶子节点：只控制展开/收起，不改变选中（避免选中“虚拟节点”导致中间面板无数据）
            if (!isLeaf && isExpandable) {
              onGroupToggle(node.key)
              return
            }
            onGroupSelect(node.key)
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* 展开收起图标 */}
              {isExpandable && (
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    onGroupToggle(node.key)
                  }}
                  style={{
                    width: 16,
                    height: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    borderRadius: 2,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {isExpanded ? (
                    <MinusOutlined style={{ fontSize: 12, color: appThemeToken.colorTextSecondary }} />
                  ) : (
                    <PlusOutlined style={{ fontSize: 12, color: appThemeToken.colorTextSecondary }} />
                  )}
                </div>
              )}

              {/* 图标 */}
              {isLeaf ? (
                <FileTextOutlined style={{ fontSize: 12, color: appThemeToken.colorTextTertiary }} />
              ) : isExpanded ? (
                <FolderOpenOutlined style={{ fontSize: 14, color: appThemeToken.colorPrimary }} />
              ) : (
                <FolderOutlined style={{ fontSize: 14, color: appThemeToken.colorTextSecondary }} />
              )}

              <Text strong={!isLeaf} style={{ fontSize: isLeaf ? 12 : 14 }}>
                {node.name}
              </Text>
              {getEhrStatusIcon(node.status)}
            </div>

            {typeof node.extractedCount !== 'undefined' && typeof node.fieldCount !== 'undefined' && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {node.extractedCount}/{node.fieldCount}
              </Text>
            )}
          </div>
        </div>

        {isExpandable && isExpanded && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // 渲染字段组Tab内容（支持任意层级）
  const renderFieldGroupsTab = () => (
    <List
      dataSource={ehrFieldGroups}
      renderItem={group => (
        <List.Item style={{ padding: '0', marginBottom: '4px' }}>
          {renderNode(group, 0)}
        </List.Item>
      )}
    />
  )

  // 构建Tab项
  const tabItems = [
    {
      key: 'fieldGroups',
      label: '表单',
      children: renderFieldGroupsTab()
    }
  ]

  // 项目模式下添加文档管理Tab
  if (isProjectMode) {
    tabItems.push({
      key: 'documents',
      label: `文档 (${projectDocuments.length})`,
      children: (
        <ProjectDocumentsTab
          onDocumentSelect={onDocumentSelect}
          onUploadDocument={onUploadDocument}
          projectDocuments={projectDocuments}
          selectedDocument={selectedDocument}
        />
      )
    })
  }

  return (
    <Card
      size="small"
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{isProjectMode ? '项目表单' : '病历夹'}</span>
          <Button
            type="text"
            size="small"
            icon={isMostExpanded() ? <ShrinkOutlined /> : <ExpandOutlined />}
            onClick={handleToggleAll}
            style={{
              padding: '2px 4px',
              height: 'auto',
              fontSize: 12,
              color: appThemeToken.colorTextSecondary
            }}
          />
        </div>
      }
      style={{
        border: `1px solid ${appThemeToken.colorBorderSecondary}`,
        borderRadius: '6px'
      }}
      styles={{ body: { padding: '12px' } }}
    >
      {isProjectMode ? (
        <Tabs
          size="small"
          items={tabItems}
          style={{ marginTop: -8 }}
        />
      ) : (
        renderFieldGroupsTab()
      )}
    </Card>
  )
}

export default LeftPanel
