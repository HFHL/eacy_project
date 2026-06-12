from __future__ import annotations

import asyncio
import json
import subprocess
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable

from app.services.agent.claude_code_runner_types import ClaudeCodeParseError


class ClaudeCodeRunnerHelperMixin:
    def _build_command(
        self,
        prompt: str,
        *,
        workspace: Path,
        job_meta: dict[str, Any],
        mcp_config_path: Path | None = None,
    ) -> list[str]:
        command = [
            self.claude_bin,
            "-p",
            prompt,
            "--output-format",
            "json",
            "--max-turns",
            str(self._effective_max_turns(job_meta)),
            "--permission-mode",
            "dontAsk",
            "--json-schema",
            self._json_dumps(self._result_json_schema()),
        ]
        if self.use_bare:
            command.extend(["--bare", "--add-dir", str(workspace)])
        if self.no_session_persistence:
            command.append("--no-session-persistence")
        session_id = self._session_id(job_meta)
        if session_id:
            command.extend(["--session-id", session_id])
        session_name = self._session_name(job_meta)
        if session_name:
            command.extend(["--name", session_name])
        if mcp_config_path is not None:
            command.extend(["--mcp-config", str(mcp_config_path), "--strict-mcp-config"])
        allowed_tools = self._effective_allowed_tools(mcp_config_path=mcp_config_path)
        if allowed_tools:
            command.extend(["--allowedTools", allowed_tools])
        if self.disallowed_tools:
            command.extend(["--disallowedTools", self.disallowed_tools])
        return command

    def _effective_max_turns(self, job_meta: dict[str, Any]) -> int:
        try:
            field_count = int(job_meta.get("field_count") or 0)
        except (TypeError, ValueError):
            field_count = 0
        if field_count <= 20:
            return self.max_turns
        extra_turns = (field_count - 20 + 7) // 8
        return min(max(self.max_turns, self.max_turns + extra_turns), 40)

    def _session_id(self, job_meta: dict[str, Any]) -> str:
        raw = job_meta.get("run_id") or job_meta.get("job_id")
        if raw:
            try:
                return str(uuid.UUID(str(raw)))
            except (TypeError, ValueError, AttributeError):
                pass
        seed = self._json_dumps(
            {
                "job_id": job_meta.get("job_id"),
                "run_id": job_meta.get("run_id"),
                "document_id": job_meta.get("document_id"),
                "target_form_key": job_meta.get("target_form_key"),
            }
        )
        return str(uuid.uuid5(uuid.NAMESPACE_URL, f"eacy-claude-code:{seed}"))

    def _session_name(self, job_meta: dict[str, Any]) -> str:
        pieces = [
            self.session_name_prefix,
            str(job_meta.get("job_type") or "extract"),
            str(job_meta.get("document_id") or job_meta.get("job_id") or "job")[:18],
        ]
        return "-".join(piece.strip("-_ ") for piece in pieces if piece)

    def _effective_allowed_tools(self, *, mcp_config_path: Path | None) -> str:
        parts = self._split_tool_list(self.allowed_tools)
        if mcp_config_path is not None:
            parts.extend(
                [
                    f"mcp__{self.mcp_server_name}__get_field_spec",
                    f"mcp__{self.mcp_server_name}__search_ocr",
                    f"mcp__{self.mcp_server_name}__validate_candidate_fields",
                    f"mcp__{self.mcp_server_name}__save_result_json",
                ]
            )
        deduped: list[str] = []
        for item in parts:
            if item and item not in deduped:
                deduped.append(item)
        return ",".join(deduped)

    def _split_tool_list(self, value: str | None) -> list[str]:
        if not value:
            return []
        return [item.strip() for chunk in str(value).split(",") for item in chunk.split() if item.strip()]

    def _run_command(self, command: list[str], *, workspace: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            command,
            cwd=str(workspace),
            capture_output=True,
            text=True,
            timeout=self.timeout_seconds,
            check=False,
        )

    async def _run_command_async(
        self,
        command: list[str],
        *,
        workspace: Path,
        cancel_check: Callable[[], Awaitable[None]] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(workspace),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        communicate_task = asyncio.create_task(process.communicate())
        deadline = time.monotonic() + self.timeout_seconds
        try:
            while True:
                done, _ = await asyncio.wait({communicate_task}, timeout=1.0)
                if done:
                    stdout_bytes, stderr_bytes = await communicate_task
                    break
                if time.monotonic() >= deadline:
                    raise asyncio.TimeoutError()
                if cancel_check is not None:
                    await cancel_check()
        except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=10)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
            if not communicate_task.done():
                communicate_task.cancel()
            raise
        stdout = stdout_bytes.decode("utf-8", errors="replace") if stdout_bytes else ""
        stderr = stderr_bytes.decode("utf-8", errors="replace") if stderr_bytes else ""
        return subprocess.CompletedProcess(command, process.returncode or 0, stdout, stderr)

    def _parse_result(self, *, workspace: Path, stdout: str) -> tuple[dict[str, Any], dict[str, Any] | None, str]:
        result_path = workspace / "output" / "result.json"
        wrapper_json: dict[str, Any] | None = None
        if result_path.exists():
            parsed_file = self._load_json_object(result_path.read_text(encoding="utf-8"), label="output/result.json")
            try:
                wrapper_json = self._load_json_object(stdout, label="stdout") if stdout else None
            except ClaudeCodeParseError:
                wrapper_json = None
            return parsed_file, wrapper_json, "result_file"

        wrapper_json = self._load_json_object(stdout, label="stdout")
        structured_output = wrapper_json.get("structured_output")
        if isinstance(structured_output, dict):
            return structured_output, wrapper_json, "stdout_structured_output"
        result = wrapper_json.get("result")
        if isinstance(result, dict):
            return result, wrapper_json, "stdout_result_object"
        if isinstance(result, str):
            return self._load_json_object(result, label="stdout.result"), wrapper_json, "stdout_result_string"
        raise ClaudeCodeParseError("Claude Code stdout JSON did not contain an object or JSON string in result")

    def _load_json_object(self, content: str, *, label: str) -> dict[str, Any]:
        cleaned = str(content or "").strip()
        if not cleaned:
            raise ClaudeCodeParseError(f"{label} was empty")
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise ClaudeCodeParseError(f"{label} was not valid JSON: {exc}") from exc
        if not isinstance(parsed, dict):
            raise ClaudeCodeParseError(f"{label} must be a JSON object")
        return parsed

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
