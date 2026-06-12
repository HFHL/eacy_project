from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models import Document, Patient


PENDING_PROCESS_GROUP_ID = "group_pending_process"


@dataclass
class DocumentIdentityInfo:
    document: Document
    doc_id: str
    identifiers: set[str]
    identifiers_list: list[str]
    name: str
    gender: str
    age: str
    birth_date: str
    hospital: str
    department: str
    phone: str
    address: str


@dataclass
class PatientIdentityInfo:
    id: str
    name: str
    identifiers: set[str]
    gender: str
    age: str
    birth_date: str
    phone: str
    address: str


def normalize_string(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def get_metadata_result(metadata_json: Any) -> dict[str, Any]:
    if not isinstance(metadata_json, dict):
        return {}
    result = metadata_json.get("result")
    if isinstance(result, dict):
        return result
    return metadata_json


def extract_identifier_values(raw_identifiers: Any) -> list[str]:
    if not isinstance(raw_identifiers, list):
        return []

    values: set[str] = set()
    for item in raw_identifiers:
        if isinstance(item, str | int | float):
            value = normalize_string(item)
            if value:
                values.add(value)
            continue
        if not isinstance(item, dict):
            continue
        value = normalize_string(
            item.get("value")
            or item.get("id")
            or item.get("identifier")
            or item.get("标识符编号")
            or item.get("编号")
        )
        if value:
            values.add(value)
    return list(values)


def extract_id_card_from_result(result: dict[str, Any]) -> str:
    raw_identifiers = result.get("唯一标识符")
    if not isinstance(raw_identifiers, list):
        return ""
    for item in raw_identifiers:
        if not isinstance(item, dict):
            continue
        identifier_type = normalize_string(item.get("标识符类型") or item.get("type"))
        value = normalize_string(
            item.get("标识符编号")
            or item.get("value")
            or item.get("identifier")
            or item.get("编号")
        )
        if value and "身份证" in identifier_type:
            return value.replace(" ", "").upper()
    return ""


def parse_document_identity(document: Document) -> DocumentIdentityInfo:
    result = get_metadata_result(document.metadata_json)
    identifiers = extract_identifier_values(result.get("唯一标识符"))
    return DocumentIdentityInfo(
        document=document,
        doc_id=str(document.id),
        identifiers=set(identifiers),
        identifiers_list=identifiers,
        name=normalize_string(result.get("患者姓名")),
        gender=normalize_string(result.get("患者性别")),
        age=normalize_string(result.get("患者年龄")),
        birth_date=normalize_string(result.get("出生日期")),
        hospital=normalize_string(result.get("机构名称")),
        department=normalize_string(result.get("科室信息")),
        phone=normalize_string(result.get("联系电话")),
        address=normalize_string(result.get("地址") or result.get("家庭住址")),
    )


def parse_patient_identity(patient: Patient) -> PatientIdentityInfo:
    extra = patient.extra_json if isinstance(patient.extra_json, dict) else {}
    identifiers = [
        *extract_identifier_values(extra.get("identifiers")),
        *extract_identifier_values(extra.get("唯一标识符")),
    ]
    birth_date = patient.birth_date.isoformat() if patient.birth_date else ""
    return PatientIdentityInfo(
        id=str(patient.id),
        name=normalize_string(patient.name),
        identifiers=set(identifiers),
        gender=normalize_string(patient.gender or extra.get("gender") or extra.get("患者性别")),
        age=normalize_string(patient.age if patient.age is not None else extra.get("age") or extra.get("患者年龄")),
        birth_date=normalize_string(birth_date or extra.get("birthDate") or extra.get("出生日期")),
        phone=normalize_string(extra.get("phone") or extra.get("联系电话")),
        address=normalize_string(extra.get("address") or extra.get("地址")),
    )


def build_candidate(
    patient: PatientIdentityInfo,
    score: int,
    reason: str,
    key_evidence: list[str],
    concerns: list[str],
) -> dict[str, Any]:
    return {
        "patientId": patient.id,
        "patient_id": patient.id,
        "id": patient.id,
        "name": patient.name,
        "patient_code": patient.id[:8],
        "score": score,
        "similarity": score,
        "reason": reason,
        "match_reasoning": reason,
        "key_evidence": key_evidence,
        "concerns": concerns,
        "gender": patient.gender,
        "age": patient.age,
    }


def serialize_document(document: Document) -> dict[str, Any]:
    return {
        "id": document.id,
        "fileName": document.original_filename,
        "file_name": document.original_filename,
        "docType": document.doc_type,
        "docSubType": document.doc_subtype,
        "docTitle": document.doc_title,
        "effectiveAt": document.effective_at.isoformat() if document.effective_at else None,
        "status": document.status,
        "patientId": document.patient_id,
        "patient_id": document.patient_id,
    }


def is_pending_process_document(document: Document) -> bool:
    if document.status == "archived":
        return False
    if document.meta_status != "completed":
        return True
    if document.ocr_status != "completed":
        return True
    if not isinstance(document.metadata_json, dict) or not get_metadata_result(document.metadata_json):
        return True
    return False
