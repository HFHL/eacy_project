import React from 'react'

import CategoryTree from '../CategoryTree'

export const SchemaFormLeftPanel = ({
  collapsedTitle,
  collapsible,
  contentAdaptive,
  handleOpenUploadExtractModal,
  handleUploadDocumentClick,
  leftCollapsed,
  leftColumnWidth,
  leftHeader,
  onAddRepeatableInstance,
  onBeforeClearForm,
  onBeforeSelect,
  onDocumentSelect,
  onPersistAfterChange,
  patientId,
  projectDocuments,
  projectMode,
  repeatableNamingPattern,
  selectedDocument,
  setLeftCollapsed,
  targetFormKey,
}) => (
  <div style={{
    width: leftColumnWidth,
    transition: 'width 0.2s',
    overflow: 'hidden',
    padding: 0,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    ...(contentAdaptive ? { position: 'sticky', top: 56, alignSelf: 'flex-start', zIndex: 2 } : {}),
  }}>
    <div style={{
      height: contentAdaptive ? 'auto' : '100%',
      minHeight: contentAdaptive ? 0 : 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      flex: contentAdaptive ? 'none' : 1,
    }}>
      {contentAdaptive && leftHeader && !leftCollapsed && (
        <div style={{ flexShrink: 0, padding: '0 8px' }}>{leftHeader}</div>
      )}
      <div style={{ flex: contentAdaptive ? 'none' : 1, minHeight: contentAdaptive ? 0 : 0, overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <CategoryTree
          defaultExpandAll
          style={{ height: contentAdaptive ? 'auto' : '100%' }}
          onBeforeSelect={onBeforeSelect}
          onBeforeClearForm={onBeforeClearForm}
          onPersistAfterChange={onPersistAfterChange}
          projectMode={projectMode}
          projectDocuments={projectDocuments}
          selectedDocument={selectedDocument}
          onDocumentSelect={onDocumentSelect}
          onUploadDocument={targetFormKey ? handleUploadDocumentClick : undefined}
          onPickExistingDocument={targetFormKey ? handleOpenUploadExtractModal : undefined}
          onAddRepeatableInstance={onAddRepeatableInstance}
          repeatableNamingPattern={repeatableNamingPattern}
          patientId={patientId}
          collapsed={leftCollapsed}
          onToggleCollapse={() => setLeftCollapsed(!leftCollapsed)}
          collapsible={collapsible}
          collapsedTitle={collapsedTitle}
        />
      </div>
    </div>
  </div>
)
