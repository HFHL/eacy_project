from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SchemaField:
    field_key: str
    field_path: str
    field_title: str
    value_type: str
    extraction_prompt: str | None = None
    options: list[Any] | None = None
    record_form_key: str | None = None
    record_form_title: str | None = None
    group_key: str | None = None
    group_title: str | None = None


def schema_top_level_forms(schema_json: dict[str, Any]) -> list[dict[str, str | None]]:
    properties = schema_json.get("properties") or {}
    forms: list[dict[str, str | None]] = []
    for folder_key, folder_schema in properties.items():
        folder_properties = (folder_schema or {}).get("properties") or {}
        if not folder_properties:
            forms.append(
                {
                    "group_key": str(folder_key),
                    "group_title": str(folder_key),
                    "form_key": str(folder_key),
                    "form_title": str(folder_key),
                }
            )
            continue
        for form_key in folder_properties.keys():
            forms.append(
                {
                    "group_key": str(folder_key),
                    "group_title": str(folder_key),
                    "form_key": f"{folder_key}.{form_key}",
                    "form_title": str(form_key),
                }
            )
    if not forms:
        forms.append({"group_key": "ehr", "group_title": "EHR", "form_key": "ehr", "form_title": "EHR"})
    return forms


def schema_leaf_paths(schema_json: dict[str, Any]) -> set[str]:
    """返回 schema 中所有叶子字段的"规范化路径"集合（去除数组下标）。

    与 `plan_schema_fields` 返回的 `field_path` 等价；这里做单独导出是为了让"完整度
    统计"等调用方避免实例化完整的 SchemaField 列表，且与 `FieldCurrentValue.field_path`
    的去下标比较直接对齐。"""
    return {field.field_path for field in plan_schema_fields(schema_json or {})}


def plan_schema_fields(schema_json: dict[str, Any]) -> list[SchemaField]:
    fields: list[SchemaField] = []
    definitions = schema_json.get("$defs") or {}

    def options_for(field_schema: dict[str, Any]) -> list[Any] | None:
        if isinstance(field_schema.get("enum"), list):
            return field_schema["enum"]
        refs = field_schema.get("allOf") or []
        if refs and isinstance(refs[0], dict):
            ref = refs[0].get("$ref")
            if isinstance(ref, str) and ref.startswith("#/$defs/"):
                enum_schema = definitions.get(ref.removeprefix("#/$defs/")) or {}
                if isinstance(enum_schema.get("enum"), list):
                    return enum_schema["enum"]
        item_schema = field_schema.get("items") or {}
        if isinstance(item_schema, dict) and isinstance(item_schema.get("enum"), list):
            return item_schema["enum"]
        return None

    def infer_value_type(field_schema: dict[str, Any]) -> str:
        display = field_schema.get("x-display")
        schema_type = field_schema.get("type")
        if field_schema.get("format") == "date-time":
            return "datetime"
        if field_schema.get("format") == "date" or display == "date":
            return "date"
        if schema_type in {"number", "integer"} or display == "number":
            return "number"
        if schema_type in {"array", "object"}:
            return "json"
        return "text"

    def is_leaf(field_schema: dict[str, Any]) -> bool:
        if field_schema.get("allOf"):
            return True
        schema_type = field_schema.get("type")
        if schema_type == "object" and isinstance(field_schema.get("properties"), dict):
            return False
        if schema_type == "array" and isinstance((field_schema.get("items") or {}).get("properties"), dict):
            return False
        return True

    def walk(
        schema: dict[str, Any],
        path: list[str],
        *,
        group_key: str | None,
        group_title: str | None,
        record_form_key: str | None,
        record_form_title: str | None,
    ) -> None:
        if is_leaf(schema):
            if not path:
                return
            field_key = path[-1]
            fields.append(
                SchemaField(
                    field_key=field_key,
                    field_path=".".join(path),
                    field_title=str(schema.get("x-display-name") or field_key),
                    value_type=infer_value_type(schema),
                    extraction_prompt=schema.get("x-extraction-prompt") or schema.get("description"),
                    options=options_for(schema),
                    record_form_key=record_form_key,
                    record_form_title=record_form_title,
                    group_key=group_key,
                    group_title=group_title,
                )
            )
            return

        properties = schema.get("properties") or {}
        if schema.get("type") == "array":
            properties = (schema.get("items") or {}).get("properties") or {}
        for child_key, child_schema in properties.items():
            if isinstance(child_schema, dict):
                walk(
                    child_schema,
                    [*path, str(child_key)],
                    group_key=group_key,
                    group_title=group_title,
                    record_form_key=record_form_key,
                    record_form_title=record_form_title,
                )

    for folder_key, folder_schema in (schema_json.get("properties") or {}).items():
        folder_properties = (folder_schema or {}).get("properties") or {}
        for form_key, form_schema in folder_properties.items():
            walk(
                form_schema,
                [str(folder_key), str(form_key)],
                group_key=str(folder_key),
                group_title=str(folder_key),
                record_form_key=f"{folder_key}.{form_key}",
                record_form_title=str(form_key),
            )

    return fields
