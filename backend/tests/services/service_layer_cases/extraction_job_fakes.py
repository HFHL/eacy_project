from .common import *

class FakeExtractionJobRepository:
    def __init__(self, job=None):
        self.job = job
        self.created = []
        self.saved = []

    async def create(self, params):
        job = SimpleNamespace(id=f"job-{len(self.created) + 1}", **params)
        self.created.append(job)
        self.job = job
        return job

    async def get_by_id(self, job_id):
        return self.job if self.job is not None and self.job.id == job_id else None

    async def save(self, job):
        self.saved.append(SimpleNamespace(**job.__dict__))
        return job

    async def list_shareable_schema_jobs_for_document(self, **_kwargs):
        return []


class FakeExtractionRunRepository:
    def __init__(self):
        self.runs = []
        self.saved = []

    async def list_by_job(self, job_id):
        return [run for run in self.runs if run.job_id == job_id]

    async def create(self, params):
        run = SimpleNamespace(id=f"run-{len(self.runs) + 1}", **params)
        self.runs.append(run)
        return run

    async def save(self, run):
        self.saved.append(SimpleNamespace(**run.__dict__))
        return run
