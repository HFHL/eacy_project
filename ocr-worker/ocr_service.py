"""
ocr_service.py — 真实 OSS 下载 + Textin OCR
"""

from __future__ import annotations

import os
import json
import oss2
import requests


# ─── OSS 下载 ────────────────────────────────────────────────────────────────

def _build_oss_bucket() -> oss2.Bucket:
    auth = oss2.Auth(
        os.environ["OSS_ACCESS_KEY_ID"],
        os.environ["OSS_ACCESS_KEY_SECRET"],
    )
    endpoint = os.environ["OSS_ENDPOINT"]  # oss-cn-shanghai.aliyuncs.com
    bucket_name = os.environ["OSS_BUCKET_NAME"]  # cinocore-eacy
    return oss2.Bucket(auth, endpoint, bucket_name)


def download_document(object_key: str) -> bytes:
    """从本地 mock_oss 或阿里云 OSS 下载文档，返回 bytes"""
    local_path = os.path.join("/Users/apple/project/first-project/mock_oss", object_key)
    if os.path.exists(local_path):
        print(f"[mock_oss] 从本地读取: {local_path}")
        with open(local_path, "rb") as f:
            data = f.read()
            print(f"[mock_oss] 读取完成, 大小: {len(data) / 1024:.1f} KB")
            return data

    print(f"[oss] 正在下载: {object_key}")
    bucket = _build_oss_bucket()
    result = bucket.get_object(object_key)
    data = result.read()
    print(f"[oss] 下载完成, 大小: {len(data) / 1024:.1f} KB")
    return data


# ─── Textin OCR ──────────────────────────────────────────────────────────────

TEXTIN_API_URL = "https://api.textin.com/ai/service/v1/pdf_to_markdown"


def run_ocr(file_bytes: bytes) -> str:
    """
    调用 Textin xParse API，返回拼接后的纯文本
    与 Node 侧 textin.ts 使用完全相同的 API 和参数
    """
    app_id = os.environ["TEXTIN_APP_ID"]
    secret = os.environ["TEXTIN_SECRET_CODE"]

    params = {
        "markdown_details": "1",
        "page_details": "1",
        "apply_document_tree": "0",
    }

    headers = {
        "x-ti-app-id": app_id,
        "x-ti-secret-code": secret,
        "Content-Type": "application/octet-stream",
    }

    print(f"[textin] 调用 API, 文件大小: {len(file_bytes) / 1024:.1f} KB")
    resp = requests.post(
        TEXTIN_API_URL,
        params=params,
        headers=headers,
        data=file_bytes,
        timeout=120,
    )
    resp.raise_for_status()

    data = resp.json()
    if data.get("code") != 200:
        raise RuntimeError(f"Textin 返回错误: code={data.get('code')} message={data.get('message')}")

    result = data["result"]

    # 建立 page_id → angle 映射
    angle_map = {}
    if isinstance(result.get("pages"), list):
        for page in result["pages"]:
            angle_map[page.get("page_id")] = page.get("angle", 0)

    # 提取 segments
    segments = []
    if isinstance(result.get("detail"), list):
        for item in result["detail"]:
            if not item.get("text") or not item.get("position"):
                continue
            segments.append({
                "page_id": item.get("page_id"),
                "page_angle": angle_map.get(item.get("page_id"), 0),
                "text": item.get("text"),
                "position": item.get("position"),
                "type": item.get("type", "paragraph"),
                "sub_type": item.get("sub_type"),
            })

    total_pages = result.get("total_page_number") or result.get("valid_page_number") or 0
    raw_text_json = json.dumps({"total_page_number": total_pages, "segments": segments}, ensure_ascii=False)

    print(f"[textin] OCR 完成: {total_pages} 页, {len(segments)} 个段落, JSON 长度: {len(raw_text_json)}")
    return raw_text_json
