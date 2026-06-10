from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[3]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.llm_ehr_extractor import LlmEhrExtractor, VALUE_SLOTS  # noqa: E402


class ExtractionWorkspaceTools:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace).resolve()
        self.input_dir = self.workspace / "input"
        self.output_dir = self.workspace / "output"
        self.validator = LlmEhrExtractor()

    def get_field_spec(self, *, field_path: str) -> dict[str, Any]:
        normalized_path = self._normalize_path(field_path)
        specs = self._field_specs()
        for spec in specs:
            if self._normalize_path(spec.get("field_path")) == normalized_path:
                return {"found": True, "field_spec": spec}
        candidates = [
            spec
            for spec in specs
            if normalized_path and normalized_path in self._normalize_path(spec.get("field_path"))
        ][:10]
        return {"found": False, "field_path": normalized_path, "candidates": candidates}

    def search_ocr(self, *, query: str, limit: int = 8) -> dict[str, Any]:
        text = str(query or "").strip()
        effective_limit = max(1, min(int(limit or 8), 20))
        if not text:
            return {"query": text, "matches": []}

        matches: list[dict[str, Any]] = []
        for unit in self._reading_units():
            if not isinstance(unit, dict):
                continue
            unit_text = str(unit.get("text") or "")
            if text not in unit_text and not self._compact(text) in self._compact(unit_text):
                continue
            matches.append(
                {
                    "source_type": unit.get("source_type"),
                    "source_id": unit.get("source_id"),
                    "page_no": unit.get("page_no"),
                    "quote_text": self._quote_around(unit_text, text),
                    "text": unit_text,
                }
            )
            if len(matches) >= effective_limit:
                break

        if not matches:
            for index, line in enumerate(self._ocr_text().splitlines(), start=1):
                if text not in line and not self._compact(text) in self._compact(line):
                    continue
                matches.append(
                    {
                        "source_type": "line",
                        "source_id": f"ocr_text:{index}",
                        "page_no": None,
                        "quote_text": self._quote_around(line, text),
                        "text": line,
                    }
                )
                if len(matches) >= effective_limit:
                    break

        return {"query": text, "matches": matches}

    def validate_candidate_fields(self, *, result: dict[str, Any] | None = None, fields: list[Any] | None = None) -> dict[str, Any]:
        raw_output = result if isinstance(result, dict) else {"fields": fields or []}
        errors, warnings, status = self.validator._validate_raw_output(
            raw_output,
            self._field_specs(),
            text=self._ocr_corpus(),
            reading_units=self._reading_units(),
            parse_error=None,
            require_source_id=bool(self._reading_units()),
        )
        errors.extend(self._indexed_field_path_errors(raw_output))
        errors.extend(self._confidence_errors(raw_output))
        quote_warnings = [warning for warning in warnings if "quote_text must be an OCR substring" in warning]
        if quote_warnings:
            errors.extend(quote_warnings)
            warnings = [warning for warning in warnings if warning not in quote_warnings]
        return {
            "valid": not errors,
            "status": "invalid" if errors else (status or "valid"),
            "errors": errors,
            "warnings": warnings,
        }

    def save_result_json(self, *, result: dict[str, Any], validate: bool = True) -> dict[str, Any]:
        if not isinstance(result, dict):
            return {"saved": False, "valid": False, "errors": ["result must be a JSON object"], "warnings": []}
        validation = self.validate_candidate_fields(result=result) if validate else {"valid": True, "errors": [], "warnings": []}
        if not validation.get("valid"):
            return {"saved": False, **validation}

        self.output_dir.mkdir(parents=True, exist_ok=True)
        result_path = self.output_dir / "result.json"
        tmp_path = self.output_dir / "result.json.tmp"
        tmp_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_path.replace(result_path)
        return {
            "saved": True,
            "valid": True,
            "path": "output/result.json",
            "field_count": len(result.get("fields") or []),
            "warnings": validation.get("warnings") or [],
        }

    def _field_specs(self) -> list[dict[str, Any]]:
        value = self._read_json(self.input_dir / "field_specs.json", default=[])
        return value if isinstance(value, list) else []

    def _reading_units(self) -> list[dict[str, Any]]:
        value = self._read_json(self.input_dir / "reading_units.json", default=[])
        return value if isinstance(value, list) else []

    def _ocr_text(self) -> str:
        path = self.input_dir / "ocr_text.md"
        if not path.exists():
            return ""
        return path.read_text(encoding="utf-8")

    def _ocr_corpus(self) -> str:
        unit_texts = [
            str(unit.get("text") or "")
            for unit in self._reading_units()
            if isinstance(unit, dict) and str(unit.get("text") or "").strip()
        ]
        return "\n".join(unit_texts) or self._ocr_text()

    def _read_json(self, path: Path, *, default: Any) -> Any:
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return default

    def _confidence_errors(self, raw_output: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        fields = raw_output.get("fields")
        if not isinstance(fields, list):
            return errors
        for index, item in enumerate(fields):
            if not isinstance(item, dict):
                continue
            has_value = any(not self.validator._is_empty(item.get(slot)) for slot in VALUE_SLOTS.values())
            if has_value and item.get("confidence") is None:
                errors.append(f"fields[{index}].confidence is required")
        return errors

    def _indexed_field_path_errors(self, raw_output: dict[str, Any]) -> list[str]:
        specs = self._field_specs()
        allowed_paths = {self._normalize_path(spec.get("field_path")) for spec in specs if spec.get("field_path")}
        errors: list[str] = []
        fields = raw_output.get("fields")
        if isinstance(fields, list):
            for index, item in enumerate(fields):
                if not isinstance(item, dict):
                    continue
                field_path = self._normalize_path(item.get("field_path"))
                canonical_path, indexes = self._canonical_path_for_allowed_field(field_path, allowed_paths)
                if indexes and canonical_path != field_path:
                    errors.append(
                        "fields[{index}].field_path must exactly match input/field_specs.json: "
                        "use {canonical_path} and put row index in repeat_index={repeat_index}, not {field_path}".format(
                            index=index,
                            canonical_path=canonical_path,
                            repeat_index=indexes[0],
                            field_path=field_path,
                        )
                    )
        records = raw_output.get("records")
        if isinstance(records, list):
            for record_index, record in enumerate(records):
                if not isinstance(record, dict):
                    continue
                form_path = self._normalize_path(record.get("form_path"))
                for field_path in self._iter_record_leaf_paths(form_path, record.get("record")):
                    canonical_path, indexes = self._canonical_path_for_allowed_field(field_path, allowed_paths)
                    if indexes and canonical_path != field_path:
                        errors.append(
                            "records[{record_index}] contains indexed field path {field_path}; "
                            "use canonical field_path {canonical_path} and repeat_index={repeat_index} metadata instead".format(
                                record_index=record_index,
                                field_path=field_path,
                                canonical_path=canonical_path,
                                repeat_index=indexes[0],
                            )
                        )
        return errors

    def _canonical_path_for_allowed_field(self, field_path: str, allowed_paths: set[str]) -> tuple[str, list[int]]:
        if not field_path or field_path in allowed_paths:
            return field_path, []
        parts = [part for part in field_path.split(".") if part]
        indexes = [int(part) for part in parts if part.isdigit()]
        if not indexes:
            return field_path, []
        canonical_path = ".".join(part for part in parts if not part.isdigit())
        if canonical_path in allowed_paths:
            return canonical_path, indexes
        return field_path, []

    def _iter_record_leaf_paths(self, prefix: str, node: Any):
        if self.validator._is_empty(node):
            return
        if isinstance(node, dict):
            for key, value in node.items():
                yield from self._iter_record_leaf_paths(f"{prefix}.{key}" if prefix else str(key), value)
            return
        if isinstance(node, list):
            for index, value in enumerate(node):
                yield from self._iter_record_leaf_paths(f"{prefix}.{index}" if prefix else str(index), value)
            return
        if prefix:
            yield prefix

    def _quote_around(self, text: str, query: str) -> str:
        compact_query = self._compact(query)
        if query in text:
            index = text.find(query)
            return text[max(0, index - 80) : index + len(query) + 80].strip()
        compact_text = self._compact(text)
        if compact_query and compact_query in compact_text:
            return text.strip()
        return text.strip()[:200]

    def _normalize_path(self, value: Any) -> str:
        return str(value or "").strip().strip("/").replace("/", ".")

    def _compact(self, value: Any) -> str:
        return "".join(str(value or "").split())


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True)
    args = parser.parse_args()
    JsonRpcMcpServer(ExtractionWorkspaceTools(args.workspace)).serve()


if __name__ == "__main__":
    main()
