"""
flow_ocr.py — Prefect 3 OCR 处理 Flow

这是核心编排文件：
- 输入: document_id
- 流程: 查库 → 标记 running → 下载文档 → OCR → 更新结果
"""

import json
from prefect import flow, task, get_run_logger
from dotenv import load_dotenv

load_dotenv()

from db import get_document, update_status_running, update_status_succeeded, update_status_failed
from ocr_service import download_document, run_ocr


@task(name="fetch-document")
def fetch_document(document_id: str) -> dict:
    """从数据库获取文档记录"""
    logger = get_run_logger()
    doc = get_document(document_id)
    if not doc:
        raise ValueError(f"文档不存在: {document_id}")
    logger.info(f"获取文档: id={doc['id']}, object_key={doc['object_key']}, status={doc['status']}")
    return doc


@task(name="download-file")
def download_file(object_key: str) -> bytes:
    """下载文档文件"""
    logger = get_run_logger()
    logger.info(f"下载文件: {object_key}")
    return download_document(object_key)


@task(name="execute-ocr")
def execute_ocr(file_bytes: bytes) -> str:
    """执行 OCR"""
    logger = get_run_logger()
    result = run_ocr(file_bytes)
    logger.info(f"OCR 完成, 文本长度: {len(result)}")
    return result


@flow(name="ocr-process", log_prints=True)
def ocr_process(document_id: str) -> None:
    """
    OCR 处理主 Flow

    状态流转:
      ocr_pending → ocr_running → ocr_succeeded / ocr_failed
    """
    logger = get_run_logger()
    logger.info(f"=== OCR Flow 开始: document_id={document_id} ===")

    # 1. 获取文档记录
    doc = fetch_document(document_id)

    # 2. 标记为 ocr_running
    update_status_running(document_id)
    logger.info("状态更新: ocr_running")

    try:
        # 3. 下载文档
        file_bytes = download_file(doc["object_key"])

        # 4. 执行 OCR
        raw_text = execute_ocr(file_bytes)

        # 5. 成功 → 更新状态和结果
        update_status_succeeded(document_id, raw_text, json.dumps({"source": "textin"}))
        logger.info("状态更新: ocr_succeeded ✅")

        # 后续的 Metadata 抽取和 EHR 抽取由 pipeline-daemon 自动发现并派发
        logger.info("OCR 完成，后续处理由 pipeline-daemon 自动调度")

    except Exception as e:
        # 失败 → 记录错误
        error_msg = f"{type(e).__name__}: {e}"
        update_status_failed(document_id, error_msg)
        logger.error(f"状态更新: ocr_failed ❌ — {error_msg}")
        raise


# ─── 用于本地直接运行测试 ────────────────────────────────────────────────
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("用法: python flow_ocr.py <document_id>")
        sys.exit(1)

    ocr_process(sys.argv[1])
