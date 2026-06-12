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


class ClaudeCodeRunnerWorkspaceMixin:
    def create_workspace(self, *, job_meta: dict[str, Any]) -> Path:
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        job_id = str(job_meta.get("job_id") or "job")
        run_id = str(job_meta.get("run_id") or uuid.uuid4())
        workspace = self.workspace_root / f"{job_id}-{run_id}-{uuid.uuid4().hex[:8]}"
        (workspace / "input").mkdir(parents=True, exist_ok=False)
        (workspace / "output").mkdir(parents=True, exist_ok=False)
        (workspace / ".claude" / "skills").mkdir(parents=True, exist_ok=False)
        return workspace

    def _write_workspace_inputs(
        self,
        *,
        workspace: Path,
        ocr_text: str,
        ocr_payload: dict[str, Any] | None,
        reading_units: list[dict[str, Any]],
        schema_json: dict[str, Any],
        field_specs: list[dict[str, Any]],
        document_meta: dict[str, Any],
        job_meta: dict[str, Any],
    ) -> dict[str, str]:
        files = {
            "input/ocr_text.md": ocr_text or "",
            "input/ocr_payload.json": self._json_dumps(ocr_payload or {}),
            "input/reading_units.json": self._json_dumps(reading_units),
            "input/schema.json": self._json_dumps(schema_json),
            "input/field_specs.json": self._json_dumps(field_specs),
            "input/document_meta.json": self._json_dumps(document_meta),
            "input/job_meta.json": self._json_dumps(job_meta),
        }
        hashes: dict[str, str] = {}
        for relative_path, content in files.items():
            target = workspace / relative_path
            target.write_text(content, encoding="utf-8")
            hashes[relative_path] = hashlib.sha256(content.encode("utf-8")).hexdigest()
        return hashes

    def _copy_skills(self, workspace: Path) -> None:
        target_root = workspace / ".claude" / "skills"
        if not self.skills_root.exists():
            return
        for source in self.skills_root.iterdir():
            if source.is_dir() and (source / "SKILL.md").exists():
                shutil.copytree(source, target_root / source.name)

    def _write_mcp_config(self, workspace: Path) -> Path:
        config_path = workspace / ".mcp.json"
        server_path = Path(__file__).resolve().with_name("eacy_extraction_mcp_server.py")
        mcp_config = {
            "mcpServers": {
                self.mcp_server_name: {
                    "command": sys.executable,
                    "args": [
                        str(server_path),
                        "--workspace",
                        str(workspace),
                    ],
                }
            }
        }
        config_path.write_text(self._json_dumps(mcp_config), encoding="utf-8")
        return config_path
