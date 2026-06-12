import React from 'react'
import AdvancedFilterModal from './AdvancedFilterModal'
import DataExportModal from './DataExportModal'
import AddPatientModal from './AddPatientModal'
import BatchImportModal from './BatchImportModal'
import ImportPatientDetailModal from './ImportPatientDetailModal'

const PatientPoolModals = ({
  advancedFilter,
  exportModal,
  addPatient,
  batchImport,
  importPatientDetail,
}) => (
  <>
    <AdvancedFilterModal {...advancedFilter} />
    <DataExportModal {...exportModal} />
    <AddPatientModal {...addPatient} />
    <BatchImportModal {...batchImport} />
    <ImportPatientDetailModal {...importPatientDetail} />
  </>
)

export default PatientPoolModals
