from app.repositories import (
    DataContextRepository,
    DocumentRepository,
    FieldCurrentValueRepository,
    FieldValueEventRepository,
    FieldValueEvidenceRepository,
    PatientRepository,
    ProjectPatientRepository,
    ProjectTemplateBindingRepository,
    RecordInstanceRepository,
    ResearchProjectRepository,
)
from app.services.research_project_context_service import ResearchProjectContextMixin
from app.services.research_project_core_service import ResearchProjectCoreMixin
from app.services.research_project_enrollment_service import ResearchProjectEnrollmentMixin
from app.services.research_project_errors import (
    ResearchProjectConflictError,
    ResearchProjectNotFoundError,
    ResearchProjectServiceError,
)
from app.services.research_project_evidence_service import ResearchProjectEvidenceMixin
from app.services.research_project_field_mutation_service import ResearchProjectFieldMutationMixin
from app.services.research_project_path_service import ResearchProjectPathMixin
from app.services.research_project_patient_service import ResearchProjectPatientMixin
from app.services.research_project_record_service import ResearchProjectRecordMixin
from app.services.research_project_template_service import ResearchProjectTemplateMixin
from app.services.schema_service import SchemaService
from app.services.structured_value_service import StructuredValueService


class ResearchProjectService(
    ResearchProjectCoreMixin,
    ResearchProjectTemplateMixin,
    ResearchProjectPatientMixin,
    ResearchProjectEnrollmentMixin,
    ResearchProjectContextMixin,
    ResearchProjectEvidenceMixin,
    ResearchProjectPathMixin,
    ResearchProjectFieldMutationMixin,
    ResearchProjectRecordMixin,
):
    def __init__(
        self,
        project_repository: ResearchProjectRepository | None = None,
        project_patient_repository: ProjectPatientRepository | None = None,
        binding_repository: ProjectTemplateBindingRepository | None = None,
        context_repository: DataContextRepository | None = None,
        patient_repository: PatientRepository | None = None,
        document_repository: DocumentRepository | None = None,
        record_repository: RecordInstanceRepository | None = None,
        schema_service: SchemaService | None = None,
        value_service: StructuredValueService | None = None,
        current_repository: FieldCurrentValueRepository | None = None,
        event_repository: FieldValueEventRepository | None = None,
        evidence_repository: FieldValueEvidenceRepository | None = None,
    ):
        self.project_repository = project_repository or ResearchProjectRepository()
        self.project_patient_repository = project_patient_repository or ProjectPatientRepository()
        self.binding_repository = binding_repository or ProjectTemplateBindingRepository()
        self.context_repository = context_repository or DataContextRepository()
        self.patient_repository = patient_repository or PatientRepository()
        self.document_repository = document_repository or DocumentRepository()
        self.record_repository = record_repository or RecordInstanceRepository()
        self.schema_service = schema_service or SchemaService()
        self.value_service = value_service or StructuredValueService()
        self.current_repository = current_repository or FieldCurrentValueRepository()
        self.event_repository = event_repository or FieldValueEventRepository()
        self.evidence_repository = evidence_repository or FieldValueEvidenceRepository()
