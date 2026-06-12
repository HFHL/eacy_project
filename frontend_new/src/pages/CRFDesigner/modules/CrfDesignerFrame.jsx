import React from 'react'
import { Button, Space, Tooltip } from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons'

import FormDesigner from '../../../components/FormDesigner'
import DesignerPageFrame from '../../../components/FormDesigner/components/shared/DesignerPageFrame'
import { PAGE_LAYOUT_HEIGHTS, toViewportHeight } from '../../../constants/pageLayout'

const TEMPLATE_DESIGNER_CONTAINER_HEIGHT = toViewportHeight(PAGE_LAYOUT_HEIGHTS.templateDesigner.containerOffset)

export const CrfDesignerFrame = ({
  canDeleteTemplate,
  deletingTemplate,
  docTypeOptions,
  formDesignerRef,
  isViewMode,
  onBack,
  onCloneTemplate,
  onDeleteTemplate,
  onEditTemplate,
  onExportCSV,
  onImportCSV,
  onOpenTemplateInfo,
  onSaveSchema,
  templateId,
  templateInfo,
}) => (
  <DesignerPageFrame
    backLabel="返回"
    showBackButton={!isViewMode}
    singleLineHeader
    containerPadding={0}
    containerHeight={TEMPLATE_DESIGNER_CONTAINER_HEIGHT}
    containerMinHeight={PAGE_LAYOUT_HEIGHTS.templateDesigner.containerMinHeight}
    unifiedContainer
    onBack={onBack}
    headerContent={(
      <Space size={8}>
        <span>模版: {templateInfo.name}</span>
        <span>|</span>
        <span>版本: {templateInfo.version}</span>
        <Tooltip title="编辑模版信息">
          <Button
            type="text"
            size="small"
            shape="circle"
            icon={<EditOutlined />}
            onClick={onOpenTemplateInfo}
          />
        </Tooltip>
      </Space>
    )}
    actions={(
      <Space>
        {!isViewMode && (
          <>
            <Button icon={<UploadOutlined />} onClick={onImportCSV}>
              导入CSV
            </Button>
            <Button onClick={onExportCSV}>
              导出CSV
            </Button>
          </>
        )}
        {!isViewMode && (
          <>
            <Button icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
              重置
            </Button>
            <Button icon={<SaveOutlined />} onClick={() => onSaveSchema(false)}>
              保存草稿
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={() => onSaveSchema(true)}>
              发布模版
            </Button>
          </>
        )}
        {isViewMode && (
          <Button type="primary" onClick={onEditTemplate}>
            进入编辑
          </Button>
        )}
        {templateId ? (
          <Button icon={<CopyOutlined />} onClick={onCloneTemplate}>
            复制为新模板
          </Button>
        ) : null}
        {canDeleteTemplate ? (
          <Button
            danger
            icon={<DeleteOutlined />}
            loading={deletingTemplate}
            onClick={onDeleteTemplate}
          >
            删除模板
          </Button>
        ) : null}
      </Space>
    )}
  >
    <FormDesigner
      ref={formDesignerRef}
      schemaPath={null}
      onSave={() => onSaveSchema(false)}
      onBack={onBack}
      readonly={isViewMode}
      showToolbar={false}
      docTypeOptions={docTypeOptions}
      borderless
    />
  </DesignerPageFrame>
)
