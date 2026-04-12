#!/usr/bin/env python3
"""
通用 EHR JSON → 数据库入库脚本

用法:
    python seed_ehr_data(1).py --patient-id <id> --json-file mock_ehr_data(1).json [--document-id <doc_id>] [--clear]
    python seed_ehr_data(1).py --patient-id <id> --clear-only
    --clear 会先删除该患者病历夹实例下的选中/候选/extraction_runs，再写入本次 JSON。
    --clear-only 只清空、不入库。

功能:
    1. 读取结构化 EHR JSON (与 crf_data 格式一致)
    2. 确保 schema_instance 存在
    3. 递归打平 JSON 为 field_path → value 映射
    4. 写入 field_value_candidates + field_value_selected
    5. 兼容前端 ehrData.ts 的读取逻辑（GET /:patientId/ehr-schema-data）

设计:
    - 不依赖 ehr_pipeline.py，可独立运行
    - 通用：任意符合 patient_ehr_v2 schema 结构的 JSON 都能入库
    - 幂等：重复运行会更新已有字段的 selected 值
"""

import argparse
import json
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ─── 配置 ──────────────────────────────────────────────────────────────────────

ROOT_DIR = Path(__file__).resolve().parent
DB_PATH = ROOT_DIR / "backend" / "eacy.db"
DEFAULT_SCHEMA_CODE = "patient_ehr_v2"


# ─── 工具函数 ──────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _new_id(prefix: str = "") -> str:
    uid = uuid.uuid4().hex
    return f"{prefix}_{uid}" if prefix else uid


def _json_dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


# ─── 打平 JSON ────────────────────────────────────────────────────────────────

def flatten_ehr_json(obj: Any, parts: Optional[List[str]] = None) -> List[Tuple[str, Any, str]]:
    """
    递归打平嵌套 JSON 为 (field_path, value, value_type) 列表。

    规则：
    - dict → 递归子节点
    - list → 整体作为一个值存储（与前端 ehrData.ts 的 flatten 逻辑一致）
    - 标量 → 叶子节点
    - 跳过 None / 空字符串

    Returns:
        [(field_path, value, value_type), ...]
        field_path 格式: "/基本信息/人口学情况/患者姓名"
    """
    if parts is None:
        parts = []

    results: List[Tuple[str, Any, str]] = []

    if obj is None:
        return results

    if isinstance(obj, dict):
        for key, value in obj.items():
            if key.startswith("_"):  # 跳过内部字段
                continue
            results.extend(flatten_ehr_json(value, parts + [key]))
        return results

    # 构建路径
    path = "/" + "/".join(parts)

    if isinstance(obj, list):
        # 数组整体存储
        results.append((path, obj, "array"))
        return results

    # 标量值
    if isinstance(obj, bool):
        results.append((path, obj, "boolean"))
    elif isinstance(obj, int):
        results.append((path, obj, "integer"))
    elif isinstance(obj, float):
        results.append((path, obj, "number"))
    elif isinstance(obj, str):
        if obj.strip():  # 跳过空字符串
            results.append((path, obj, "string"))
    else:
        results.append((path, str(obj), "string"))

    return results


# ─── 数据库操作 ────────────────────────────────────────────────────────────────

