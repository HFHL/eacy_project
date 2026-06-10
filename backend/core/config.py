import os

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENV: str = "development"
    DEBUG: bool = True
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    # 必填：远程 PostgreSQL（见项目根 .env.example）。无本地 MySQL 默认。
    DATABASE_URL: str | None = None
    WRITER_DB_URL: str = ""
    READER_DB_URL: str = ""
    DB_POOL_SIZE: int = 1
    DB_MAX_OVERFLOW: int = 1
    DB_POOL_TIMEOUT: int = 5
    DB_POOL_RECYCLE: int = 600
    JWT_SECRET_KEY: str = "fastapi"
    JWT_ALGORITHM: str = "HS256"
    ENABLE_AUTH: bool = False
    SENTRY_SDN: str = ""
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_BACKEND_URL: str = Field(
        default="redis://localhost:6379/2",
        validation_alias=AliasChoices("CELERY_BACKEND_URL", "CELERY_RESULT_BACKEND"),
    )
    CELERY_TASK_ALWAYS_EAGER: bool = False
    CELERY_WORKER_PREFETCH_MULTIPLIER: int = 1
    # Celery Beat: mark idle pending extraction jobs as failed (retryable).
    STALE_PENDING_ABANDON_ENABLED: bool = True
    STALE_PENDING_ABANDON_HOURS: int = 24
    STALE_PENDING_ABANDON_LIMIT: int = 500
    STALE_PENDING_ABANDON_CRON_HOUR: int = 3
    STALE_PENDING_ABANDON_CRON_MINUTE: int = 0
    EXTRACTION_SCHEDULER_ENABLED: bool = True
    EXTRACTION_GLOBAL_CONCURRENCY: int = 4
    EXTRACTION_USER_CONCURRENCY: int = 1
    EXTRACTION_PROJECT_CONCURRENCY: int = 2
    EXTRACTION_SCHEDULER_BATCH_SIZE: int = 20
    EXTRACTION_SCHEDULER_INTERVAL_SECONDS: int = 15
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    DOCUMENT_STORAGE_PROVIDER: str = "oss"
    OSS_ACCESS_KEY_ID: str | None = None
    OSS_ACCESS_KEY_SECRET: str | None = None
    OSS_BUCKET_NAME: str | None = None
    OSS_ENDPOINT: str | None = None
    OSS_REGION: str | None = None
    OSS_BASE_PREFIX: str = "documents"
    OSS_PUBLIC_BASE_URL: str | None = None
    TEXTIN_APP_ID: str | None = None
    TEXTIN_SECRET_CODE: str | None = None
    TEXTIN_API_URL: str | None = None
    TEXTIN_PARSE_MODE: str = "auto"
    TEXTIN_GET_IMAGE: str = "page"
    TEXTIN_TIMEOUT_SECONDS: float = 120.0
    DOCUMENT_OCR_AUTO_ENQUEUE: bool = True
    DOCUMENT_MAX_FILE_SIZE_BYTES: int = 100 * 1024 * 1024
    OPENAI_API_KEY: str | None = None
    OPENAI_API_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini"
    METADATA_LLM_TIMEOUT_SECONDS: float = 120.0
    METADATA_LLM_TEMPERATURE: float = 0.0
    METADATA_LLM_ENABLE_RULE_FALLBACK: bool = True
    EACY_EXTRACTION_STRATEGY: str = "simple"
    EXTRACTION_LLM_TIMEOUT_SECONDS: float = 180.0
    EXTRACTION_LLM_TEMPERATURE: float = 0.0
    EXTRACTION_FIELD_BATCH_SIZE: int = 35
    EXTRACTION_OCR_EVIDENCE_UNIT_LIMIT: int = 400
    CLAUDE_CODE_BIN: str = "claude"
    CLAUDE_CODE_WORKSPACE_ROOT: str = "/tmp/eacy-claude-code"
    CLAUDE_CODE_TIMEOUT_SECONDS: float = 300.0
    CLAUDE_CODE_MAX_TURNS: int = 14
    CLAUDE_CODE_KEEP_WORKSPACE: bool = False
    CLAUDE_CODE_ALLOWED_TOOLS: str = "Read,LS,Grep"
    CLAUDE_CODE_DISALLOWED_TOOLS: str = "Bash,Edit,Write,WebFetch,WebSearch"
    CLAUDE_CODE_ENABLE_MCP_TOOLS: bool = True
    CLAUDE_CODE_MCP_SERVER_NAME: str = "eacy_extraction"
    CLAUDE_CODE_BARE: bool = False
    CLAUDE_CODE_NO_SESSION_PERSISTENCE: bool = True
    CLAUDE_CODE_SESSION_NAME_PREFIX: str = "eacy-extract"
    CLAUDE_CODE_CONCURRENCY: int = 1

    # SMTP（用于注册/找回密码邮箱验证码）
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 465
    SMTP_USE_SSL: bool = True
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str | None = None
    SMTP_FROM_NAME: str = "易悉 EACY"
    SMTP_TIMEOUT_SECONDS: float = 15.0

    # 邮箱验证码
    VERIFICATION_CODE_TTL_SECONDS: int = 600        # 10 分钟有效
    VERIFICATION_CODE_RESEND_COOLDOWN: int = 60     # 同邮箱 60s 一次
    VERIFICATION_CODE_DAILY_LIMIT: int = 10         # 同邮箱 24h 上限
    VERIFICATION_CODE_LENGTH: int = 6
    # 当 SMTP 未配置时是否退化为"调试模式"（验证码写入日志，不真发邮件）
    VERIFICATION_CODE_DEBUG_FALLBACK: bool = True

    @model_validator(mode="after")
    def resolve_db_urls(self):
        if self.DATABASE_URL:
            if not self.WRITER_DB_URL:
                self.WRITER_DB_URL = self.DATABASE_URL
            if not self.READER_DB_URL:
                self.READER_DB_URL = self.DATABASE_URL
        elif not self.WRITER_DB_URL:
            raise ValueError(
                "DATABASE_URL is required (remote PostgreSQL). "
                "Copy .env.example to .env and set DATABASE_URL=postgresql+asyncpg://..."
            )
        if not self.READER_DB_URL:
            self.READER_DB_URL = self.WRITER_DB_URL
        return self


class TestConfig(Config):
    ...


class LocalConfig(Config):
    ...


class ProductionConfig(Config):
    DEBUG: bool = False


def get_config():
    env = os.getenv("ENV", "local")
    config_type = {
        "test": TestConfig(),
        "local": LocalConfig(),
        "prod": ProductionConfig(),
    }
    return config_type[env]


config: Config = get_config()
