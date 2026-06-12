import React from 'react'
import { Badge, Button, Empty, Space, Tabs, Tooltip, Tree, Typography } from 'antd'
import {
  FileTextOutlined,
  FormOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MinusSquareOutlined,
  PlusSquareOutlined,
} from '@ant-design/icons'
import DocumentDetailModal from '../../../pages/PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal'
import { appThemeToken } from '../../../styles/themeTokens'
import DocumentList from './DocumentList'

const { Text } = Typography

const HEADER_ICON_BUTTON_BASE_STYLE = {
  padding: 0,
  height: 24,
  minWidth: 24,
  fontSize: 14,
  borderRadius: 6,
  border: `1px solid ${appThemeToken.colorBorder}`,
}
const HEADER_ICON_BUTTON_SECONDARY_STYLE = {
  ...HEADER_ICON_BUTTON_BASE_STYLE,
  color: appThemeToken.colorTextSecondary,
}
const HEADER_ICON_BUTTON_MUTED_STYLE = {
  ...HEADER_ICON_BUTTON_BASE_STYLE,
  color: appThemeToken.colorTextTertiary,
}

const tabsLayoutStyle = `
  .category-tree-tabs .ant-tabs-content-holder { flex: 1; overflow: hidden; }
  .category-tree-tabs .ant-tabs-content { height: 100%; }
  .category-tree-tabs .ant-tabs-tabpane { height: 100%; overflow: hidden; }
`

const treeNodeStyles = `
  .category-tree-nodes .ant-tree-treenode { width: 100%; overflow: hidden; padding: 0 4px 0 0 !important; }
  .category-tree-nodes .ant-tree-switcher { width: 0 !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; flex: none !important; }
  .category-tree-nodes .ant-tree-node-content-wrapper { overflow: hidden; flex: 1; min-width: 0; padding: 0 4px !important; }
  .category-tree-nodes .ant-tree-title { overflow: hidden; display: block; }
  .category-tree-nodes .ant-tree-indent { display: inline-flex !important; align-self: stretch; }
  .category-tree-nodes .ant-tree-indent-unit { width: 16px !important; min-width: 16px !important; display: inline-block !important; }
  .category-tree-nodes .ant-tree-list-holder-inner { padding-left: 8px; }
`

const shellStyle = (style) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: appThemeToken.colorBgContainer,
  borderRadius: 0,
  overflow: 'hidden',
  ...style,
})

export const CategoryTreeEmpty = ({ style }) => (
  <div style={{ padding: 16, color: appThemeToken.colorTextTertiary, textAlign: 'center', ...style }}>
    请加载Schema
  </div>
)

export const CategoryTreeContent = ({
  expandedKeys,
  handleExpand,
  handleSelect,
  selectedTreeKey,
  titleRender,
  treeData,
}) => (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }} className="category-tree-scrollable hover-scrollbar scroll-edge-hint">
      <Tree
        treeData={treeData}
        expandedKeys={expandedKeys}
        onExpand={handleExpand}
        selectedKeys={selectedTreeKey ? [selectedTreeKey] : []}
        onSelect={handleSelect}
        titleRender={titleRender}
        showIcon={false}
        switcherIcon={() => null}
        blockNode
        style={{ padding: '8px 0', background: 'transparent' }}
        className="category-tree-nodes"
      />
    </div>
  </div>
)

export const CategoryTreeHeaderActions = ({
  collapsible,
  handleToggleExpandAll,
  isAllExpanded,
  onToggleCollapse,
}) => (
  <Space size={4}>
    <Tooltip title={isAllExpanded ? '收起全部' : '展开全部'}>
      <Button
        type="text"
        size="small"
        aria-label={isAllExpanded ? '收起全部' : '展开全部'}
        icon={isAllExpanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
        onClick={handleToggleExpandAll}
        style={HEADER_ICON_BUTTON_MUTED_STYLE}
      />
    </Tooltip>
    {collapsible && (
      <Tooltip title="收起目录">
        <Button
          type="text"
          size="small"
          aria-label="收起目录"
          icon={<MenuFoldOutlined />}
          onClick={onToggleCollapse}
          style={HEADER_ICON_BUTTON_SECONDARY_STYLE}
        />
      </Tooltip>
    )}
  </Space>
)

export const CollapsedCategoryTree = ({ collapsedTitle, collapsible, onToggleCollapse, style }) => (
  <div style={{ height: '100%', minHeight: 42, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 10, paddingTop: 10, background: appThemeToken.colorBgContainer, borderRadius: 0, border: 'none', ...style }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: appThemeToken.colorTextSecondary, fontSize: 12, lineHeight: 1.25, letterSpacing: 1, writingMode: 'vertical-rl', textOrientation: 'upright', userSelect: 'none' }} aria-label="收起目录标题">
      {collapsedTitle}
    </div>
    {collapsible && (
      <Tooltip title="展开目录" placement="right">
        <Button type="text" aria-label="展开目录" icon={<MenuUnfoldOutlined />} onClick={onToggleCollapse} style={HEADER_ICON_BUTTON_SECONDARY_STYLE} />
      </Tooltip>
    )}
  </div>
)

