from __future__ import annotations

import json
from typing import Any

from app.models import Document
from app.services.llm_ehr_types import EhrExtractionState
from app.services.schema_field_planner import SchemaField


class LlmEhrPromptMixin:
    def _build_system_prompt(self, field_specs: list[dict[str, Any]]) -> str:
        return (
            "你是医疗 EHR/CRF 结构化抽取助手。只根据输入 OCR 原文抽取，不要编造。\n"
            "输出必须是 JSON object，优先使用 fields 格式；records 仅用于整条重复记录更容易表达时。\n\n"
            "推荐 fields 输出格式：\n"
            "{\n"
            "  \"fields\": [\n"
            "    {\n"
            "      \"field_path\": \"必须逐字等于字段清单中的 field_path\",\n"
            "      \"value_type\": \"text|number|date|datetime|json\",\n"
            "      \"value_text\": \"值\",\n"
            "      \"repeat_index\": 0,\n"
            "      \"confidence\": 0.0-1.0,\n"
            "      \"evidences\": [{\"source_type\": \"line\", \"source_id\": \"p1-l1\", \"quote_text\": \"原文片段\", \"page_no\": 1}]\n"
            "    }\n"
            "  ]\n"
            "}\n\n"
            "兼容 records 输出格式：\n"
            "{\n"
            "  \"records\": [\n"
            "    {\n"
            "      \"form_path\": \"顶层分组.表单名\",\n"
            "      \"record\": {\"字段\": \"值\", \"嵌套对象\": {\"字段\": \"值\"}},\n"
            "      \"confidence\": 0.0-1.0,\n"
            "      \"evidences\": [{\"source_type\": \"line\", \"source_id\": \"p1-l1\", \"quote_text\": \"原文片段\", \"page_no\": 1}]\n"
            "    }\n"
            "  ]\n"
            "}\n\n"
            "严格规则：\n"
            "1. 不要输出 null、空字符串、未知、未见、无法判断。\n"
            "2. 日期统一 YYYY-MM-DD；datetime 统一 ISO 格式。\n"
            "3. 枚举字段必须从 options 中选择最接近项。\n"
            "4. 每个有值字段必须填写 confidence 和 evidences；evidence.quote_text 必须来自对应 reading unit 的 text，不要改写。\n"
            "5. source_id 必须从输入 reading_units 中原样引用，不要编造。\n"
            "6. 不要自行决定数据库是否覆盖 current；只输出候选抽取结果。\n"
            "7. 对可重复记录/表格，fields 中使用 repeat_index 表示第几条记录，不要把 .0/.1 写进 field_path。\n"
            "8. 如果字段清单中有 merge_binding，请优先抽取 anchor/fallback/group_key/interval 涉及的字段，帮助系统合并同一条记录。\n"
            "9. 枚举/是/否类推断字段：值可推理，但 quote_text 必须引用原文依据片段，不能填选项字面量。\n\n"
            f"可抽取字段清单：\n{json.dumps(field_specs, ensure_ascii=False, indent=2)}"
        )

    def _build_user_prompt(self, *, state: EhrExtractionState) -> str:
        field_specs = state.get("field_specs") or []
        reading_units = self._trim_reading_units(
            state.get("reading_units") or state.get("ocr_evidence_units") or [],
            field_specs=field_specs,
        )
        if reading_units:
            return (
                "请从下面 OCR 结构化单元（reading_units）中抽取字段。\n"
                "每个单元都有 source_type/source_id/text；输出 evidence 时必须原样引用 source_type/source_id。\n\n"
                f"document_id: {state.get('document_id')}\n"
                f"document_meta: {json.dumps(state.get('document_meta') or {}, ensure_ascii=False)}\n\n"
                f"reading_units:\n{json.dumps(reading_units, ensure_ascii=False)}"
            )

        text = self._trim_text(state.get("text") or "", field_specs=field_specs)
        return (
            "请从下面单份医疗文档 OCR 文本中抽取字段。\n\n"
            f"document_id: {state.get('document_id')}\n"
            f"document_meta: {json.dumps(state.get('document_meta') or {}, ensure_ascii=False)}\n\n"
            f"OCR 文本：\n{text}"
        )

    def _build_repair_prompt(self, *, state: EhrExtractionState, errors: list[str]) -> str:
        field_specs = state.get("field_specs") or []
        reading_units = self._trim_reading_units(
            state.get("reading_units") or state.get("ocr_evidence_units") or [],
            field_specs=field_specs,
        )
        if reading_units:
            ocr_section = f"\nreading_units:\n{json.dumps(reading_units, ensure_ascii=False)}\n"
        else:
            ocr_section = f"\nOCR 文本：\n{self._trim_text(state.get('text') or '', field_specs=field_specs)}\n"
        return (
            "上一次抽取输出未通过校验。请只修复 JSON 输出，不要重新发挥或添加原文没有的信息。\n"
            "必须输出严格 JSON object，禁止 Markdown fence，保留原抽取含义。\n"
            f"校验错误：{json.dumps(errors, ensure_ascii=False)}\n"
            f"上一次原始输出：{state.get('raw_content') or json.dumps(state.get('raw_output'), ensure_ascii=False)}\n"
            f"可抽取字段清单：{json.dumps(field_specs, ensure_ascii=False)}\n"
            f"{ocr_section}"
        )

    def _field_spec(self, field: SchemaField) -> dict[str, Any]:
        return {
            "field_key": field.field_key,
            "field_path": field.field_path,
            "field_title": field.field_title,
            "value_type": field.value_type,
            "record_form_key": field.record_form_key,
            "record_form_title": field.record_form_title,
            "options": field.options,
            "prompt": field.extraction_prompt,
            "display_type": getattr(field, "display_type", None),
            "schema_type": getattr(field, "schema_type", None),
            "schema_format": getattr(field, "schema_format", None),
            "merge_binding": getattr(field, "merge_binding", None),
        }

    def _trim_reading_units(
        self,
        units: list[dict[str, Any]],
        *,
        field_specs: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        if not units:
            return []
        serialized = json.dumps(units, ensure_ascii=False)
        if len(serialized) <= 18000:
            return units

        keywords = ("姓名", "性别", "诊断", "入院", "出院", "病理", "检查", "治疗", "用药", "报告")
        for spec in field_specs or []:
            for key in ("field_title", "field_key", "prompt"):
                value = spec.get(key)
                if isinstance(value, str) and value.strip():
                    keywords = (*keywords, value.strip())

        def score(unit: dict[str, Any]) -> int:
            text = str(unit.get("text") or "")
            return sum(1 for keyword in keywords if keyword in text)

        ranked = sorted(enumerate(units), key=lambda pair: score(pair[1]), reverse=True)
        selected: list[tuple[int, dict[str, Any]]] = []
        for index, unit in ranked:
            candidate = [selected_unit for _, selected_unit in selected] + [unit]
            if len(json.dumps(candidate, ensure_ascii=False)) > 18000:
                continue
            selected.append((index, unit))
        selected.sort(key=lambda pair: pair[0])
        return [unit for _, unit in selected] or units[: min(len(units), 50)]

    def _trim_text(self, text: str, *, field_specs: list[dict[str, Any]] | None = None) -> str:
        if len(text) <= 18000:
            return text
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        keywords = ("姓名", "性别", "诊断", "入院", "出院", "病理", "检查", "治疗", "用药", "报告")
        for spec in field_specs or []:
            for key in ("field_title", "field_key", "prompt"):
                value = spec.get(key)
                if isinstance(value, str) and value.strip():
                    keywords = (*keywords, value.strip())
        picked = [line for line in lines if any(keyword in line for keyword in keywords)]
        return "\n".join([text[:9000], *picked[:300], text[-4000:]])[:24000]

    def _document_meta(self, document: Document | None) -> dict[str, Any]:
        if document is None:
            return {}
        return {
            "filename": document.original_filename,
            "doc_type": document.doc_type or document.document_type,
            "doc_subtype": document.doc_subtype or document.document_sub_type,
            "doc_title": document.doc_title,
            "effective_at": document.effective_at.isoformat() if document.effective_at else None,
        }
