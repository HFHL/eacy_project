from __future__ import annotations

import json
from typing import Any

from app.repositories.extraction_job_repository import ExtractionJobRepository, ExtractionRunRepository
from app.repositories.patient_repository import PatientRepository
from app.services.document_preview_utils import document_uses_ocr_page_preview, get_ocr_page_count

from .schemas import BoundPatientSummary, DocumentResponse, DocumentSummaryResponse


def build_content_list(ocr_payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(ocr_payload, dict):
        return []

    content_list: list[dict[str, Any]] = []
    for index, block in enumerate(ocr_payload.get("blocks") or []):
        if not isinstance(block, dict):
            continue

        raw_type = block.get("type")
        block_type = "table" if raw_type == "table" or block.get("table_id") else "text"
        if raw_type == "image":
            block_type = "image"

        page_no = block.get("page_no") or 1
        try:
            page_idx = max(int(page_no) - 1, 0)
        except (TypeError, ValueError):
            page_idx = 0

        content_list.append(
            {
                "id": block.get("block_id") or f"block-{index + 1}",
                "type": block_type,
                "page_idx": page_idx,
                "text": block.get("text") or block.get("markdown") or "",
                "bbox": block.get("polygon"),
                "table_body": block.get("text") if block_type == "table" else None,
                "text_level": block.get("text_level"),
            }
        )
    return content_list


def document_response(
    document,
    *,
    linked_patients: list[dict[str, Any]] | None = None,
    extraction_records: list[dict[str, Any]] | None = None,
) -> DocumentResponse:
    payload = document.ocr_payload_json if isinstance(document.ocr_payload_json, dict) else None
    metadata_json = document.metadata_json if isinstance(document.metadata_json, dict) else None
    parsed_content = getattr(document, "parsed_content", None)
    if parsed_content is None and payload is not None:
        parsed_content = json.dumps(payload, ensure_ascii=False)

    records = extraction_records or []
    uses_ocr_pages = document_uses_ocr_page_preview(document)
    ocr_page_count = get_ocr_page_count(payload) if uses_ocr_pages else None
    preview_source = "ocr_page" if uses_ocr_pages and ocr_page_count else "native"
    return DocumentResponse.model_validate(
        {
            **document.__dict__,
            "metadata_json": metadata_json,
            "document_metadata_summary": build_document_metadata_summary(metadata_json),
            "parsed_content": parsed_content,
            "parsed_data": getattr(document, "parsed_data", None) or payload,
            "content_list": build_content_list(payload),
            "linked_patients": linked_patients or [],
            "extraction_records": records,
            "extraction_count": len(records),
            "preview_source": preview_source if uses_ocr_pages else "native",
            "ocr_page_count": ocr_page_count,
        }
    )


async def build_extraction_records(document_id: str) -> list[dict[str, Any]]:
    job_repo = ExtractionJobRepository()
    run_repo = ExtractionRunRepository()
    jobs = await job_repo.list_by_document_id(document_id)
    if not jobs:
        return []

    job_ids = [str(job.id) for job in jobs]
    latest_runs = await run_repo.get_latest_run_by_job_ids(job_ids)
    merge_map = await run_repo.aggregate_merge_status_by_job_ids(job_ids)

    records: list[dict[str, Any]] = []
    for job in jobs:
        job_id = str(job.id)
        run = latest_runs.get(job_id)
        parsed = run.parsed_output_json if run and isinstance(run.parsed_output_json, dict) else {}
        merge_info = merge_map.get(job_id) or {}
        records.append(
            {
                "extraction_id": job_id,
                "job_type": job.job_type,
                "target_form_key": job.target_form_key,
                "target_mode": "targeted_section" if job.target_form_key else "full_document",
                "status": job.status,
                "created_at": job.created_at,
                "extracted_ehr_data": parsed,
                "is_merged": bool(merge_info.get("is_merged")),
                "merged_at": merge_info.get("merged_at"),
                "conflict_count": 0,
            }
        )
    return records


async def build_linked_patients(document, *, owner_id: str | None = None) -> list[dict[str, Any]]:
    patient_id = getattr(document, "patient_id", None)
    if not patient_id:
        return []

    patient = await PatientRepository().get_active_by_id(str(patient_id), owner_id=owner_id)
    if patient is None:
        return []
    return [
        {
            "patient_id": str(patient.id),
            "patient_name": patient.name,
            "patient_code": None,
            "gender": patient.gender,
            "age": patient.age,
            "department": patient.department,
            "main_diagnosis": patient.main_diagnosis,
        }
    ]


def document_summary_response(
    document,
    *,
    extract_status_map: dict[str, str] | None = None,
    bound_patient_map: dict[str, BoundPatientSummary] | None = None,
) -> DocumentSummaryResponse:
    metadata_json = document.metadata_json if isinstance(document.metadata_json, dict) else None
    extract_status = extract_status_map.get(str(document.id)) if extract_status_map is not None else None
    bound_patient: BoundPatientSummary | None = None
    if bound_patient_map is not None and document.patient_id:
        bound_patient = bound_patient_map.get(str(document.patient_id))
    return DocumentSummaryResponse.model_validate(
        {
            **document.__dict__,
            "metadata_json": metadata_json,
            "document_metadata_summary": build_document_metadata_summary(metadata_json),
            "extract_status": extract_status,
            "bound_patient": bound_patient,
        }
    )


def build_document_metadata_summary(metadata_json: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(metadata_json, dict):
        return None
    result = metadata_json.get("result")
    if not isinstance(result, dict):
        return None
    identifiers = result.get("唯一标识符") if isinstance(result.get("唯一标识符"), list) else []
    return {
        "patient_name": result.get("患者姓名"),
        "patient_gender": result.get("患者性别"),
        "patient_age": result.get("患者年龄"),
        "birth_date": result.get("出生日期"),
        "phone": result.get("联系电话"),
        "diagnosis": result.get("诊断"),
        "organization_name": result.get("机构名称"),
        "department": result.get("科室信息"),
        "document_type": result.get("文档类型"),
        "document_subtype": result.get("文档子类型"),
        "document_title": result.get("文档标题"),
        "effective_date": result.get("文档生效日期"),
        "identifiers": identifiers,
    }


async def build_extract_status_map(documents) -> dict[str, str]:
    document_ids = [str(document.id) for document in documents if getattr(document, "id", None)]
    if not document_ids:
        return {}
    return await ExtractionJobRepository().list_latest_extract_status_by_document_ids(document_ids)


async def build_bound_patient_map(
    documents,
    *,
    owner_id: str | None = None,
) -> dict[str, BoundPatientSummary]:
    patient_ids = list(
        {
            str(getattr(document, "patient_id", None))
            for document in documents
            if getattr(document, "patient_id", None)
        }
    )
    if not patient_ids:
        return {}
    patients = await PatientRepository().list_by_ids(patient_ids, owner_id=owner_id)
    return {
        str(patient.id): BoundPatientSummary(
            patient_id=str(patient.id),
            name=patient.name,
            gender=patient.gender,
            age=patient.age,
        )
        for patient in patients
    }
