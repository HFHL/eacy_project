from app.repositories import DocumentRepository, ExtractionJobRepository, ExtractionRunRepository, RecordInstanceRepository
from app.services.agent import ClaudeCodeEhrExtractor
from app.services.document_text_extractor import extract_document_text  # re-exported for tests/patching
from app.services.ehr_service import EhrService
from app.services.extraction_access_service import ExtractionAccessMixin
from app.services.extraction_errors import (
    ExtractionCancelledError,
    ExtractionConflictError,
    ExtractionNotFoundError,
    ExtractionServiceError,
    ExtractionTargetValidationError,
)
from app.services.extraction_evidence_builder_service import ExtractionEvidenceBuilderMixin
from app.services.extraction_executor_service import ExtractionExecutorMixin
from app.services.extraction_folder_helpers import ExtractionFolderHelpersMixin
from app.services.extraction_folder_patient_service import ExtractionFolderPatientMixin
from app.services.extraction_folder_project_batch_service import ExtractionFolderProjectBatchMixin
from app.services.extraction_folder_project_service import ExtractionFolderProjectMixin
from app.services.extraction_job_creation_service import ExtractionJobCreationMixin
from app.services.extraction_job_lifecycle_service import ExtractionJobLifecycleMixin
from app.services.extraction_output_record_service import ExtractionOutputRecordMixin
from app.services.extraction_planner import ExtractionPlanner
from app.services.extraction_process_runner_service import ExtractionProcessRunnerMixin
from app.services.extraction_process_state_service import ExtractionProcessStateMixin
from app.services.extraction_scheduler_service import ExtractionSchedulerMixin
from app.services.extraction_schema_scope_service import ExtractionSchemaScopeMixin
from app.services.extraction_shared_document_service import ExtractionSharedDocumentMixin
from app.services.extraction_snapshot_service import ExtractionSnapshotMixin
from app.services.extraction_success_persistence_service import ExtractionSuccessPersistenceMixin
from app.services.extraction_types import FolderUpdateOptions, MockExtractor, SharedDocumentExtractionState
from app.services.extraction_validation_service import ExtractionValidationMixin
from app.services.extraction_value_writer_service import ExtractionValueWriterMixin
from app.services.llm_ehr_extractor import LlmEhrExtractor
from app.services.simple_ehr_extractor import SimpleEhrExtractor
from app.services.structured_value_service import StructuredValueService
from app.services.task_progress_service import TaskProgressService
from core.db import release_db_connection  # re-exported for tests/patching


class ExtractionService(
    ExtractionAccessMixin,
    ExtractionFolderHelpersMixin,
    ExtractionJobCreationMixin,
    ExtractionFolderPatientMixin,
    ExtractionFolderProjectMixin,
    ExtractionFolderProjectBatchMixin,
    ExtractionSchedulerMixin,
    ExtractionJobLifecycleMixin,
    ExtractionValidationMixin,
    ExtractionSnapshotMixin,
    ExtractionSuccessPersistenceMixin,
    ExtractionProcessRunnerMixin,
    ExtractionProcessStateMixin,
    ExtractionSharedDocumentMixin,
    ExtractionSchemaScopeMixin,
    ExtractionExecutorMixin,
    ExtractionValueWriterMixin,
    ExtractionEvidenceBuilderMixin,
    ExtractionOutputRecordMixin,
):
    def __init__(
        self,
        job_repository: ExtractionJobRepository | None = None,
        run_repository: ExtractionRunRepository | None = None,
        record_repository: RecordInstanceRepository | None = None,
        document_repository: DocumentRepository | None = None,
        ehr_service: EhrService | None = None,
        value_service: StructuredValueService | None = None,
        extractor: MockExtractor | None = None,
        ehr_extractor: SimpleEhrExtractor | None = None,
        llm_ehr_extractor: LlmEhrExtractor | None = None,
        claude_code_ehr_extractor: ClaudeCodeEhrExtractor | None = None,
        extraction_planner: ExtractionPlanner | None = None,
        task_progress_service: TaskProgressService | None = None,
    ):
        self.job_repository = job_repository or ExtractionJobRepository()
        self.run_repository = run_repository or ExtractionRunRepository()
        self.record_repository = record_repository or RecordInstanceRepository()
        self.document_repository = document_repository or DocumentRepository()
        self.ehr_service = ehr_service or EhrService()
        self.value_service = value_service or StructuredValueService()
        self.extractor = extractor or MockExtractor()
        self.ehr_extractor = ehr_extractor or SimpleEhrExtractor()
        self._llm_ehr_extractor_injected = llm_ehr_extractor is not None
        self.llm_ehr_extractor = llm_ehr_extractor or LlmEhrExtractor()
        self.claude_code_ehr_extractor = claude_code_ehr_extractor or ClaudeCodeEhrExtractor()
        self.extraction_planner = extraction_planner or ExtractionPlanner()
        self.task_progress_service = task_progress_service or TaskProgressService()
