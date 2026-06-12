import React from 'react'
import { Button, Tooltip } from 'antd'
import {
  AppstoreOutlined,
  FileTextOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import ResearchProjectRailSection from './ResearchProjectRailSection'
import ResearchTemplateRailSection from './ResearchTemplateRailSection'
import { RESEARCH_SPLITTER_HANDLE_HEIGHT } from './layoutRailModel'

const ResearchRail = ({
  activeProjectId,
  activeTemplateId,
  activeToolbarPanel,
  deletingProjectId,
  deletingTemplateId,
  goFirstProjectDetail,
  goFirstTemplateView,
  handleResearchSplitterMouseDown,
  hoveredRailCardKey,
  isResearchSplitterDragging,
  location,
  navigate,
  onCloneTemplate,
  onCreateProject,
  onCreateTemplate,
  onCsvImport,
  onDeleteProject,
  onDeleteTemplate,
  onOpenTemplateMeta,
  onPreviewTemplate,
  onSetSiderExpanded,
  onSetToolbarPanel,
  projectItems,
  projectLoading,
  projectPaneHeight,
  projectSearch,
  projectSort,
  researchRailContainerRef,
  setHoveredRailCardKey,
  setProjectSearch,
  setProjectSort,
  setTemplateSearch,
  setTemplateSort,
  siderCollapsed,
  templateItems,
  templateLoading,
  templatePaneHeight,
  templateSearch,
  templateSort,
  token,
}) => {
  if (siderCollapsed) {
    return (
      <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <Tooltip title="科研项目" placement="right">
          <Button
            shape="circle"
            type={activeProjectId ? 'primary' : 'text'}
            icon={<AppstoreOutlined />}
            onClick={async () => {
              onSetSiderExpanded()
              await goFirstProjectDetail()
            }}
          />
        </Tooltip>
        <Tooltip title="CRF 模板" placement="right">
          <Button
            shape="circle"
            type={activeTemplateId ? 'primary' : 'text'}
            icon={<FileTextOutlined />}
            onClick={async () => {
              onSetSiderExpanded()
              await goFirstTemplateView()
            }}
          />
        </Tooltip>
        <Tooltip title="新建项目" placement="right">
          <Button shape="circle" icon={<PlusOutlined />} onClick={onCreateProject} />
        </Tooltip>
      </div>
    )
  }

  return (
    <div
      ref={researchRailContainerRef}
      style={{ padding: 12, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
    >
      <ResearchProjectRailSection
        activeProjectId={activeProjectId}
        activeToolbarPanel={activeToolbarPanel}
        deletingProjectId={deletingProjectId}
        hoveredRailCardKey={hoveredRailCardKey}
        itemHeight={projectPaneHeight}
        items={projectItems}
        loading={projectLoading}
        location={location}
        navigate={navigate}
        onCreate={onCreateProject}
        onDeleteProject={onDeleteProject}
        onSetToolbarPanel={onSetToolbarPanel}
        search={projectSearch}
        setHoveredRailCardKey={setHoveredRailCardKey}
        setSearch={setProjectSearch}
        setSort={setProjectSort}
        sort={projectSort}
        token={token}
      />

      <div
        role="separator"
        aria-label="调整科研项目与CRF模板高度"
        aria-orientation="horizontal"
        onMouseDown={handleResearchSplitterMouseDown}
        style={{
          height: RESEARCH_SPLITTER_HANDLE_HEIGHT,
          margin: '4px 0',
          borderRadius: 999,
          cursor: 'row-resize',
          background: isResearchSplitterDragging ? token.colorPrimaryBorder : token.colorBorderSecondary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div style={{ width: 42, height: 2, borderRadius: 999, background: isResearchSplitterDragging ? token.colorPrimary : token.colorTextTertiary }} />
      </div>

      <ResearchTemplateRailSection
        activeTemplateId={activeTemplateId}
        activeToolbarPanel={activeToolbarPanel}
        deletingTemplateId={deletingTemplateId}
        hoveredRailCardKey={hoveredRailCardKey}
        itemHeight={templatePaneHeight}
        items={templateItems}
        loading={templateLoading}
        navigate={navigate}
        onCloneTemplate={onCloneTemplate}
        onCreate={onCreateTemplate}
        onCsvImport={onCsvImport}
        onDeleteTemplate={onDeleteTemplate}
        onOpenTemplateMeta={onOpenTemplateMeta}
        onPreviewTemplate={onPreviewTemplate}
        onSetToolbarPanel={onSetToolbarPanel}
        search={templateSearch}
        setHoveredRailCardKey={setHoveredRailCardKey}
        setSearch={setTemplateSearch}
        setSort={setTemplateSort}
        sort={templateSort}
        token={token}
      />
    </div>
  )
}

export default ResearchRail
