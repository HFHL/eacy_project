from .common import *
from .extraction_job_fakes import *

class FakeDocumentRepository:
    def __init__(self, document):
        self.document = document

    async def get_visible_by_id(self, document_id, **_kwargs):
        return self.document if self.document.id == document_id else None


class FakeSchemaServiceForExtraction:
    def __init__(self, schema_json):
        self.schema_json = schema_json

    async def get_version(self, version_id):
        return SimpleNamespace(id=version_id, schema_json=self.schema_json)


class FakeContextRepositoryForExtraction:
    def __init__(self, context):
        self.context = context

    async def get_by_id(self, context_id):
        return self.context if self.context.id == context_id else None


class FakeEhrServiceForExtraction:
    def __init__(self, *, context, schema_json):
        self.context_repository = FakeContextRepositoryForExtraction(context)
        self.schema_service = FakeSchemaServiceForExtraction(schema_json)


class FakeSchemaExtractor:
    def __init__(self):
        self.calls = []

    def extract(self, *, text, fields, document_id, document=None, **kwargs):
        self.calls.append({"text": text, "fields": fields, "document_id": document_id, "document": document})
        return {
            "extractor": "FakeSchemaExtractor",
            "document_id": document_id,
            "raw_output": {"fields": []},
            "fields": [
                {
                    "field_key": fields[0].field_key,
                    "field_path": fields[0].field_path,
                    "field_title": fields[0].field_title,
                    "record_form_key": fields[0].record_form_key,
                    "value_type": "text",
                    "value_text": "男",
                    "quote_text": "性别：男",
                }
            ],
            "validation_status": "valid",
            "validation_log": [],
            "attempt_count": 1,
        }


class FakeSharedClaudeCodeExtractor:
    def __init__(self):
        self.calls = []

    async def extract_async(self, *, text, fields, schema_json, document_id, document=None, job=None, **_kwargs):
        self.calls.append(
            {
                "text": text,
                "fields": fields,
                "schema_json": schema_json,
                "document_id": document_id,
                "job": job,
            }
        )
        return {
            "extractor": "FakeSharedClaudeCodeExtractor",
            "document_id": document_id,
            "raw_output": {"fields": [{"field_path": field.field_path} for field in fields]},
            "fields": [
                {
                    "field_key": field.field_key,
                    "field_path": field.field_path,
                    "field_title": field.field_title,
                    "record_form_key": field.record_form_key,
                    "record_form_title": field.record_form_title,
                    "value_type": "text",
                    "value_text": "男",
                    "confidence": 0.91,
                    "quote_text": "性别：男",
                }
                for field in fields
            ],
            "validation_status": "valid",
            "validation_log": [],
            "validation_warnings": [],
            "discarded_fields": [],
            "attempt_count": 1,
        }


class FakeMultiExtractionJobRepository(FakeExtractionJobRepository):
    def __init__(self, jobs):
        super().__init__(jobs[0] if jobs else None)
        self.jobs = {job.id: job for job in jobs}

    async def get_by_id(self, job_id):
        return self.jobs.get(job_id)

    async def save(self, job):
        self.jobs[job.id] = job
        self.saved.append(SimpleNamespace(**job.__dict__))
        return job

    async def list_shareable_schema_jobs_for_document(
        self,
        *,
        document_id,
        requested_by,
        exclude_job_id,
        statuses=("pending", "queued"),
        **_kwargs,
    ):
        return [
            job
            for job in self.jobs.values()
            if job.id != exclude_job_id
            and job.document_id == document_id
            and job.status in statuses
            and job.requested_by == requested_by
        ]


class FakeSchemaServiceForExtractionMap:
    def __init__(self, schema_by_version):
        self.schema_by_version = schema_by_version

    async def get_version(self, version_id):
        schema_json = self.schema_by_version.get(version_id)
        return SimpleNamespace(id=version_id, schema_json=schema_json) if schema_json is not None else None


class FakeContextRepositoryForExtractionMap:
    def __init__(self, contexts):
        self.contexts = {context.id: context for context in contexts}

    async def get_by_id(self, context_id):
        return self.contexts.get(context_id)


class FakeEhrServiceForExtractionMap:
    def __init__(self, *, contexts, schema_by_version):
        self.context_repository = FakeContextRepositoryForExtractionMap(contexts)
        self.schema_service = FakeSchemaServiceForExtractionMap(schema_by_version)


def project_schema_json():
    return {
        "properties": {
            "basic": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "properties": {
                            "gender": {"type": "string", "x-display-name": "性别", "enum": ["男", "女"]},
                            "age": {"type": "number", "x-display-name": "年龄"},
                        },
                    },
                    "diagnosis": {
                        "type": "object",
                        "x-sources": {"secondary": ["病案首页"]},
                        "properties": {"name": {"type": "string", "x-display-name": "诊断"}},
                    },
                }
            }
        }
    }
