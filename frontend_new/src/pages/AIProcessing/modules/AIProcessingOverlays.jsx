import CreatePatientDrawer from '../../../components/Patient/CreatePatientDrawer'
import DocumentDetailModal from '../../PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal'
import { getConfidenceDisplay } from './confidenceDisplay'
import DocumentPreviewDrawer from './DocumentPreviewDrawer'
import ExtractionResultModal from './ExtractionResultModal'
import PatientMatchModal from './PatientMatchModal'

const AIProcessingOverlays = ({
  createPatientProps,
  detailProps,
  extractionResultProps,
  navigate,
  patientMatchProps,
  previewProps,
}) => (
  <>
    {detailProps.selectedDocumentForDetail && (
      <DocumentDetailModal
        visible={detailProps.detailModalVisible}
        document={detailProps.selectedDocumentForDetail}
        patientId={detailProps.selectedDocumentForDetail.patientId}
        onClose={detailProps.handleDetailModalClose}
        onSave={detailProps.handleFieldSave}
        onReExtract={detailProps.handleReExtract}
        onChangePatient={detailProps.handleChangePatient}
        onArchivePatient={detailProps.handleArchivePatient}
        onDownload={detailProps.handleDownload}
        onViewOcr={detailProps.handleViewOcr}
        onExtractSuccess={detailProps.handleExtractSuccess}
        showTaskStatus={true}
      />
    )}

    <PatientMatchModal
      {...patientMatchProps}
      getConfidenceDisplay={getConfidenceDisplay}
    />

    <DocumentPreviewDrawer
      {...previewProps}
      onOpenOcr={(documentId) => navigate(`/document/ocr-viewer/${documentId}`)}
    />

    <ExtractionResultModal {...extractionResultProps} />

    <CreatePatientDrawer {...createPatientProps} />
  </>
)

export default AIProcessingOverlays
