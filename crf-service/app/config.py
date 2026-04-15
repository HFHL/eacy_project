"""
CRF 抽取服务 — 配置

统一管理数据库路径、Redis URL、LLM 凭据等运行参数。
所有模块通过 `from app.config import settings` 获取。
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# 加载项目根 .env（crf-service 上层）
_SERVICE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = _SERVICE_DIR.parent
load_dotenv(ROOT_DIR / ".env", override=False)


class Settings:
    """集中管理所有配置，方便 mock / 切换环境。"""

    # ── 数据库 ──────────────────────────────────────────────────────────────
    DB_PATH: Path = Path(os.getenv("EACY_DB_PATH", str(ROOT_DIR / "backend" / "eacy.db")))

    # ── Redis / Celery ─────────────────────────────────────────────────────
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/1")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/2")

    # ── LLM ────────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_API_BASE_URL: str = os.getenv("OPENAI_API_BASE_URL", "https://api.openai.com/v1")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o")

    # ── 服务 ───────────────────────────────────────────────────────────────
    CRF_SERVICE_PORT: int = int(os.getenv("CRF_SERVICE_PORT", "8100"))
    DEFAULT_SCHEMA_CODE: str = os.getenv("DEFAULT_EHR_SCHEMA_CODE", "patient_ehr_v2")

    # ── 并发 ───────────────────────────────────────────────────────────────
    MAX_CONCURRENT_EXTRACTIONS: int = int(os.getenv("CRF_MAX_CONCURRENT", "2"))

    # ── 日志 ───────────────────────────────────────────────────────────────
    LOG_DIR: Path = _SERVICE_DIR / "logs"
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # ── Redis 进度频道前缀 ─────────────────────────────────────────────────
    PROGRESS_CHANNEL_PREFIX: str = "crf:progress:"


settings = Settings()

# 确保日志目录存在
settings.LOG_DIR.mkdir(parents=True, exist_ok=True)
