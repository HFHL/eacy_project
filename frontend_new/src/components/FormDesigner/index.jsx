/**
 * FormDesigner 主容器组件
 * 顶层只负责组装数据流、操作 hooks 与弹窗。
 */

import React, { forwardRef, useCallback, useMemo, useState } from 'react'
import { message } from 'antd'

import FieldModal from './components/FieldModal'
import { FormDesignerPanels } from './components/FormDesignerPanels'
import PreviewModal from './components/PreviewModal'
import { useDesignData } from './hooks/useDesignData'
import { useDesignerFieldActions } from './hooks/useDesignerFieldActions'
import { useDesignerFolderGroupActions } from './hooks/useDesignerFolderGroupActions'
import { useDesignerImperativeApi } from './hooks/useDesignerImperativeApi'
import { useDesignerKeyboard } from './hooks/useDesignerKeyboard'
import { useDesignerMatrixActions } from './hooks/useDesignerMatrixActions'
import { useDesignerSchemaActions } from './hooks/useDesignerSchemaActions'
import { useDesignerSelection } from './hooks/useDesignerSelection'
import { useDesignerTableActions } from './hooks/useDesignerTableActions'
import { useSchemaParser } from './hooks/useSchemaParser'
import './styles.less'

const FormDesigner = forwardRef(({
  schemaPath = null,
  onSave = null,
  onBack = null,
  readonly = false,
  showToolbar = false,
  docTypeOptions = [],
  borderless = false,
}, ref) => {
  const designData = useDesignData()
  const [fieldModalVisible, setFieldModalVisible] = useState(false)
  const [editingField, setEditingField] = useState(null)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [leftPanelTab, setLeftPanelTab] = useState('structure')
  const [rightPanelTab, setRightPanelTab] = useState('field')
  const [folderTreeExpandAllSignal, setFolderTreeExpandAllSignal] = useState(0)
  const [folderTreeCollapseAllSignal, setFolderTreeCollapseAllSignal] = useState(0)
  const [isFolderTreeAllExpanded, setIsFolderTreeAllExpanded] = useState(true)
  const [folderTreeFolderCount, setFolderTreeFolderCount] = useState(0)

  const schemaParser = useSchemaParser({
    onParseSuccess: (data, runtimeOptions = {}) => {
      designData.resetData(data)
      if (!runtimeOptions.suppressSuccess) {
        message.success('Schema加载成功')
      }
    },
    onParseError: (errors, runtimeOptions = {}) => {
      if (runtimeOptions.suppressError) return
      message.error(`Schema解析失败: ${errors.map((item) => item.message).join(', ')}`)
    },
    onGenerateSuccess: (schema) => {
      if (onSave) onSave(schema)
    },
  })

  const data = useMemo(() => designData.getData(), [designData.version])
  const selection = useDesignerSelection({ data, setRightPanelTab })
  const schemaActions = useDesignerSchemaActions({ data, designData, onSave, schemaParser })

  useDesignerImperativeApi({
    designData,
    ref,
    schemaParser,
    setPreviewVisible,
    setSelectionPath: selection.setSelectionPath,
  })

  const folderGroupActions = useDesignerFolderGroupActions({
    data,
    designData,
    selectionPath: selection.selectionPath,
    setSelectionPath: selection.setSelectionPath,
  })
  const fieldActions = useDesignerFieldActions({
    data,
    designData,
    selectedObjects: selection.selectedObjects,
    selectionPath: selection.selectionPath,
    setEditingField,
    setFieldModalVisible,
    setSelectionPath: selection.setSelectionPath,
    syncSelectionPathName: selection.syncSelectionPathName,
  })
  const tableActions = useDesignerTableActions({
    data,
    designData,
    selectionPath: selection.selectionPath,
    setSelectionPath: selection.setSelectionPath,
    syncSelectionPathName: selection.syncSelectionPathName,
  })
  const matrixActions = useDesignerMatrixActions({
    data,
    designData,
    selectionPath: selection.selectionPath,
  })

  const handleToggleFolderTreeExpandState = useCallback(() => {
    if (isFolderTreeAllExpanded) {
      setFolderTreeCollapseAllSignal((prev) => prev + 1)
      return
    }
    setFolderTreeExpandAllSignal((prev) => prev + 1)
  }, [isFolderTreeAllExpanded])

  const handleFolderTreeExpandStateChange = useCallback((nextIsAllExpanded, nextFolderCount) => {
    setIsFolderTreeAllExpanded(nextIsAllExpanded)
    setFolderTreeFolderCount(nextFolderCount)
  }, [])

  useDesignerKeyboard({
    fieldModalVisible,
    handleDeleteField: fieldActions.handleDeleteField,
    handleDownloadSchema: schemaActions.handleDownloadSchema,
    handleSaveSchema: schemaActions.handleSaveSchema,
    previewVisible,
    readonly,
    selectionPath: selection.selectionPath,
    setEditingField,
    setFieldModalVisible,
    setPreviewVisible,
    setSelectionPath: selection.setSelectionPath,
  })

  const handlers = {
    ...selection,
    ...schemaActions,
    ...folderGroupActions,
    ...fieldActions,
    ...tableActions,
    ...matrixActions,
    handleFolderTreeExpandStateChange,
    handleToggleFolderTreeExpandState,
  }

  return (
    <div className={`form-designer ${borderless ? 'form-designer-borderless' : ''}`}>
      <div className="main-content">
        <div className="design-view">
          <FormDesignerPanels
            data={data}
            designData={designData}
            docTypeOptions={docTypeOptions}
            folderTreeCollapseAllSignal={folderTreeCollapseAllSignal}
            folderTreeExpandAllSignal={folderTreeExpandAllSignal}
            folderTreeFolderCount={folderTreeFolderCount}
            handlers={handlers}
            isFolderTreeAllExpanded={isFolderTreeAllExpanded}
            leftPanelTab={leftPanelTab}
            readonly={readonly}
            rightPanelTab={rightPanelTab}
            selectedFieldId={selection.selectedFieldId}
            selectedFolderId={selection.selectedFolderId}
            selectedGroupId={selection.selectedGroupId}
            selectedObjects={selection.selectedObjects}
            selectionPath={selection.selectionPath}
            setLeftPanelTab={setLeftPanelTab}
            setRightPanelTab={setRightPanelTab}
          />
        </div>
      </div>

      <FieldModal
        visible={fieldModalVisible}
        field={editingField}
        mode={editingField?.id ? 'edit' : 'create'}
        onCancel={() => {
          setFieldModalVisible(false)
          setEditingField(null)
        }}
        onOk={fieldActions.handleSaveField}
      />

      <PreviewModal
        visible={previewVisible}
        data={data}
        onCancel={() => setPreviewVisible(false)}
      />
    </div>
  )
})

FormDesigner.displayName = 'FormDesigner'

export default FormDesigner
