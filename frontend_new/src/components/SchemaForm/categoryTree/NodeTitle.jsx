import React from 'react'
import { Button, Dropdown, Tooltip, Typography } from 'antd'
import {
  BlockOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  FormOutlined,
  PlusOutlined,
  TableOutlined,
} from '@ant-design/icons'
import { orderedPropertyEntries } from '../SchemaFormContext'
import { appThemeToken } from '../../../styles/themeTokens'
import { isRepeatableForm } from './categoryTreeUtils'

const { Text } = Typography

const treeHoverStyle = `
  .category-tree-node .node-hover-actions {
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .category-tree-node:hover .node-hover-actions {
    opacity: 1;
  }
`

const NodeTitle = ({ node, expanded, onAddInstance, onDeleteInstance, onClearForm, onClearFormRequest }) => {
  const {
    hasData,
    progress,
    isForm,
    isFolder,
    isFormInstance,
    isRepeatableForm: nodeIsRepeatableForm,
    schemaNode,
    originalFormName,
    originalFormPath,
    originalFormSchema,
    instanceIndex,
    totalInstances,
    recordCount,
  } = node

  const folderRepeatableTypes = isFolder && schemaNode?.properties
    ? orderedPropertyEntries(schemaNode.properties, schemaNode)
        .filter(([, schema]) => isRepeatableForm(schema))
        .map(([formName, formSchema]) => ({
          formName,
          formPath: `${node.key}.${formName}`,
          formSchema,
        }))
    : []

  const getIcon = () => {
    if (isFolder) {
      return expanded
        ? <FolderOpenOutlined style={{ color: appThemeToken.colorWarning, marginRight: 6 }} />
        : <FolderOutlined style={{ color: appThemeToken.colorWarning, marginRight: 6 }} />
    }
    if (isForm && nodeIsRepeatableForm) {
      return <TableOutlined style={{ color: appThemeToken.colorPrimary, marginRight: 6 }} />
    }
    if (isFormInstance) {
      return <BlockOutlined style={{ color: appThemeToken.colorPrimary, marginRight: 6 }} />
    }
    return <FormOutlined style={{ color: appThemeToken.colorSuccess, marginRight: 6 }} />
  }

  const progressText = progress && progress.total > 0
    ? `${progress.filled}/${progress.total}`
    : null

  const handleFolderAddType = (formPath, formName, formSchema) => (e) => {
    e?.stopPropagation?.()
    onAddInstance?.(formPath, formName, formSchema)
  }

  const handleAddClick = (e) => {
    e.stopPropagation()
    if (!nodeIsRepeatableForm || !onAddInstance) return
    if (isFormInstance) {
      onAddInstance(originalFormPath, originalFormName, originalFormSchema)
    } else {
      onAddInstance(node.path, node.title, schemaNode)
    }
  }

  const handleDeleteClick = (e) => {
    e.stopPropagation()
    if (nodeIsRepeatableForm) {
      if (isFormInstance && onDeleteInstance) {
        onDeleteInstance(originalFormPath, instanceIndex, totalInstances)
      } else if (onClearFormRequest) {
        onClearFormRequest(node.path)
      } else if (onClearForm) {
        onClearForm(node.path)
      }
      return
    }

    if (isFormInstance && onDeleteInstance) {
      onDeleteInstance(originalFormPath, instanceIndex, totalInstances)
    } else if (isForm && !isFormInstance) {
      if (onClearFormRequest) {
        onClearFormRequest(node.path)
      } else if (onClearForm) {
        onClearForm(node.path)
      }
    }
  }

  const canAdd = isForm && nodeIsRepeatableForm && !isFormInstance
  const canAddOnInstance = isFormInstance && nodeIsRepeatableForm
  const canDelete = nodeIsRepeatableForm ? true : (isFormInstance || (isForm && hasData))
  const deleteTooltip = nodeIsRepeatableForm
    ? (hasData ? '清空全部记录' : '清空表单')
    : '清空表单'

  return (
    <div className="category-tree-node" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', width: '100%' }}>
      <style>{treeHoverStyle}</style>
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        {getIcon()}
        <Text style={{ fontSize: 14, fontWeight: isFolder ? 500 : 400, color: hasData ? appThemeToken.colorText : appThemeToken.colorTextSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.title}
        </Text>
        {isFolder && (
          <Text style={{ fontSize: 12, color: appThemeToken.colorTextTertiary, marginLeft: 5, flexShrink: 0 }}>
            #{node.children?.length ?? 0}
          </Text>
        )}
        {!isFormInstance && isForm && nodeIsRepeatableForm && (
          <Text style={{ fontSize: 12, color: appThemeToken.colorTextTertiary, marginLeft: 5, flexShrink: 0 }}>
            #{recordCount || 0}
          </Text>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {!isFolder && progressText && (
          <Text style={{ fontSize: 12, color: appThemeToken.colorTextTertiary }}>
            {progressText}
          </Text>
        )}
        {isFolder && folderRepeatableTypes.length > 0 && (
          <Dropdown
            menu={{
              items: folderRepeatableTypes.map(({ formName, formPath, formSchema }) => ({
                key: formPath,
                label: formName,
                onClick: () => handleFolderAddType(formPath, formName, formSchema)(),
              })),
              onClick: (e) => e.domEvent?.stopPropagation?.(),
            }}
            trigger={['click']}
            placement="bottomLeft"
          >
            <Tooltip title="添加表单（选择类型）" placement="top">
              <Button type="text" size="small" icon={<PlusOutlined style={{ fontSize: 12 }} />} className="node-hover-actions" onClick={(e) => e.stopPropagation()} style={{ padding: '0 4px', height: 18, minWidth: 18, color: appThemeToken.colorPrimary }} />
            </Tooltip>
          </Dropdown>
        )}
        {(canAdd || canAddOnInstance) && (
          <Tooltip title="新增记录" placement="top">
            <Button type="text" size="small" icon={<PlusOutlined style={{ fontSize: 12 }} />} onClick={handleAddClick} className="node-hover-actions" style={{ padding: '0 4px', height: 18, minWidth: 18, color: appThemeToken.colorPrimary }} />
          </Tooltip>
        )}
        {canDelete && (
          <Tooltip title={isFormInstance ? '删除此记录' : deleteTooltip} placement="top">
            <Button type="text" size="small" icon={<DeleteOutlined style={{ fontSize: 12 }} />} onClick={handleDeleteClick} className="node-hover-actions" style={{ padding: '0 4px', height: 18, minWidth: 18, color: appThemeToken.colorError }} />
          </Tooltip>
        )}
        {!canAdd && !canDelete && (
          <span style={{ display: 'inline-block', width: 24, height: 18, minWidth: 18 }} aria-hidden />
        )}
      </div>
    </div>
  )
}

export default NodeTitle
