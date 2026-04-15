from __future__ import annotations

import copy
import json
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Any

from app.config import settings

_DB = settings.DB_PATH
# 单条表单：名称、首要来源列表、次要来源列表
FormMeta = tuple[str, list[str], list[str]]


def _nonempty_str(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def _normalize_source_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [s for s in (value.strip(),) if s]
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for x in value:
        s = _nonempty_str(x)
        if s:
            out.append(s)
    return out


def _dedupe_preserve(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _group_target_schema(group_schema: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(group_schema, dict):
        return None
    if group_schema.get("type") == "array" and isinstance(
        group_schema.get("items"), dict
    ):
        return group_schema["items"]
    return group_schema


def _sources_from_x_sources_block(
    target: dict[str, Any] | None,
) -> tuple[list[str], list[str]]:
    if not isinstance(target, dict):
        return [], []
    xs = target.get("x-sources")
    if not isinstance(xs, dict):
        return [], []
    prim = _normalize_source_list(xs.get("primary"))
    sec = _normalize_source_list(xs.get("secondary"))
    return prim, sec


def _forms_meta_from_designer(content: dict[str, Any]) -> list[FormMeta]:
    forms: list[FormMeta] = []
    for folder in content.get("folders") or []:
        if not isinstance(folder, dict):
            continue
        fname = str(folder.get("name") or "").strip()
        for group in folder.get("groups") or []:
            if not isinstance(group, dict):
                continue
            gname = str(group.get("name") or "").strip()
            form_label = (
                f"{fname} / {gname}"
                if fname and gname
                else (gname or fname or "未命名表单")
            )
            prim = _normalize_source_list(
                group.get("primarySources")
                or (group.get("sources") or {}).get("primary")
            )
            sec = _normalize_source_list(
                group.get("secondarySources")
                or (group.get("sources") or {}).get("secondary")
            )
            forms.append((form_label, prim, sec))
    return forms


def _forms_meta_from_field_groups(content: dict[str, Any]) -> list[FormMeta]:
    forms: list[FormMeta] = []
    for group in content.get("fieldGroups") or []:
        if not isinstance(group, dict):
            continue
        form_label = str(group.get("name") or "未命名表单").strip() or "未命名表单"
        prim: list[str] = []
        sec: list[str] = []
        sb = group.get("_sourcesByDocType")
        if isinstance(sb, dict):
            for v in sb.values():
                if not isinstance(v, dict):
                    continue
                prim.extend(_normalize_source_list(v.get("primary")))
                sec.extend(_normalize_source_list(v.get("secondary")))
        prim.extend(_normalize_source_list(group.get("primarySources")))
        sec.extend(_normalize_source_list(group.get("secondarySources")))
        forms.append((form_label, _dedupe_preserve(prim), _dedupe_preserve(sec)))
    return forms


# 与 SchemaParser 一致：根 properties 为文件夹，其下第一层 properties 为字段组，x-sources 写在组对象（或 array.items）上
def _forms_meta_from_json_schema(content: dict[str, Any]) -> list[FormMeta]:
    root = content.get("properties")
    if not isinstance(root, dict) or not root:
        return []
    forms: list[FormMeta] = []
    for folder_name, folder_schema in root.items():
        if not isinstance(folder_schema, dict):
            continue
        fprops = folder_schema.get("properties")
        if not isinstance(fprops, dict) or not fprops:
            tgt = _group_target_schema(folder_schema)
            if tgt:
                prim, sec = _sources_from_x_sources_block(folder_schema)
                if not prim and not sec:
                    prim, sec = _sources_from_x_sources_block(tgt)
                if prim or sec:
                    label = str(folder_name).strip() or "未命名表单"
                    forms.append((label, prim, sec))
            continue
        for group_name, group_schema in fprops.items():
            if not isinstance(group_schema, dict):
                continue
            target = _group_target_schema(group_schema)
            prim, sec = _sources_from_x_sources_block(group_schema)
            if not prim and not sec:
                prim, sec = _sources_from_x_sources_block(target)
            fn = str(folder_name).strip()
            gn = str(group_name).strip()
            form_label = f"{fn} / {gn}" if fn and gn else (gn or fn or "未命名表单")
            forms.append((form_label, prim, sec))
    return forms


def _parse_content_json(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8", errors="replace")
    if isinstance(raw, str):
        try:
            obj = json.loads(raw or "{}")
        except json.JSONDecodeError:
            return {}
        return obj if isinstance(obj, dict) else {}
    return {}


def _build_forms_meta_list(content: dict[str, Any]) -> list[FormMeta]:
    if content.get("folders"):
        return _forms_meta_from_designer(content)
    if content.get("fieldGroups"):
        return _forms_meta_from_field_groups(content)
    if isinstance(content.get("properties"), dict) and content["properties"]:
        return _forms_meta_from_json_schema(content)
    return []


def _format_sources_line(primary: list[str], secondary: list[str]) -> str:
    p = "、".join(primary) if primary else "（未配置）"
    s = "、".join(secondary) if secondary else "（未配置）"
    return f"首要来源：{p}；次要来源：{s}"


# 加载 schema：只输出表单及每个表单的首要/次要来源（不列出字段）
# include_content=True 时附带解析后的 content_json，供裁剪子 schema（避免二次查库）
def load_schema(
    schema_id: str, *, include_content: bool = False
) -> dict[str, Any] | None:
    with sqlite3.connect(_DB) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            "SELECT id, name, code, schema_type, version, content_json FROM schemas WHERE id = ?",
            (schema_id,),
        )
        row = cur.fetchone()
        if not row:
            print(f"未找到 schema：{schema_id}")
            return None
        r = dict(row)
        content = _parse_content_json(r.get("content_json"))
        forms = _build_forms_meta_list(content)
        total_forms = len(forms)
        lines: list[str] = ["待抽取表单："]
        for i, (form_name, primary, secondary) in enumerate(forms, start=1):
            lines.append(
                f"表单{i}（{form_name}）： {_format_sources_line(primary, secondary)}"
            )
        lines.append(f"总表单数量：{total_forms}")
        report = "\n".join(lines)
        # print(report)
        out: dict[str, Any] = {
            "id": r.get("id"),
            "name": r.get("name"),
            "code": r.get("code"),
            "schema_type": r.get("schema_type"),
            "version": r.get("version"),
            "forms": [
                {"name": n, "primary_sources": p, "secondary_sources": s}
                for n, p, s in forms
            ],
            "total_forms": total_forms,
            "report": report,
        }
        if include_content:
            out["content"] = content
        return out


def _parse_form_path(form_name: str) -> tuple[str, str | None]:
    sep = " / "
    if sep in form_name:
        i = form_name.index(sep)
        a, b = form_name[:i].strip(), form_name[i + len(sep) :].strip()
        return a, (b or None)
    s = form_name.strip()
    return s, None


def _normalize_source_token(s: str) -> str:
    """与 Agent 侧类似：去常见分隔符后比较小类文书名（病案首页、入院记录、出院小结_记录 等）。"""
    import re

    if not s:
        return ""
    t = str(s).lower().strip()
    return re.sub(r"[_\-/\\·\s、，,。.（）()【】\[\]《》<>「」『』]+", "", t)


def _doc_matches_source_labels(doc: dict[str, Any], labels: list[str]) -> bool:
    """首要来源等标签只与文档子类型匹配，不与主类型（如「病历记录」）匹配。"""
    st = _nonempty_str(doc.get("doc_sub_type"))
    if not st:
        return False
    n_st = _normalize_source_token(st)
    for lab in labels:
        lg = _nonempty_str(lab)
        if not lg:
            continue
        n_lab = _normalize_source_token(lg)
        if n_st == n_lab or n_lab in n_st or n_st in n_lab:
            return True
    return False


def _wrap_minimal_json_schema(
    full: dict[str, Any], properties: dict[str, Any]
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "$schema": full.get("$schema"),
        "type": "object",
        "properties": properties,
    }
    if "$defs" in full:
        out["$defs"] = copy.deepcopy(full["$defs"])
    if "unevaluatedProperties" in full:
        out["unevaluatedProperties"] = full["unevaluatedProperties"]
    if "$id" in full:
        out["$id"] = full["$id"]
    return out


def _trim_json_schema_form(
    full: dict[str, Any], form_name: str
) -> dict[str, Any] | None:
    root = full.get("properties")
    if not isinstance(root, dict):
        return None
    fn, gn = _parse_form_path(form_name)
    if fn not in root or not isinstance(root[fn], dict):
        return None
    folder_orig = root[fn]
    if gn is None:
        return _wrap_minimal_json_schema(full, {fn: copy.deepcopy(folder_orig)})
    fprops = folder_orig.get("properties")
    if not isinstance(fprops, dict) or gn not in fprops:
        return None
    trim_folder: dict[str, Any] = {
        "type": folder_orig.get("type", "object"),
        "properties": {gn: copy.deepcopy(fprops[gn])},
    }
    for key in ("unevaluatedProperties", "x-property-order"):
        if key in folder_orig:
            trim_folder[key] = copy.deepcopy(folder_orig[key])
    req = folder_orig.get("required")
    if isinstance(req, list) and gn in req:
        trim_folder["required"] = [gn]
    return _wrap_minimal_json_schema(full, {fn: trim_folder})


def _trim_designer_form(
    content: dict[str, Any], form_name: str
) -> dict[str, Any] | None:
    fn_expect, gn_expect = _parse_form_path(form_name)
    new_folders: list[dict[str, Any]] = []
    for folder in content.get("folders") or []:
        if not isinstance(folder, dict):
            continue
        if str(folder.get("name") or "").strip() != fn_expect:
            continue
        if gn_expect is None:
            new_folders.append(copy.deepcopy(folder))
            break
        groups: list[dict[str, Any]] = []
        for group in folder.get("groups") or []:
            if not isinstance(group, dict):
                continue
            if str(group.get("name") or "").strip() == gn_expect:
                groups.append(copy.deepcopy(group))
                break
        if groups:
            nf = {k: copy.deepcopy(v) for k, v in folder.items() if k != "groups"}
            nf["groups"] = groups
            new_folders.append(nf)
        break
    if not new_folders:
        return None
    out = {k: copy.deepcopy(v) for k, v in content.items() if k != "folders"}
    out["folders"] = new_folders
    return out


def _trim_field_groups_form(
    content: dict[str, Any], form_name: str
) -> dict[str, Any] | None:
    want = form_name.strip()
    hit: dict[str, Any] | None = None
    for g in content.get("fieldGroups") or []:
        if isinstance(g, dict) and str(g.get("name") or "").strip() == want:
            hit = copy.deepcopy(g)
            break
    if not hit:
        return None
    out = {k: copy.deepcopy(v) for k, v in content.items() if k != "fieldGroups"}
    out["fieldGroups"] = [hit]
    return out


def _trim_schema_for_form(
    content: dict[str, Any], form_name: str
) -> dict[str, Any] | None:
    if content.get("folders"):
        return _trim_designer_form(content, form_name)
    if content.get("fieldGroups"):
        return _trim_field_groups_form(content, form_name)
    if isinstance(content.get("properties"), dict) and content["properties"]:
        return _trim_json_schema_form(content, form_name)
    return None


# 元数据提取结果写在 metadata.result 里（中文键与后端 documents 路由 META_KEY_MAP 一致）；顶层 doc_type 常为空
def _doc_types_from_metadata(metadata_raw: Any) -> tuple[str | None, str | None]:
    if not metadata_raw:
        return None, None
    if isinstance(metadata_raw, dict):
        meta = metadata_raw
    elif isinstance(metadata_raw, str):
        try:
            meta = json.loads(metadata_raw)
        except json.JSONDecodeError:
            return None, None
    else:
        return None, None
    result = meta.get("result")
    if not isinstance(result, dict):
        result = meta
    dt = _nonempty_str(result.get("文档类型")) or _nonempty_str(
        result.get("documentType")
    )
    st = _nonempty_str(result.get("文档子类型")) or _nonempty_str(
        result.get("documentSubtype")
    )
    return dt, st


# 输入患者 id，读取该患者下所有文档：仅 id、文档类型、文档子类型（优先表字段，否则从 metadata.result 回退）
def get_documents_by_patient_id(patient_id: str) -> list[dict[str, Any]]:
    pid = (patient_id or "").strip()
    if not pid:
        return []
    sql = """
        SELECT id,
               COALESCE(NULLIF(TRIM(doc_type), ''), NULLIF(TRIM(document_type), '')) AS doc_type,
               document_sub_type AS doc_sub_type,
               metadata
        FROM documents
        WHERE patient_id = ?
        ORDER BY datetime(COALESCE(updated_at, created_at, uploaded_at)) DESC
    """
    with sqlite3.connect(_DB) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(sql, (pid,))
        rows: list[dict[str, Any]] = []
        for row in cur.fetchall():
            r = dict(row)
            meta_raw = r.pop("metadata", None)
            m_dt, m_st = _doc_types_from_metadata(meta_raw)
            dt = _nonempty_str(r.get("doc_type")) or m_dt
            st = _nonempty_str(r.get("doc_sub_type")) or m_st
            rows.append({"id": r["id"], "doc_type": dt, "doc_sub_type": st})
        return rows


def _json_loads_maybe(value: Any, default: Any = None) -> Any:
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8", errors="ignore")
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return default
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            return default
    return default


def ocr_payload_to_content_list(
    ocr_payload: Any, raw_text: str | None = None
) -> list[dict[str, Any]]:
    """从 documents.ocr_payload（含 segments）或纯 raw_text 构建 content_list，供 EhrExtractorAgent。"""
    payload = _json_loads_maybe(ocr_payload, default=None)
    if (
        not payload
        and raw_text
        and isinstance(raw_text, str)
        and raw_text.strip().startswith("{")
    ):
        payload = _json_loads_maybe(raw_text, default=None)

    if isinstance(payload, dict):
        segments = payload.get("segments")
        if isinstance(segments, list):
            page_seq: dict[int, int] = defaultdict(int)
            content_list: list[dict[str, Any]] = []
            for seg in segments:
                if not isinstance(seg, dict):
                    continue
                text = (seg.get("text") or seg.get("content") or "").strip()
                if not text:
                    continue
                raw_page = seg.get("page_id", 0)
                try:
                    page_id = int(raw_page) if raw_page is not None else 0
                except (TypeError, ValueError):
                    page_id = 0
                idx_in_page = page_seq[page_id]
                page_seq[page_id] = idx_in_page + 1
                block_id = f"p{page_id}.{idx_in_page}"
                pos = seg.get("position")
                bbox = None
                if isinstance(pos, list) and len(pos) >= 8:
                    bbox = [pos[0], pos[1], pos[4], pos[5]]
                elif isinstance(pos, list) and len(pos) == 4:
                    bbox = pos
                content_list.append(
                    {
                        "id": block_id,
                        "bbox": bbox,
                        "text": text,
                        "page_id": page_id,
                        "page_idx": page_id,
                        "position": pos,
                        "type": seg.get("type"),
                        "sub_type": seg.get("sub_type"),
                    }
                )
            return content_list

    if raw_text and isinstance(raw_text, str) and raw_text.strip():
        t = raw_text.strip()
        return [
            {
                "id": "p0.0",
                "bbox": None,
                "text": t,
                "page_id": 0,
                "page_idx": 0,
                "type": "paragraph",
            }
        ]

    return []


def get_document_for_extraction(document_id: str) -> dict[str, Any] | None:
    """按文档 id 读取 OCR 等字段，组装 EhrExtractorAgent.extract_single_document 所需 document dict。"""
    did = (document_id or "").strip()
    if not did:
        return None
    sql = """
        SELECT id, file_name, file_type,
               COALESCE(NULLIF(TRIM(doc_type), ''), NULLIF(TRIM(document_type), '')) AS doc_type,
               document_sub_type AS doc_sub_type,
               document_type,
               metadata, ocr_payload, raw_text
        FROM documents
        WHERE id = ?
    """
    with sqlite3.connect(_DB) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(sql, (did,)).fetchone()
    if not row:
        return None
    r = dict(row)
    meta_raw = r.get("metadata")
    m_dt, m_st = _doc_types_from_metadata(meta_raw)
    doc_type = _nonempty_str(r.get("doc_type")) or m_dt
    doc_sub = _nonempty_str(r.get("doc_sub_type")) or m_st
    content_list = ocr_payload_to_content_list(r.get("ocr_payload"), r.get("raw_text"))
    meta_out: str
    if isinstance(meta_raw, str):
        meta_out = meta_raw or "{}"
    else:
        meta_out = json.dumps(meta_raw or {}, ensure_ascii=False)

    return {
        "id": r["id"],
        "file_name": r.get("file_name") or "",
        "file_type": r.get("file_type"),
        "document_type": doc_type or "",
        "document_sub_type": doc_sub or "",
        "doc_type": doc_type,
        "metadata": meta_out,
        "content_list": content_list,
    }


# 抽取 pipeline：仅「配置了首要来源」且患者名下存在与首要/次要来源标签匹配的文档」的表单视为可抽取单元；每个单元返回一份裁剪后的 schema（保留 $defs 供 $ref）
def extract_pipeline(patient_id: str, schema_id: str) -> dict[str, Any]:
    documents = get_documents_by_patient_id(patient_id)
    schema = load_schema(schema_id, include_content=True)
    if not schema:
        return {
            "patient_id": patient_id,
            "schema_id": schema_id,
            "trimmed_schemas": [],
            "report": "",
            "error": "schema_not_found",
        }
    content = schema.get("content")
    if not isinstance(content, dict):
        return {
            "patient_id": patient_id,
            "schema_id": schema_id,
            "trimmed_schemas": [],
            "report": "",
            "error": "empty_content",
        }

    trimmed_schemas: list[dict[str, Any]] = []
    report_lines: list[str] = []

    for form in schema.get("forms") or []:
        primary = form.get("primary_sources") or []
        if not primary:
            continue
        # 仅按首要来源判断是否存在可抽取文书（doc_type / doc_sub_type 命中其一即可）
        labels = _dedupe_preserve(list(primary))
        matched_ids = [
            d["id"] for d in documents if _doc_matches_source_labels(d, labels)
        ]
        if not matched_ids:
            continue

        trimmed = _trim_schema_for_form(content, str(form.get("name") or ""))
        if trimmed is None:
            continue

        trimmed_schemas.append(
            {
                "form_name": form["name"],
                "primary_sources": primary,
                "secondary_sources": form.get("secondary_sources") or [],
                "matched_document_ids": matched_ids,
                "schema": trimmed,
            }
        )
        report_lines.append(
            f"表单{form['name']}：首要来源={primary} 命中文档={len(matched_ids)}"
        )

    return {
        "patient_id": patient_id,
        "schema_id": schema_id,
        "trimmed_schemas": trimmed_schemas,
        "count": len(trimmed_schemas),
        "report": "\n".join(report_lines),
    }


if __name__ == "__main__":
    _r = extract_pipeline(
        "847298b6-a4c8-49ea-aa07-8989cf036cf3",
        "d20b08fc-b73e-42cf-9c1b-8e89247c71f0",
    )
    _summary = {
        "patient_id": _r.get("patient_id"),
        "schema_id": _r.get("schema_id"),
        "count": _r.get("count"),
        "report": _r.get("report"),
        "trimmed_schemas": [
            {
                "form_name": x.get("form_name"),
                "primary_sources": x.get("primary_sources"),
                "secondary_sources": x.get("secondary_sources"),
                "matched_document_ids": x.get("matched_document_ids"),
                "schema_root_keys": list((x.get("schema") or {}).keys()),
                "schema_top_properties": list(
                    ((x.get("schema") or {}).get("properties") or {}).keys()
                ),
            }
            for x in (_r.get("trimmed_schemas") or [])
        ],
    }
    print(json.dumps(_summary, ensure_ascii=False, indent=2))
