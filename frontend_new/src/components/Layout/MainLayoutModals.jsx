import React from 'react'
import PatientCreateModal from '../Patient/PatientCreateModal'
import ProjectCreateWizardModal from '../Research/ProjectCreateWizardModal'
import TemplateMetaModal from '../Research/TemplateMetaModal'
import CrfTemplateCsvImportModal from '../Research/CrfTemplateCsvImportModal'
import CrfTemplateCloneModal from '../Research/CrfTemplateCloneModal'
import TemplatePreviewModal from './TemplatePreviewModal'
import {
  researchProjectDetail,
  templateCreate,
  templateEdit,
} from '../../utils/researchPaths'
import { storePendingTemplateCreateFlow } from '../../utils/templateCreateFlow'

const MainLayoutModals = ({
  cloneTemplateModal,
  location,
  navigate,
  patientCreateVisible,
  projectCreateVisible,
  refreshResearchTemplateRail,
  setCloneTemplateModal,
  setPatientCreateVisible,
  setProjectCreateVisible,
  setTemplateCreateVisible,
  setTemplateCsvImportVisible,
  setTemplatePreviewModal,
  templateCreateForm,
  templateCreateVisible,
  templateCsvImportVisible,
  templatePreviewModal,
  templatePreviewModel,
  token,
}) => (
  <>
    <PatientCreateModal
      open={patientCreateVisible}
      onCancel={() => setPatientCreateVisible(false)}
      onSuccess={(patientId) => {
        setPatientCreateVisible(false)
        navigate(`/patient/detail/${patientId}`, { state: { from: '/patient/pool' } })
      }}
    />
    <ProjectCreateWizardModal
      open={projectCreateVisible}
      onCancel={() => setProjectCreateVisible(false)}
      onSuccess={(projectId) => {
        setProjectCreateVisible(false)
        navigate(researchProjectDetail(projectId))
      }}
    />
    <TemplateMetaModal
      open={templateCreateVisible}
      form={templateCreateForm}
      title="新建模板"
      confirmText="开始设计"
      initialValues={{ name: '', category: '通用', description: '' }}
      onCancel={() => setTemplateCreateVisible(false)}
      onOk={async () => {
        const values = await templateCreateForm.validateFields()
        const returnTo = `${location.pathname}${location.search || ''}`
        storePendingTemplateCreateFlow(
          {
            name: values.name,
            category: values.category,
            description: values.description,
          },
          returnTo
        )
        setTemplateCreateVisible(false)
        navigate(templateCreate(), {
          state: { pendingTemplateCreateTs: Date.now() },
        })
      }}
    />
    <CrfTemplateCsvImportModal
      open={templateCsvImportVisible}
      onCancel={() => setTemplateCsvImportVisible(false)}
      onSuccess={(template) => {
        setTemplateCsvImportVisible(false)
        const newId = template?.id
        if (newId) {
          navigate(templateEdit(newId))
        }
      }}
    />
    <TemplatePreviewModal
      detail={templatePreviewModal.detail}
      loading={templatePreviewModal.loading}
      model={templatePreviewModel}
      onCancel={() => setTemplatePreviewModal({ open: false, loading: false, detail: null })}
      open={templatePreviewModal.open}
      token={token}
    />
    <CrfTemplateCloneModal
      open={cloneTemplateModal.open}
      templateId={cloneTemplateModal.templateId}
      sourceName={cloneTemplateModal.templateName}
      onCancel={() => setCloneTemplateModal({ open: false, templateId: '', templateName: '' })}
      onCloned={(newId) => {
        setCloneTemplateModal({ open: false, templateId: '', templateName: '' })
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('research-template-rail-refresh'))
        }
        refreshResearchTemplateRail()
        navigate(templateEdit(newId))
      }}
    />
  </>
)

export default MainLayoutModals
