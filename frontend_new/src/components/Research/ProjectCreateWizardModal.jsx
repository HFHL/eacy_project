import React from 'react'
import { Button, Modal, Steps } from 'antd'

import { PatientSelectStep } from './projectCreateWizard/PatientSelectStep'
import { ProjectInfoStep } from './projectCreateWizard/ProjectInfoStep'
import { TemplateSelectStep } from './projectCreateWizard/TemplateSelectStep'
import { useProjectCreateWizard } from './projectCreateWizard/useProjectCreateWizard'
import { projectCreateStepItems } from './projectCreateWizard/wizardSteps'

const ProjectCreateWizardModal = ({ open, onCancel, onSuccess }) => {
  const wizard = useProjectCreateWizard({ onCancel, onSuccess, open })

  const handleCancel = () => {
    if (wizard.creating) return
    wizard.resetWizard()
    onCancel()
  }

  return (
    <Modal
      title="新建科研项目向导"
      open={open}
      onCancel={handleCancel}
      width={860}
      destroyOnHidden
      footer={[
        <Button
          key="cancel"
          disabled={wizard.creating}
          onClick={handleCancel}
        >
          取消
        </Button>,
        wizard.step > 0 ? (
          <Button key="prev" disabled={wizard.creating} onClick={() => wizard.setStep((prev) => prev - 1)}>
            上一步
          </Button>
        ) : null,
        wizard.step < 2 ? (
          <Button key="next" type="primary" disabled={wizard.creating} onClick={wizard.handleNext}>
            下一步
          </Button>
        ) : (
          <Button key="finish" type="primary" loading={wizard.creating} disabled={wizard.creating} onClick={wizard.handleFinish}>
            完成创建
          </Button>
        ),
      ]}
    >
      <Steps current={wizard.step} style={{ marginBottom: 24 }} items={projectCreateStepItems} />

      {wizard.step === 0 ? (
        <ProjectInfoStep form={wizard.wizardForm} />
      ) : null}

      {wizard.step === 1 ? (
        <TemplateSelectStep
          normalizedTemplates={wizard.normalizedTemplates}
          selectedTemplateId={wizard.selectedTemplateId}
          setSelectedTemplateId={wizard.setSelectedTemplateId}
          templatesLoading={wizard.templatesLoading}
        />
      ) : null}

      {wizard.step === 2 ? (
        <PatientSelectStep
          patientLoading={wizard.patientLoading}
          patientRowIds={wizard.patientRowIds}
          patients={wizard.patients}
          selectedPatientIdSet={wizard.selectedPatientIdSet}
          togglePatientSelection={wizard.togglePatientSelection}
          toggleSelectAllPatients={wizard.toggleSelectAllPatients}
        />
      ) : null}
    </Modal>
  )
}

export default ProjectCreateWizardModal
