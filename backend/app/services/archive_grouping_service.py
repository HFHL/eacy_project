from __future__ import annotations

from typing import Any

from app.models import Document, Patient
from app.services.archive_grouping_identity import (
    DocumentIdentityInfo,
    PENDING_PROCESS_GROUP_ID,
    build_candidate,
    extract_id_card_from_result,
    get_metadata_result,
    is_pending_process_document,
    parse_document_identity,
    parse_patient_identity,
    serialize_document,
)


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
