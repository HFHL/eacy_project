/**
 * 分类目录树组件
 * 基于Schema结构生成左侧导航目录树
 * 只展示到层级1（文件夹 → 表单），不展示字段级别
 * 参考旧版设计：图标和文字在同一行
 *
 * 扩展功能：
 * - 项目模式：支持文档列表渲染
 * - 可重复表单：支持添加新实例
 */
import React, { useCallback, useState } from 'react'
import { useSchemaForm } from './SchemaFormContext'
import {
  CategoryTreeEmpty,
  CategoryTreeHeaderActions,
  CollapsedCategoryTree,
  ProjectCategoryTreeView,
  StandardCategoryTreeView,
} from './categoryTree/CategoryTreeViews'
import { useCategoryTreeMutations } from './categoryTree/useCategoryTreeMutations'
import { useCategoryTreeState } from './categoryTree/useCategoryTreeState'

/**
 * 分类目录树组件
 */
const CategoryTree = ({
  onSelect,
  /** 切换选中项前调用，返回 Promise<boolean>：true 允许切换，false 取消 */
  onBeforeSelect,
  /** 删除可重复记录后立即持久化（调接口保存），传入删除后的完整 draft 数据 */
  onPersistAfterChange,
  /** 清空不重复表单前确认（有未保存修改时同切换表单：保存/不保存/取消） */
  onBeforeClearForm,
  style,
  defaultExpandAll = true,

  // 项目模式相关
  projectMode = false,
  projectDocuments = [],
  selectedDocument = null,
  onDocumentSelect,
  onUploadDocument,
  onPickExistingDocument,

  // Repeatable 表单相关
  onAddRepeatableInstance,
  repeatableNamingPattern = '{formName}_{index}',

  // 患者ID（用于文档详情弹窗）
  patientId = null,
  // 目录栏折叠控制（由 SchemaFormInner 管理）
  collapsed = false,
  onToggleCollapse,
  collapsible = true,
  /** 收起状态下展示的竖排标题文案 */
  collapsedTitle = '目录'
}) => {
  const { schema, draftData, selectedPath, actions } = useSchemaForm()

  // 项目模式下的Tab状态
  const [activeTab, setActiveTab] = useState('forms')

  // 文档详情弹窗状态
  const [detailDoc, setDetailDoc] = useState(null)
  const [detailVisible, setDetailVisible] = useState(false)

  const handleViewDocumentDetail = useCallback((doc) => {
    setDetailDoc(doc)
    setDetailVisible(true)
  }, [])

  const handleCloseDocumentDetail = useCallback(() => {
    setDetailVisible(false)
    setDetailDoc(null)
  }, [])

  const {
    expandedKeys,
    handleExpand,
    handleToggleExpandAll,
    isAllExpanded,
    selectedTreeKey,
    setExpandedKeys,
    treeData,
    trySetSelectedPath,
  } = useCategoryTreeState({
    actions,
    draftData,
    onBeforeSelect,
    onSelect,
    schema,
    selectedPath,
  })
  const { handleSelect, titleRender } = useCategoryTreeMutations({
    actions,
    draftData,
    expandedKeys,
    onAddRepeatableInstance,
    onBeforeClearForm,
    onPersistAfterChange,
    onSelect,
    schema,
    selectedPath,
    setExpandedKeys,
    trySetSelectedPath,
  })

  const treeProps = {
    expandedKeys,
    handleExpand,
    handleSelect,
    selectedTreeKey,
    titleRender,
    treeData,
  }
  const headerActions = (
    <CategoryTreeHeaderActions
      collapsible={collapsible}
      handleToggleExpandAll={handleToggleExpandAll}
      isAllExpanded={isAllExpanded}
      onToggleCollapse={onToggleCollapse}
    />
  )

  if (!schema) {
    return <CategoryTreeEmpty style={style} />
  }

  if (collapsed) {
    return (
      <CollapsedCategoryTree
        collapsedTitle={collapsedTitle}
        collapsible={collapsible}
        onToggleCollapse={onToggleCollapse}
        style={style}
      />
    )
  }

  if (projectMode) {
    return (
      <ProjectCategoryTreeView
        activeTab={activeTab}
        detailDoc={detailDoc}
        detailVisible={detailVisible}
        handleCloseDocumentDetail={handleCloseDocumentDetail}
        handleViewDocumentDetail={handleViewDocumentDetail}
        headerActions={headerActions}
        onDocumentSelect={onDocumentSelect}
        onPickExistingDocument={onPickExistingDocument}
        onUploadDocument={onUploadDocument}
        patientId={patientId}
        projectDocuments={projectDocuments}
        selectedDocument={selectedDocument}
        setActiveTab={setActiveTab}
        style={style}
        treeProps={treeProps}
      />
    )
  }

  return (
    <StandardCategoryTreeView
      headerActions={headerActions}
      style={style}
      treeProps={treeProps}
    />
  )
}

export default React.memo(CategoryTree)
