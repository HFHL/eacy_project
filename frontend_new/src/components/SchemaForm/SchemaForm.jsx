/**
 * Schema表单主组件
 * 组合CategoryTree和FormPanel，提供完整的Schema驱动表单体验
 * 支持三栏布局：左侧目录树 + 中间表单 + 右侧文档溯源
 */
import React, { useState, useCallback, useEffect } from 'react'
import {
  Button,
  message,
  Modal,
  Spin,
} from 'antd'
import {
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import { SchemaFormProvider, useSchemaForm } from './SchemaFormContext'
import FormPanel from './FormPanel'
import { useTargetedExtraction } from './extraction/useTargetedExtraction'
import SourcePanel from './sourcePanel/SourcePanel'
import {
  toAuditPath as _toAuditPath,
  toAuditPathWithoutIndex as _toAuditPathWithoutIndex,
  normalizePathKey as _normalizePathKey,
  formatAuditDisplayValue as _formatAuditDisplayValue,
} from '../../utils/auditResolver'
import SplitterHandle from '../Common/SplitterHandle'
import {
  COLUMN_RESIZE_BAR_STYLE,
  DIVIDER_LINE_STYLE,
  LEGACY_MIDDLE_PANEL_WIDTH_KEY,
  safeStorageRemove,
} from './schemaForm/layoutSizing'
import { useCandidateApplication } from './schemaForm/useCandidateApplication'
import { useAutoSave } from './schemaForm/useAutoSave'
import { useFieldSourceSelection } from './schemaForm/useFieldSourceSelection'
import { useSchemaPanelResize } from './schemaForm/useSchemaPanelResize'
import { useUnsavedLeaveGuard } from './schemaForm/useUnsavedLeaveGuard'
import SchemaFormOverlays from './schemaForm/SchemaFormOverlays'
import { SchemaFormLeftPanel } from './schemaForm/SchemaFormLeftPanel'
const SchemaFormInner = ({ onSave, onReset, onDataChange, onFieldCandidateSolidified, externalHistoryRefreshKey = 0, autoSaveInterval = 30000, siderWidth = 220, sourcePanelWidth, collapsible = true, showSourcePanel = true, projectMode = false, projectConfig = null, projectId = null, patientId = null, contentAdaptive = false, leftHeader = null, collapsedTitle = '目录', beforeUploadActions = null }) => {
  const { state, actions, draftData, patientData, isDirty } = useSchemaForm()
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(true)
  const [saving, setSaving] = useState(false)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0) // 用于触发修改历史刷新
  const mergedHistoryRefreshKey = historyRefreshKey + Number(externalHistoryRefreshKey || 0)
  const {
    handleLeftPanelResizeStart,
    handleRightPanelResizeStart,
    isLeftPanelResizing,
    isRightPanelResizing,
    leftPanelWidth,
    rightPanelWidth,
  } = useSchemaPanelResize({ siderWidth, sourcePanelWidth, leftCollapsed })
  const { documents: projectDocuments = [], selectedDocument = null, onDocumentSelect, onAddRepeatableInstance, onDeleteRepeatableRecords, repeatableNamingPattern = '{formName}_{index}', sourcePatientId = null } = projectConfig || {}
  const {
    extractCandidateDocuments,
    extractConfirming,
    handleCloseUploadExtractModal,
    handleOpenUploadExtractModal,
    handleSelectExistingDocumentForExtract,
    handleUploadDocumentClick,
    handleUploadExtractFile,
    selectedExtractDocId,
    targetFormKey,
    targetSection,
    uploadExtractModalOpen,
    uploadFileInputRef,
  } = useTargetedExtraction({
    draftData,
    onDataChange,
    patientId,
    projectDocuments,
    projectId,
    selectedPath: state?.selectedPath,
    sourcePatientId,
  })
  const handleSave = useCallback(async (type = 'manual') => {
    if (!isDirty && type === 'manual') { message.info('没有需要保存的修改'); return }
    setSaving(true)
    try {
      if (onSave) await onSave(draftData, type)
      actions.markSaved()
      setHistoryRefreshKey(k => k + 1) // 保存成功后触发历史刷新
      if (type === 'manual') message.success('保存成功')
      else message.info('自动保存成功', 1)
    } catch (error) { message.error('保存失败: ' + (error.message || '未知错误')) }
    finally { setSaving(false) }
  }, [isDirty, draftData, onSave, actions])
  const handleReset = useCallback(() => {
    Modal.confirm({ title: '确认重置', icon: <ExclamationCircleOutlined />, content: '重置后将丢失所有未保存的修改，确定要重置吗？', okText: '确定重置', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => { actions.setPatientData(patientData); if (onReset) onReset(); message.success('已重置为原始数据') } })
  }, [patientData, actions, onReset])
  const {
    handleLeaveConfirmCancel,
    handleLeaveConfirmDiscard,
    handleLeaveConfirmSave,
    leaveConfirmOpen,
    onBeforeClearForm,
    onBeforeSelect,
  } = useUnsavedLeaveGuard({
    actions,
    draftData,
    isDirty,
    onSave,
    patientData,
    setHistoryRefreshKey,
    setSaving,
  })
  /** 删除可重复记录后立即调接口保存（无需再点保存） */
  const persistDataAfterChange = useCallback(async (data) => {
    setSaving(true)
    try {
      if (onSave) await onSave(data, 'manual')
      actions.setPatientData(data)
    } finally {
      setSaving(false)
    }
  }, [onSave, actions])
  const {
    activeCoordinates,
    handleFieldSourceClick,
    selectedField,
  } = useFieldSourceSelection({ draftData, rightCollapsed, setRightCollapsed })
  const handleCandidateApplied = useCandidateApplication({
    actions,
    draftData,
    onFieldCandidateSolidified,
    onSave,
    projectMode,
    setHistoryRefreshKey,
  })
  const leftColumnWidth = leftCollapsed ? 52 : leftPanelWidth
  const leftDividerOffset = leftColumnWidth + (leftCollapsed ? 0 : COLUMN_RESIZE_BAR_STYLE.width)
  const rightDividerOffset = rightCollapsed ? 32 : rightPanelWidth
  useAutoSave(autoSaveEnabled, autoSaveInterval, handleSave)
  useEffect(() => {
    // 清理历史遗留的中间栏固定宽，确保中间栏始终按剩余空间自适应。
    safeStorageRemove(LEGACY_MIDDLE_PANEL_WIDTH_KEY)
  }, [])
  useEffect(() => {
    const handleBeforeUnload = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])
  return (
    <div style={{
      height: contentAdaptive ? 'auto' : '100%',
      minHeight: contentAdaptive ? 500 : undefined,
      display: 'flex',
      flexDirection: 'column',
      background: '#fff',
      borderRadius: 0,
      overflow: contentAdaptive ? 'visible' : 'hidden'
    }}>
      <SchemaFormOverlays
        extractCandidateDocuments={extractCandidateDocuments}
        extractConfirming={extractConfirming}
        handleCloseUploadExtractModal={handleCloseUploadExtractModal}
        handleLeaveConfirmCancel={handleLeaveConfirmCancel}
        handleLeaveConfirmDiscard={handleLeaveConfirmDiscard}
        handleLeaveConfirmSave={handleLeaveConfirmSave}
        handleSelectExistingDocumentForExtract={handleSelectExistingDocumentForExtract}
        handleUploadExtractFile={handleUploadExtractFile}
        leaveConfirmOpen={leaveConfirmOpen}
        patientId={patientId}
        projectId={projectId}
        saving={saving}
        selectedExtractDocId={selectedExtractDocId}
        targetFormKey={targetFormKey}
        targetSection={targetSection}
        uploadExtractModalOpen={uploadExtractModalOpen}
        uploadFileInputRef={uploadFileInputRef}
      />
      <div style={{ flex: contentAdaptive ? 'none' : 1, minHeight: contentAdaptive ? 500 : 0, display: 'flex', overflow: contentAdaptive ? 'visible' : 'hidden', background: '#fff', position: 'relative', alignItems: contentAdaptive ? 'flex-start' : 'stretch' }}>
        <div style={{ ...DIVIDER_LINE_STYLE, left: leftDividerOffset }} />
        {showSourcePanel && <div style={{ ...DIVIDER_LINE_STYLE, left: `calc(100% - ${rightDividerOffset}px)` }} />}
        <SchemaFormLeftPanel
          collapsedTitle={collapsedTitle}
          collapsible={collapsible}
          contentAdaptive={contentAdaptive}
          handleOpenUploadExtractModal={handleOpenUploadExtractModal}
          handleUploadDocumentClick={handleUploadDocumentClick}
          leftCollapsed={leftCollapsed}
          leftColumnWidth={leftColumnWidth}
          leftHeader={leftHeader}
          onAddRepeatableInstance={onAddRepeatableInstance}
          onBeforeClearForm={onBeforeClearForm}
          onBeforeSelect={onBeforeSelect}
          onDeleteRepeatableRecords={onDeleteRepeatableRecords}
          onDocumentSelect={onDocumentSelect}
          onPersistAfterChange={persistDataAfterChange}
          patientId={patientId}
          projectDocuments={projectDocuments}
          projectMode={projectMode}
          repeatableNamingPattern={repeatableNamingPattern}
          selectedDocument={selectedDocument}
          setLeftCollapsed={setLeftCollapsed}
          targetFormKey={targetFormKey}
        />
        {!leftCollapsed && (
          <SplitterHandle
            axis="vertical"
            thickness={COLUMN_RESIZE_BAR_STYLE.width}
            isActive={isLeftPanelResizing}
            showOnHover
            onMouseDown={handleLeftPanelResizeStart}
            style={{ alignSelf: 'stretch' }}
            ariaLabel="拖动调整目录栏宽度"
          />
        )}
        <div
          style={{
            flex: 1,
            overflow: contentAdaptive ? 'visible' : 'hidden',
            minWidth: 0
          }}
        >
          <FormPanel
            style={{ height: contentAdaptive ? 'auto' : '100%' }}
            onFieldSelect={handleFieldSourceClick}
            toolbarProps={{
              onSave: handleSave,
              onReset: handleReset,
              saving,
              autoSaveEnabled,
              onToggleAutoSave: () => setAutoSaveEnabled(!autoSaveEnabled),
              isDirty
            }}
            onUploadDocument={targetFormKey ? handleUploadDocumentClick : undefined}
            beforeUploadActions={
              beforeUploadActions || (targetFormKey ? (
                <Button
                  size="small"
                  type="link"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={handleOpenUploadExtractModal}
                >
                  已有文档
                </Button>
              ) : null)
            }
          />
        </div>
        {showSourcePanel && (
          <>
            {!rightCollapsed && (
              <SplitterHandle
                axis="vertical"
                thickness={COLUMN_RESIZE_BAR_STYLE.width}
                isActive={isRightPanelResizing}
                showOnHover
                onMouseDown={handleRightPanelResizeStart}
                style={{ alignSelf: 'stretch', marginLeft: 2 }}
                ariaLabel="拖动调整文档溯源面板宽度"
              />
            )}
            <SourcePanel
              collapsed={rightCollapsed}
              onToggle={() => setRightCollapsed(!rightCollapsed)}
              selectedField={selectedField}
              width={rightPanelWidth}
              activeCoordinates={activeCoordinates}
              patientId={patientId}
              projectId={projectId}
              historyRefreshKey={mergedHistoryRefreshKey}
              onRefreshHistory={() => setHistoryRefreshKey(k => k + 1)}
              onCandidateApplied={handleCandidateApplied}
              fallbackDocuments={projectDocuments}
              preferredDocument={selectedDocument}
              contentAdaptive={contentAdaptive}
            />
          </>
        )}
      </div>
    </div>
  )
}

