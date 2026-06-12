from __future__ import annotations

import json
import sys
from typing import Any

from eacy_extraction_workspace_tools import ExtractionWorkspaceTools




TOOL_SCHEMAS = {
    "get_field_spec": {
        "name": "get_field_spec",
        "description": "Return the allowed field specification for one field_path from this extraction workspace.",
        "inputSchema": {
            "type": "object",
            "properties": {"field_path": {"type": "string"}},
            "required": ["field_path"],
            "additionalProperties": False,
        },
    },
    "search_ocr": {
        "name": "search_ocr",
        "description": "Search only the current workspace OCR text/reading_units and return source_id evidence snippets.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    "validate_candidate_fields": {
        "name": "validate_candidate_fields",
        "description": "Validate a candidate extraction JSON against field_specs, value slots, options, dates, confidence, and evidence.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "result": {"type": "object"},
                "fields": {"type": "array"},
            },
            "additionalProperties": False,
        },
    },
    "save_result_json": {
        "name": "save_result_json",
        "description": "Validate and write the final JSON object to output/result.json in the current workspace.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "result": {"type": "object"},
                "validate": {"type": "boolean"},
            },
            "required": ["result"],
            "additionalProperties": False,
        },
    },
}


class JsonRpcMcpServer:
    def __init__(self, tools: ExtractionWorkspaceTools):
        self.tools = tools

    def serve(self) -> None:
        for line in sys.stdin:
            if not line.strip():
                continue
            try:
                message = json.loads(line)
                responses = self._handle_batch(message) if isinstance(message, list) else [self._handle(message)]
            except Exception as exc:
                responses = [self._error_response(None, -32700, str(exc))]
            for response in responses:
                if response is None:
                    continue
                sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
                sys.stdout.flush()

    def _handle_batch(self, messages: list[Any]) -> list[dict[str, Any] | None]:
        return [self._handle(message) if isinstance(message, dict) else self._error_response(None, -32600, "Invalid request") for message in messages]

    def _handle(self, message: dict[str, Any]) -> dict[str, Any] | None:
        method = message.get("method")
        request_id = message.get("id")
        params = message.get("params") if isinstance(message.get("params"), dict) else {}
        if request_id is None and str(method or "").startswith("notifications/"):
            return None
        if method == "initialize":
            return self._response(
                request_id,
                {
                    "protocolVersion": params.get("protocolVersion") or "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "eacy_extraction", "version": "0.1.0"},
                },
            )
        if method == "ping":
            return self._response(request_id, {})
        if method == "tools/list":
            return self._response(request_id, {"tools": list(TOOL_SCHEMAS.values())})
        if method == "tools/call":
            return self._tool_call_response(request_id, params)
        return self._error_response(request_id, -32601, f"Method not found: {method}")

    def _tool_call_response(self, request_id: Any, params: dict[str, Any]) -> dict[str, Any]:
        name = params.get("name")
        arguments = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
        if name not in TOOL_SCHEMAS:
            return self._error_response(request_id, -32602, f"Unknown tool: {name}")
        try:
            result = getattr(self.tools, str(name))(**arguments)
            return self._response(request_id, self._tool_content(result))
        except Exception as exc:
            return self._response(request_id, self._tool_content({"error": str(exc)}, is_error=True))

    def _tool_content(self, result: dict[str, Any], *, is_error: bool = False) -> dict[str, Any]:
        payload = {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(result, ensure_ascii=False),
                }
            ]
        }
        if is_error:
            payload["isError"] = True
        return payload

    def _response(self, request_id: Any, result: dict[str, Any]) -> dict[str, Any]:
        return {"jsonrpc": "2.0", "id": request_id, "result": result}

    def _error_response(self, request_id: Any, code: int, message: str) -> dict[str, Any]:
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}