def get_or_create_instance(conn: sqlite3.Connection, patient_id: str, schema_id: str) -> str:
    """确保 schema_instances 中存在该患者的病历夹实例，返回 instance_id。"""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id FROM schema_instances
        WHERE patient_id = ? AND schema_id = ? AND instance_type = 'patient_ehr'
        LIMIT 1
        """,
        (patient_id, schema_id),
    )
    row = cur.fetchone()
    if row:
        return row[0]

    new_id = _new_id("si")
    cur.execute(
        """
        INSERT INTO schema_instances (id, patient_id, schema_id, instance_type, name, status, created_at, updated_at)
        VALUES (?, ?, ?, 'patient_ehr', '电子病历夹', 'draft', ?, ?)
        """,
        (new_id, patient_id, schema_id, _now_iso(), _now_iso()),
    )
    return new_id


def get_schema_id(conn: sqlite3.Connection, schema_code: str) -> str:
    """获取 schema 的 UUID id。"""
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM schemas WHERE code = ? AND is_active = 1 ORDER BY version DESC LIMIT 1",
        (schema_code,),
    )
    row = cur.fetchone()
    if not row:
        raise ValueError(f"schemas 表中不存在 code={schema_code}")
    return row[0]


def clear_instance_ehr_rows(conn: sqlite3.Connection, instance_id: str) -> None:
    """删除该病历夹实例下的选中值、候选值与抽取运行（保留 schema_instances 行）。"""
    conn.execute("DELETE FROM field_value_selected WHERE instance_id = ?", (instance_id,))
    conn.execute("DELETE FROM field_value_candidates WHERE instance_id = ?", (instance_id,))
    conn.execute("DELETE FROM extraction_runs WHERE instance_id = ?", (instance_id,))


def create_extraction_run(conn: sqlite3.Connection, instance_id: str, document_id: Optional[str]) -> str:
    """创建 extraction_run 记录。"""
    run_id = _new_id("er")
    now = _now_iso()
    conn.execute(
        """
        INSERT INTO extraction_runs (id, instance_id, document_id, target_mode, status, model_name, prompt_version, started_at, finished_at, created_at)
        VALUES (?, ?, ?, 'full_instance', 'succeeded', 'mock_seed', 'v1', ?, ?, ?)
        """,
        (run_id, instance_id, document_id, now, now, now),
    )
    return run_id


def _bbox_to_json(bbox: Any) -> Optional[str]:
    """将 [x1,y1,x2,y2] 转为 {"x":..,"y":..,"w":..,"h":..} JSON 字符串。"""
    if bbox and isinstance(bbox, list) and len(bbox) == 4:
        return _json_dumps({"x": bbox[0], "y": bbox[1], "w": bbox[2] - bbox[0], "h": bbox[3] - bbox[1]})
    return None


def _insert_candidate(
    conn: sqlite3.Connection,
    instance_id: str,
    field_path: str,
    value_json: str,
    value_type: str,
    normalized: Optional[str],
    document_id: Optional[str],
    source_page: Any,
    source_block_id: Any,
    source_bbox_json: Optional[str],
    source_text: Optional[str],
    extraction_run_id: Optional[str],
    confidence: float,
    now: str,
) -> str:
    """插入一条 candidate 记录，返回 candidate_id。"""
    candidate_id = _new_id("fvc")
    conn.execute(
        """
        INSERT INTO field_value_candidates
            (id, instance_id, field_path, value_json, value_type, normalized_value_text,
             source_document_id, source_page, source_block_id, source_bbox_json, source_text,
             extraction_run_id, confidence, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?)
        """,
        (
            candidate_id, instance_id, field_path, value_json, value_type, normalized,
            document_id, source_page, source_block_id, source_bbox_json, source_text,
            extraction_run_id, confidence, now,
        ),
    )
    return candidate_id


def seed_fields(
    conn: sqlite3.Connection,
    instance_id: str,
    fields: List[Tuple[str, Any, str]],
    document_id: Optional[str],
    extraction_run_id: Optional[str],
    sources_map: Optional[Dict[str, Any]] = None,
) -> Tuple[int, int, int, int, int]:
    """
    将打平的字段列表写入 field_value_candidates + field_value_selected。

    sources_map 支持两种格式：
      - 标量字段: { "raw": "原文", "source_id": "p0.3", "page": 0, "bbox": [x1,y1,x2,y2] }
      - 数组字段: [ { "raw": "..", "source_id": "..", "page": .., "bbox": [...], "row_label": ".." }, ... ]
        每行一条溯源，会插入独立的 candidate

    返回 (total, new, updated, sourced) 计数。
    """
    now = _now_iso()
    if sources_map is None:
        sources_map = {}

    # 读取已有的 selected values
    existing = {}
    for row in conn.execute(
        "SELECT field_path, selected_value_json FROM field_value_selected WHERE instance_id = ?",
        (instance_id,),
    ):
        existing[row[0]] = row[1]

    total = 0
    new_count = 0
    updated_count = 0
    sourced_count = 0
    row_candidate_count = 0

    for field_path, value, value_type in fields:
        total += 1
        value_json = _json_dumps(value)

        # 查找溯源信息
        src = sources_map.get(field_path)
        main_candidate_id = None

        if isinstance(src, list):
            # ── 数组字段：每行一条 candidate ──
            sourced_count += 1

            # 为每行数组元素插入独立的 candidate（逐行溯源）
            for i, row_src in enumerate(src):
                row_raw = row_src.get("raw")
                row_block_id = row_src.get("source_id")
                row_page = row_src.get("page")
                row_bbox_json = _bbox_to_json(row_src.get("bbox"))
                row_label = row_src.get("row_label", f"row_{i}")

                # 数组元素对应的单行 JSON —— 从原始 value 取出对应索引
                if isinstance(value, list) and i < len(value):
                    row_value_json = _json_dumps(value[i])
                else:
                    row_value_json = value_json

                row_cid = _insert_candidate(
                    conn, instance_id,
                    f"{field_path}/{i}",  # 逐行路径，如 /药物治疗/0
                    row_value_json, "object",
                    row_label[:200],
                    document_id, row_page, row_block_id, row_bbox_json, row_raw,
                    extraction_run_id, 0.92, now,
                )
                row_candidate_count += 1

                # 第一行的 candidate 作为 main_candidate 的备用
            # 再插入一条完整数组值的 candidate（用于 selected 指向）
            # 溯源用第一行的信息做代表
            first_src = src[0] if src else {}
            main_candidate_id = _insert_candidate(
                conn, instance_id, field_path,
                value_json, value_type, None,
                document_id,
                first_src.get("page"),
                first_src.get("source_id"),
                _bbox_to_json(first_src.get("bbox")),
                " | ".join(s.get("raw", "") for s in src),  # 拼接所有行的原文
                extraction_run_id, 0.92, now,
            )

        elif isinstance(src, dict) and src.get("raw"):
            # ── 标量字段：单条 candidate ──
            sourced_count += 1
            main_candidate_id = _insert_candidate(
                conn, instance_id, field_path,
                value_json, value_type,
                str(value)[:200] if not isinstance(value, (list, dict)) else None,
                document_id,
                src.get("page"),
                src.get("source_id"),
                _bbox_to_json(src.get("bbox")),
                src.get("raw"),
                extraction_run_id, 0.92, now,
            )

        else:
            # ── 无溯源信息 ──
            main_candidate_id = _insert_candidate(
                conn, instance_id, field_path,
                value_json, value_type,
                str(value)[:200] if not isinstance(value, (list, dict)) else None,
                document_id, None, None, None, None,
                extraction_run_id, 0.85, now,
            )

        # 2. Upsert selected（指向完整值的 main candidate）
        old_value = existing.get(field_path)
        if old_value is None:
            selected_id = _new_id("fvs")
            conn.execute(
                """
                INSERT INTO field_value_selected
                    (id, instance_id, field_path, selected_candidate_id, selected_value_json, selected_by, selected_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'ai', ?, ?)
                """,
                (selected_id, instance_id, field_path, main_candidate_id, value_json, now, now),
            )
            new_count += 1
        elif old_value != value_json:
            conn.execute(
                """
                UPDATE field_value_selected
                SET selected_candidate_id = ?,
                    selected_value_json = ?,
                    selected_by = 'ai',
                    selected_at = ?,
                    updated_at = ?
                WHERE instance_id = ? AND field_path = ?
                """,
                (main_candidate_id, value_json, now, now, instance_id, field_path),
            )
            updated_count += 1
        else:
            conn.execute(
                """
                UPDATE field_value_selected
                SET selected_candidate_id = ?,
                    selected_by = 'ai',
                    selected_at = ?,
                    updated_at = ?
                WHERE instance_id = ? AND field_path = ?
                """,
                (main_candidate_id, now, now, instance_id, field_path),
            )
            updated_count += 1

    return total, new_count, updated_count, sourced_count, row_candidate_count


# ─── 主流程 ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="通用 EHR JSON 入库工具")
    parser.add_argument("--patient-id", required=True, help="患者 ID")
    parser.add_argument(
        "--json-file",
        default=None,
        help="EHR JSON 文件路径（与 --clear-only 二选一：仅清空时可省略）",
    )
    parser.add_argument("--document-id", default=None, help="关联的文档 ID（可选）")
    parser.add_argument("--schema-code", default=DEFAULT_SCHEMA_CODE, help="Schema code")
    parser.add_argument("--db", default=str(DB_PATH), help="SQLite 数据库路径")
    parser.add_argument("--dry-run", action="store_true", help="仅打印，不写库")
    parser.add_argument(
        "--clear",
        action="store_true",
        help="入库前清空该患者病历夹实例下的 field_value_selected / field_value_candidates / extraction_runs",
    )
    parser.add_argument(
        "--clear-only",
        action="store_true",
        help="仅执行上述清空，不读取 JSON、不入库（可与 --patient-id、--db、--schema-code 配合）",
    )
    args = parser.parse_args()

    if args.clear_only and args.dry_run:
        print("❌ --clear-only 不能与 --dry-run 同时使用", file=sys.stderr)
        sys.exit(1)

    if args.clear_only:
        db_path = Path(args.db)
        if not db_path.exists():
            print(f"❌ 数据库不存在: {db_path}", file=sys.stderr)
            sys.exit(1)
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            schema_id = get_schema_id(conn, args.schema_code)
            instance_id = get_or_create_instance(conn, args.patient_id, schema_id)
            n_sel = conn.execute(
                "SELECT COUNT(*) FROM field_value_selected WHERE instance_id = ?",
                (instance_id,),
            ).fetchone()[0]
            n_cand = conn.execute(
                "SELECT COUNT(*) FROM field_value_candidates WHERE instance_id = ?",
                (instance_id,),
            ).fetchone()[0]
            n_run = conn.execute(
                "SELECT COUNT(*) FROM extraction_runs WHERE instance_id = ?",
                (instance_id,),
            ).fetchone()[0]
            clear_instance_ehr_rows(conn, instance_id)
            conn.commit()
            print(f"🧹 已清空 patient={args.patient_id} instance={instance_id}")
            print(f"   删除前: selected={n_sel}, candidates={n_cand}, extraction_runs={n_run}")
        finally:
            conn.close()
        return

    if not args.json_file:
        print("❌ 请提供 --json-file，或使用 --clear-only", file=sys.stderr)
        sys.exit(1)

    # 1. 读取 JSON
    json_path = Path(args.json_file)
    if not json_path.exists():
        print(f"❌ JSON 文件不存在: {json_path}", file=sys.stderr)
        sys.exit(1)

    with open(json_path, "r", encoding="utf-8") as f:
        ehr_data = json.load(f)

    print(f"📄 读取 JSON: {json_path}")
    print(f"   顶层 keys: {[k for k in ehr_data.keys() if not k.startswith('_')]}")

    # 2. 提取 _sources 溯源信息
    sources_map = ehr_data.pop("_sources", {}) or {}
    # 去掉注释 key
    sources_map = {k: v for k, v in sources_map.items() if not k.startswith("_")}
    if sources_map:
        scalar_src = sum(1 for v in sources_map.values() if isinstance(v, dict))
        array_src = sum(1 for v in sources_map.values() if isinstance(v, list))
        total_rows = sum(len(v) for v in sources_map.values() if isinstance(v, list))
        print(f"   📍 溯源: {scalar_src} 标量 + {array_src} 数组({total_rows}行)")
    else:
        print(f"   ⚠️  未找到 _sources，将不填充溯源信息")

    # 3. 打平
    fields = flatten_ehr_json(ehr_data)
    print(f"   打平后字段数: {len(fields)}")

    if args.dry_run:
        print("\n🔍 Dry run — 打平结果:")
        for path, value, vtype in fields:
            display = str(value)[:80]
            src = sources_map.get(path)
            if isinstance(src, list):
                src_tag = f" ← [{len(src)}行溯源]"
                for i, rs in enumerate(src):
                    src_tag += f"\n      [{i}] [{rs.get('source_id','?')}] {rs.get('raw','')[:50]}"
            elif isinstance(src, dict):
                src_tag = f" ← [{src.get('source_id','?')}] {src.get('raw','')[:40]}"
            else:
                src_tag = ""
            print(f"  {path} ({vtype}) = {display}{src_tag}")
        without_src = [p for p, _, _ in fields if p not in sources_map]
        print(f"\n✅ Dry run 完成，共 {len(fields)} 个字段")
        if without_src:
            print(f"⚠️  {len(without_src)} 个字段无溯源: {without_src[:5]}...")
        return

    # 3. 连接数据库
    db_path = Path(args.db)
    if not db_path.exists():
        print(f"❌ 数据库不存在: {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    try:
        # 4. 获取 schema_id
        schema_id = get_schema_id(conn, args.schema_code)
        print(f"🗂️  Schema: code={args.schema_code}, id={schema_id[:20]}...")

        # 5. 确保 instance 存在
        instance_id = get_or_create_instance(conn, args.patient_id, schema_id)
        print(f"📋 Instance: {instance_id}")

        if args.clear:
            clear_instance_ehr_rows(conn, instance_id)
            print("🧹 已清空该实例下的选中值、候选值与 extraction_runs")

        # 6. 创建 extraction_run
        run_id = create_extraction_run(conn, instance_id, args.document_id)
        print(f"🔬 Extraction run: {run_id}")

        # 7. 写入字段（含溯源信息）
        total, new_count, updated_count, sourced_count, row_cand_count = seed_fields(
            conn, instance_id, fields, args.document_id, run_id, sources_map
        )

        conn.commit()

        print(f"\n{'='*50}")
        print(f"✅ 入库完成!")
        print(f"   患者 ID:    {args.patient_id}")
        print(f"   Instance:   {instance_id}")
        print(f"   总字段数:   {total}")
        print(f"   新增字段:   {new_count}")
        print(f"   更新字段:   {updated_count}")
        print(f"   未变字段:   {total - new_count - updated_count}")
        print(f"   📍有溯源:   {sourced_count}/{total}")
        print(f"   📎逐行候选: {row_cand_count} 条")
        print(f"{'='*50}")
        print(f"\n💡 现在刷新前端页面即可看到填充效果")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
