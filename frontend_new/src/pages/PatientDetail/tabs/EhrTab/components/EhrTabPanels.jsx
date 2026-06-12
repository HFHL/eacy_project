import React from 'react'

import { appThemeToken } from '@/styles/themeTokens'
import LeftPanel from './LeftPanel'
import MiddlePanel from './MiddlePanel'
import RightPanel from './RightPanel'

export const EhrTabPanels = ({
  collapseAllGroups,
  currentGroup,
  editing,
  ehrFieldGroups,
  ehrLeftWidth,
  ehrRightWidth,
  expandedGroups,
  expandAllGroups,
  fieldSourceProps,
  getEhrConfidenceColor,
  getEhrStatusIcon,
  handleLeftResize,
  handleGroupToggle,
  handleRightResize,
  isProjectMode,
  onDocumentSelect,
  onFieldViewSource,
  onGroupExtract,
  onGroupSelect,
  onGroupToggle,
  onProjectDocumentSelect,
  onReExtract,
  onUploadProjectDocument,
  onViewFullDocument,
  projectDocuments,
  rightPanelVisible,
  selectedEhrGroup,
  selectedProjectDocument,
}) => (
  <div style={{ display: 'flex', gap: '8px' }}>
    <div style={{ width: `${ehrLeftWidth}px`, minWidth: '100px' }}>
      <LeftPanel
        ehrFieldGroups={ehrFieldGroups}
        selectedEhrGroup={selectedEhrGroup}
        expandedGroups={expandedGroups}
        getEhrStatusIcon={getEhrStatusIcon}
        onGroupSelect={onGroupSelect}
        onGroupToggle={handleGroupToggle}
        onExpandAll={() => expandAllGroups(ehrFieldGroups)}
        onCollapseAll={collapseAllGroups}
        isProjectMode={isProjectMode}
        projectDocuments={projectDocuments}
        selectedDocument={selectedProjectDocument}
        onDocumentSelect={onProjectDocumentSelect || onDocumentSelect}
        onUploadDocument={onUploadProjectDocument}
      />
    </div>

    <div
      style={{
        width: '4px',
        background: appThemeToken.colorBorder,
        cursor: 'col-resize',
        borderRadius: '2px',
        transition: 'background 0.2s',
      }}
      onMouseDown={handleLeftResize}
      onMouseEnter={(event) => { event.target.style.background = appThemeToken.colorBorderSecondary }}
      onMouseLeave={(event) => { event.target.style.background = appThemeToken.colorBorder }}
    />

    <div style={{ flex: 1, minWidth: '400px' }}>
      <MiddlePanel
        currentGroup={currentGroup}
        editingEhrField={editing.editingEhrField}
        editingEhrValue={editing.editingEhrValue}
        setEditingEhrValue={editing.setEditingEhrValue}
        handleEhrFieldEdit={editing.handleEhrFieldEdit}
        handleEhrSaveEdit={editing.handleEhrSaveEdit}
        handleEhrCancelEdit={editing.handleEhrCancelEdit}
        handleEhrGroupExtract={onGroupExtract}
        handleEhrViewSource={onFieldViewSource}
        handleEhrEditRecord={(recordId) => console.log('编辑记录:', recordId)}
        handleEhrDeleteRecord={(recordId) => console.log('删除记录:', recordId)}
        onDeleteTableRow={(fieldId, rowId) => console.log('删除表格行:', fieldId, rowId)}
        onAddTableRow={(fieldId, newRow) => console.log('新增表格行:', fieldId, newRow)}
        onAddNewGroup={(groupName) => console.log('添加新字段组:', groupName)}
        getEhrConfidenceColor={getEhrConfidenceColor}
      />
    </div>

    {rightPanelVisible && (
      <>
        <div
          style={{
            width: 4,
            background: appThemeToken.colorBorder,
            cursor: 'col-resize',
            borderRadius: 2,
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
          onMouseDown={handleRightResize}
          onMouseEnter={(event) => { event.target.style.background = appThemeToken.colorBorderSecondary }}
          onMouseLeave={(event) => { event.target.style.background = appThemeToken.colorBorder }}
        />
        <div
          style={{
            width: `${ehrRightWidth}px`,
            minWidth: 280,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: `1px solid ${appThemeToken.colorBorder}`,
            background: appThemeToken.colorBgContainer,
            position: 'sticky',
            top: 0,
            alignSelf: 'flex-start',
            maxHeight: 'calc(100vh - 80px)',
            overflowY: 'auto',
            zIndex: 90,
          }}
        >
          <div style={{ flex: 1 }}>
            <RightPanel
              selectedField={fieldSourceProps.selectedField}
              fieldHistory={fieldSourceProps.fieldHistory}
              historyLoading={fieldSourceProps.historyLoading}
              documentImageUrl={fieldSourceProps.documentImageUrl}
              imageLoading={fieldSourceProps.imageLoading}
              sourceLocation={fieldSourceProps.sourceLocation}
              fallbackDocument={fieldSourceProps.fallbackDocument}
              onViewFullDocument={onViewFullDocument}
              onReExtract={onReExtract}
              extracting={fieldSourceProps.extracting}
            />
          </div>
        </div>
      </>
    )}
  </div>
)
