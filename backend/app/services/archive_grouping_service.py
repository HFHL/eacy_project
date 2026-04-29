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


class ArchiveGroupingService:
    def build_groups(
        self,
        documents: list[Document],
        patients: list[Patient],
        *,
        include_raw_documents: bool = True,
    ) -> list[dict[str, Any]]:
        pending_documents = [document for document in documents if is_pending_process_document(document)]
        ready_documents = [document for document in documents if not is_pending_process_document(document)]
        doc_infos = [parse_document_identity(document) for document in ready_documents]
        parent: dict[str, str] = {}

        def find(doc_id: str) -> str:
            parent.setdefault(doc_id, doc_id)
            if parent[doc_id] != doc_id:
                parent[doc_id] = find(parent[doc_id])
            return parent[doc_id]

        def union(left: str, right: str) -> None:
            left_root = find(left)
            right_root = find(right)
            if left_root != right_root:
                parent[left_root] = right_root

        for info in doc_infos:
            parent.setdefault(info.doc_id, info.doc_id)

        for left_index, left in enumerate(doc_infos):
            for right in doc_infos[left_index + 1 :]:
                if left.identifiers.intersection(right.identifiers):
                    union(left.doc_id, right.doc_id)
                    continue

                weak_score = 0
                if left.name and right.name and left.name == right.name:
                    weak_score += 3
                if left.birth_date and right.birth_date and left.birth_date == right.birth_date:
                    weak_score += 3
                if left.age and right.age and left.age == right.age:
                    weak_score += 2
                if left.gender and right.gender and left.gender == right.gender:
                    weak_score += 1
                if left.hospital and right.hospital and left.hospital == right.hospital:
                    weak_score += 1
                if left.department and right.department and left.department == right.department:
                    weak_score += 1

                if weak_score >= 5:
                    union(left.doc_id, right.doc_id)

        grouped_docs: dict[str, list[DocumentIdentityInfo]] = {}
        for info in doc_infos:
            grouped_docs.setdefault(find(info.doc_id), []).append(info)

        patient_infos = [parse_patient_identity(patient) for patient in patients]
        groups: list[dict[str, Any]] = []

        if pending_documents:
            pending_payload = [serialize_document(document) for document in pending_documents]
            if include_raw_documents:
                for payload, document in zip(pending_payload, pending_documents, strict=False):
                    payload["raw_document"] = document
            groups.append(
                {
                    "groupId": PENDING_PROCESS_GROUP_ID,
                    "group_id": PENDING_PROCESS_GROUP_ID,
                    "displayName": "待 OCR / 元数据提取",
                    "display_name": "待 OCR / 元数据提取",
                    "status": "pending_process",
                    "confidence": "low",
                    "groupReason": "文档尚未完成 OCR 或元数据提取，暂归入临时分组",
                    "group_reason": "文档尚未完成 OCR 或元数据提取，暂归入临时分组",
                    "matchReason": "待 OCR / 元数据提取完成后刷新分组",
                    "match_reason": "待 OCR / 元数据提取完成后刷新分组",
                    "identifiers": [],
                    "patientSnapshot": {
                        "name": "待处理文档",
                        "gender": None,
                        "age": None,
                        "birthDate": None,
                        "hospital": None,
                        "department": None,
                    },
                    "patient_snapshot": {
                        "name": "待处理文档",
                        "gender": None,
                        "age": None,
                        "birth_date": None,
                        "hospital": None,
                        "department": None,
                    },
                    "documents": pending_payload,
                    "candidatePatients": [],
                    "candidate_patients": [],
                    "matched_patient_id": None,
                }
            )

        for group_docs in grouped_docs.values():
            canonical_doc_id = sorted(info.doc_id for info in group_docs)[0]
            group_id = f"group_{canonical_doc_id[:8]}"
            identifiers: set[str] = set()
            group_name = ""
            group_gender = ""
            group_age = ""
            group_birth_date = ""
            group_hospital = ""
            group_department = ""

            for info in group_docs:
                identifiers.update(info.identifiers_list)
                group_name = group_name or info.name
                group_gender = group_gender or info.gender
                group_age = group_age or info.age
                group_birth_date = group_birth_date or info.birth_date
                group_hospital = group_hospital or info.hospital
                group_department = group_department or info.department

            identifier_list = list(identifiers)
            group_reason = "单文档无需并组"
            if len(group_docs) > 1:
                matched_identifiers: set[str] = set()
                weak_reasons: set[str] = set()
                for left_index, left in enumerate(group_docs):
                    for right in group_docs[left_index + 1 :]:
                        matched_identifiers.update(left.identifiers.intersection(right.identifiers))
                        if left.name and right.name and left.name == right.name:
                            weak_reasons.add("姓名")
                        if left.birth_date and right.birth_date and left.birth_date == right.birth_date:
                            weak_reasons.add("出生日期")
                        if left.age and right.age and left.age == right.age:
                            weak_reasons.add("年龄")
                if matched_identifiers:
                    group_reason = f"文档之间唯一标识符重合：{'、'.join(sorted(matched_identifiers))}"
                elif weak_reasons:
                    group_reason = f"文档之间弱信息匹配：{'、'.join(sorted(weak_reasons))}相同"
                else:
                    group_reason = "文档之间弱信息匹配"

            candidates: list[dict[str, Any]] = []
            status = "insufficient_info"
            confidence = "low"
            match_reason = ""

            for patient in patient_infos:
                matched_identifier = next((identifier for identifier in identifier_list if identifier in patient.identifiers), "")
                if matched_identifier:
                    candidates.append(
                        build_candidate(
                            patient,
                            95,
                            f"与已有患者唯一标识符重合：{matched_identifier}",
                            [f"唯一标识符：{matched_identifier}"],
                            [],
                        )
                    )
                    continue

                weak_score = 0
                reasons: list[str] = []
                if group_name and patient.name and group_name == patient.name:
                    weak_score += 50
                    reasons.append("姓名")
                if group_birth_date and patient.birth_date and group_birth_date == patient.birth_date:
                    weak_score += 20
                    reasons.append("出生日期")
                if group_gender and patient.gender and group_gender == patient.gender:
                    weak_score += 10
                    reasons.append("性别")
                if group_age and patient.age and group_age == patient.age:
                    weak_score += 10
                    reasons.append("年龄")

                if weak_score >= 50:
                    candidates.append(
                        build_candidate(
                            patient,
                            weak_score,
                            f"弱信息匹配到已有患者：{'、'.join(reasons)}相同",
                            reasons,
                            [] if weak_score >= 90 else ["需人工确认"],
                        )
                    )

            candidates.sort(key=lambda candidate: candidate["score"], reverse=True)
            if candidates and candidates[0]["score"] >= 90:
                status = "matched_existing"
                confidence = "high"
                match_reason = candidates[0]["reason"]
            elif candidates:
                status = "needs_confirmation"
                confidence = "medium"
                match_reason = "匹配到多个候选患者，需人工选择" if len(candidates) > 1 else f"{candidates[0]['reason']}，需人工确认"
            elif group_name or identifier_list:
                status = "new_patient_candidate"
                confidence = "medium"
                match_reason = "未匹配到现有患者，建议新建档"
            else:
                match_reason = "信息严重不足，无法匹配或建档"

            matched_patient_id = candidates[0]["patientId"] if status == "matched_existing" and candidates else None
            display_name = group_name or (candidates[0]["name"] if candidates else "未知患者")
            documents_payload = [serialize_document(info.document) for info in group_docs]
            if include_raw_documents:
                for payload, info in zip(documents_payload, group_docs, strict=False):
                    payload["raw_document"] = info.document

            groups.append(
                {
                    "groupId": group_id,
                    "group_id": group_id,
                    "displayName": display_name,
                    "display_name": display_name,
                    "status": status,
                    "confidence": confidence,
                    "groupReason": group_reason,
                    "group_reason": group_reason,
                    "matchReason": match_reason,
                    "match_reason": match_reason,
                    "identifiers": identifier_list,
                    "patientSnapshot": {
                        "name": group_name or None,
                        "gender": group_gender or None,
                        "age": group_age or None,
                        "birthDate": group_birth_date or None,
                        "hospital": group_hospital or None,
                        "department": group_department or None,
                    },
                    "patient_snapshot": {
                        "name": group_name or None,
                        "gender": group_gender or None,
                        "age": group_age or None,
                        "birth_date": group_birth_date or None,
                        "hospital": group_hospital or None,
                        "department": group_department or None,
                    },
                    "documents": documents_payload,
                    "candidatePatients": candidates,
                    "candidate_patients": candidates,
                    "matched_patient_id": matched_patient_id,
                }
            )

        return sorted(groups, key=lambda group: (group["status"], group["displayName"], group["groupId"]))
