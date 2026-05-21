from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.models import Document, Patient
from app.repositories.document_repository import DocumentRepository
from app.repositories.patient_repository import PatientRepository
from core.config import config
from core.db import session
from core.db.transactional import Transactional

AI_SUMMARY_KEY = "ai_summary"


class PatientSummaryError(RuntimeError):
    pass


class PatientSummaryService:
    def __init__(
        self,
        patient_repository: PatientRepository | None = None,
        document_repository: DocumentRepository | None = None,
    ):
        self.patient_repository = patient_repository or PatientRepository()
        self.document_repository = document_repository or DocumentRepository()

    async def get_summary(self, patient_id: str, *, owner_id: str | None = None) -> dict[str, Any]:
        patient = await self.patient_repository.get_active_by_id(patient_id, owner_id=owner_id)
        if patient is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
        return self._serialize_summary(patient)

    @Transactional()
    async def save_summary(self, patient_id: str, content: str, *, owner_id: str | None = None) -> dict[str, Any]:
        patient = await self.patient_repository.get_active_by_id(patient_id, owner_id=owner_id)
        if patient is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        extra = dict(patient.extra_json or {})
        current = dict(extra.get(AI_SUMMARY_KEY) or {})
        current.update(
            {
                "content": content.strip(),
                "generated_at": datetime.utcnow().isoformat(),
            }
        )
        extra[AI_SUMMARY_KEY] = current
        patient.extra_json = extra
        patient = await self.patient_repository.save(patient)
        await session.refresh(patient)
        return self._serialize_summary(patient)

    @Transactional()
    async def generate_summary(self, patient_id: str, *, owner_id: str | None = None) -> dict[str, Any]:
        patient = await self.patient_repository.get_active_by_id(patient_id, owner_id=owner_id)
        if patient is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        documents = await self.document_repository.list_by_patient(
            patient_id,
            limit=50,
            uploaded_by=owner_id,
        )
        active_documents = [doc for doc in documents if getattr(doc, "status", None) != "deleted"]
        if not active_documents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="暂无文档，无法生成病情摘要",
            )

        content = self._generate_with_llm(patient, active_documents)
        source_documents = self._build_source_documents(active_documents)

        extra = dict(patient.extra_json or {})
        extra[AI_SUMMARY_KEY] = {
            "content": content,
            "generated_at": datetime.utcnow().isoformat(),
            "source_document_ids": [doc.id for doc in active_documents[:10]],
            "source_documents": source_documents,
        }
        patient.extra_json = extra
        patient = await self.patient_repository.save(patient)
        await session.refresh(patient)
        return self._serialize_summary(patient)

    def _serialize_summary(self, patient: Patient) -> dict[str, Any]:
        summary = (patient.extra_json or {}).get(AI_SUMMARY_KEY) or {}
        return {
            "content": str(summary.get("content") or ""),
            "generated_at": summary.get("generated_at"),
            "source_documents": list(summary.get("source_documents") or []),
        }

    def _build_source_documents(self, documents: list[Document]) -> list[dict[str, str]]:
        items: list[dict[str, str]] = []
        for index, document in enumerate(documents[:10], start=1):
            items.append(
                {
                    "id": str(document.id),
                    "name": str(document.original_filename or document.file_name or document.id),
                    "ref": f"[{index}]",
                    "type": str(document.doc_type or document.document_type or ""),
                }
            )
        return items

    def _build_context(self, patient: Patient, documents: list[Document]) -> str:
        lines = [
            f"患者姓名: {patient.name}",
            f"性别: {patient.gender or '未知'}",
            f"年龄: {patient.age if patient.age is not None else '未知'}",
            f"科室: {patient.department or '未知'}",
            f"主要诊断: {patient.main_diagnosis or '未知'}",
            "",
            "相关文档:",
        ]
        for document in documents[:10]:
            metadata = document.metadata_json if isinstance(document.metadata_json, dict) else {}
            result = metadata.get("result") if isinstance(metadata.get("result"), dict) else {}
            title = document.doc_title or result.get("文档标题") or document.original_filename
            doc_type = document.doc_type or result.get("文档类型") or ""
            diagnosis = result.get("诊断") or ""
            lines.append(f"- {title} ({doc_type}) 诊断线索: {diagnosis}")
            ocr_excerpt = (document.ocr_text or "")[:800].strip()
            if ocr_excerpt:
                lines.append(f"  OCR摘要: {ocr_excerpt}")
        return "\n".join(lines)

    def _generate_with_llm(self, patient: Patient, documents: list[Document]) -> str:
        if not config.OPENAI_API_KEY:
            return self._fallback_summary(patient, documents)

        context = self._build_context(patient, documents)
        base_url = (config.OPENAI_API_BASE_URL or "https://api.openai.com/v1").rstrip("/")
        request_payload = {
            "model": config.OPENAI_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是临床病历摘要助手。请根据提供的患者信息与文档线索，"
                        "生成 300-500 字的中文病情综述，使用 Markdown 小标题与条目，"
                        "不要编造文档中不存在的信息。"
                    ),
                },
                {"role": "user", "content": context},
            ],
            "temperature": config.METADATA_LLM_TEMPERATURE,
        }
        headers = {
            "Authorization": f"Bearer {config.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }
        try:
            with httpx.Client(timeout=config.METADATA_LLM_TIMEOUT_SECONDS) as client:
                response = client.post(f"{base_url}/chat/completions", headers=headers, json=request_payload)
                response.raise_for_status()
                data = response.json()
            content = data["choices"][0]["message"]["content"]
            return str(content or "").strip() or self._fallback_summary(patient, documents)
        except Exception as exc:
            fallback = self._fallback_summary(patient, documents)
            return f"{fallback}\n\n> 注：AI 服务暂不可用（{exc.__class__.__name__}），以上为规则生成的简要摘要。"

    def _fallback_summary(self, patient: Patient, documents: list[Document]) -> str:
        doc_names = ", ".join(
            str(doc.original_filename or doc.file_name or doc.id)
            for doc in documents[:5]
        )
        return (
            f"## 病情综述\n\n"
            f"**{patient.name}**（{patient.gender or '性别未知'}，"
            f"{patient.age if patient.age is not None else '年龄未知'}岁）"
            f"当前主要诊断：{patient.main_diagnosis or '待补充'}。\n\n"
            f"已归档文档 {len(documents)} 份，包括：{doc_names or '无'}。"
        )
