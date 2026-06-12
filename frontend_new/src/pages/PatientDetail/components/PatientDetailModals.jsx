import React from 'react'

import AiAssistantModal from './AiAssistantModal'
import BatchExtractionModal from './BatchExtractionModal'
import ChangeLogModal from './ChangeLogModal'
import ConflictResolveModal from './ConflictResolveModal'
import PatientEditModal from './PatientEditModal'
import PatientExportModal from './PatientExportModal'
import TaskCenterDrawer from './TaskCenterDrawer'
import UploadDocumentModal from './UploadDocumentModal'

export const PatientDetailModals = ({
  aiAssistant,
  batchExtraction,
  changeLog,
  conflictResolve,
  editPatient,
  exportPatient,
  taskCenter,
  token,
  uploadDocument,
}) => (
  <>
    <PatientEditModal {...editPatient} token={token} />
    <PatientExportModal {...exportPatient} />
    <UploadDocumentModal {...uploadDocument} />
    <BatchExtractionModal {...batchExtraction} />
    <AiAssistantModal {...aiAssistant} token={token} />
    <ConflictResolveModal {...conflictResolve} token={token} />
    <ChangeLogModal {...changeLog} />
    <TaskCenterDrawer {...taskCenter} token={token} />
  </>
)
