/**
 * 电子病历Tab组件
 * 三栏布局：左侧字段组树 + 中间字段详情 + 右侧文档溯源侧边栏（默认收起）
 */
import React from 'react'

import { useEhrFieldEdit } from './hooks/useEhrFieldEdit'
import { useEhrFieldGroups } from './hooks/useEhrFieldGroups'
import { useEhrFieldSource } from './hooks/useEhrFieldSource'
import { useEhrGroupSelection } from './hooks/useEhrGroupSelection'
import { useEhrLayout } from './hooks/useEhrLayout'
import { useEhrRightResize } from './hooks/useEhrRightResize'
import { useTargetEhrExtraction } from './hooks/useTargetEhrExtraction'
import { EhrTabPanels } from './components/EhrTabPanels'
import { TargetExtractionModal } from './components/TargetExtractionModal'

const EhrTab = ({
  patientId,
  ehrFieldGroups,
  selectedEhrDocument,
  setSelectedEhrDocument,
  ehrDocuments,
  ehrFieldsData,
  getEhrStatusIcon,
  getEhrConfidenceColor,
  onEhrRefresh,
  layoutMode,
  isProjectMode = false,
  projectDocuments = [],
  selectedProjectDocument = null,
  onProjectDocumentSelect = null,
  onUploadProjectDocument = null,
}) => {
  const {
    ehrLeftWidth,
    ehrRightWidth,
    setEhrRightWidth,
    handleLeftResize,
  } = useEhrLayout()
  const {
    selectedEhrGroup,
    expandedGroups,
    handleEhrGroupSelect: originalHandleEhrGroupSelect,
    handleGroupToggle,
    expandAllGroups,
    collapseAllGroups,
  } = useEhrFieldGroups()
  const editing = useEhrFieldEdit(patientId, onEhrRefresh)
  const rightPanelVisible = layoutMode === 'three-column'
  const handleRightResize = useEhrRightResize({ ehrRightWidth, setEhrRightWidth })

  const {
    getCurrentGroupData,
    handleEhrGroupSelectWithDocument,
  } = useEhrGroupSelection({
    ehrDocuments,
    ehrFieldGroups,
    ehrFieldsData,
    layoutMode,
    originalHandleEhrGroupSelect,
    selectedEhrGroup,
    setSelectedEhrDocument,
  })
  const currentGroup = getCurrentGroupData()
  const {
    fieldSourceProps,
    handleFieldViewSource,
    handleViewFullDocument,
  } = useEhrFieldSource({
    ehrDocuments,
    patientId,
  })
  const extraction = useTargetEhrExtraction({
    ehrDocuments,
    onEhrRefresh,
    patientId,
    selectedEhrDocument,
    selectedEhrGroup,
  })

  return (
    <>
      <EhrTabPanels
        collapseAllGroups={collapseAllGroups}
        currentGroup={currentGroup}
        editing={editing}
        ehrDocuments={ehrDocuments}
        ehrFieldGroups={ehrFieldGroups}
        ehrLeftWidth={ehrLeftWidth}
        ehrRightWidth={ehrRightWidth}
        expandedGroups={expandedGroups}
        expandAllGroups={expandAllGroups}
        fieldSourceProps={{
          ...fieldSourceProps,
          extracting: extraction.extracting,
        }}
        getEhrConfidenceColor={getEhrConfidenceColor}
        getEhrStatusIcon={getEhrStatusIcon}
        handleLeftResize={handleLeftResize}
        handleGroupToggle={handleGroupToggle}
        handleRightResize={handleRightResize}
        isProjectMode={isProjectMode}
        onDocumentSelect={setSelectedEhrDocument}
        onFieldViewSource={handleFieldViewSource}
        onGroupExtract={extraction.openTargetExtraction}
        onGroupSelect={handleEhrGroupSelectWithDocument}
        onProjectDocumentSelect={onProjectDocumentSelect}
        onReExtract={extraction.handleReExtract}
        onUploadProjectDocument={onUploadProjectDocument}
        onViewFullDocument={handleViewFullDocument}
        projectDocuments={projectDocuments}
        rightPanelVisible={rightPanelVisible}
        selectedEhrGroup={selectedEhrGroup}
        selectedProjectDocument={selectedProjectDocument}
      />
      <TargetExtractionModal
        currentGroup={currentGroup}
        ehrDocuments={ehrDocuments}
        extracting={extraction.extracting}
        onSubmit={extraction.submitTargetExtraction}
        selectedEhrGroup={selectedEhrGroup}
        setTargetDocumentId={extraction.setTargetDocumentId}
        setTargetFileList={extraction.setTargetFileList}
        setTargetModalOpen={extraction.setTargetModalOpen}
        targetDocumentId={extraction.targetDocumentId}
        targetFileList={extraction.targetFileList}
        targetModalOpen={extraction.targetModalOpen}
      />
    </>
  )
}

export default EhrTab
