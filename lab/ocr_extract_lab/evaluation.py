from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


VALUE_SLOTS = ("value_text", "value_number", "value_date", "value_datetime", "value_json")


def evaluate_run(run_dir: Path) -> dict[str, Any]:
    run = read_json(run_dir / "run.json", default={})
    fields = run.get("fields") if isinstance(run.get("fields"), list) else []
    docs = run.get("documents") if isinstance(run.get("documents"), list) else []
    planned_specs = load_planned_specs(run_dir)
    planned_paths = set(planned_specs)
    extracted_paths = {str(field.get("field_path")) for field in fields if isinstance(field, dict) and field.get("field_path")}
    format_errors = validate_fields(fields, planned_paths)
    by_form = evaluate_by_form(planned_specs, fields)
    status_counts = Counter(str(doc.get("status") or "unknown") for doc in docs if isinstance(doc, dict))
    metric = {
        "run_id": run.get("run_id"),
        "status": run.get("status"),
        "document_count": len(docs),
        "document_status_counts": dict(status_counts),
        "planned_unique_field_count": len(planned_paths),
        "extracted_field_count": len(fields),
        "extracted_unique_field_count": len(extracted_paths),
        "non_empty_field_count": sum(1 for field in fields if non_empty_value(field)),
        "format_error_count": len(format_errors),
        "format_valid": not format_errors,
        "fill_rate": ratio(len(extracted_paths & planned_paths), len(planned_paths)),
        "non_empty_fill_rate": ratio(sum(1 for field in fields if non_empty_value(field)), len(planned_paths)),
        "unexpected_field_count": len(extracted_paths - planned_paths),
        "missing_planned_field_count": len(planned_paths - extracted_paths),
        "by_form": by_form,
        "format_errors": format_errors[:200],
        "missing_planned_fields": sorted(planned_paths - extracted_paths)[:300],
        "unexpected_fields": sorted(extracted_paths - planned_paths)[:100],
    }
    write_json(run_dir / "output" / "evaluation.json", metric)
    return metric


def load_planned_specs(run_dir: Path) -> dict[str, dict[str, Any]]:
    specs: dict[str, dict[str, Any]] = {}
    for path in sorted((run_dir / "documents").glob("*/input/selected_fields.json")):
        items = read_json(path, default=[])
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and item.get("field_path"):
                specs[str(item["field_path"])] = item
    return specs


def validate_fields(fields: list[Any], planned_paths: set[str]) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    for index, field in enumerate(fields):
        if not isinstance(field, dict):
            errors.append({"index": index, "type": "not_object"})
            continue
        path = str(field.get("field_path") or "")
        if not path:
            errors.append({"index": index, "type": "missing_field_path"})
        elif planned_paths and path not in planned_paths:
            errors.append({"index": index, "field_path": path, "type": "unexpected_field_path"})
        slots = [slot for slot in VALUE_SLOTS if field.get(slot) not in (None, "", [], {})]
        if not slots:
            errors.append({"index": index, "field_path": path, "type": "empty_value"})
        if len(slots) > 1:
            errors.append({"index": index, "field_path": path, "type": "multiple_value_slots", "slots": slots})
        if field.get("confidence") is None:
            errors.append({"index": index, "field_path": path, "type": "missing_confidence"})
        evidences = field.get("evidences")
        if not isinstance(evidences, list) or not evidences:
            errors.append({"index": index, "field_path": path, "type": "missing_evidence"})
        else:
            for evidence_index, evidence in enumerate(evidences):
                if not isinstance(evidence, dict):
                    errors.append({"index": index, "field_path": path, "type": "bad_evidence", "evidence_index": evidence_index})
                    continue
                if not evidence.get("quote_text"):
                    errors.append({"index": index, "field_path": path, "type": "missing_quote_text", "evidence_index": evidence_index})
    return errors


def evaluate_by_form(planned_specs: dict[str, dict[str, Any]], fields: list[Any]) -> list[dict[str, Any]]:
    planned_by_form: dict[str, set[str]] = defaultdict(set)
    for path, spec in planned_specs.items():
        form = str(spec.get("record_form_key") or "unknown")
        planned_by_form[form].add(path)
    extracted_by_form: dict[str, set[str]] = defaultdict(set)
    for field in fields:
        if not isinstance(field, dict) or not field.get("field_path"):
            continue
        form = str(field.get("record_form_key") or planned_specs.get(str(field.get("field_path")), {}).get("record_form_key") or "unknown")
        extracted_by_form[form].add(str(field["field_path"]))
    rows: list[dict[str, Any]] = []
    for form in sorted(set(planned_by_form) | set(extracted_by_form)):
        planned = planned_by_form.get(form, set())
        extracted = extracted_by_form.get(form, set())
        rows.append(
            {
                "record_form_key": form,
                "planned_unique_field_count": len(planned),
                "extracted_unique_field_count": len(extracted),
                "fill_rate": ratio(len(planned & extracted), len(planned)),
            }
        )
    return rows


def non_empty_value(field: Any) -> bool:
    if not isinstance(field, dict):
        return False
    return any(field.get(slot) not in (None, "", [], {}) for slot in VALUE_SLOTS)


def ratio(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)


def read_json(path: Path, *, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