const SchemaForm = ({ schema, enums = {}, patientData, patientId, projectId, onSave, onReset, onDataChange, onFieldCandidateSolidified, externalHistoryRefreshKey = 0, loading = false, autoSaveInterval = 30000, siderWidth = 220, sourcePanelWidth, collapsible = true, showSourcePanel = true, projectMode = false, projectConfig = null, contentAdaptive = false, leftHeader = null, collapsedTitle = '目录', style, beforeUploadActions = null }) => {
  const resolvedPatientId = patientId || patientData?.id || patientData?.patient_id || null

  if (loading) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}><Spin tip="加载中..." size="large" /></div>
  if (!schema) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', ...style }}>请提供Schema配置</div>
  return (
    <div style={{ height: contentAdaptive ? 'auto' : '100%', ...style }}>
      <SchemaFormProvider schema={schema} enums={enums} patientData={patientData}>
        <SchemaFormInner onSave={onSave} onReset={onReset} onDataChange={onDataChange} onFieldCandidateSolidified={onFieldCandidateSolidified} externalHistoryRefreshKey={externalHistoryRefreshKey} autoSaveInterval={autoSaveInterval} siderWidth={siderWidth} sourcePanelWidth={sourcePanelWidth} collapsible={collapsible} showSourcePanel={showSourcePanel} projectMode={projectMode} projectConfig={projectConfig} projectId={projectId} patientId={resolvedPatientId} contentAdaptive={contentAdaptive} leftHeader={leftHeader} collapsedTitle={collapsedTitle} beforeUploadActions={beforeUploadActions} />
      </SchemaFormProvider>
    </div>
  )
}

export default SchemaForm
