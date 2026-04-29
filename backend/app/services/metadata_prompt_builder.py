import json
import re
from typing import Any

from app.models import Document
from app.services.metadata_normalizer import get_document_subtype_by_type, get_document_type_enum, get_identifier_type_enum, get_required_result_keys


class MetadataPromptBuilder:
    KEYWORDS = (
        "姓名",
        "性别",
        "年龄",
        "出生日期",
        "住院号",
        "门诊号",
        "病案号",
        "身份证",
        "科室",
        "医院",
        "中心",
        "诊断",
        "报告日期",
        "检查日期",
        "出院日期",
        "入院日期",
    )

    def build_input(self, document: Document) -> dict[str, Any]:
        flattened_text = self.flatten_document_text(document)
        return {
            "document_id": document.id,
            "original_filename": document.original_filename,
            "mime_type": document.mime_type,
            "ocr_text": self._trim_ocr_text(flattened_text),
            "ocr_payload_json": document.ocr_payload_json or {},
            "schema": "meta_data.json",
            "schema_context": self.build_schema_context(),
            "rule_hints": self.build_rule_hints(flattened_text),
        }

    def build_schema_context(self) -> dict[str, Any]:
        return {
            "required_result_keys": list(get_required_result_keys()),
            "document_type_enum": sorted(get_document_type_enum()),
            "identifier_type_enum": sorted(get_identifier_type_enum()),
            "document_subtype_by_type": {key: sorted(value) for key, value in get_document_subtype_by_type().items()},
        }

    def flatten_document_text(self, document: Document) -> str:
        parts = [document.ocr_text or ""]
        payload_text = self.flatten_ocr_payload(document.ocr_payload_json)
        if payload_text:
            parts.append(payload_text)
        return self._dedupe_lines("\n".join(part for part in parts if part))

    def flatten_ocr_payload(self, payload: Any) -> str:
        if payload is None:
            return ""
        if isinstance(payload, str):
            stripped = payload.strip()
            if not stripped:
                return ""
            try:
                payload = json.loads(stripped)
            except json.JSONDecodeError:
                return stripped
        if isinstance(payload, dict):
            if isinstance(payload.get("markdown"), str) and payload["markdown"].strip():
                return payload["markdown"].strip()
            for key in ("blocks", "lines", "segments"):
                text = self._flatten_items(payload.get(key))
                if text:
                    return text
            pages = payload.get("pages")
            if isinstance(pages, list):
                page_parts: list[str] = []
                for page in pages:
                    if not isinstance(page, dict):
                        continue
                    page_parts.append(self._flatten_items(page.get("raw_ocr")))
                    page_parts.append(self._flatten_items(page.get("lines")))
                    page_parts.append(self._flatten_items(page.get("blocks")))
                return self._dedupe_lines("\n".join(part for part in page_parts if part))
            return ""
        if isinstance(payload, list):
            return self._flatten_items(payload)
        return str(payload).strip()

    def build_rule_hints(self, text: str) -> dict[str, list[str]]:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return {
            "candidate_titles": self._pick_lines(lines, ("报告", "记录", "检查", "小结", "病历"), limit=8),
            "candidate_dates": self._pick_lines(lines, ("日期", "时间", "入院", "出院", "报告", "检查"), limit=10),
            "candidate_identifier_lines": self._pick_lines(lines, ("住院号", "门诊号", "病案号", "身份证", "MRN", "ID"), limit=10),
            "candidate_patient_lines": self._pick_lines(lines, ("姓名", "性别", "年龄", "出生", "电话", "手机"), limit=10),
            "candidate_organization_lines": self._pick_lines(lines, ("医院", "中心", "诊所", "科室", "科"), limit=10),
        }

    def build_system_prompt(self, schema_context: dict[str, Any]) -> str:
        return (
            "你是医疗文档元数据抽取器。\n"
            "任务：从 OCR 文本中抽取文档级索引元数据，只输出合法 JSON。\n\n"
            "输出顶层必须且只能包含 result，不要输出 audit、evidence、解释、Markdown 或代码块。\n"
            "result 必须包含 schema_context.required_result_keys 中的所有字段。\n"
            "抽不到的单值字段填 null，唯一标识符抽不到填 []。\n"
            "不要编造患者信息、机构、诊断、日期或编号。\n"
            "文档类型必须来自 schema_context.document_type_enum。\n"
            "文档子类型必须来自 schema_context.document_subtype_by_type[文档类型]；无法判断填 null。\n"
            "出生日期格式为 YYYY-MM-DD。\n"
            "文档生效日期格式为 YYYY-MM-DDT00:00:00；无法确定日期填 null。\n"
            "唯一标识符必须是数组，每项包含 标识符类型 和 标识符编号。\n\n"
            f"schema_context:\n{json.dumps(schema_context, ensure_ascii=False, indent=2)}"
        )

    def build_user_prompt(self, payload: dict[str, Any]) -> str:
        return (
            "请从下面文档中抽取元数据。\n\n"
            f"document_id: {payload.get('document_id')}\n"
            f"filename: {payload.get('original_filename')}\n"
            f"mime_type: {payload.get('mime_type')}\n\n"
            f"规则预判：\n{json.dumps(payload.get('rule_hints') or {}, ensure_ascii=False, indent=2)}\n\n"
            f"OCR 文本：\n{payload.get('ocr_text') or ''}"
        )

    def _trim_ocr_text(self, text: str) -> str:
        if len(text) <= 9000:
            return text
        selected: list[str] = [text[:5000], text[-2000:]]
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith(("#", "##")) or any(keyword in stripped for keyword in self.KEYWORDS):
                selected.append(stripped)
        return self._dedupe_lines("\n".join(selected))[:12000]

    def _flatten_items(self, items: Any) -> str:
        if not isinstance(items, list):
            return ""
        parts: list[str] = []
        for item in items:
            if isinstance(item, str):
                cleaned = item.strip()
            elif isinstance(item, dict):
                raw_text = item.get("text") or item.get("markdown") or item.get("content") or ""
                cleaned = self._strip_html(str(raw_text))
            else:
                cleaned = str(item).strip()
            if cleaned:
                parts.append(cleaned)
        return self._dedupe_lines("\n".join(parts))

    def _strip_html(self, text: str) -> str:
        text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</tr>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</td>", "\t", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", "", text)
        return re.sub(r"\n{3,}", "\n\n", text.replace("**", "")).strip()

    def _dedupe_lines(self, text: str) -> str:
        out: list[str] = []
        seen: set[str] = set()
        for line in text.splitlines():
            normalized = re.sub(r"\s+", " ", line).strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            out.append(line.strip())
        return "\n".join(out).strip()

    def _pick_lines(self, lines: list[str], keywords: tuple[str, ...], *, limit: int) -> list[str]:
        picked = [line for line in lines if any(keyword in line for keyword in keywords)]
        return picked[:limit]
