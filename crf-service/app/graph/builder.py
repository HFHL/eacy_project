"""
LangGraph StateGraph 编译器

将 4 个节点 + 条件边组装成可执行的 compiled graph。
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Dict

from langgraph.graph import END, START, StateGraph

from app.graph.nodes import (
    node_extract_units,
    node_filter_units,
    node_load_schema_and_docs,
    node_materialize,
)
from app.graph.state import CRFExtractionState


def _should_extract(state: CRFExtractionState) -> str:
    """条件边：筛选后是否有可抽取单元？"""
    if state.get("pipeline_error"):
        return "end"
    units = state.get("extraction_units") or []
    if not units:
        return "end"
    return "extract"


@lru_cache(maxsize=1)
def build_graph():
    """
    构建并编译 CRF 抽取 StateGraph:

        load_schema_and_docs
              ↓
         filter_units
              ↓
        [条件] 有可抽取单元?
           ├── 是 → extract_units → materialize → END
           └── 否 → END
    """
    builder = StateGraph(CRFExtractionState)

    # 添加节点
    builder.add_node("load_schema_and_docs", node_load_schema_and_docs)
    builder.add_node("filter_units", node_filter_units)
    builder.add_node("extract_units", node_extract_units)
    builder.add_node("materialize", node_materialize)

    # 固定边
    builder.add_edge(START, "load_schema_and_docs")
    builder.add_edge("load_schema_and_docs", "filter_units")

    # 条件边：filter 后决定是否继续
    builder.add_conditional_edges(
        "filter_units",
        _should_extract,
        {
            "extract": "extract_units",
            "end": END,
        },
    )

    # extract → materialize → END
    builder.add_edge("extract_units", "materialize")
    builder.add_edge("materialize", END)

    return builder.compile()
