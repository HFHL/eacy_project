import React from 'react'
import { Button, Radio, Space, Tooltip, Typography } from 'antd'
import {
  DownOutlined,
  ExportOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons'

const { Text } = Typography

const ProjectDatasetHeader = ({
  projectInfo,
  currentTemplateId,
  projectUpdateDisplay,
  showRendererSwitch,
  rendererMode,
  viewMode,
  isOverviewCollapsed,
  token,
  onRendererModeChange,
  onViewModeChange,
  onRefresh,
  onAddPatients,
  onExportData,
  onOpenProjectEdit,
  onViewProjectTemplate,
  onToggleOverview,
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
      alignItems: 'center',
      columnGap: 12,
      width: '100%',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '0 1 auto' }}>
        <Tooltip title={projectInfo.name}>
          <Text
            strong
            style={{
              fontSize: 16,
              color: token.colorText,
              display: 'inline-block',
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              verticalAlign: 'bottom',
              flexShrink: 1,
            }}
          >
            {projectInfo.name}
          </Text>
        </Tooltip>
        <Tooltip title={currentTemplateId ? projectInfo.crfTemplate : '点击选择 CRF 模板'}>
          <Button
            size="small"
            icon={<FileTextOutlined />}
            onClick={onViewProjectTemplate}
            style={{
              maxWidth: currentTemplateId ? 190 : 150,
              height: 26,
              borderRadius: 999,
              borderColor: currentTemplateId ? token.colorPrimaryBorder : token.colorWarning,
              background: currentTemplateId ? token.colorPrimaryBg : token.colorWarningBg,
              color: currentTemplateId ? token.colorPrimary : token.colorWarning,
              boxShadow: 'none',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', maxWidth: 112, overflow: 'hidden', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
              <span style={{ flexShrink: 0, fontWeight: 500 }}>
                {currentTemplateId ? '模板 ·\u00a0' : '选择模板'}
              </span>
              {currentTemplateId ? (
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
                  {projectInfo.crfTemplate || '-'}
                </span>
              ) : null}
            </span>
          </Button>
        </Tooltip>
      </div>
      <Space size={4} style={{ flexShrink: 0 }}>
        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {`更新于 ${projectUpdateDisplay.shortText}`}
        </Text>
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined />}
          onClick={onRefresh}
          style={{ paddingInline: 4, color: token.colorTextSecondary }}
        />
      </Space>
    </div>
    <div style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
      <Space direction="vertical" size={6} align="center" style={{ display: showRendererSwitch ? 'flex' : 'none' }}>
        <Radio.Group value={rendererMode} onChange={onRendererModeChange} size="small">
          <Radio.Button value="v1">V1 表格</Radio.Button>
          <Radio.Button value="v2">V2 分组 Tabs</Radio.Button>
        </Radio.Group>
        {rendererMode === 'v1' && (
          <Radio.Group value={viewMode} onChange={(event) => onViewModeChange(event.target.value)} size="small">
            <Radio.Button value="penetration">穿透视图</Radio.Button>
            <Radio.Button value="overview">概览视图</Radio.Button>
          </Radio.Group>
        )}
      </Space>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
      <Button size="small" icon={<PlusOutlined />} onClick={onAddPatients}>
        添加患者
      </Button>
      <Button size="small" icon={<ExportOutlined />} onClick={onExportData}>
        导出数据
      </Button>
      <Button size="small" icon={<SettingOutlined />} onClick={onOpenProjectEdit}>
        项目设置
      </Button>
      <Tooltip title={isOverviewCollapsed ? '展开统计概览' : '收起统计概览'}>
        <Button
          type="text"
          size="small"
          onClick={onToggleOverview}
          icon={isOverviewCollapsed ? <DownOutlined /> : <DownOutlined style={{ transform: 'rotate(180deg)' }} />}
          style={{ paddingInline: 6 }}
        />
      </Tooltip>
    </div>
  </div>
)

export default ProjectDatasetHeader
