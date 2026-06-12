from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from .claude_code_runner_types import ClaudeCodeParseError


class ClaudeCodeRunnerPromptMixin:
    def _build_task_prompt(
        self,
        *,
        job_meta: dict[str, Any],
        document_meta: dict[str, Any],
        repair_errors: list[str] | None = None,
    ) -> str:
        repair_section = ""
        if repair_errors:
            repair_section = (
                "\n\n上一轮输出未通过后端校验。请只修复 JSON，不要新增 OCR 中没有的信息。\n"
                f"校验错误：{self._json_dumps(repair_errors)}\n"
            )
        return (
            "你是 EACY 医疗 OCR 结构化抽取 Agent，运行在单次病例抽取 workspace 内。\n"
            "请自主选择 .claude/skills 中与任务相关的 skills，完成 OCR 清洗、字段理解、抽取、校验和修正。\n"
            "你只能读取当前 workspace/input 下的文件。不要访问其他目录。\n"
            "重要：这是非交互 headless 会话，turn 数有限。不要逐字段循环调用工具；一次读取 field_specs/reading_units 后直接完成抽取。\n"
            "禁止联网搜索，禁止读取其他目录，禁止修改输入文件。\n\n"
            "输入文件：\n"
            "- input/ocr_text.md：OCR markdown/plain text。\n"
            "- input/ocr_payload.json：TextIn 归一化 OCR payload。\n"
            "- input/reading_units.json：带 source_type/source_id/page_no/text 的证据单元。\n"
            "- input/schema.json：完整 JSON Schema。\n"
            "- input/field_specs.json：本次允许抽取的字段清单，field_path 必须从这里选择。\n"
            "- input/document_meta.json：文档元数据。\n"
            "- input/job_meta.json：任务元数据。\n\n"
            "最终输出要求：\n"
            "1. 如 MCP 工具可用，优先用 mcp__eacy_extraction__validate_candidate_fields 校验一次候选结果；不要逐字段调用 get_field_spec/search_ocr。\n"
            "2. 如还有足够 turn，可通过 mcp__eacy_extraction__save_result_json 写入 output/result.json；否则最终回复 JSON object 即为结果。\n"
            "3. 最终回复必须是 JSON object，禁止 Markdown fence，禁止解释性文字。\n"
            "4. JSON object 必须包含 fields 数组；可选 missing_fields、uncertain_fields、conflict_fields、validation_errors。\n"
            "5. fields[] 每项必须符合现有 EACY 字段候选格式：field_path、value_type、对应 value_*、confidence、evidences。\n"
            "   field_path 必须逐字等于 input/field_specs.json 中的某个 field_path；不要插入 .0.、.1. 等行号。\n"
            "   多行/重复记录的行号写到 repeat_index（0-based）或 value_json，不要写进 field_path。\n"
            "6. 不确定不要编造；缺失字段不要输出空值，可写入 missing_fields/uncertain_fields。\n"
            "7. evidence.quote_text 必须来自 OCR 原文，evidence.source_id/source_type 必须来自 reading_units。\n\n"
            f"job_meta 摘要：{self._json_dumps(job_meta)}\n"
            f"document_meta 摘要：{self._json_dumps(document_meta)}"
            f"{repair_section}"
        )

    def _result_json_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "fields": {"type": "array", "items": {"type": "object"}},
                "missing_fields": {"type": "array"},
                "uncertain_fields": {"type": "array"},
                "conflict_fields": {"type": "array"},
                "validation_errors": {"type": "array"},
            },
            "required": ["fields"],
            "additionalProperties": True,
        }

    def _default_skills_root(self) -> Path:
        return Path(__file__).resolve().parents[2] / "agent_skills"

    def _json_dumps(self, value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, indent=2, default=self._json_default)

    def _json_default(self, value: Any) -> str:
        if isinstance(value, datetime):
            return value.isoformat()
        return str(value)
