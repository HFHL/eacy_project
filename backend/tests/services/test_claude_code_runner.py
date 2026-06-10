import json
import os
import subprocess
import sys
import textwrap

import pytest

from app.services.agent import ClaudeCodeExitError, ClaudeCodeParseError, ClaudeCodeRunner


def test_claude_code_runner_parses_wrapper_result_string(tmp_path):
    runner = ClaudeCodeRunner(workspace_root=tmp_path, skills_root=tmp_path / "missing")
    stdout = json.dumps(
        {
            "type": "result",
            "result": json.dumps({"fields": [], "missing_fields": ["诊断"]}, ensure_ascii=False),
        },
        ensure_ascii=False,
    )

    parsed, wrapper, source = runner._parse_result(workspace=tmp_path, stdout=stdout)

    assert parsed == {"fields": [], "missing_fields": ["诊断"]}
    assert wrapper["type"] == "result"
    assert source == "stdout_result_string"


def test_claude_code_runner_prefers_structured_output(tmp_path):
    runner = ClaudeCodeRunner(workspace_root=tmp_path, skills_root=tmp_path / "missing")
    stdout = json.dumps(
        {
            "type": "result",
            "result": "Done",
            "structured_output": {"fields": [{"field_path": "diagnosis.name"}]},
        }
    )

    parsed, wrapper, source = runner._parse_result(workspace=tmp_path, stdout=stdout)

    assert parsed == {"fields": [{"field_path": "diagnosis.name"}]}
    assert wrapper["result"] == "Done"
    assert source == "stdout_structured_output"


def test_claude_code_runner_prefers_result_file(tmp_path):
    runner = ClaudeCodeRunner(workspace_root=tmp_path, skills_root=tmp_path / "missing")
    (tmp_path / "output").mkdir()
    (tmp_path / "output" / "result.json").write_text('{"fields": [{"field_path": "a.b"}]}', encoding="utf-8")

    parsed, wrapper, source = runner._parse_result(
        workspace=tmp_path,
        stdout='{"result": {"fields": []}, "session_id": "s1"}',
    )

    assert parsed == {"fields": [{"field_path": "a.b"}]}
    assert wrapper["session_id"] == "s1"
    assert source == "result_file"


def test_claude_code_runner_rejects_invalid_wrapper_json(tmp_path):
    runner = ClaudeCodeRunner(workspace_root=tmp_path, skills_root=tmp_path / "missing")

    with pytest.raises(ClaudeCodeParseError):
        runner._parse_result(workspace=tmp_path, stdout="not-json")


def test_claude_code_runner_copies_skills_and_writes_workspace(tmp_path):
    skills_root = tmp_path / "skills"
    skill_dir = skills_root / "eacy-test-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("# Test Skill", encoding="utf-8")

    class FakeRunner(ClaudeCodeRunner):
        def _run_command(self, command, *, workspace):
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=json.dumps({"result": {"fields": []}}),
                stderr="",
            )

    runner = FakeRunner(workspace_root=tmp_path / "work", skills_root=skills_root, keep_workspace=True)
    result = runner.run_extraction(
        ocr_text="姓名：张三",
        ocr_payload={},
        reading_units=[],
        schema_json={"type": "object"},
        field_specs=[],
        document_meta={"document_id": "doc-1"},
        job_meta={"job_id": "job-1", "run_id": "run-1"},
    )

    workspace = result.workspace_path
    assert (tmp_path / "work").exists()
    workspace_path = tmp_path / "work" / workspace.split("/")[-1]
    assert (workspace_path / ".claude" / "skills" / "eacy-test-skill" / "SKILL.md").exists()
    assert (workspace_path / ".mcp.json").exists()
    assert "--mcp-config" in result.command
    allowed_index = result.command.index("--allowedTools") + 1
    assert "mcp__eacy_extraction__validate_candidate_fields" in result.command[allowed_index]
    assert "Write" not in result.command[allowed_index].split(",")
    assert result.parsed_result == {"fields": []}


def test_claude_code_runner_can_disable_mcp_tools(tmp_path):
    runner = ClaudeCodeRunner(
        workspace_root=tmp_path,
        skills_root=tmp_path / "missing",
        enable_mcp_tools=False,
        allowed_tools="Read,LS",
    )

    command = runner._build_command("prompt", workspace=tmp_path, job_meta={"job_id": "job-1"}, mcp_config_path=None)

    assert "--mcp-config" not in command
    assert command[command.index("--allowedTools") + 1] == "Read,LS"
    assert "--no-session-persistence" in command
    assert "--session-id" in command


def test_claude_code_runner_raises_on_nonzero_exit(tmp_path):
    class FakeRunner(ClaudeCodeRunner):
        def _run_command(self, command, *, workspace):
            return subprocess.CompletedProcess(command, 2, stdout="", stderr="bad")

    runner = FakeRunner(workspace_root=tmp_path, skills_root=tmp_path / "missing")

    with pytest.raises(ClaudeCodeExitError):
        runner.run_extraction(
            ocr_text="",
            ocr_payload={},
            reading_units=[],
            schema_json={},
            field_specs=[],
            document_meta={},
            job_meta={"job_id": "job-1"},
        )


@pytest.mark.asyncio
async def test_claude_code_runner_async_cancel_terminates_process_and_cleans_workspace(tmp_path):
    pid_file = tmp_path / "child.pid"

    class LongRunningRunner(ClaudeCodeRunner):
        def _build_command(self, prompt, *, workspace, job_meta, mcp_config_path=None):
            script = textwrap.dedent(
                f"""
                import os
                import signal
                import sys
                import time

                with open({str(pid_file)!r}, "w", encoding="utf-8") as handle:
                    handle.write(str(os.getpid()))

                def _stop(*_args):
                    sys.exit(0)

                signal.signal(signal.SIGTERM, _stop)
                while True:
                    time.sleep(1)
                """
            )
            return [sys.executable, "-c", script]

    runner = LongRunningRunner(
        workspace_root=tmp_path / "work",
        skills_root=tmp_path / "missing",
        keep_workspace=False,
        timeout_seconds=10,
    )

    async def cancel_check():
        if pid_file.exists():
            raise RuntimeError("cancelled")

    with pytest.raises(RuntimeError, match="cancelled"):
        await runner.run_extraction_async(
            ocr_text="",
            ocr_payload={},
            reading_units=[],
            schema_json={},
            field_specs=[],
            document_meta={},
            job_meta={"job_id": "job-1", "run_id": "run-1"},
            cancel_check=cancel_check,
        )

    pid = int(pid_file.read_text(encoding="utf-8"))
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)
    assert not any((tmp_path / "work").iterdir())
