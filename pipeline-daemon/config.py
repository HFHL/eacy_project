"""
Pipeline Daemon 配置
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# ─── 路径 ──────────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env", override=False)

DB_PATH = ROOT_DIR / "backend" / "eacy.db"

# OCR worker 的 Python 环境和脚本
OCR_PYTHON = str(ROOT_DIR / "ocr-worker" / ".venv" / "bin" / "python")
OCR_SCRIPT = str(ROOT_DIR / "ocr-worker" / "flow_ocr.py")

# Metadata + EHR worker 共享的 Python 环境
WORKER_PYTHON = str(ROOT_DIR / "metadata-worker" / ".venv" / "bin" / "python")
META_SCRIPT = str(ROOT_DIR / "metadata-worker" / "metadata_extractor_worker.py")
EHR_SCRIPT = str(ROOT_DIR / "metadata-worker" / "ehr_pipeline.py")

# ─── Prefect ───────────────────────────────────────────────────────────────────
PREFECT_API_URL = os.getenv("PREFECT_API_URL", "http://127.0.0.1:4200/api")
PREFECT_OCR_DEPLOYMENT_ID = os.getenv("PREFECT_OCR_DEPLOYMENT_ID", "")
USE_PREFECT_FOR_OCR = bool(PREFECT_OCR_DEPLOYMENT_ID)

# ─── 轮询 ──────────────────────────────────────────────────────────────────────
POLL_INTERVAL_SECONDS = int(os.getenv("DAEMON_POLL_INTERVAL", "5"))

# ─── 并发限制 ──────────────────────────────────────────────────────────────────
MAX_CONCURRENT_OCR = int(os.getenv("DAEMON_MAX_OCR", "2"))
MAX_CONCURRENT_META = int(os.getenv("DAEMON_MAX_META", "3"))
MAX_CONCURRENT_EHR = int(os.getenv("DAEMON_MAX_EHR", "2"))
MAX_CONCURRENT_MATERIALIZE = int(os.getenv("DAEMON_MAX_MATERIALIZE", "3"))

# ─── 重试 ──────────────────────────────────────────────────────────────────────
MAX_RETRIES = int(os.getenv("DAEMON_MAX_RETRIES", "2"))

# ─── Schema ────────────────────────────────────────────────────────────────────
DEFAULT_SCHEMA_CODE = os.getenv("DEFAULT_SCHEMA_CODE", "patient_ehr_v2")
