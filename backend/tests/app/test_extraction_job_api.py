from datetime import datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.v1.extraction.router import get_extraction_service
from app.services.extraction_service import ExtractionConflictError, ExtractionNotFoundError
from app.server import app


client = TestClient(app)


class FakeExtractionService:
    def __init__(self):
        self.jobs = {}
        self.runs = {}

    async def create_and_process_job(self, **params):
        job = SimpleNamespace(
            id="job-1",
            status="completed",
            progress=100,
            started_at=datetime(2026, 1, 1),
            finished_at=datetime(2026, 1, 1),
            created_at=datetime(2026, 1, 1),
            updated_at=None,
            error_message=None,
            **params,
        )
        self.jobs[job.id] = job
        self.runs[job.id] = [
            SimpleNamespace(
                id="run-1",
                job_id=job.id,
                run_no=1,
                status="completed",
                model_name="MockExtractor",
                prompt_version="mock-v1",
                input_snapshot_json={"job_type": job.job_type},
                raw_output_json={"fields": [{"field_path": "basic.demographics.gender"}]},
                parsed_output_json={"fields": [{"field_path": "basic.demographics.gender"}]},
                validation_status="valid",
                error_message=None,
                started_at=datetime(2026, 1, 1),
                finished_at=datetime(2026, 1, 1),
                created_at=datetime(2026, 1, 1),
            )
        ]
        return job

    async def create_planned_jobs(self, **params):
        first = await self.create_and_process_job(**{**params, "target_form_key": "basic.demographics"})
        second = await self.create_and_process_job(**{**params, "target_form_key": "basic.diagnosis"})
        second.id = "job-2"
        self.jobs[second.id] = second
        self.runs[second.id] = self.runs.pop("job-1") if "job-1" in self.runs and first.id != "job-1" else self.runs.get(second.id, [])
        return [first, second]

    async def get_job(self, job_id):
        return self.jobs.get(job_id)

    async def list_runs(self, job_id):
        if job_id not in self.jobs:
            raise ExtractionNotFoundError("Extraction job not found")
        return self.runs[job_id]

    async def cancel_job(self, job_id):
        job = self.jobs.get(job_id)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        if job.status == "completed":
            raise ExtractionConflictError("Completed extraction job cannot be cancelled")
        job.status = "cancelled"
        return job

    async def retry_job(self, job_id):
        job = self.jobs.get(job_id)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        job.status = "completed"
        self.runs[job_id].append(SimpleNamespace(**{**self.runs[job_id][0].__dict__, "id": "run-2", "run_no": 2}))
        return job

    async def delete_job(self, job_id):
        if job_id not in self.jobs:
            raise ExtractionNotFoundError("Extraction job not found")
        if self.runs.get(job_id):
            raise ExtractionConflictError("Extraction job has runs or field events and cannot be deleted")
        self.jobs[job_id].status = "cancelled"


def test_extraction_job_create_query_runs_retry_and_delete_policy():
    fake_service = FakeExtractionService()
    app.dependency_overrides[get_extraction_service] = lambda: fake_service

    create_response = client.post(
        "/api/v1/extraction-jobs",
        json={
            "job_type": "patient_ehr",
            "patient_id": "patient-1",
            "document_id": "document-1",
            "context_id": "context-1",
            "schema_version_id": "schema-version-1",
            "input_json": {
                "mock_fields": [
                    {
                        "field_key": "gender",
                        "field_path": "basic.demographics.gender",
                        "value_type": "text",
                        "value_text": "female",
                    }
                ]
            },
        },
    )
    assert create_response.status_code == 202
    job = create_response.json()
    assert job["status"] == "completed"
    assert job["progress"] == 100

    detail_response = client.get(f"/api/v1/extraction-jobs/{job['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["id"] == job["id"]

    runs_response = client.get(f"/api/v1/extraction-jobs/{job['id']}/runs")
    assert runs_response.status_code == 200
    assert runs_response.json()[0]["model_name"] == "MockExtractor"
    assert runs_response.json()[0]["parsed_output_json"]["fields"][0]["field_path"] == "basic.demographics.gender"

    retry_response = client.post(f"/api/v1/extraction-jobs/{job['id']}/retry")
    assert retry_response.status_code == 200
    assert len(fake_service.runs[job["id"]]) == 2

    plan_response = client.post(
        "/api/v1/extraction-jobs/plan",
        json={
            "job_type": "project_crf",
            "patient_id": "patient-1",
            "document_id": "document-1",
            "project_id": "project-1",
            "project_patient_id": "project-patient-1",
            "context_id": "context-1",
            "schema_version_id": "schema-version-1",
        },
    )
    assert plan_response.status_code == 202
    assert len(plan_response.json()["jobs"]) == 2

    delete_response = client.delete(f"/api/v1/extraction-jobs/{job['id']}")
    assert delete_response.status_code == 409

    app.dependency_overrides.clear()
