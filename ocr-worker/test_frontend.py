"""
test_frontend.py - 模拟物理层面前端上传流程
(不碰数据库，完全通过调用 Node API 和直连 OSS 来模拟前端行为)
"""

import os
import sys
import time
import requests
import oss2
import random
from dotenv import load_dotenv

# 加载 .env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

NODE_API = "http://localhost:8000/api/v1"

def upload_to_oss(local_path: str, object_key: str):
    auth = oss2.Auth(
        os.environ["OSS_ACCESS_KEY_ID"],
        os.environ["OSS_ACCESS_KEY_SECRET"],
    )
    bucket = oss2.Bucket(auth, os.environ["OSS_ENDPOINT"], os.environ["OSS_BUCKET_NAME"])
    print(f"[前端] 正在上传文件至 OSS → {object_key}")
    bucket.put_object_from_file(object_key, local_path)
    print("[前端] OSS 上传完成 ✅")

if __name__ == "__main__":
    # 找一个的测试文件
    test_dir = os.path.join(os.path.dirname(__file__), "..", "test_files", "病历三")
    pdf_files = [f for f in os.listdir(test_dir) if f.endswith(".pdf")]
    test_file = random.choice(pdf_files)
    local_path = os.path.join(test_dir, test_file)
    file_size = os.path.getsize(local_path)

    print("=" * 60)
    print(f"🎬 模拟前端操作开始: {test_file} ({file_size/1024:.1f} KB)")
    print("=" * 60)

    # 1. 模拟前端调用 upload-init
    print("\n[前端] 1. 请求 /documents/upload-init ...")
    res1 = requests.post(f"{NODE_API}/documents/upload-init", json={
        "fileName": test_file,
        "fileSize": file_size,
        "mimeType": "application/pdf"
    })
    res1.raise_for_status()
    data1 = res1.json()
    if not data1["success"]:
        print(f"初始化失败: {data1}")
        sys.exit(1)
    
    doc_id = data1["data"]["documentId"]
    object_key = data1["data"]["objectKey"]
    print(f"       ✅ 成功，获得 documentId = {doc_id}")
    print(f"       ✅ 获得 objectKey = {object_key}")

    # 2. 模拟前端使用 OSS SDK 直传 (或拿到 STS token 之后上传)
    print(f"\n[前端] 2. 直传物理文件到 OSS (模拟客户端 SDK 上传)...")
    upload_to_oss(local_path, object_key)

    # 3. 模拟前端调用 complete 触发处理流程
    print(f"\n[前端] 3. 请求 /documents/complete 通知后端处理...")
    res2 = requests.post(f"{NODE_API}/documents/complete", json={
        "documentId": doc_id,
        "objectKey": object_key
    })
    res2.raise_for_status()
    data2 = res2.json()
    if not data2["success"]:
        print(f"完成接口失败: {data2}")
        sys.exit(1)
    
    print(f"       ✅ 服务端已接管处理，返回状态: {data2['data']['status']}")

    # 4. 轮询后端检查是否处理完成 (仅为效果展示)
    print(f"\n[前端] 4. 前端开始轮询，等待 OCR 或者状态刷新...")
    start = time.time()
    while True:
        res3 = requests.get(f"{NODE_API}/documents/{doc_id}")
        doc_info = res3.json()["data"]
        status = doc_info["status"]
        
        elapsed = time.time() - start
        
        if status in ["ocr_succeeded", "ocr_failed"]:
            print(f"       ✅ 终态到达！耗时: {elapsed:.1f} 秒 -> 状态: {status}")
            if status == "ocr_succeeded":
                text = doc_info["raw_text"] or ""
                print(f"          获取到了解析结果，JSON 长度: {len(text)}")
                print(f"          片段: {text[:100]} ...")
            elif status == "ocr_failed":
                print(f"          发生错误: {doc_info.get('error_message')}")
            break
        elif elapsed > 60:
            print(f"       ⏳ 超时退出，当前状态: {status}")
            break
        else:
            print(f"       ... 当前状态: {status}，等待中 ...")
            time.sleep(2)
