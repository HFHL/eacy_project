import React from 'react'
import { Button, Tabs, Tooltip } from 'antd'
import { MinusSquareOutlined, PlusSquareOutlined } from '@ant-design/icons'

import ResizablePanels from './ResizablePanels'
import { DesignCanvas } from './CenterPanel'
import { ComponentLibrary, FolderTree } from './LeftPanel'
import { FieldConfigPanel, FormConfigPanel } from './RightPanel'

const { TabPane } = Tabs

export const FormDesignerPanels = ({
  data,
  designData,
  docTypeOptions,
  folderTreeCollapseAllSignal,
  folderTreeExpandAllSignal,
  folderTreeFolderCount,
  handlers,
  isFolderTreeAllExpanded,
  leftPanelTab,
  readonly,
  rightPanelTab,
  selectedFieldId,
  selectedFolderId,
  selectedGroupId,
  selectedObjects,
  selectionPath,
  setLeftPanelTab,
  setRightPanelTab,
}) => (
  <ResizablePanels
    defaultLeftWidth={240}
    defaultRightWidth={360}
    minLeftWidth={180}
    maxLeftWidth={400}
    minRightWidth={300}
    maxRightWidth={500}
    leftPanel={
      <Tabs
        activeKey={leftPanelTab}
        onChange={setLeftPanelTab}
        tabPosition="top"
        size="small"
        className="left-panel-tabs"
        tabBarExtraContent={leftPanelTab === 'structure' ? (
          <Tooltip title={isFolderTreeAllExpanded ? '收起全部目录' : '展开全部目录'}>
            <Button
              type="text"
              size="small"
              aria-label={isFolderTreeAllExpanded ? '收起全部目录' : '展开全部目录'}
              disabled={folderTreeFolderCount === 0}
              icon={isFolderTreeAllExpanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
              onClick={handlers.handleToggleFolderTreeExpandState}
            />
          </Tooltip>
        ) : null}
      >
        <TabPane tab="目录" key="structure">
          <FolderTree
            folders={data.folders}
            version={designData.version}
            selectedFolderId={selectedFolderId}
            selectedGroupId={selectedGroupId}
            onSelect={handlers.handleTreeSelect}
            onAddFolder={!readonly ? handlers.handleAddFolder : null}
            onAddGroup={!readonly ? handlers.handleAddGroup : null}
            onEditFolder={!readonly ? handlers.handleEditFolder : null}
            onCopyFolder={!readonly ? handlers.handleCopyFolder : null}
            onDeleteFolder={!readonly ? handlers.handleDeleteFolder : null}
            onEditGroupName={!readonly ? handlers.handleEditGroupName : null}
            onDeleteGroup={!readonly ? handlers.handleDeleteGroup : null}
            onReorderFolders={!readonly ? designData.reorderFolders : null}
            onReorderGroups={!readonly ? designData.reorderGroups : null}
            onMoveGroup={!readonly ? designData.moveGroup : null}
            expandAllSignal={folderTreeExpandAllSignal}
            collapseAllSignal={folderTreeCollapseAllSignal}
            onExpandStateChange={handlers.handleFolderTreeExpandStateChange}
            readonly={readonly}
          />
        </TabPane>
        <TabPane tab="组件库" key="components">
          <ComponentLibrary draggable={!readonly} onDragStart={() => {}} />
        </TabPane>
      </Tabs>
    }
    centerPanel={
      <DesignCanvas
        folders={data.folders}
        version={designData.version}
        selectedFolderId={selectedFolderId}
        selectedGroupId={selectedGroupId}
        selectedFieldId={selectedFieldId}
        selectionPath={selectionPath}
        onSelect={handlers.handleCanvasSelect}
        onAddField={handlers.handleAddField}
        onAddGroup={!readonly ? handlers.handleAddGroup : null}
        onAddFolder={!readonly ? handlers.handleAddFolder : null}
        onEditField={handlers.handleEditField}
        onDeleteField={handlers.handleDeleteField}
        onCopyField={handlers.handleCopyField}
        onFieldReorder={!readonly ? handlers.handleFieldReorder : null}
        onFieldNameChange={!readonly ? handlers.handleFieldNameChange : null}
        onOptionsChange={!readonly ? handlers.handleOptionsChange : null}
        onGroupNameChange={!readonly ? handlers.handleGroupNameChange : null}
        onChildSelect={!readonly ? handlers.handleChildSelect : null}
        onAddTableChild={!readonly ? handlers.handleAddTableChild : null}
        onAddTableRow={!readonly ? handlers.handleAddTableRow : null}
        onEditRowPrefix={!readonly ? handlers.handleEditRowPrefix : null}
        onAddMatrixRow={!readonly ? handlers.handleAddMatrixRow : null}
        onAddMatrixCol={!readonly ? handlers.handleAddMatrixCol : null}
        onDeleteMatrixRow={!readonly ? handlers.handleDeleteMatrixRow : null}
        onCopyMatrixRow={!readonly ? handlers.handleCopyMatrixRow : null}
        onDeleteMatrixCol={!readonly ? handlers.handleDeleteMatrixCol : null}
        onDeleteTableChild={!readonly ? handlers.handleDeleteTableChild : null}
        onReorderTableChildren={!readonly ? handlers.handleReorderTableChildren : null}
        onMatrixConfigChange={!readonly ? handlers.handleMatrixConfigChange : null}
        onTableChildNameChange={!readonly ? handlers.handleTableChildNameChange : null}
        onDrop={!readonly ? handlers.handleDropField : null}
        onLoadExample={!readonly ? handlers.handleLoadExample : null}
        onApplyTemplate={!readonly ? handlers.handleApplyTemplate : null}
        readonly={readonly}
      />
    }
    rightPanel={
      <Tabs
        activeKey={rightPanelTab}
        onChange={setRightPanelTab}
        tabPosition="top"
        size="small"
        className="right-panel-tabs"
      >
        <TabPane tab="表单配置" key="form">
          <FormConfigPanel
            folder={selectedObjects.folder}
            group={selectedObjects.group}
            onUpdate={handlers.handleUpdateGroup}
            readonly={readonly}
            docTypeOptions={docTypeOptions}
            version={designData.version}
          />
        </TabPane>
        <TabPane tab="字段配置" key="field" disabled={!selectedObjects.field}>
          <FieldConfigPanel
            field={selectedObjects.field}
            onUpdate={handlers.handleUpdateField}
            readonly={readonly}
            version={designData.version}
          />
        </TabPane>
      </Tabs>
    }
  />
)
