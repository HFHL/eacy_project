from app.repositories import (
    DataContextRepository,
    FieldCurrentValueRepository,
    FieldValueEventRepository,
    FieldValueEvidenceRepository,
    PatientRepository,
    RecordInstanceRepository,
)
from app.services.ehr_context_service import EhrContextMixin
from app.services.ehr_evidence_service import EhrEvidenceMixin
from app.services.ehr_field_mutation_service import EhrFieldMutationMixin
from app.services.ehr_record_service import EhrRecordMixin
from app.services.schema_service import SchemaService
from app.services.structured_value_service import StructuredValueService


class EhrService(
    EhrContextMixin,
    EhrEvidenceMixin,
    EhrFieldMutationMixin,
    EhrRecordMixin,
):
    def __init__(
        self,
        context_repository: DataContextRepository | None = None,
        record_repository: RecordInstanceRepository | None = None,
        patient_repository: PatientRepository | None = None,
        schema_service: SchemaService | None = None,
        value_service: StructuredValueService | None = None,
        current_repository: FieldCurrentValueRepository | None = None,
        event_repository: FieldValueEventRepository | None = None,
        evidence_repository: FieldValueEvidenceRepository | None = None,
    ):
        self.context_repository = context_repository or DataContextRepository()
        self.record_repository = record_repository or RecordInstanceRepository()
        self.patient_repository = patient_repository or PatientRepository()
        self.schema_service = schema_service or SchemaService()
        self.value_service = value_service or StructuredValueService()
        self.current_repository = current_repository or FieldCurrentValueRepository()
        self.event_repository = event_repository or FieldValueEventRepository()
        self.evidence_repository = evidence_repository or FieldValueEvidenceRepository()
