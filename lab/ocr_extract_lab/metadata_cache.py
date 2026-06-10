from __future__ import annotations

import json
import mimetypes
import os
import re
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from app.services.metadata_agent import MetadataExtractionAgent, RuleBasedMetadataExtractionAgent
from app.services.metadata_normalizer import METADATA_SCHEMA_VERSION, MetadataNormalizer

from .cache import load_batch_entries, read_json


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def batch_metadata_summary_path(batch_dir: Path) -> Path:
    return batch_dir / "document_metadata_summary.json"


def metadata_path_for_entry(entry: dict[str, Any]) -> Path:
    output_dir = entry.get("output_dir")
    if output_dir:
        return Path(str(output_dir)) / "metadata.json"
    relative = re.sub(r"[^0-9A-Za-z._\-\u4e00-\u9fff]+", "_", str(entry.get("source_name") or "document"))
    return Path(str(entry.get("normalized_json") or ".")).parent / f"{relative}.metadata.json"


def load_metadata_index(batch_dir: Path) -> dict[str, dict[str, Any]]:
    entries = load_batch_entries(batch_dir)
    index: dict[str, dict[str, Any]] = {}
    summary_path = batch_metadata_summary_path(batch_dir)
    if summary_path.exists():
        summary = read_json(summary_path)
        for item in summary.get("results") or []:
            if isinstance(item, dict):
                add_metadata_index_item(index, item)
    for entry in entries:
        path = metadata_path_for_entry(entry)
        if path.exists():
            add_metadata_index_item(index, read_json(path))
    return index


def add_metadata_index_item(index: dict[str, dict[str, Any]], item: dict[str, Any]) -> None:
    for key in ("relative_path", "source_name", "normalized_json"):
        value = item.get(key)
        if value:
            index[str(value)] = item


