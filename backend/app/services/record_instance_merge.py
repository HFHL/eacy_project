from dataclasses import dataclass
from typing import Any

from app.models import RecordInstance
from app.services.record_instance_label import record_instance_label
from app.services.record_instance_merge_utils import (
    binding_names,
    canonical_field_path,
    field_value,
    fields_by_label,
    first_text,
    label_key,
    local_repeat_index_for_field,
    normalize_chinese_ordinals,
    normalize_date_text,
    normalize_value,
    parse_merge_binding,
    record_form_key_from_field_path,
)


@dataclass(frozen=True)
class OutputFieldGroupKey:
    form_key: str | None
    local_repeat_index: int


class RecordInstanceMergeResolver:
    """Resolve extraction output rows to stable RecordInstance rows.

    Claude/LLM repeat_index is local to one output document. This resolver maps
    those local rows onto patient/CRF-global record instances using schema
    merge bindings and stored record anchors.
    """

    def __init__(
        self,
        *,
        record_repository: Any,
        records_by_form: dict[str, dict[int, RecordInstance]],
        default_record: RecordInstance | None,
        context_id: str,
        source_document_id: str | None,
        extraction_run_id: str | None,
    ):
        self.record_repository = record_repository
        self.records_by_form = records_by_form
        self.default_record = default_record
        self.context_id = context_id
        self.source_document_id = source_document_id
        self.extraction_run_id = extraction_run_id

    def group_key_for_field(self, field: dict[str, Any]) -> OutputFieldGroupKey:
        form_key = field.get("record_form_key") or self.record_form_key_from_field_path(field.get("field_path"))
        return OutputFieldGroupKey(
            form_key=form_key,
            local_repeat_index=self.local_repeat_index_for_field(field=field, record_form_key=form_key),
        )

    async def resolve_record_for_group(self, fields: list[dict[str, Any]]) -> RecordInstance | None:
        if not fields:
            return self.default_record

        key = self.group_key_for_field(fields[0])
        form_key = key.form_key
        if not form_key:
            return self.default_record

        records_for_form = self.records_by_form.setdefault(form_key, {})
        base_record = records_for_form.get(0) or next(iter(records_for_form.values()), None)
        anchor_json = self.build_anchor_json(
            fields=fields,
            form_key=form_key,
            local_repeat_index=key.local_repeat_index,
        )
        merge_key = str(anchor_json.get("merge_key") or "")

        matched = self._record_with_merge_key(records_for_form, merge_key)
        if matched is not None:
            return matched

        blank_default = records_for_form.get(0)
        if self._can_claim_default_record(blank_default):
            blank_default.anchor_json = anchor_json
            if self.source_document_id and getattr(blank_default, "source_document_id", None) is None:
                blank_default.source_document_id = self.source_document_id
            if self.extraction_run_id and getattr(blank_default, "created_by_run_id", None) is None:
                blank_default.created_by_run_id = self.extraction_run_id
            if hasattr(self.record_repository, "save"):
                await self.record_repository.save(blank_default)
            return blank_default

        repeat_index = await self._next_repeat_index(form_key=form_key, records_for_form=records_for_form)
        record = await self._create_record(
            form_key=form_key,
            repeat_index=repeat_index,
            base_record=base_record,
            form_title=fields[0].get("record_form_title"),
            group_key=fields[0].get("group_key"),
            group_title=fields[0].get("group_title"),
            anchor_json=anchor_json,
        )
        records_for_form[repeat_index] = record
        return record

    def build_anchor_json(
        self,
        *,
        fields: list[dict[str, Any]],
        form_key: str,
        local_repeat_index: int,
    ) -> dict[str, Any]:
        merge_binding = self._first_text(field.get("merge_binding") for field in fields)
        binding = self._parse_merge_binding(merge_binding)
        field_by_label = self._fields_by_label(fields)

        anchor_values: dict[str, Any] = {}
        group_values: dict[str, Any] = {}
        interval_values: dict[str, Any] = {}
        merge_parts: list[str] = [f"form={form_key}"]

        anchor_names = self._binding_names(binding.get("anchor"))
        fallback_names = self._binding_names(binding.get("fallback"))
        group_names = self._binding_names(binding.get("group_key"))
        interval_names = self._binding_names(binding.get("interval"), separator="|")
        has_merge_rule = bool(anchor_names or fallback_names or group_names or interval_names)
        anchor_source: str | None = None

        for name in anchor_names:
            value = self._field_value(field_by_label.get(self._label_key(name)))
            if value not in (None, "", [], {}):
                anchor_values[name] = value
        if anchor_values:
            anchor_source = "anchor"
        if not anchor_values:
            for name in fallback_names:
                value = self._field_value(field_by_label.get(self._label_key(name)))
                if value not in (None, "", [], {}):
                    anchor_values[name] = value
            if anchor_values:
                anchor_source = "fallback"

        for name in group_names:
            value = self._field_value(field_by_label.get(self._label_key(name)))
            if value not in (None, "", [], {}):
                group_values[name] = value

        for name in interval_names:
            value = self._field_value(field_by_label.get(self._label_key(name)))
            if value not in (None, "", [], {}):
                interval_values[name] = value

        granularity = binding.get("granularity")
        for prefix, values in (
            ("anchor", anchor_values),
            ("interval", interval_values),
            ("group", group_values),
        ):
            for name, value in sorted(values.items()):
                merge_parts.append(f"{prefix}:{self._label_key(name)}={self._normalize_value(value, granularity)}")

        missing_merge_anchor = has_merge_rule and not (anchor_values or group_values or interval_values)
        fallback_used = False
        if len(merge_parts) == 1:
            fallback_used = True
            if missing_merge_anchor:
                merge_parts.append("missing_merge_anchor=1")
                fallback_scope = self.source_document_id or self.extraction_run_id
                if fallback_scope:
                    merge_parts.append(f"fallback_scope={fallback_scope}")
                if local_repeat_index > 0:
                    merge_parts.append(f"local_repeat_index={local_repeat_index}")
            elif local_repeat_index > 0:
                merge_parts.append(f"local_repeat_index={local_repeat_index}")

        merge_key = "|".join(merge_parts)
        return {
            "version": 1,
            "form_key": form_key,
            "merge_binding": merge_binding,
            "merge_key": merge_key,
            "anchor_values": anchor_values,
            "anchor_source": anchor_source,
            "group_values": group_values,
            "interval_values": interval_values,
            "source_document_id": self.source_document_id,
            "local_repeat_index": local_repeat_index,
            "fallback_used": fallback_used,
            "anchor_missing": bool(anchor_names) and anchor_source != "anchor",
            "duplicate_suspect": missing_merge_anchor,
            "duplicate_suspect_reason": "missing_merge_anchor" if missing_merge_anchor else None,
        }

    async def _create_record(
        self,
        *,
        form_key: str,
        repeat_index: int,
        base_record: RecordInstance | None,
        form_title: str | None,
        group_key: str | None,
        group_title: str | None,
        anchor_json: dict[str, Any],
    ) -> RecordInstance:
        title = getattr(base_record, "form_title", None) or form_title or form_key.split(".")[-1]
        resolved_group_key = group_key or getattr(base_record, "group_key", None) or (form_key.split(".")[0] if "." in form_key else None)
        resolved_group_title = group_title or getattr(base_record, "group_title", None) or resolved_group_key
        return await self.record_repository.create(
            {
                "context_id": self.context_id,
                "group_key": resolved_group_key,
                "group_title": resolved_group_title,
                "form_key": form_key,
                "form_title": title,
                "repeat_index": repeat_index,
                "instance_label": record_instance_label(title, form_key, repeat_index),
                "anchor_json": anchor_json,
                "source_document_id": self.source_document_id,
                "created_by_run_id": self.extraction_run_id,
                "review_status": "unreviewed",
            }
        )

    async def _next_repeat_index(self, *, form_key: str, records_for_form: dict[int, RecordInstance]) -> int:
        if hasattr(self.record_repository, "next_repeat_index"):
            return await self.record_repository.next_repeat_index(context_id=self.context_id, form_key=form_key)
        return max(records_for_form.keys(), default=-1) + 1

    def _record_with_merge_key(
        self,
        records_for_form: dict[int, RecordInstance],
        merge_key: str,
    ) -> RecordInstance | None:
        if not merge_key:
            return None
        for record in records_for_form.values():
            anchor_json = getattr(record, "anchor_json", None)
            if isinstance(anchor_json, dict) and anchor_json.get("merge_key") == merge_key:
                return record
        return None

    def _can_claim_default_record(self, record: RecordInstance | None) -> bool:
        if record is None or int(getattr(record, "repeat_index", 0) or 0) != 0:
            return False
        anchor_json = getattr(record, "anchor_json", None)
        if isinstance(anchor_json, dict) and anchor_json.get("merge_key"):
            return False
        return getattr(record, "created_by_run_id", None) is None and getattr(record, "source_document_id", None) is None

    @staticmethod
    def canonical_field_path(field_path: Any) -> str:
        return canonical_field_path(field_path)

    @staticmethod
    def record_form_key_from_field_path(field_path: Any) -> str | None:
        return record_form_key_from_field_path(field_path)

    @staticmethod
    def local_repeat_index_for_field(*, field: dict[str, Any], record_form_key: str | None) -> int:
        return local_repeat_index_for_field(field=field, record_form_key=record_form_key)

    def _fields_by_label(self, fields: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        return fields_by_label(fields)

    @staticmethod
    def _parse_merge_binding(value: str | None) -> dict[str, str]:
        return parse_merge_binding(value)

    @staticmethod
    def _binding_names(value: str | None, *, separator: str = "+") -> list[str]:
        return binding_names(value, separator=separator)

    @staticmethod
    def _field_value(field: dict[str, Any] | None) -> Any:
        return field_value(field)

    @staticmethod
    def _first_text(values: Any) -> str | None:
        return first_text(values)

    @staticmethod
    def _label_key(value: Any) -> str:
        return label_key(value)

    @staticmethod
    def _normalize_value(value: Any, granularity: str | None) -> str:
        return normalize_value(value, granularity)

    @staticmethod
    def _normalize_date_text(text: str) -> str | None:
        return normalize_date_text(text)

    @staticmethod
    def _normalize_chinese_ordinals(text: str) -> str:
        return normalize_chinese_ordinals(text)
