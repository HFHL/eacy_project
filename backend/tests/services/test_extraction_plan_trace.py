from app.services.extraction_plan_trace import build_folder_plan_json, document_trace_terms


class FakeDocument:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", "doc-1")
        self.file_name = kwargs.get("file_name", "test.pdf")
        self.original_filename = kwargs.get("original_filename", "test.pdf")
        self.doc_type = kwargs.get("doc_type", "病案首页")
        self.doc_subtype = None
        self.document_type = None
        self.document_sub_type = None
        self.doc_title = None
        self.metadata_json = kwargs.get("metadata_json")
        self.ocr_status = "completed"


class FakeJob:
    def __init__(self, *, document_id: str, target_form_key: str | None, job_id: str, input_json=None):
        self.id = job_id
        self.document_id = document_id
        self.target_form_key = target_form_key
        self.input_json = input_json or {}


def test_document_trace_terms_includes_doc_type():
    doc = FakeDocument(doc_type="病案首页", metadata_json={"文档类型": "首页"})
    terms = document_trace_terms(doc)
    assert "病案首页" in terms


def test_build_folder_plan_json_marks_skipped_document():
    doc = FakeDocument(id="doc-skip")
    plan = build_folder_plan_json(
        options={"mode": "incremental", "target_form_keys": []},
        schema_version_id="schema-v1",
        source_tag="patient_ehr_folder_update",
        documents_total=1,
        eligible_documents=[doc],
        pending_documents=[doc],
        already_extracted_document_ids=set(),
        jobs=[],
        skipped=[{"document_id": "doc-skip", "reason": "no primary source matched"}],
        schema_json={"properties": {}},
    )
    assert plan["stats"]["skipped_documents"] == 1
    skipped_entry = next(item for item in plan["documents"] if item["document_id"] == "doc-skip")
    assert skipped_entry["status"] == "skipped"


def test_build_folder_plan_json_maps_multi_form_job_to_each_form():
    doc = FakeDocument(id="doc-1", doc_type="病案首页")
    schema_json = {
        "properties": {
            "basic": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"gender": {"type": "string"}},
                    },
                    "diagnosis": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"name": {"type": "string"}},
                    },
                }
            }
        }
    }

    plan = build_folder_plan_json(
        options={"mode": "incremental", "target_form_keys": []},
        schema_version_id="schema-v1",
        source_tag="patient_ehr_folder_update",
        documents_total=1,
        eligible_documents=[doc],
        pending_documents=[doc],
        already_extracted_document_ids=set(),
        jobs=[
            FakeJob(
                document_id="doc-1",
                target_form_key=None,
                job_id="job-1",
                input_json={"form_keys": ["basic.demographics", "basic.diagnosis"]},
            )
        ],
        skipped=[],
        schema_json=schema_json,
    )

    forms = plan["documents"][0]["forms"]
    assert [form["target_form_key"] for form in forms] == ["basic.demographics", "basic.diagnosis"]
    assert {form["job_id"] for form in forms} == {"job-1"}


def test_build_folder_plan_json_marks_full_schema_job_without_form_keys():
    doc = FakeDocument(id="doc-1", doc_type="病程记录")
    plan = build_folder_plan_json(
        options={"mode": "incremental", "target_form_keys": []},
        schema_version_id="schema-v1",
        source_tag="project_crf_folder_update",
        documents_total=1,
        eligible_documents=[doc],
        pending_documents=[doc],
        already_extracted_document_ids=set(),
        jobs=[
            FakeJob(
                document_id="doc-1",
                target_form_key=None,
                job_id="job-1",
                input_json={
                    "source": "project_crf_folder_update",
                    "all_schema": True,
                    "match_role": "full_schema",
                },
            )
        ],
        skipped=[],
        schema_json={"properties": {}},
    )

    document_entry = plan["documents"][0]
    assert document_entry["status"] == "planned"
    assert document_entry["forms"] == [
        {
            "target_form_key": None,
            "form_title": "全部表单",
            "match_role": "full_schema",
            "reason": "document scheduled for full schema extraction",
            "job_id": "job-1",
            "status": "planned",
        }
    ]