def metadata_for_entry(entry: dict[str, Any], index: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    for key in ("relative_path", "source_name", "normalized_json"):
        value = entry.get(key)
        if value and str(value) in index:
            return index[str(value)]
    return None


def ensure_batch_metadata(
    batch_dir: Path,
    *,
    force: bool = False,
    limit: int = 0,
    strategy: str | None = None,
) -> dict[str, Any]:
    entries = load_batch_entries(batch_dir)
    selected = entries[:limit] if limit and limit > 0 else entries
    results: list[dict[str, Any]] = []
    started_at = datetime.utcnow()
    strategy_name = normalize_strategy(strategy or os.getenv("EACY_LAB_METADATA_STRATEGY") or "rule")

    for index, entry in enumerate(selected, start=1):
        path = metadata_path_for_entry(entry)
        if path.exists() and not force:
            result = read_json(path)
        else:
            result = classify_entry(entry, strategy=strategy_name)
            write_json(path, result)
        results.append(result)
        write_metadata_summary(
            batch_dir,
            results=results,
            total_count=len(entries),
            strategy=strategy_name,
            started_at=started_at,
            finished=False,
        )

    summary = write_metadata_summary(
        batch_dir,
        results=results,
        total_count=len(entries),
        strategy=strategy_name,
        started_at=started_at,
        finished=True,
    )
    return summary


def classify_entry(entry: dict[str, Any], *, strategy: str) -> dict[str, Any]:
    started_at = datetime.utcnow()
    payload = read_json(Path(str(entry.get("normalized_json"))))
    document = metadata_document(entry, payload)
    raw_output: dict[str, Any] | None = None
    warnings: list[dict[str, str]] = []
    try:
        raw_output = metadata_agent(strategy).extract(metadata_input(document))
    except Exception as exc:
        warnings.append({"type": exc.__class__.__name__, "message": str(exc), "fallback": "rule"})
        raw_output = RuleBasedMetadataExtractionAgent().extract(metadata_input(document))

    normalizer = MetadataNormalizer()
    normalized = normalizer.normalize(raw_output)
    hinted = apply_lab_source_hints(normalized, payload.get("markdown") or "", str(entry.get("source_name") or ""))
    normalized = normalizer.normalize({"result": hinted})
    updates = normalizer.to_document_update(normalized)
    return {
        "status": "completed",
        "schema_version": METADATA_SCHEMA_VERSION,
        "strategy": strategy,
        "source_name": entry.get("source_name"),
        "relative_path": entry.get("relative_path"),
        "source_path": entry.get("source_path"),
        "normalized_json": entry.get("normalized_json"),
        "markdown": entry.get("markdown"),
        "metadata_json": updates.get("metadata_json"),
        "doc_type": updates.get("doc_type"),
        "doc_subtype": updates.get("doc_subtype"),
        "doc_title": updates.get("doc_title"),
        "effective_at": updates.get("effective_at"),
        "result": normalized,
        "raw_output": raw_output,
        "warnings": warnings,
        "started_at": started_at.isoformat(),
        "finished_at": datetime.utcnow().isoformat(),
    }


def metadata_document(entry: dict[str, Any], payload: dict[str, Any]) -> SimpleNamespace:
    source_name = str(entry.get("source_name") or entry.get("relative_path") or "document")
    return SimpleNamespace(
        id=f"ocr-{entry.get('index') or source_name}",
        original_filename=source_name,
        file_name=source_name,
        mime_type=entry.get("mime_type") or mimetypes.guess_type(source_name)[0],
        ocr_text=payload.get("markdown") or "",
        ocr_payload_json=payload,
    )


def metadata_input(document: SimpleNamespace) -> dict[str, Any]:
    from app.services.metadata_prompt_builder import MetadataPromptBuilder

    return MetadataPromptBuilder().build_input(document)


def metadata_agent(strategy: str) -> Any:
    if strategy in {"rule", "rule_based", "heuristic"}:
        return RuleBasedMetadataExtractionAgent()
    return MetadataExtractionAgent()


def normalize_strategy(value: str) -> str:
    normalized = value.strip().lower().replace("-", "_")
    return normalized or "rule"


def write_metadata_summary(
    batch_dir: Path,
    *,
    results: list[dict[str, Any]],
    total_count: int,
    strategy: str,
    started_at: datetime,
    finished: bool,
) -> dict[str, Any]:
    completed = sum(1 for item in results if item.get("status") == "completed")
    failed = sum(1 for item in results if item.get("status") == "failed")
    summary = {
        "batch_dir": str(batch_dir),
        "schema_version": METADATA_SCHEMA_VERSION,
        "strategy": strategy,
        "total_count": total_count,
        "processed_count": len(results),
        "completed_count": completed,
        "failed_count": failed,
        "started_at": started_at.isoformat(),
        "finished_at": datetime.utcnow().isoformat() if finished else None,
        "results": results,
    }
    write_json(batch_metadata_summary_path(batch_dir), summary)
    return summary


SOURCE_HINTS: tuple[tuple[tuple[str, ...], str, str], ...] = (
    (("住院病案首页", "病案首页", "手术及操作编码"), "病历记录", "病案首页"),
    (("出院记录", "出院小结", "出院情况", "出院医嘱"), "病历记录", "出院小结_记录"),
    (("入院记录",), "病历记录", "入院记录"),
    (("病程记录", "首次病程录", "术后首次病程记录", "术前讨论", "术前小结"), "病历记录", "病程记录"),
    (("手术记录", "手术名称"), "治疗记录", "手术记录"),
    (("麻醉记录", "麻醉记录单", "麻醉恢复记录"), "治疗记录", "麻醉记录"),
    (("麻醉访视记录单",), "病历记录", "麻醉访视记录单"),
    (("手术风险评估表",), "病历记录", "手术风险评估表"),
    (("护理记录", "护理记录单", "术前评估／交接护理记录单"), "病历记录", "护理记录"),
    (("手术知情同意书", "麻醉知情同意书", "患者告知书"), "其他材料", "治疗同意书"),
    (("CT", "CT检查", "CT平扫"), "影像检查", "CT检查"),
    (("MRI", "磁共振"), "影像检查", "MRI检查"),
    (("超声", "B超"), "影像检查", "超声检查"),
    (("心电图",), "生理功能检查", "心电图(ECG)"),
    (("血常规",), "实验室检查", "血常规"),
    (("生化", "肝功", "肾功", "电解质"), "实验室检查", "生化检查"),
    (("凝血",), "实验室检查", "凝血功能"),
    (("病理",), "病理报告", "手术病理"),
)


def apply_lab_source_hints(result: dict[str, Any], text: str, filename: str) -> dict[str, Any]:
    haystack = f"{filename}\n{text}"
    for keywords, doc_type, doc_subtype in SOURCE_HINTS:
        if any(keyword in haystack for keyword in keywords):
            updated = dict(result)
            updated["文档类型"] = doc_type
            updated["文档子类型"] = doc_subtype
            updated["文档标题"] = result.get("文档标题") or doc_subtype
            return updated
    return result
