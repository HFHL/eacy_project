from datetime import datetime
import json
from pathlib import Path
from urllib.parse import quote
from typing import Any

import httpx

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import CurrentUser, get_current_user, uuid_user_id_or_none
from app.core.security import decode_access_token
from app.repositories.extraction_job_repository import ExtractionJobRepository, ExtractionRunRepository
from app.repositories.field_value_repository import FieldValueEvidenceRepository
from app.repositories.patient_repository import PatientRepository
from app.services.document_metadata_service import DocumentMetadataService
from app.services.document_service import DocumentService

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentUpdate(BaseModel):
    doc_type: str | None = Field(default=None, max_length=100)
    doc_subtype: str | None = Field(default=None, max_length=100)
    doc_title: str | None = Field(default=None, max_length=255)
    effective_at: datetime | None = None
    metadata_json: dict[str, Any] | None = None
    meta_status: str | None = Field(default=None, max_length=50)
    ocr_text: str | None = None
    ocr_payload_json: dict[str, Any] | None = None
    ocr_status: str | None = Field(default=None, max_length=50)


class DocumentArchiveRequest(BaseModel):
    patient_id: str
    create_extraction_job: bool = True


class DocumentStatusesRequest(BaseModel):
    document_ids: list[str] = Field(default_factory=list, max_length=200)


class DocumentBatchArchiveRequest(BaseModel):
    document_ids: list[str] = Field(..., min_length=1)
    patient_id: str
    create_extraction_job: bool = True


class LinkedPatientSummary(BaseModel):
    patient_id: str
    patient_name: str
    patient_code: str | None = None
    gender: str | None = None
    age: int | None = None
    department: str | None = None
    main_diagnosis: str | None = None


class ExtractionRecordItem(BaseModel):
    """单条抽取记录，专供前端 DocumentDetailModal 的"抽取记录"区使用。"""

    extraction_id: str
    job_type: str | None = None
    status: str | None = None
    created_at: datetime | None = None
    extracted_ehr_data: dict[str, Any] = Field(default_factory=dict)
    is_merged: bool = False
    merged_at: datetime | None = None
    conflict_count: int = 0


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str | None = None
    original_filename: str
    file_ext: str | None = None
    mime_type: str | None = None
    file_size: int | None = None
    storage_provider: str | None = None
    storage_path: str | None = None
    file_url: str | None = None
    status: str
    ocr_status: str | None = None
    ocr_text: str | None = None
    ocr_payload_json: dict[str, Any] | None = None
    parsed_content: str | None = None
    parsed_data: dict[str, Any] | None = None
    content_list: list[dict[str, Any]] = Field(default_factory=list)
    meta_status: str | None = None
    metadata_json: dict[str, Any] | None = None
    document_metadata_summary: dict[str, Any] | None = None
    doc_type: str | None = None
    doc_subtype: str | None = None
    doc_title: str | None = None
    effective_at: datetime | None = None
    uploaded_by: str | None = None
    archived_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    linked_patients: list[LinkedPatientSummary] = Field(default_factory=list)
    extraction_records: list[ExtractionRecordItem] = Field(default_factory=list)
    extraction_count: int = 0


class BoundPatientSummary(BaseModel):
    """文档已绑定患者的轻量摘要，供文档列表"绑定摘要"列展示。"""

    patient_id: str
    name: str | None = None
    gender: str | None = None
    age: int | None = None


class DocumentSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str | None = None
    original_filename: str
    file_ext: str | None = None
    mime_type: str | None = None
    file_size: int | None = None
    storage_provider: str | None = None
    storage_path: str | None = None
    file_url: str | None = None
    status: str
    ocr_status: str | None = None
    meta_status: str | None = None
    extract_status: str | None = None
    metadata_json: dict[str, Any] | None = None
    document_metadata_summary: dict[str, Any] | None = None
    doc_type: str | None = None
    doc_subtype: str | None = None
    doc_title: str | None = None
    effective_at: datetime | None = None
    uploaded_by: str | None = None
    archived_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    bound_patient: BoundPatientSummary | None = None


class DocumentListResponse(BaseModel):
    items: list[DocumentSummaryResponse]
    total: int
    page: int
    page_size: int


class DocumentStatusesResponse(BaseModel):
    items: list[DocumentSummaryResponse]


class DocumentBatchArchiveResponse(BaseModel):
    items: list[DocumentResponse]
    total: int


