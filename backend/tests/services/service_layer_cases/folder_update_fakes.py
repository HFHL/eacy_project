from .common import *
from .extraction_job_fakes import *
from .schema_extraction_fakes import *

class FakePatientEhrServiceForFolderUpdate:
    def __init__(self, *, context, schema_json):
        self.context_repository = FakeContextRepositoryForExtraction(context)
        self.patient_repository = FakePatientRepository()
        self.schema_service = FakeSchemaServiceForExtraction(schema_json)
        self.context = context
        self.schema_json = schema_json

    async def get_patient_ehr(self, patient_id, created_by=None, **_kwargs):
        return {"context": self.context, "schema": self.schema_json, "records": [], "current_values": {}}


class FakePatientDocumentsRepository:
    def __init__(self, documents):
        for document in documents:
            if not hasattr(document, "file_name"):
                document.file_name = getattr(document, "original_filename", None)
        self.documents = documents
        self.list_by_patient_calls = []

    async def list_by_patient(self, patient_id, *, limit=100, **kwargs):
        self.list_by_patient_calls.append({"patient_id": patient_id, "limit": limit, **kwargs})
        return [document for document in self.documents if document.patient_id == patient_id]

    async def get_visible_by_id(self, document_id, **_kwargs):
        return next((document for document in self.documents if document.id == document_id), None)


class FakeExtractionJobRepositoryWithExisting(FakeExtractionJobRepository):
    def __init__(self, existing_jobs=None):
        super().__init__()
        self.existing_jobs = existing_jobs or []

    async def list_by_patient_documents(self, *, patient_id, document_ids):
        return [job for job in self.existing_jobs if job.patient_id == patient_id and job.document_id in document_ids]


async def noop_commit_pending_jobs_before_enqueue():
    return None


class FakeTaskProgressService:
    def __init__(self):
        self.batches: list[dict[str, Any]] = []
        self.items: list[dict[str, Any]] = []

    async def create_batch(self, **params):
        batch = SimpleNamespace(id=f"batch-{len(self.batches) + 1}", **params)
        self.batches.append(batch)
        return batch

    async def persist_plan_snapshot(self, batch_id, plan_json):
        batch = next((entry for entry in self.batches if entry.id == batch_id), None)
        if batch is not None:
            batch.plan_json = plan_json
        return batch

    async def create_item_for_job(self, *, batch_id=None, task_type, job, **_kwargs):
        item = SimpleNamespace(
            id=f"item-{len(self.items) + 1}",
            batch_id=batch_id,
            task_type=task_type,
            extraction_job_id=job.id,
            target_form_key=job.target_form_key,
            status="created",
            progress=int(job.progress or 0),
            stage=None,
            stage_label=None,
            message=None,
            error_message=None,
            started_at=None,
            finished_at=None,
        )
        self.items.append(item)
        return item

    async def ensure_item_for_job(self, *, job, batch_id=None, task_type=None, **_kwargs):
        existing = next((item for item in self.items if item.extraction_job_id == job.id), None)
        if existing is not None:
            return existing
        return await self.create_item_for_job(batch_id=batch_id, task_type=task_type or job.job_type, job=job)

    async def aggregate_batch(self, batch_id):
        batch = next((entry for entry in self.batches if entry.id == batch_id), None)
        return batch

    async def mark_job_queued(self, job_id, **_kwargs):
        return None

    async def mark_job_waiting_for_scheduler(self, job, **_kwargs):
        return None

    async def update_job_progress(self, job_or_id, **_kwargs):
        return None

    async def mark_job_failed(self, job, **_kwargs):
        return None

    async def mark_job_succeeded(self, job, **_kwargs):
        return None


async def noop_enqueue_extraction_task(job_id):
    return None


async def noop_attach_async_task_tracking_for_job(**kwargs):
    return "batch-test-1"


def disable_extraction_enqueue(service):
    service.task_progress_service = FakeTaskProgressService()
    service._enqueue_extraction_task = noop_enqueue_extraction_task
    service._commit_pending_jobs_before_enqueue = noop_commit_pending_jobs_before_enqueue
    service._attach_async_task_tracking_for_job = noop_attach_async_task_tracking_for_job
    return service
