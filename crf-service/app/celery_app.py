"""
Celery 应用实例

CRF 抽取服务使用 Celery 做异步任务队列，Redis 做 broker。
Worker 启动命令：celery -A app.celery_app worker -l info -c 2
"""

from __future__ import annotations

from celery import Celery

from app.config import settings

celery_app = Celery(
    "crf_service",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    # 序列化
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # 时区
    timezone="UTC",
    enable_utc=True,

    # 重试
    task_acks_late=True,                    # 任务完成后才 ACK（worker 崩溃不丢任务）
    task_reject_on_worker_lost=True,        # worker 异常退出时拒绝任务（由 broker 重新分发）
    task_default_retry_delay=30,            # 默认重试间隔 30s
    task_max_retries=3,                     # 默认最大重试 3 次

    # Worker
    worker_prefetch_multiplier=1,           # 每次只预取 1 个任务（LLM 调用耗时长）
    worker_concurrency=settings.MAX_CONCURRENT_EXTRACTIONS,

    # 结果
    result_expires=3600,                    # 结果保留 1 小时
)

# 自动发现 tasks 模块
celery_app.autodiscover_tasks(["app"])