class EvidenceImpactField(BaseModel):
    """单个被影响的字段。"""

    code: str
    title: str


class DocumentEvidenceImpactResponse(BaseModel):
    """文档作为字段证据时的影响范围。

    供"删除前确认弹窗"使用：当 evidence_count > 0 时，前端需提示用户该文档
    已作为这些字段的来源；删除后病历字段值仍保留，但来源标记为"已删除文档"。
    """

    document_id: str
    evidence_count: int = 0
    fields: list[EvidenceImpactField] = Field(default_factory=list)


class DocumentArchiveTreeResponse(BaseModel):
    total: int
    counts: dict[str, int]
    todo_groups: list[dict[str, Any]]
    archived_patients: list[dict[str, Any]]


class DocumentGroupDocumentsResponse(BaseModel):
    items: list[DocumentSummaryResponse]
    group: dict[str, Any]
    match_info: dict[str, Any]
    pagination: dict[str, Any]


class DocumentGroupArchiveResponse(BaseModel):
    archived_count: int
    failed_count: int = 0
    errors: list[dict[str, Any]] = Field(default_factory=list)
    archived_document_ids: list[str]


class DocumentPreviewUrlResponse(BaseModel):
    document_id: str
    url: str
    temp_url: str
    preview_url: str
    expires_in: int
    storage_provider: str | None = None
    mime_type: str | None = None
    file_name: str


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
        }
    )


async def build_extraction_records(document_id: str) -> list[dict[str, Any]]:
    """组装文档详情页"抽取记录"列表。

    每条记录对应一个 ExtractionJob：
      - extracted_ehr_data 取该 job 最新 ExtractionRun 的 parsed_output_json
      - is_merged / merged_at 由 field_value_events 聚合得出（review_status='accepted'）
      - conflict_count 暂留 0（前端 conflict_count > 0 时才展示冲突 Tag，不影响主流程）

    未关联到 document_id 的 job 自动被过滤（依赖列上的 idx_jobs_document 索引）。
    """
    job_repo = ExtractionJobRepository()
    run_repo = ExtractionRunRepository()
    jobs = await job_repo.list_by_document_id(document_id)
    if not jobs:
        return []

    job_ids = [str(job.id) for job in jobs]
    latest_runs = await run_repo.get_latest_run_by_job_ids(job_ids)
    # 注意：aggregate_merge_status_by_job_ids 定义在 ExtractionRunRepository 上（因为
    # 它走 ExtractionRun ↔ FieldValueEvent 这条链路），不要错挂到 job_repo。
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
                "status": job.status,
                "created_at": job.created_at,
                "extracted_ehr_data": parsed,
                "is_merged": bool(merge_info.get("is_merged")),
                "merged_at": merge_info.get("merged_at"),
                "conflict_count": 0,
            }
        )
    return records


async def build_linked_patients(document) -> list[dict[str, Any]]:
    """根据 document.patient_id 拉取一条 LinkedPatientSummary。

    目前每个文档至多绑定一个患者；保留 list 形式以便日后多绑定扩展。
    """
    patient_id = getattr(document, "patient_id", None)
    if not patient_id:
        return []
    from app.repositories import PatientRepository

    patient = await PatientRepository().get_active_by_id(str(patient_id))
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
    extract_status = None
    if extract_status_map is not None:
        extract_status = extract_status_map.get(str(document.id))
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
    repo = ExtractionJobRepository()
    return await repo.list_latest_extract_status_by_document_ids(document_ids)


async def build_bound_patient_map(documents) -> dict[str, BoundPatientSummary]:
    """批量回填文档列表的"已绑定患者摘要"。

    `DocumentSummaryResponse.bound_patient` 默认为 None；这里挑出 `document.patient_id`
    非空的记录，一次性按 id 拉回 `Patient`，构造 {patient_id: BoundPatientSummary}。
    没有绑定患者的文档自然查不到，渲染层按"未绑定"处理。
    """
    patient_ids = list({
        str(getattr(document, "patient_id", None))
        for document in documents
        if getattr(document, "patient_id", None)
    })
    if not patient_ids:
        return {}
    patients = await PatientRepository().list_by_ids(patient_ids)
    return {
        str(patient.id): BoundPatientSummary(
            patient_id=str(patient.id),
            name=patient.name,
            gender=patient.gender,
            age=patient.age,
        )
        for patient in patients
    }


