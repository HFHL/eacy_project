from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models import Document


@dataclass(frozen=True)
class ExtractionPlanItem:
    document_id: str
    target_form_key: str
    form_title: str | None = None
    reason: str | None = None
    match_role: str | None = None


class ExtractionPlanner:
    """Plan document-level extraction as one or more targeted form jobs."""

    def plan(
        self,
        *,
        document: Document,
        schema_json: dict[str, Any],
        target_form_key: str | None = None,
        input_json: dict[str, Any] | None = None,
        source_roles: set[str] | None = None,
    ) -> list[ExtractionPlanItem]:
        explicit_form_keys = self._explicit_form_keys(target_form_key=target_form_key, input_json=input_json)
        forms = self._schema_forms(schema_json)
        if explicit_form_keys:
            return [
                ExtractionPlanItem(
                    document_id=document.id,
                    target_form_key=form["form_key"],
                    form_title=form.get("form_title"),
                    reason="explicit target form",
                    match_role="explicit",
                )
                for form in forms
                if form["form_key"] in explicit_form_keys
            ]

        document_terms = self._document_terms(document)
        matched: list[ExtractionPlanItem] = []
        seen: set[str] = set()
        for form in forms:
            role, source = self._match_sources(form.get("sources"), document_terms, source_roles=source_roles)
            if role is None:
                continue
            form_key = form["form_key"]
            if form_key in seen:
                continue
            seen.add(form_key)
            matched.append(
                ExtractionPlanItem(
                    document_id=document.id,
                    target_form_key=form_key,
                    form_title=form.get("form_title"),
                    reason=f"document metadata matched {role} source: {source}",
                    match_role=role,
                )
            )
        return matched

    def _schema_forms(self, schema_json: dict[str, Any]) -> list[dict[str, Any]]:
        forms: list[dict[str, Any]] = []
        for group_key, group_schema in (schema_json.get("properties") or {}).items():
            group_properties = (group_schema or {}).get("properties") or {}
            for form_key, form_schema in group_properties.items():
                if not isinstance(form_schema, dict):
                    continue
                target_schema = form_schema.get("items") if form_schema.get("type") == "array" and isinstance(form_schema.get("items"), dict) else form_schema
                sources = form_schema.get("x-sources") or (target_schema or {}).get("x-sources")
                forms.append(
                    {
                        "group_key": str(group_key),
                        "form_key": f"{group_key}.{form_key}",
                        "form_title": str((target_schema or {}).get("x-display-name") or form_schema.get("x-display-name") or form_key),
                        "sources": sources,
                        "is_extraction_unit": bool(form_schema.get("x-is-extraction-unit") or (target_schema or {}).get("x-is-extraction-unit")),
                    }
                )
        return forms

    def _explicit_form_keys(self, *, target_form_key: str | None, input_json: dict[str, Any] | None) -> set[str]:
        form_keys = set(self._as_list((input_json or {}).get("form_keys")))
        if target_form_key:
            form_keys.add(target_form_key)
        return form_keys

    def _document_terms(self, document: Document) -> list[str]:
        metadata = document.metadata_json if isinstance(document.metadata_json, dict) else {}
        values = [
            document.doc_type,
            document.doc_subtype,
            document.document_type,
            document.document_sub_type,
            document.doc_title,
            document.original_filename,
            metadata.get("文档类型"),
            metadata.get("文档子类型"),
            metadata.get("document_type"),
            metadata.get("document_subtype"),
            metadata.get("doc_type"),
            metadata.get("doc_subtype"),
            metadata.get("title"),
        ]
        return [self._normalize(value) for value in values if self._normalize(value)]

    def _match_sources(self, sources: Any, document_terms: list[str], *, source_roles: set[str] | None = None) -> tuple[str | None, str | None]:
        if not isinstance(sources, dict):
            return None, None
        roles = ("primary", "secondary") if source_roles is None else tuple(role for role in ("primary", "secondary") if role in source_roles)
        for role in roles:
            for source in self._as_list(sources.get(role)):
                normalized_source = self._normalize(source)
                if not normalized_source:
                    continue
                if any(normalized_source in term or term in normalized_source for term in document_terms):
                    return role, source
        return None, None

    def _normalize(self, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip().lower().replace(" ", "").replace("/", "").replace("／", "")

    def _as_list(self, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item) for item in value if item is not None]
        return [str(value)]
