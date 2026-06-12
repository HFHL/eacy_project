from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.services.llm_call_logger import ERROR_PARSE, LLMCallRecorder
from app.services.llm_ehr_types import EhrExtractionState, LlmExtractionError
from core.config import config


class LlmEhrClientMixin:
    def _node_call_llm(self, state: EhrExtractionState) -> dict[str, Any]:
        base_url = (config.OPENAI_API_BASE_URL or "https://api.openai.com/v1").rstrip("/")
        attempt = int(state.get("attempt") or 0) + 1
        prompt = state.get("repair_prompt") if attempt > 1 and state.get("repair_prompt") else state["user_prompt"]
        request_payload = {
            "model": config.OPENAI_MODEL,
            "messages": [
                {"role": "system", "content": state["system_prompt"]},
                {"role": "user", "content": prompt},
            ],
            "temperature": getattr(config, "EXTRACTION_LLM_TEMPERATURE", config.METADATA_LLM_TEMPERATURE),
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {config.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }
        timeout = getattr(config, "EXTRACTION_LLM_TIMEOUT_SECONDS", config.METADATA_LLM_TIMEOUT_SECONDS)

        buffer = state.get("llm_call_buffer")
        call_context = dict(state.get("llm_call_context") or {})
        call_context.setdefault("purpose", "extract")
        call_context.setdefault("provider", "openai")
        call_context.setdefault("node_name", "call_llm")
        call_context["retry_no"] = attempt - 1
        recorder = LLMCallRecorder(buffer=buffer, context=call_context)
        recorder.set_request(
            system_prompt=state["system_prompt"],
            user_prompt=prompt,
            model_name=config.OPENAI_MODEL,
            prompt_version=call_context.get("prompt_version"),
        )

        try:
            with recorder:
                with httpx.Client(timeout=timeout) as client:
                    response = client.post(f"{base_url}/chat/completions", headers=headers, json=request_payload)
                    if response.status_code >= 400 and request_payload.get("response_format"):
                        request_payload.pop("response_format", None)
                        response = client.post(f"{base_url}/chat/completions", headers=headers, json=request_payload)
                    recorder.set_response(http_status=response.status_code, raw_response=response.text)
                    response.raise_for_status()
                    data = response.json()
                recorder.set_response(usage=data.get("usage") or {})
                content = data.get("choices", [{}])[0].get("message", {}).get("content") or ""
        except httpx.TimeoutException as exc:
            raise LlmExtractionError(f"LLM timeout: {exc}") from exc
        except httpx.HTTPError as exc:
            raise LlmExtractionError(f"LLM HTTP error: {exc}") from exc

        try:
            raw_output = self._parse_json_content(content)
            recorder.set_response(parsed_response=raw_output)
            if buffer:
                buffer[-1]["parsed_response"] = raw_output
            return {"attempt": attempt, "raw_content": content, "raw_output": raw_output, "parse_error": None}
        except Exception as exc:
            if buffer:
                buffer[-1]["error_type"] = ERROR_PARSE
                buffer[-1]["error_message"] = str(exc) or exc.__class__.__name__
            return {"attempt": attempt, "raw_content": content, "raw_output": None, "parse_error": str(exc)}

    def _parse_json_content(self, content: str) -> dict[str, Any]:
        cleaned = content.strip()
        if not cleaned:
            raise LlmExtractionError("EHR LLM returned empty content")
        if "</think>" in cleaned:
            cleaned = cleaned.split("</think>")[-1].strip()
        fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, flags=re.DOTALL | re.IGNORECASE)
        if fence_match:
            cleaned = fence_match.group(1).strip()
        parsed = json.loads(cleaned)
        if not isinstance(parsed, dict):
            raise LlmExtractionError("EHR LLM output must be a JSON object")
        return parsed
