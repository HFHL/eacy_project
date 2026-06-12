from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ExportField:
    field_path: str
    field_key: str
    field_title: str
    value_type: str
    group_key: str
    group_title: str
    form_key: str
    form_title: str


@dataclass(frozen=True)
class ExportRequest:
    scope: str = "all"
    patient_ids: tuple[str, ...] = ()
    expand_repeatable_rows: bool = True
