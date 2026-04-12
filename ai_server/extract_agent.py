"""入口：仅患者 ID + schema ID → 筛选可抽取单元 → 调 EhrExtractorAgent 逐文书抽取。

编排使用 LangGraph：run_pipeline → extract_units。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

_AGENT_DIR = Path(__file__).resolve().parent
_EXTRACT_LOG_FILE = Path(
    os.getenv(
        "EXTRACT_AGENT_LOG",
        str(_AGENT_DIR / "logs" / "extract_agent.log"),
    )
).expanduser()


def _append_extract_run_log(body: str) -> None:
    """将一次抽取运行结果追加到本地日志（UTF-8），不写入 stdout。"""
    try:
        path = _EXTRACT_LOG_FILE.resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).isoformat()
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"\n{'=' * 60}\n[{ts}] extract_agent 运行结果\n{'-' * 60}\n")
            f.write(body)
            if body and not body.endswith("\n"):
                f.write("\n")
    except OSError as exc:
        logging.getLogger("extract_agent").error("写入 extract 日志失败: %s", exc)


if str(_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(_AGENT_DIR))

from ehr_extract import extract_pipeline, get_document_for_extraction
from ehr_extractor_agent import EhrExtractorAgent

logger = logging.getLogger("extract_agent")


class ExtractAgentState(TypedDict, total=False):
    """LangGraph 状态：与 run_patient_schema_extraction 返回值对齐，并含中间字段。"""

    patient_id: str
    schema_id: str
    pipeline_count: Any
    pipeline_report: Any
    pipeline_error: Any
    trimmed_schemas: list[dict[str, Any]]
    units: list[dict[str, Any]]


async def _extract_one_unit(unit: dict[str, Any]) -> dict[str, Any]:
    """对 extract_pipeline 返回的一个 trimmed 单元，按命中文档 id 串行跑 ADK 抽取。"""
    schema = unit.get("schema") or {}
    agent = EhrExtractorAgent(schema)
    doc_results: list[dict[str, Any]] = []

    for doc_id in unit.get("matched_document_ids") or []:
        doc = get_document_for_extraction(str(doc_id))
        if not doc:
            doc_results.append({"document_id": doc_id, "error": "document_not_found"})
            continue
        if not doc.get("content_list"):
            doc_results.append(
                {
                    "document_id": doc_id,
                    "error": "no_content_list",
                    "file_name": doc.get("file_name"),
                }
            )
            continue
        try:
            res = await agent.extract_single_document(doc)
            doc_results.append(
                {
                    "document_id": doc_id,
                    "file_name": doc.get("file_name"),
                    "extraction": asdict(res),
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("抽取失败 doc=%s", doc_id)
            doc_results.append(
                {
                    "document_id": doc_id,
                    "file_name": doc.get("file_name"),
                    "error": str(exc),
                }
            )

    return {
        "form_name": unit.get("form_name"),
        "primary_sources": unit.get("primary_sources"),
        "secondary_sources": unit.get("secondary_sources"),
        "matched_document_ids": unit.get("matched_document_ids"),
        "documents": doc_results,
    }


async def _extract_all_units(units: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for u in units:
        out.append(await _extract_one_unit(u))
    return out


def _node_run_pipeline(state: ExtractAgentState) -> dict[str, Any]:
    pid = (state.get("patient_id") or "").strip()
    sid = (state.get("schema_id") or "").strip()
    pipeline = extract_pipeline(pid, sid)
    return {
        "patient_id": pid,
        "schema_id": sid,
        "pipeline_count": pipeline.get("count"),
        "pipeline_report": pipeline.get("report"),
        "pipeline_error": pipeline.get("error"),
        "trimmed_schemas": pipeline.get("trimmed_schemas") or [],
    }


async def _node_extract_units(state: ExtractAgentState) -> dict[str, Any]:
    units_in = state.get("trimmed_schemas") or []
    return {"units": await _extract_all_units(units_in)}


@lru_cache(maxsize=1)
def _compiled_extract_graph():
    builder = StateGraph(ExtractAgentState)
    builder.add_node("run_pipeline", _node_run_pipeline)
    builder.add_node("extract_units", _node_extract_units)
    builder.add_edge(START, "run_pipeline")
    builder.add_edge("run_pipeline", "extract_units")
    builder.add_edge("extract_units", END)
    return builder.compile()


def run_patient_schema_extraction(patient_id: str, schema_id: str) -> dict[str, Any]:
    """
    1) ehr_extract.extract_pipeline：首要来源 + 文书类型命中 → 裁剪 schema；
    2) 对每个单元、每个命中文档调用 EhrExtractorAgent。

    由 LangGraph 两节点顺序执行，对外返回结构与改写前一致。
    """
    pid, sid = (patient_id or "").strip(), (schema_id or "").strip()
    graph = _compiled_extract_graph()
    final: ExtractAgentState = asyncio.run(
        graph.ainvoke({"patient_id": pid, "schema_id": sid})
    )
    return {
        "patient_id": final.get("patient_id", pid),
        "schema_id": final.get("schema_id", sid),
        "pipeline_count": final.get("pipeline_count"),
        "pipeline_report": final.get("pipeline_report"),
        "pipeline_error": final.get("pipeline_error"),
        "units": final.get("units") or [],
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    # 直接改这里
    patient_id = "847298b6-a4c8-49ea-aa07-8989cf036cf3"
    schema_id = "d20b08fc-b73e-42cf-9c1b-8e89247c71f0"

    result = run_patient_schema_extraction(patient_id, schema_id)
    payload = json.dumps(result, ensure_ascii=False, indent=2, default=str)
    _append_extract_run_log(payload)
    logger.info("抽取完成，结果已追加写入: %s", _EXTRACT_LOG_FILE.resolve())


if __name__ == "__main__":
    main()
