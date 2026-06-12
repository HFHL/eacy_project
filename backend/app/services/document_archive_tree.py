from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException, status

from app.models import Document
from app.services.archive_grouping_service import (
    ArchiveGroupingService,
    extract_id_card_from_result,
    get_metadata_result,
    is_pending_process_document,
    parse_document_identity,
)
from core.helpers.redis import redis_client


class DocumentArchiveTreeMixin:
    async def get_archive_tree(
        self,
        *,
        include_raw_documents: bool = False,
        refresh: bool = False,
        uploaded_by: str | None = None,
    ) -> dict[str, Any]:
        cache_key = self._archive_cache_key(uploaded_by)
        if not include_raw_documents and not refresh:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception:
                pass

        documents = await self.document_repository.list_visible_documents(uploaded_by=uploaded_by)
        patients = await self.patient_repository.list_all_active(owner_id=uploaded_by)
        groups = ArchiveGroupingService().build_groups(
            [document for document in documents if document.status != "archived"],
            patients,
            include_raw_documents=include_raw_documents,
        )

        todo_groups = self._build_todo_groups(groups)
        archived_patients = self._build_archived_patients(documents, patients)
        payload = {
            "total": len(documents),
            "counts": {
                "parse_total": len([document for document in documents if is_pending_process_document(document)]),
                "todo_total": sum(group["count"] for group in todo_groups),
                "archived_total": len([document for document in documents if document.status == "archived"]),
            },
            "todo_groups": todo_groups,
            "archived_patients": archived_patients,
        }
        if not include_raw_documents:
            try:
                await redis_client.set(cache_key, json.dumps(payload, ensure_ascii=False), ex=300)
            except Exception:
                pass
        return payload

    def _build_todo_groups(self, groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
        todo_groups = []
        for group in groups:
            if group.get("status") == "pending_process":
                continue
            active_documents = [document for document in group["documents"] if document.get("status") != "archived"]
            if not active_documents:
                continue
            status_set = self._archive_status_set(group["status"])
            snapshot = group.get("patientSnapshot") or {}
            todo_groups.append(
                {
                    "group_id": group["groupId"],
                    "label": {
                        "name": snapshot.get("name") or group.get("displayName") or "未知患者",
                        "gender": snapshot.get("gender") or "--",
                        "age": snapshot.get("age") or "--",
                    },
                    "count": len(active_documents),
                    "document_ids": [document["id"] for document in active_documents],
                    "status_set": status_set,
                    "matched_patient_id": group.get("matched_patient_id"),
                }
            )
        return todo_groups

    @staticmethod
    def _archive_status_set(group_status: str) -> list[str]:
        if group_status == "matched_existing":
            return ["auto_archived"]
        if group_status == "needs_confirmation":
            return ["pending_confirm_review"]
        if group_status == "new_patient_candidate":
            return ["pending_confirm_new"]
        return ["pending_confirm_uncertain"]

    @staticmethod
    def _build_archived_patients(documents: list[Document], patients) -> list[dict[str, Any]]:
        archived_by_patient: dict[str, list[Document]] = {}
        for document in documents:
            if document.status == "archived" and document.patient_id:
                archived_by_patient.setdefault(document.patient_id, []).append(document)

        patient_map = {patient.id: patient for patient in patients}
        archived_patients = []
        for patient_id, patient_documents in archived_by_patient.items():
            patient = patient_map.get(patient_id)
            archived_patients.append(
                {
                    "patient_id": patient_id,
                    "patient_code": patient_id[:8],
                    "label": {
                        "name": patient.name if patient else "未知患者",
                        "gender": patient.gender if patient and patient.gender else "--",
                        "age": patient.age if patient and patient.age is not None else "--",
                    },
                    "count": len(patient_documents),
                    "patient_status": "active" if patient else "inactive",
                }
            )
        return archived_patients

    async def get_archive_counts(self, *, refresh: bool = False, uploaded_by: str | None = None) -> dict[str, Any]:
        cache_key = self._archive_cache_key(uploaded_by)
        if not refresh:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    data = json.loads(cached)
                    return {"total": int(data.get("total") or 0), "counts": data.get("counts") or {}}
            except Exception:
                pass
        tree = await self.get_archive_tree(refresh=refresh, uploaded_by=uploaded_by)
        return {"total": int(tree.get("total") or 0), "counts": tree.get("counts") or {}}

    @staticmethod
    def _build_group_match_info(group: dict[str, Any]) -> dict[str, Any]:
        group_status = group.get("status") or "insufficient_info"
        candidates = group.get("candidatePatients") or group.get("candidate_patients") or []
        matched_patient_id = group.get("matched_patient_id")
        top_candidate_id = None
        if candidates:
            top_candidate = candidates[0]
            top_candidate_id = top_candidate.get("patientId") or top_candidate.get("patient_id") or top_candidate.get("id")

        match_result = {
            "pending_process": "pending",
            "matched_existing": "matched",
            "needs_confirmation": "review",
            "new_patient_candidate": "new",
        }.get(group_status, "uncertain")
        ai_recommendation = matched_patient_id or None
        if group_status == "needs_confirmation":
            ai_recommendation = top_candidate_id

        match_score = candidates[0].get("similarity", 0) if candidates else 0
        return {
            "matched_patient_id": matched_patient_id,
            "match_score": match_score,
            "confidence": match_score,
            "match_result": match_result,
            "candidates": candidates,
            "ai_recommendation": ai_recommendation,
            "ai_reason": group.get("matchReason") or group.get("match_reason"),
        }

    @staticmethod
    def _build_document_extracted_info(document: Document) -> dict[str, Any]:
        identity = parse_document_identity(document)
        result = get_metadata_result(document.metadata_json)
        id_number = extract_id_card_from_result(result)
        return {
            "name": identity.name,
            "patient_name": identity.name,
            "gender": identity.gender,
            "patient_gender": identity.gender,
            "age": identity.age,
            "patient_age": identity.age,
            "birth_date": identity.birth_date,
            "phone": identity.phone,
            "address": identity.address,
            "id_number": id_number,
            "id_card": id_number,
        }

    async def _build_archive_groups(
        self,
        *,
        uploaded_by: str | None = None,
        include_raw_documents: bool = True,
    ) -> tuple[list[Document], list[dict[str, Any]]]:
        documents = await self.document_repository.list_visible_documents(uploaded_by=uploaded_by)
        patients = await self.patient_repository.list_all_active(owner_id=uploaded_by)
        groups = ArchiveGroupingService().build_groups(
            [document for document in documents if document.status != "archived"],
            patients,
            include_raw_documents=include_raw_documents,
        )
        return documents, groups

    async def get_document_match_info(self, document_id: str, *, uploaded_by: str | None = None) -> dict[str, Any]:
        document = await self.get_document(document_id, uploaded_by=uploaded_by)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        metadata = document.metadata_json if isinstance(document.metadata_json, dict) else {}
        extracted_info = self._build_document_extracted_info(document)
        _, groups = await self._build_archive_groups(uploaded_by=uploaded_by, include_raw_documents=True)
        group = next(
            (item for item in groups if any(doc.get("id") == document_id for doc in item.get("documents") or [])),
            None,
        )
        if group is None:
            return {
                "document_id": document_id,
                "group_id": None,
                "document_metadata": metadata,
                "extracted_info": extracted_info,
                "matched_patient_id": None,
                "match_score": 0,
                "confidence": 0,
                "match_result": "uncertain",
                "candidates": [],
                "ai_recommendation": None,
                "ai_reason": "未找到所属分组或文档尚未完成解析",
            }

        match_info = self._build_group_match_info(group)
        return {
            "document_id": document_id,
            "group_id": group.get("groupId"),
            "document_metadata": metadata,
            "extracted_info": extracted_info,
            **match_info,
        }

    async def refresh_document_match_info(self, document_id: str, *, uploaded_by: str | None = None) -> dict[str, Any]:
        await self.invalidate_archive_tree_cache(uploaded_by)
        return await self.get_document_match_info(document_id, uploaded_by=uploaded_by)

    async def get_archive_group_documents(self, group_id: str, *, uploaded_by: str | None = None) -> dict[str, Any]:
        _, groups = await self._build_archive_groups(uploaded_by=uploaded_by, include_raw_documents=True)
        group = next((item for item in groups if item["groupId"] == group_id), None)
        if group is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

        active_documents = [item["raw_document"] for item in group["documents"] if item.get("status") != "archived"]
        response_group = {**group}
        response_group["documents"] = [
            {key: value for key, value in document.items() if key != "raw_document"}
            for document in group["documents"]
        ]
        return {
            "items": active_documents,
            "group": response_group,
            "match_info": self._build_group_match_info(group),
            "pagination": {"page": 1, "page_size": len(active_documents), "total": len(active_documents), "total_pages": 1},
        }
