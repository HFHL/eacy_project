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
    DATABASE_URL: str | None = None
    WRITER_DB_URL: str = "mysql+aiomysql://fastapi:fastapi@localhost:3306/fastapi"
    READER_DB_URL: str = "mysql+aiomysql://fastapi:fastapi@localhost:3306/fastapi"
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
    TEXTIN_TIMEOUT_SECONDS: float = 120.0
    DOCUMENT_OCR_AUTO_ENQUEUE: bool = True
    OPENAI_API_KEY: str | None = None
    OPENAI_API_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini"
    METADATA_LLM_TIMEOUT_SECONDS: float = 120.0
    METADATA_LLM_TEMPERATURE: float = 0.0
    METADATA_LLM_ENABLE_RULE_FALLBACK: bool = True
    EACY_EXTRACTION_STRATEGY: str = "simple"
    EXTRACTION_LLM_TIMEOUT_SECONDS: float = 180.0
    EXTRACTION_LLM_TEMPERATURE: float = 0.0

    @model_validator(mode="after")
    def use_database_url_when_writer_reader_are_default(self):
        if self.DATABASE_URL:
            default_url = Config.model_fields["WRITER_DB_URL"].default
            if self.WRITER_DB_URL == default_url:
                self.WRITER_DB_URL = self.DATABASE_URL
            if self.READER_DB_URL == default_url:
                self.READER_DB_URL = self.DATABASE_URL
        return self


class TestConfig(Config):
    WRITER_DB_URL: str = "mysql+aiomysql://fastapi:fastapi@localhost:3306/fastapi_test"
    READER_DB_URL: str = "mysql+aiomysql://fastapi:fastapi@localhost:3306/fastapi_test"


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
