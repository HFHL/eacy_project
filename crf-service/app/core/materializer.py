"""
物化器 — 将抽取结果写入实例层表

从 documents.extract_result_json (staged) → schema_instances / section_instances /
row_instances / field_value_candidates / field_value_selected

核心逻辑从 metadata-worker/ehr_pipeline.py._materialize_from_staged_extraction 迁移。
"""

from __future__ import annotations

import json
import logging
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

from app.repo.db import CRFRepo, _normalize_field_path

logger = logging.getLogger("crf-service.materializer")


class Materializer:
    """将 staged 抽取结果写入实例层关系表。"""

    def __init__(self, repo: Optional[CRFRepo] = None):
        self.repo = repo or CRFRepo()

    def materialize(
        self,
        *,
        conn: sqlite3.Connection,
        patient_id: str,
        document_id: str,
        schema_id: str,
        extract_payload: Dict[str, Any],
        content_list: Optional[List[Dict[str, Any]]] = None,
        instance_type: str = "patient_ehr",
    ) -> str:
        """
        将 documents.extract_result_json 里的 staged 抽取结果写入实例层表。

        逻辑：
        1. 确保 schema_instance 存在
        2. 绑定 instance_documents
        3. 为这次物化创建 extraction_runs（实例层）
        4. 遍历 task_results / audit.fields，把候选值写入 field_value_candidates
        5. 若某字段当前尚无 selected，则自动选中最新候选值

        Returns:
            instance_id
        """
        instance_id = self.repo.ensure_schema_instance(conn, patient_id, schema_id, instance_type)
        self.repo.ensure_instance_document(conn, instance_id, document_id, relation_type="source")

        run_id = self.repo.create_extraction_run(
            conn,
            instance_id=instance_id,
            document_id=document_id,
            target_mode="full_instance",
            target_path=None,
            model_name="ehr_extractor_agent",
            prompt_version="staged_materialize_v1",
        )

        try:
            task_results = extract_payload.get("task_results") or []
            if not isinstance(task_results, list):
                task_results = []

            # 构建 source_id → bbox 映射（用于溯源高亮）
            source_id_to_bbox: Dict[str, Any] = {}
            if content_list:
                for chunk in content_list:
                    if chunk.get("id") and chunk.get("bbox"):
                        source_id_to_bbox[chunk["id"]] = chunk["bbox"]

            for task in task_results:
                if not isinstance(task, dict):
                    continue
                task_path = task.get("path") or []
                extracted = task.get("extracted")
                audit = task.get("audit") or {}
                audit_fields = audit.get("fields") if isinstance(audit, dict) else {}
                if not isinstance(task_path, list):
                    continue
                if extracted in (None, {}, []):
                    continue

                section_path = "/" + "/".join(task_path)
                root_is_repeatable = isinstance(extracted, list)

                if isinstance(extracted, list):
                    for idx, item in enumerate(extracted):
                        section_instance_id = self.repo.ensure_section_instance(
                            conn,
                            instance_id=instance_id,
                            section_path=section_path,
                            repeat_index=idx,
                            is_repeatable=True,
                            created_by="ai",
                        )
                        self._persist_node(
                            conn=conn,
                            instance_id=instance_id,
                            section_instance_id=section_instance_id,
                            row_instance_id=None,
                            current_path=task_path + [str(idx)],
                            node=item,
                            audit_fields=audit_fields or {},
                            document_id=document_id,
                            extraction_run_id=run_id,
                            source_id_to_bbox=source_id_to_bbox,
                        )
                else:
                    section_instance_id = self.repo.ensure_section_instance(
                        conn,
                        instance_id=instance_id,
                        section_path=section_path,
                        repeat_index=0,
                        is_repeatable=root_is_repeatable,
                        created_by="ai",
                    )
                    self._persist_node(
                        conn=conn,
                        instance_id=instance_id,
                        section_instance_id=section_instance_id,
                        row_instance_id=None,
                        current_path=task_path,
                        node=extracted,
                        audit_fields=audit_fields or {},
                        document_id=document_id,
                        extraction_run_id=run_id,
                        source_id_to_bbox=source_id_to_bbox,
                    )

            self.repo.finalize_extraction_run(conn, run_id, "succeeded", None)
            return instance_id
        except Exception as exc:
            self.repo.finalize_extraction_run(conn, run_id, "failed", str(exc))
            raise

    def _persist_node(
        self,
        *,
        conn: sqlite3.Connection,
        instance_id: str,
        section_instance_id: str,
        row_instance_id: Optional[str],
        current_path: List[str],
        node: Any,
        audit_fields: Dict[str, Any],
        document_id: str,
        extraction_run_id: str,
        source_id_to_bbox: Dict[str, Any],
        parent_row_id: Optional[str] = None,
    ) -> None:
        """递归遍历抽取结果树，将叶子节点写入 field_value_candidates。"""
        if isinstance(node, dict):
            for key, value in node.items():
                self._persist_node(
                    conn=conn,
                    instance_id=instance_id,
                    section_instance_id=section_instance_id,
                    row_instance_id=row_instance_id,
                    current_path=current_path + [key],
                    node=value,
                    audit_fields=audit_fields,
                    document_id=document_id,
                    extraction_run_id=extraction_run_id,
                    source_id_to_bbox=source_id_to_bbox,
                    parent_row_id=parent_row_id,
                )
            return

        if isinstance(node, list):
            group_path = "/" + "/".join(current_path)
            for idx, item in enumerate(node):
                child_row_id = self.repo.ensure_row_instance(
                    conn,
                    instance_id=instance_id,
                    section_instance_id=section_instance_id,
                    group_path=group_path,
                    repeat_index=idx,
                    parent_row_id=parent_row_id,
                    is_repeatable=True,
                    created_by="ai",
                )
                self._persist_node(
                    conn=conn,
                    instance_id=instance_id,
                    section_instance_id=section_instance_id,
                    row_instance_id=child_row_id,
                    current_path=current_path,
                    node=item,
                    audit_fields=audit_fields,
                    document_id=document_id,
                    extraction_run_id=extraction_run_id,
                    source_id_to_bbox=source_id_to_bbox,
                    parent_row_id=child_row_id,
                )
            return

        # ── 叶子节点（标量值）──
        full_pointer = "/" + "/".join(current_path)
        field_path = _normalize_field_path(full_pointer)
        audit_entry = audit_fields.get(full_pointer) or audit_fields.get(field_path) or {}
        source_page, source_block_id = self._parse_source_id(
            audit_entry.get("source_id") if isinstance(audit_entry, dict) else None
        )
        source_text = audit_entry.get("raw") if isinstance(audit_entry, dict) else None

        source_bbox = None
        if source_block_id and source_id_to_bbox:
            source_bbox = source_id_to_bbox.get(source_block_id)
            if source_bbox is not None:
                source_bbox = json.dumps(source_bbox, ensure_ascii=False)

        candidate_id = self.repo.insert_candidate(
            conn,
            instance_id=instance_id,
            section_instance_id=section_instance_id,
            row_instance_id=row_instance_id,
            field_path=field_path,
            value=node,
            source_document_id=document_id,
            source_page=source_page,
            source_block_id=source_block_id,
            source_bbox=source_bbox,
            source_text=source_text,
            extraction_run_id=extraction_run_id,
            confidence=None,
            created_by="ai",
        )
        self.repo.upsert_selected_if_absent(
            conn,
            instance_id=instance_id,
            section_instance_id=section_instance_id,
            row_instance_id=row_instance_id,
            field_path=field_path,
            candidate_id=candidate_id,
            value=node,
            selected_by="ai",
            overwrite_existing=False,
        )

    @staticmethod
    def _parse_source_id(source_id: Optional[str]) -> Tuple[Optional[int], Optional[str]]:
        if not source_id:
            return None, None
        try:
            if source_id.startswith("p") and "." in source_id:
                page_part, _ = source_id.split(".", 1)
                page_no = int(page_part[1:])
                return page_no, source_id
        except Exception:
            pass
        return None, source_id