def get_document_service() -> DocumentService:
    return DocumentService()


def get_document_metadata_service() -> DocumentMetadataService:
    return DocumentMetadataService()


def user_scope_id(current_user: CurrentUser) -> str | None:
    return uuid_user_id_or_none(current_user)


def current_user_from_payload(payload: dict[str, Any]) -> CurrentUser:
    user_id = payload.get("user_id") or payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token missing user identity",
        )
    return CurrentUser(
        id=str(user_id),
        username=str(payload.get("username") or payload.get("name") or user_id),
        role=str(payload.get("role") or "user"),
        permissions=list(payload.get("permissions") or []),
    )


async def get_stream_current_user(
    request: Request,
    access_token: str | None = Query(default=None),
) -> CurrentUser:
    if access_token:
        current_user = current_user_from_payload(decode_access_token(access_token))
        request.state.current_user = current_user
        return current_user
    return await get_current_user(request)


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    patient_id: str | None = Form(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.upload_document(file=file, patient_id=patient_id, uploaded_by=current_user.id)
    return document_response(document)


@router.get("/", response_model=DocumentListResponse)
@router.get("", response_model=DocumentListResponse, include_in_schema=False)
async def list_documents(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    patient_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentListResponse:
    documents, total = await service.list_documents(
        page=page,
        page_size=page_size,
        patient_id=patient_id,
        status=status_filter,
        uploaded_by=user_scope_id(current_user),
    )
    extract_status_map = await build_extract_status_map(documents)
    bound_patient_map = await build_bound_patient_map(documents)
    return DocumentListResponse(
        items=[
            document_summary_response(
                document,
                extract_status_map=extract_status_map,
                bound_patient_map=bound_patient_map,
            )
            for document in documents
        ],
        total=total,
        page=page,
        page_size=page_size,
    )




@router.get("/v2/tree", response_model=DocumentArchiveTreeResponse)
async def get_file_list_tree(
    refresh: bool = Query(default=False),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentArchiveTreeResponse:
    return DocumentArchiveTreeResponse.model_validate(await service.get_archive_tree(refresh=refresh, uploaded_by=user_scope_id(current_user)))


@router.post("/statuses", response_model=DocumentStatusesResponse)
async def get_document_statuses(
    payload: DocumentStatusesRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentStatusesResponse:
    documents = await service.list_documents_by_ids(payload.document_ids, uploaded_by=user_scope_id(current_user))
    extract_status_map = await build_extract_status_map(documents)
    bound_patient_map = await build_bound_patient_map(documents)
    return DocumentStatusesResponse(
        items=[
            document_summary_response(
                document,
                extract_status_map=extract_status_map,
                bound_patient_map=bound_patient_map,
            )
            for document in documents
        ]
    )


@router.get("/v2/groups/{group_id}/documents", response_model=DocumentGroupDocumentsResponse)
async def get_group_documents(
    group_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentGroupDocumentsResponse:
    payload = await service.get_archive_group_documents(group_id, uploaded_by=user_scope_id(current_user))
    extract_status_map = await build_extract_status_map(payload["items"])
    bound_patient_map = await build_bound_patient_map(payload["items"])
    items = [
        document_summary_response(
            document,
            extract_status_map=extract_status_map,
            bound_patient_map=bound_patient_map,
        )
        for document in payload["items"]
    ]
    return DocumentGroupDocumentsResponse(
        items=items,
        group=payload["group"],
        match_info=payload["match_info"],
        pagination=payload["pagination"],
    )


@router.post("/v2/groups/{group_id}/confirm-archive", response_model=DocumentGroupArchiveResponse)
async def confirm_group_archive(
    group_id: str,
    patient_id: str = Query(...),
    auto_merge_ehr: bool = Query(default=True),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentGroupArchiveResponse:
    documents = await service.archive_group_to_patient(
        group_id=group_id,
        patient_id=patient_id,
        requested_by=user_scope_id(current_user),
        create_extraction_job=auto_merge_ehr,
    )
    return DocumentGroupArchiveResponse(
        archived_count=len(documents),
        archived_document_ids=[document.id for document in documents],
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.get_document(document_id, uploaded_by=user_scope_id(current_user))
    if document is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    linked_patients = await build_linked_patients(document)
    extraction_records = await build_extraction_records(document_id)
    return document_response(
        document,
        linked_patients=linked_patients,
        extraction_records=extraction_records,
    )


@router.get("/{document_id}/preview-url", response_model=DocumentPreviewUrlResponse)
async def get_document_preview_url(
    document_id: str,
    expires_in: int = Query(default=3600, ge=1, le=86400),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentPreviewUrlResponse:
    payload = await service.get_preview_url(document_id, expires_in=expires_in, uploaded_by=user_scope_id(current_user))
    return DocumentPreviewUrlResponse.model_validate(payload)


async def stream_document_response(
    document_id: str,
    current_user: CurrentUser,
    service: DocumentService,
) -> StreamingResponse:
    document = await service.get_stream_document(document_id, uploaded_by=user_scope_id(current_user))
    preview = await service.get_preview_url(document_id, uploaded_by=user_scope_id(current_user))
    filename = Path(document.original_filename or document.file_name or "document.pdf").name
    content_type = document.mime_type or "application/pdf"
    if (document.file_ext or "").lower() == ".pdf":
        content_type = "application/pdf"

    async def iter_file():
        async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
            async with client.stream("GET", preview["temp_url"]) as upstream:
                upstream.raise_for_status()
                async for chunk in upstream.aiter_bytes():
                    if chunk:
                        yield chunk

    return StreamingResponse(
        iter_file(),
        media_type=content_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename, safe='')}",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{document_id}/stream")
async def stream_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_stream_current_user),
    service: DocumentService = Depends(get_document_service),
):
    return await stream_document_response(document_id, current_user, service)


@router.get("/{document_id}/pdf-stream")
async def pdf_stream_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_stream_current_user),
    service: DocumentService = Depends(get_document_service),
):
    return await stream_document_response(document_id, current_user, service)


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: str,
    payload: DocumentUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.update_document(document_id, **payload.model_dump(exclude_unset=True))
    return document_response(document)


@router.post("/{document_id}/ocr", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_document_ocr(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.queue_document_ocr(document_id, requested_by=user_scope_id(current_user))
    return document_response(document)


@router.post("/{document_id}/metadata", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_document_metadata(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentMetadataService = Depends(get_document_metadata_service),
) -> DocumentResponse:
    document = await service.queue_document_metadata(document_id)
    return document_response(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> Response:
    await service.delete_document(document_id, requested_by=user_scope_id(current_user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{document_id}/evidence-impact", response_model=DocumentEvidenceImpactResponse)
async def get_document_evidence_impact(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentEvidenceImpactResponse:
    """删除前查询该文档被字段证据引用的范围。

    前端在弹"确认删除"弹窗前调一次：
    - evidence_count == 0 → 普通删除文案
    - evidence_count > 0  → 提示影响的字段清单（删除后值保留、来源标记为"已删除文档"）
    """
    # 先做权限/存在性校验（沿用 service.get_document 的 scope 判断，找不到会 404）
    document = await service.get_document(document_id, uploaded_by=user_scope_id(current_user))
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    repo = FieldValueEvidenceRepository()
    summary = await repo.summarize_by_document_id(document_id)
    return DocumentEvidenceImpactResponse(
        document_id=document_id,
        evidence_count=summary.get("evidence_count", 0),
        fields=[EvidenceImpactField(**f) for f in summary.get("fields", [])],
    )


@router.post("/batch-archive", response_model=DocumentBatchArchiveResponse)
async def batch_archive_documents(
    payload: DocumentBatchArchiveRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentBatchArchiveResponse:
    documents = await service.batch_archive_to_patient(
        document_ids=payload.document_ids,
        patient_id=payload.patient_id,
        requested_by=user_scope_id(current_user),
        create_extraction_job=payload.create_extraction_job,
    )
    return DocumentBatchArchiveResponse(
        items=[document_response(document) for document in documents],
        total=len(documents),
    )


@router.post("/{document_id}/archive", response_model=DocumentResponse)
async def archive_document(
    document_id: str,
    payload: DocumentArchiveRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.archive_to_patient(
        document_id=document_id,
        patient_id=payload.patient_id,
        requested_by=user_scope_id(current_user),
        create_extraction_job=payload.create_extraction_job,
    )
    return document_response(document)


@router.post("/{document_id}/unarchive", response_model=DocumentResponse)
async def unarchive_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.unarchive_document(document_id, requested_by=user_scope_id(current_user))
    return document_response(document)
