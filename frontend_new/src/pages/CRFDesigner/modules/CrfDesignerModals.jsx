import React from 'react'

import CrfTemplateCloneModal from '../../../components/Research/CrfTemplateCloneModal'
import TemplateMetaModal from '../../../components/Research/TemplateMetaModal'

export const CrfDesignerModals = ({
  cloneModalOpen,
  onCancelClone,
  onCloseTemplateInfo,
  onCloned,
  onSaveTemplateInfo,
  templateForm,
  templateId,
  templateInfo,
  templateInfoVisible,
}) => (
  <>
    <TemplateMetaModal
      open={templateInfoVisible}
      form={templateForm}
      title={!templateId ? '新建模板' : '模板信息'}
      confirmText={!templateId ? '开始设计' : '保存'}
      initialValues={{
        name: templateInfo.name,
        category: templateInfo.category,
        description: templateInfo.description,
      }}
      onCancel={onCloseTemplateInfo}
      onOk={onSaveTemplateInfo}
    />
    <CrfTemplateCloneModal
      open={cloneModalOpen}
      templateId={templateId}
      sourceName={templateInfo.name}
      onCancel={onCancelClone}
      onCloned={onCloned}
    />
  </>
)
