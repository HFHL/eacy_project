"""flush_llm_call_logs 单测：保证额外 context 字段不会让 ORM 构造抛 TypeError。"""

from __future__ import annotations

from datetime import datetime

import pytest

from app.models import LLMCallLog
from app.services.llm_call_logger import (
    LLMCallRecorder,
    _LLM_CALL_LOG_COLUMNS,
    flush_llm_call_logs,
)


class _FakeSession:
    """Minimal sync stand-in for `core.db.session` used in flush_llm_call_logs."""

    def __init__(self) -> None:
        self.added: list[LLMCallLog] = []
        self.commits: int = 0

    def add(self, obj) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.commits += 1


@pytest.fixture
def fake_session(monkeypatch):
    fake = _FakeSession()
    monkeypatch.setattr("app.services.llm_call_logger.session", fake)
    return fake


def _base_record(**overrides):
    record = {
        "call_id": "call-1",
        "job_id": "11111111-1111-4111-8111-111111111111",
        "run_id": None,
        "document_id": "22222222-2222-4222-8222-222222222222",
        "project_id": None,
        "requested_by": None,
        "purpose": "extract",
        "node_name": "call_llm",
        "provider": "deepseek",
        "model_name": "deepseek-chat",
        "prompt_version": "v1",
        "retry_no": 0,
        "system_prompt": "sys",
        "user_prompt": "user",
        "raw_response": "{}",
        "parsed_response": None,
        "prompt_tokens": 1,
        "completion_tokens": 1,
        "total_tokens": 2,
        "elapsed_ms": 100,
        "http_status": 200,
        "status": "success",
        "error_type": None,
        "error_message": None,
        "started_at": datetime.utcnow(),
        "finished_at": datetime.utcnow(),
    }
    record.update(overrides)
    return record


@pytest.mark.asyncio
async def test_flush_drops_unknown_context_keys(fake_session):
    """额外 context（batch_index/batch_count）不能让 LLMCallLog 构造抛 TypeError。"""
    record = _base_record()
    # `LLMCallRecorder` 会把这些键写入 record，模拟 llm_ehr_extractor 分批调用场景
    record["batch_index"] = 0
    record["batch_count"] = 3
    record["extra_debug_field"] = {"foo": "bar"}

    await flush_llm_call_logs([record])

    assert len(fake_session.added) == 1
    log = fake_session.added[0]
    assert isinstance(log, LLMCallLog)
    assert log.call_id == "call-1"
    assert log.purpose == "extract"
    assert log.prompt_tokens == 1
    # 列白名单不应漏掉真实声明列
    assert "purpose" in _LLM_CALL_LOG_COLUMNS
    # 同时也必须挡住未声明列
    assert "batch_index" not in _LLM_CALL_LOG_COLUMNS
    assert "batch_count" not in _LLM_CALL_LOG_COLUMNS


@pytest.mark.asyncio
async def test_flush_skips_record_with_invalid_uuid(fake_session):
    """非法 UUID 的 record 必须被跳过，不能影响其他正常 record。"""
    bad_record = _base_record(job_id="not-a-uuid")
    good_record = _base_record(call_id="call-2")

    await flush_llm_call_logs([bad_record, good_record])

    assert len(fake_session.added) == 1
    assert fake_session.added[0].call_id == "call-2"


@pytest.mark.asyncio
async def test_flush_clears_buffer_and_handles_empty(fake_session):
    buffer = [_base_record(call_id="call-only")]
    await flush_llm_call_logs(buffer)
    assert buffer == []
    # empty 调用安全
    await flush_llm_call_logs(None)
    await flush_llm_call_logs([])


@pytest.mark.asyncio
async def test_flush_commits_when_requested(fake_session):
    await flush_llm_call_logs([_base_record()], commit=True)
    assert fake_session.commits == 1


def test_recorder_keeps_extra_context_keys_but_flush_drops_them(fake_session):
    """LLMCallRecorder 仍允许调用方写入额外 context（保留调试上下文）。"""
    buffer: list[dict] = []
    recorder = LLMCallRecorder(
        buffer=buffer,
        context={
            "job_id": "33333333-3333-4333-8333-333333333333",
            "document_id": "44444444-4444-4444-8444-444444444444",
            "purpose": "extract",
            "node_name": "call_llm",
            "model_name": "deepseek",
            "batch_index": 1,
            "batch_count": 2,
        },
    )
    recorder.set_request(system_prompt="sys", user_prompt="user")
    with recorder:
        recorder.set_response(http_status=200, raw_response="{}")
    assert len(buffer) == 1
    rec = buffer[0]
    # recorder 不裁剪上下文键
    assert rec["batch_index"] == 1
    assert rec["batch_count"] == 2
    assert rec["purpose"] == "extract"