export const ProjectCategoryTreeView = ({
  activeTab,
  detailDoc,
  detailVisible,
  handleCloseDocumentDetail,
  handleViewDocumentDetail,
  headerActions,
  onDocumentSelect,
  onPickExistingDocument,
  onUploadDocument,
  patientId,
  projectDocuments,
  selectedDocument,
  setActiveTab,
  style,
  treeProps,
}) => {
  const tabItems = [
    {
      key: 'forms',
      label: <span style={{ fontSize: 12 }}><FormOutlined style={{ marginRight: 4 }} />表单</span>,
      children: <CategoryTreeContent {...treeProps} />,
    },
    {
      key: 'documents',
      label: (
        <span style={{ fontSize: 12 }}>
          <FileTextOutlined style={{ marginRight: 4 }} />
          文档
          {projectDocuments.length > 0 && <Badge count={projectDocuments.length} size="small" style={{ marginLeft: 4 }} />}
        </span>
      ),
      children: (
        <div style={{ height: '100%', overflow: 'auto' }} className="category-tree-scrollable hover-scrollbar scroll-edge-hint">
          <DocumentList documents={projectDocuments} selectedDocumentId={selectedDocument?.id} onDocumentSelect={onDocumentSelect} onUploadDocument={onUploadDocument} onPickExistingDocument={onPickExistingDocument} onViewDocumentDetail={handleViewDocumentDetail} />
        </div>
      ),
    },
  ]

  return (
    <div style={shellStyle(style)}>
      <style>{tabsLayoutStyle}</style>
      <style>{treeNodeStyles}</style>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="small" tabBarExtraContent={activeTab === 'forms' ? headerActions : null} className="category-tree-tabs" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }} tabBarStyle={{ margin: 0, padding: '0 12px', minHeight: 41, background: appThemeToken.colorBgContainer, borderBottom: `1px solid ${appThemeToken.colorBorder}`, flexShrink: 0, display: 'flex', alignItems: 'center' }} />
      <DocumentDetailModal visible={detailVisible} document={detailDoc} patientId={patientId} onClose={handleCloseDocumentDetail} />
    </div>
  )
}

export const StandardCategoryTreeView = ({ headerActions, style, treeProps }) => (
  <div style={shellStyle(style)}>
    <style>{tabsLayoutStyle}</style>
    <style>{treeNodeStyles}</style>
    <div style={{ height: 41, padding: '0 12px', borderBottom: `1px solid ${appThemeToken.colorBorder}`, background: appThemeToken.colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <FileTextOutlined style={{ color: appThemeToken.colorPrimary, marginRight: 8 }} />
        <Text strong style={{ fontSize: 14, color: appThemeToken.colorText }}>目录</Text>
      </div>
      {headerActions}
    </div>
    <div className="category-tree-scrollable hover-scrollbar scroll-edge-hint" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
      <Tree
        treeData={treeProps.treeData}
        expandedKeys={treeProps.expandedKeys}
        onExpand={treeProps.handleExpand}
        selectedKeys={treeProps.selectedTreeKey ? [treeProps.selectedTreeKey] : []}
        onSelect={treeProps.handleSelect}
        titleRender={treeProps.titleRender}
        showIcon={false}
        switcherIcon={() => null}
        blockNode
        style={{ padding: '8px 0', background: 'transparent' }}
        className="category-tree-nodes"
      />
    </div>
  </div>
)
