"""
flow_ocr.py — OCR 处理流水线（无 Prefect 依赖）

由 pipeline-daemon subprocess 或本地 CLI 直接调用，避免 Prefect 在无 Server 时
拉起临时进程内 Server（Windows 上易失败、耗时长）。

- 输入: document_id
- 流程: 查库 → 标记 running → 下载文档 → OCR → 更新结果
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT / ".env", override=False)

if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        stream=sys.stderr,
    )
logger = logging.getLogger(__name__)

from db import get_document, update_status_running, update_status_succeeded, update_status_failed
from ocr_service import download_document, run_ocr


def fetch_document(document_id: str) -> dict:
    doc = get_document(document_id)
    if not doc:
        raise ValueError(f"文档不存在: {document_id}")
    logger.info(
        "获取文档: id=%s, object_key=%s, status=%s",
        doc["id"],
        doc.get("object_key"),
        doc.get("status"),
    )
    return doc


def download_file(object_key: str) -> bytes:
    logger.info("下载文件: %s", object_key)
    return download_document(object_key)


def execute_ocr(file_bytes: bytes) -> str:
    result = run_ocr(file_bytes)
    logger.info("OCR 完成, 文本长度: %d", len(result))
    return result


def ocr_process(document_id: str) -> None:
    """
    OCR 主入口（与旧 Prefect flow 同名，便于脚本与测试引用）。

    状态流转:
      ocr_pending → ocr_running → ocr_succeeded / ocr_failed
    """
    logger.info("=== OCR 开始: document_id=%s ===", document_id)

    doc = fetch_document(document_id)
    update_status_running(document_id)
    logger.info("状态更新: ocr_running")

    try:
        file_bytes = download_file(doc["object_key"])
        raw_text = execute_ocr(file_bytes)
        update_status_succeeded(document_id, raw_text, json.dumps({"source": "textin"}))
        logger.info("状态更新: ocr_succeeded")
        logger.info("OCR 完成，后续处理由 pipeline-daemon 自动调度")
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        update_status_failed(document_id, error_msg)
        logger.error("状态更新: ocr_failed — %s", error_msg)
        raise


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python flow_ocr.py <document_id>")
        sys.exit(1)
    ocr_process(sys.argv[1])
