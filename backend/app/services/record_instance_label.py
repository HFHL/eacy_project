from __future__ import annotations


def record_instance_label(form_title: str | None, form_key: str | None, repeat_index: int | None) -> str:
    title = (form_title or form_key or "").strip() or "Record"
    index = max(0, int(repeat_index or 0))
    return title if index == 0 else f"{title}_{index + 1}"
