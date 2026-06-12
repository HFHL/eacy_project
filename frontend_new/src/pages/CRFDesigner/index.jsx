/**
 * CRF Designer - guide prototype based designer
 */

import React, { useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Form } from 'antd'

import { isCrfTemplateDeletable } from '../../utils/crfTemplateGuards'
import { createDefaultTemplateInfo } from '../../utils/templatePageState'
import { CrfDesignerFrame } from './modules/CrfDesignerFrame'
import { CrfDesignerModals } from './modules/CrfDesignerModals'
import { useCrfDesignerActions } from './modules/useCrfDesignerActions'
import { useCrfDocTypeOptions } from './modules/useCrfDocTypeOptions'
import { useCrfTemplateLoader } from './modules/useCrfTemplateLoader'
import { useCrfTemplateMetaEvents } from './modules/useCrfTemplateMetaEvents'

const CRFDesigner = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { templateId } = useParams()
  const formDesignerRef = useRef(null)
  const isViewMode = location.pathname.endsWith('/view')

  const [templateInfoVisible, setTemplateInfoVisible] = useState(false)
  const [templateInfo, setTemplateInfo] = useState(createDefaultTemplateInfo(templateId || ''))
  const [templateForm] = Form.useForm()
  const [templateRaw, setTemplateRaw] = useState(null)
  const [deletingTemplate, setDeletingTemplate] = useState(false)
  const [cloneModalOpen, setCloneModalOpen] = useState(false)

  const docTypeOptions = useCrfDocTypeOptions()
  const canDeleteTemplate = useMemo(
    () => Boolean(templateId) && isCrfTemplateDeletable(templateRaw || { id: templateId }),
    [templateId, templateRaw],
  )

  const {
    handleBack,
    handleDeleteTemplate,
    handleEditTemplate,
    handleExportCSV,
    handleImportCSV,
    handleSaveSchema,
    handleSaveTemplateInfo,
    handleTemplateCloned,
  } = useCrfDesignerActions({
    canDeleteTemplate,
    formDesignerRef,
    isViewMode,
    navigate,
    setCloneModalOpen,
    setDeletingTemplate,
    setTemplateInfo,
    setTemplateInfoVisible,
    templateForm,
    templateId,
    templateInfo,
    templateRaw,
  })

  useCrfTemplateMetaEvents({
    navigate,
    setTemplateInfoVisible,
    templateId,
  })
  useCrfTemplateLoader({
    formDesignerRef,
    locationKey: location.key,
    navigate,
    setTemplateInfo,
    setTemplateInfoVisible,
    setTemplateRaw,
    templateForm,
    templateId,
  })

  return (
    <>
      <CrfDesignerFrame
        canDeleteTemplate={canDeleteTemplate}
        deletingTemplate={deletingTemplate}
        docTypeOptions={docTypeOptions}
        formDesignerRef={formDesignerRef}
        isViewMode={isViewMode}
        onBack={handleBack}
        onCloneTemplate={() => setCloneModalOpen(true)}
        onDeleteTemplate={handleDeleteTemplate}
        onEditTemplate={handleEditTemplate}
        onExportCSV={handleExportCSV}
        onImportCSV={handleImportCSV}
        onOpenTemplateInfo={() => setTemplateInfoVisible(true)}
        onSaveSchema={handleSaveSchema}
        templateId={templateId}
        templateInfo={templateInfo}
      />
      <CrfDesignerModals
        cloneModalOpen={cloneModalOpen}
        onCancelClone={() => setCloneModalOpen(false)}
        onCloseTemplateInfo={() => setTemplateInfoVisible(false)}
        onCloned={handleTemplateCloned}
        onSaveTemplateInfo={handleSaveTemplateInfo}
        templateForm={templateForm}
        templateId={templateId}
        templateInfo={templateInfo}
        templateInfoVisible={templateInfoVisible}
      />
    </>
  )
}

export default CRFDesigner
