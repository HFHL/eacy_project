"""
Celery 异步任务定义

定义 CRF 抽取的 Celery task，Worker 进程中执行 LangGraph 图。
通过 Redis pub/sub 推送实时进度给 FastAPI SSE 端点。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional

import redis

from app.celery_app import celery_app
from app.config import settings
from app.graph.builder import build_graph
from app.repo.db import CRFRepo, _now_iso

logger = logging.getLogger("crf-service.tasks")


def _get_redis_client() -> redis.Redis:
    return redis.from_url(settings.REDIS_URL, decode_responses=True)


def _publish_progress(job_id: str, data: Dict[str, Any]) -> None:
    """将进度事件推送到 Redis pub/sub 频道。"""
    try:
        r = _get_redis_client()
        channel = f"{settings.PROGRESS_CHANNEL_PREFIX}{job_id}"
        payload = json.dumps(data, ensure_ascii=False, default=str)
        r.publish(channel, payload)
    except Exception as exc:
        logger.warning("推送进度失败: %s", exc)


@celery_app.task(
    bind=True,
    name="crf.run_extraction",
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def run_extraction_task(
    self,
    *,
    job_id: Optional[str] = None,
    patient_id: str,
    schema_id: str,
    document_ids: Optional[list] = None,
    instance_type: str = "patient_ehr",
) -> Dict[str, Any]:
    """
    Celery task：执行完整的 CRF 抽取 pipeline。

    1. 从 DB claim job
    2. 调用 LangGraph 图
    3. 更新 job 状态
    4. 通过 Redis pub/sub 推送进度
    """
    t0 = time.time()
    repo = CRFRepo()
    actual_job_id = job_id or self.request.id or "unknown"

    logger.info(
        "[task] 开始抽取 job=%s patient=%s schema=%s",
        actual_job_id, patient_id, schema_id,
    )
    _publish_progress(actual_job_id, {
        "status": "running",
        "node": "start",
        "message": "抽取任务已开始",
    })

    # Claim primary job（如果有 job_id）
    if job_id:
        try:
            with repo.connect() as conn:
                claimed = repo.claim_job(conn, job_id)
                conn.commit()
            if not claimed:
                logger.warning("[task] job 无法 claim: %s", job_id)
                return {"job_id": job_id, "status": "skipped", "reason": "claim_failed"}
        except Exception as exc:
            logger.error("[task] claim 异常: %s", exc)

    # 构建初始 state
    initial_state = {
        "job_id": actual_job_id,
        "patient_id": patient_id,
        "schema_id": schema_id,
        "instance_type": instance_type,
        "errors": [],
    }
    if document_ids:
        initial_state["document_ids"] = document_ids

    # 执行 LangGraph 图
    try:
        graph = build_graph()
        final_state = asyncio.run(graph.ainvoke(initial_state))

        elapsed_ms = int((time.time() - t0) * 1000)

        result = {
            "job_id": actual_job_id,
            "patient_id": patient_id,
            "schema_id": schema_id,
            "status": "completed",
            "materialized": final_state.get("materialized", False),
            "instance_id": final_state.get("instance_id"),
            "unit_count": len(final_state.get("unit_results") or []),
            "pipeline_report": final_state.get("pipeline_report", ""),
            "errors": final_state.get("errors", []),
            "elapsed_ms": elapsed_ms,
        }

        # 更新所有相关 job 状态（批量模式下包含多个文档的 job）
        if job_id:
            try:
                instance_id = final_state.get("instance_id")
                with repo.connect() as conn:
                    # 完成 primary job
                    repo.complete_job(conn, job_id, instance_id)
                    # 批量完成同批次中其他文档的 pending/running jobs
                    if document_ids and len(document_ids) > 1:
                        placeholders = ",".join(["?"] * len(document_ids))
                        conn.execute(
                            f"""
                            UPDATE ehr_extraction_jobs
                            SET status = 'completed',
                                completed_at = ?,
                                result_extraction_run_id = COALESCE(?, result_extraction_run_id),
                                updated_at = ?
                            WHERE document_id IN ({placeholders})
                              AND schema_id = ?
                              AND status IN ('pending', 'running')
                              AND id != ?
                            """,
                            (_now_iso(), instance_id, _now_iso(), *document_ids, schema_id, job_id),
                        )
                    conn.commit()
                logger.info("[task] 已完成 job=%s 及其关联 jobs", job_id)
            except Exception as exc:
                logger.error("[task] 更新 job 状态失败: %s", exc)

        _publish_progress(actual_job_id, {
            "status": "completed",
            "node": "done",
            "message": f"抽取完成，耗时 {elapsed_ms}ms",
            "result": result,
        })

        logger.info("[task] 完成 job=%s elapsed=%dms", actual_job_id, elapsed_ms)
        return result

    except Exception as exc:
        logger.exception("[task] 抽取异常 job=%s", actual_job_id)

        # 更新所有相关 job 失败状态
        if job_id:
            try:
                with repo.connect() as conn:
                    repo.fail_job(conn, job_id, str(exc))
                    # 批量标记同批次其他 jobs 为 failed
                    if document_ids and len(document_ids) > 1:
                        placeholders = ",".join(["?"] * len(document_ids))
                        conn.execute(
                            f"""
                            UPDATE ehr_extraction_jobs
                            SET status = 'failed',
                                last_error = ?,
                                completed_at = ?,
                                updated_at = ?
                            WHERE document_id IN ({placeholders})
                              AND schema_id = ?
                              AND status IN ('pending', 'running')
                              AND id != ?
                            """,
                            (str(exc)[:4000], _now_iso(), _now_iso(), *document_ids, schema_id, job_id),
                        )
                    conn.commit()
            except Exception:
                pass

        _publish_progress(actual_job_id, {
            "status": "failed",
            "node": "error",
            "message": f"抽取失败: {exc}",
        })

        # Celery 自动重试
        raise self.retry(exc=exc)


# ── 流水线 Tasks ─────────────────────────────────────────────────────────────

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

def _resolve_worker_python(env_var: str, worker_subdir: str) -> str:
    from dotenv import load_dotenv
    load_dotenv(ROOT_DIR / ".env", override=False)
    override = os.getenv(env_var, "").strip()
    if override:
        return override
    venv = ROOT_DIR / worker_subdir / ".venv"
    rel = Path("Scripts") / "python.exe" if os.name == "nt" else Path("bin") / "python"
    candidate = venv / rel
    if candidate.exists():
        return str(candidate)
    return sys.executable

OCR_PYTHON = _resolve_worker_python("DAEMON_OCR_PYTHON", "ocr-worker")
OCR_SCRIPT = str(ROOT_DIR / "ocr-worker" / "flow_ocr.py")

WORKER_PYTHON = _resolve_worker_python("DAEMON_WORKER_PYTHON", "metadata-worker")
META_SCRIPT = str(ROOT_DIR / "metadata-worker" / "metadata_extractor_worker.py")


@celery_app.task(
    bind=True,
    name="pipeline.run_ocr",
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def run_ocr_task(self, document_id: str, *args, **kwargs) -> str:
    """运行 OCR 并返回 document_id，供 chain 下一步使用"""
    logger.info("[task] 开始 OCR %s", document_id)
    try:
        result = subprocess.run(
            [OCR_PYTHON, OCR_SCRIPT, document_id],
            capture_output=True, text=True, timeout=600,
            cwd=str(Path(OCR_SCRIPT).parent),
        )
        if result.returncode != 0:
            raise RuntimeError(f"OCR 任务失败: {result.stderr[:500]}")
        return document_id
    except Exception as exc:
        logger.error("[task] OCR 异常: %s", exc)
        raise self.retry(exc=exc)


@celery_app.task(
    bind=True,
    name="pipeline.run_metadata",
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def run_metadata_task(self, document_id: str, *args, **kwargs) -> Dict[str, Any]:
    """运行 Metadata，兼容前一步 chain 传来的 document_id"""
    logger.info("[task] 开始 Metadata %s", document_id)
    try:
        result = subprocess.run(
            [WORKER_PYTHON, META_SCRIPT, "--document-id", document_id],
            capture_output=True, text=True, timeout=300,
            cwd=str(Path(META_SCRIPT).parent),
        )
        if result.returncode != 0:
            error_msg = (result.stderr or result.stdout or "unknown error")
            raise RuntimeError(f"Metadata 任务失败: {error_msg[:500]}")
        return {"status": "success", "document_id": document_id, "task": "metadata"}
    except Exception as exc:
        logger.error("[task] Metadata 异常: %s", exc)
        raise self.retry(exc=exc)