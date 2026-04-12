"""
Pipeline Daemon 配置
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# ─── 路径 ──────────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env", override=False)

DB_PATH = ROOT_DIR / "backend" / "eacy.db"


def _resolve_worker_python(env_var: str, worker_subdir: str) -> str:
    """
    子进程使用的 Python：优先环境变量，其次各 worker 下 .venv，否则当前解释器（适合 conda）。
    环境变量示例：DAEMON_OCR_PYTHON（指向任意 python.exe，例如 conda 环境）
    """
    override = os.getenv(env_var, "").strip()
    if override:
        return override
    venv = ROOT_DIR / worker_subdir / ".venv"
    rel = Path("Scripts") / "python.exe" if os.name == "nt" else Path("bin") / "python"
    candidate = venv / rel
    if candidate.exists():
        return str(candidate)
    return sys.executable


# OCR worker 的 Python 环境和脚本
OCR_PYTHON = _resolve_worker_python("DAEMON_OCR_PYTHON", "ocr-worker")
OCR_SCRIPT = str(ROOT_DIR / "ocr-worker" / "flow_ocr.py")

# Metadata 抽取 worker
WORKER_PYTHON = _resolve_worker_python("DAEMON_WORKER_PYTHON", "metadata-worker")
META_SCRIPT = str(ROOT_DIR / "metadata-worker" / "metadata_extractor_worker.py")

# ─── Prefect ───────────────────────────────────────────────────────────────────
PREFECT_API_URL = os.getenv("PREFECT_API_URL", "http://127.0.0.1:4200/api")
PREFECT_OCR_DEPLOYMENT_ID = os.getenv("PREFECT_OCR_DEPLOYMENT_ID", "")
USE_PREFECT_FOR_OCR = bool(PREFECT_OCR_DEPLOYMENT_ID)

# ─── 轮询 ──────────────────────────────────────────────────────────────────────
POLL_INTERVAL_SECONDS = int(os.getenv("DAEMON_POLL_INTERVAL", "5"))

# ─── 并发限制 ──────────────────────────────────────────────────────────────────
MAX_CONCURRENT_OCR = int(os.getenv("DAEMON_MAX_OCR", "2"))
MAX_CONCURRENT_META = int(os.getenv("DAEMON_MAX_META", "3"))
