"""9 步串行业务流程。

跳过：
- metadata 抽取（最快路径不验证元数据）
- 靶向抽取（同上）

每步用 api.step() 包一层，自动产生 STEP/xxx 的 locust 统计。
"""
from __future__ import annotations

import os
import sys
import random
import time

# 兼容 locust 直接 exec locustfile.py 的场景（无包上下文）
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import api  # noqa: E402


SUPPORTED_EXTS = (".pdf", ".jpg", ".jpeg", ".png")


def list_fixture_files(fixtures_dir: str) -> list[str]:
    """扫描 fixtures_dir 下的所有支持后缀文件（扁平目录，不递归）。"""
    if not os.path.isdir(fixtures_dir):
        raise RuntimeError(f"FIXTURES_DIR not found: {fixtures_dir}")
    files = []
    for name in sorted(os.listdir(fixtures_dir)):
        full = os.path.join(fixtures_dir, name)
        if os.path.isfile(full) and name.lower().endswith(SUPPORTED_EXTS):
            files.append(full)
    if not files:
        raise RuntimeError(
            f"no supported files ({'/'.join(SUPPORTED_EXTS)}) in {fixtures_dir}"
        )
    return files


def pick_fixture(vu_id: int, all_files: list[str], n: int = 5) -> list[str]:
    """从全量池里随机抽 n 份；同一个 VU 用 vu_id 做种子，保证一次 run 内可复现。"""
    if len(all_files) < n:
        raise RuntimeError(
            f"fixture pool has {len(all_files)} files, need ≥{n} (DOCS_PER_VU)"
        )
    rng = random.Random(f"{vu_id}-{time.time_ns()}")
    return rng.sample(all_files, n)


def run_pipeline(client, ctx: dict, cfg: dict) -> None:
    """跑完整 9 步流程；任何一步失败抛异常。

    ctx 必含：run_id, vu_id, files (list[str])
    cfg 必含：TEMPLATE_ID, DOCS_PER_VU, STEP_TIMEOUT_*
    """
    run_id = ctx["run_id"]
    vu_id = ctx["vu_id"]
    files = ctx["files"]

    # Step 1 · 注册
    with api.step("register"):
        reg = api.register(client, run_id, vu_id)
    token = reg["token"]
    print(f"[VU {vu_id}] registered as {reg['email']}")

    # Step 2 · 建 patient
    with api.step("create_patient"):
        patient_id = api.create_patient(client, token, run_id, vu_id)
    print(f"[VU {vu_id}] patient_id={patient_id}")

    # Step 3 · 上传 N 份（v0 串行；并发上传留给 v1）
    total = len(files)
    doc_ids: list[str] = []
    for i, path in enumerate(files, 1):
        with api.step("upload_doc"):
            doc_id = api.upload_document(client, token, patient_id, path)
        doc_ids.append(doc_id)
        print(f"[VU {vu_id}] uploaded {i}/{total} {os.path.basename(path)} → {doc_id}")

    # Step 4 · 等 OCR（同时 = "观察 celery 状况" 的关键窗口）
    print(f"[VU {vu_id}] waiting OCR for {len(doc_ids)} docs ...")
    with api.step("wait_ocr"):
        api.poll_doc_statuses(
            client,
            token,
            doc_ids,
            field="ocr_status",
            done_values={"completed"},
            fail_values={"failed"},
            timeout_s=int(cfg["STEP_TIMEOUT_OCR"]),
            interval_s=2.0,
        )
    print(f"[VU {vu_id}] OCR done")

    # Step 5 · 归档（上传时已自动归档；只打日志）
    with api.step("archive_noop"):
        pass
    print(f"[VU {vu_id}] archive: auto (done at upload)")

    # Step 6 · 触发 EHR + 等
    with api.step("trigger_ehr"):
        ehr_batch = api.trigger_ehr(client, token, patient_id)
    print(f"[VU {vu_id}] EHR batch_id={ehr_batch}")
    with api.step("wait_ehr"):
        api.poll_task_batch(
            client,
            token,
            ehr_batch,
            timeout_s=int(cfg["STEP_TIMEOUT_EHR"]),
            interval_s=3.0,
            label=f"ehr/vu{vu_id}",
        )
    print(f"[VU {vu_id}] EHR done")

    # Step 7 · 建项目 + 绑模板
    with api.step("create_project"):
        project_id = api.create_project(client, token, run_id, vu_id)
    print(f"[VU {vu_id}] project_id={project_id}")
    with api.step("bind_template"):
        api.bind_template(client, token, project_id, cfg["TEMPLATE_ID"], cfg["TEMPLATE_VERSION_ID"])

    # Step 8 · 入组
    with api.step("enroll_patient"):
        ppid = api.enroll_patient(client, token, project_id, patient_id)
    print(f"[VU {vu_id}] project_patient_id={ppid}")

    # Step 9 · CRF 抽取
    with api.step("trigger_crf"):
        crf_batch = api.trigger_crf(client, token, project_id, ppid)
    print(f"[VU {vu_id}] CRF batch_id={crf_batch}")
    with api.step("wait_crf"):
        api.poll_task_batch(
            client,
            token,
            crf_batch,
            timeout_s=int(cfg["STEP_TIMEOUT_CRF"]),
            interval_s=3.0,
            label=f"crf/vu{vu_id}",
        )
    print(f"[VU {vu_id}] CRF done ✓ — full pipeline OK")
