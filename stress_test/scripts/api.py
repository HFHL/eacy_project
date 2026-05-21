"""HTTP 调用 + 业务埋点 + 轮询工具。

设计要点：
- 直接复用 Locust 的 self.client，不引第三方 HTTP 库
- step() context manager 把业务步骤耗时通过 events.request.fire 打入 locust_stats.csv
  → 不需要单独写 report.py，跑完看 locust 自带 stats 就够了
- 轮询函数会把每次请求计入 HTTP 层统计（locust client 默认行为），同时单独埋点
"""
from __future__ import annotations

import time
from contextlib import contextmanager

from locust import events


# --------------------------------------------------------------------- 业务埋点

@contextmanager
def step(name: str):
    """把一段业务步骤的总耗时打到 Locust stats 里。

    用法：
        with step("wait_ocr"):
            poll_ocr(...)

    成功的 step 会在 locust 报告里以 `STEP / wait_ocr` 形式出现，能直接看 p50/p95。
    失败的 step 也会记录，但 exception 会继续抛出。
    """
    t0 = time.time()
    err: Exception | None = None
    try:
        yield
    except Exception as e:
        err = e
        raise
    finally:
        elapsed_ms = (time.time() - t0) * 1000
        events.request.fire(
            request_type="STEP",
            name=name,
            response_time=elapsed_ms,
            response_length=0,
            exception=err,
        )


# --------------------------------------------------------------------- 通用工具

def _ok(resp, ctx_name: str):
    """检查 HTTP 响应；非 2xx 抛错并把响应体写进 message 里方便排查。"""
    if not resp.ok:
        body = resp.text[:500] if resp.text else ""
        raise RuntimeError(f"{ctx_name} HTTP {resp.status_code}: {body}")
    try:
        return resp.json()
    except Exception:
        raise RuntimeError(f"{ctx_name} returned non-JSON: {resp.text[:200]}")


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------- 各 step API

def register(client, run_id: str, vu_id: int) -> dict:
    """Step 1 · 注册。返回 {token, user_id, email}"""
    email = f"stress_{run_id}_{vu_id}@stress.test"
    payload = {
        "email": email,
        "password": "Stress@123456",
        "username": f"stress_{run_id}_{vu_id}",
        "name": f"压测_{run_id}_{vu_id}",
    }
    with client.post("/api/v1/auth/register", json=payload, name="POST /auth/register", catch_response=True) as r:
        data = _ok(r, "register")
        r.success()
    return {
        "token": data["access_token"],
        "user_id": data.get("user", {}).get("id"),
        "email": email,
    }


def create_patient(client, token: str, run_id: str, vu_id: int) -> str:
    """Step 2 · 建 patient。返回 patient_id"""
    payload = {"name": f"压测患者_{run_id}_{vu_id}"}
    with client.post(
        "/api/v1/patients",
        json=payload,
        headers=auth_headers(token),
        name="POST /patients",
        catch_response=True,
    ) as r:
        data = _ok(r, "create_patient")
        r.success()
    return data["id"]


def upload_document(client, token: str, patient_id: str, file_path: str) -> str:
    """Step 3 · 单份上传。返回 document_id。

    注意：传 patient_id 会触发立即归档（status=archived）+ OCR 自动入队。
    """
    import os
    fname = os.path.basename(file_path)
    with open(file_path, "rb") as f:
        files = {"file": (fname, f)}
        data = {"patient_id": patient_id}
        with client.post(
            "/api/v1/documents",
            files=files,
            data=data,
            headers=auth_headers(token),
            name="POST /documents",
            catch_response=True,
        ) as r:
            body = _ok(r, "upload_document")
            r.success()
    return body["id"]


def poll_doc_statuses(
    client,
    token: str,
    doc_ids: list[str],
    field: str,
    done_values: set[str],
    fail_values: set[str],
    timeout_s: int,
    interval_s: float = 2.0,
) -> dict:
    """通用：轮询 POST /documents/statuses 直到所有 doc 在 field 列上落入终止态。

    返回最后一次完整响应（list[dict]）。
    """
    deadline = time.time() + timeout_s
    last = None
    iters = 0
    while True:
        with client.post(
            "/api/v1/documents/statuses",
            json={"document_ids": doc_ids},
            headers=auth_headers(token),
            name="POST /documents/statuses",
            catch_response=True,
        ) as r:
            data = _ok(r, "poll_doc_statuses")
            r.success()
        last = data
        # 状态汇总
        pending = sum(1 for d in data if d.get(field) not in done_values | fail_values)
        failed = [d for d in data if d.get(field) in fail_values]
        if failed:
            raise RuntimeError(
                f"poll_doc_statuses: {field} failed for {[d.get('id') for d in failed]}"
            )
        if pending == 0:
            return data
        iters += 1
        if iters % 5 == 0:
            print(f"  [{field}] still pending={pending}/{len(doc_ids)} after {iters*interval_s:.0f}s")
        if time.time() > deadline:
            raise TimeoutError(
                f"poll_doc_statuses({field}) timeout after {timeout_s}s; pending={pending}"
            )
        time.sleep(interval_s)


def trigger_ehr(client, token: str, patient_id: str) -> str:
    """Step 7 · 触发 EHR。返回 batch_id"""
    with client.post(
        f"/api/v1/patients/{patient_id}/ehr/update-folder",
        headers=auth_headers(token),
        name="POST /patients/{id}/ehr/update-folder",
        catch_response=True,
    ) as r:
        data = _ok(r, "trigger_ehr")
        r.success()
    return data["batch_id"]


def poll_task_batch(
    client,
    token: str,
    batch_id: str,
    timeout_s: int,
    interval_s: float = 3.0,
    label: str = "batch",
) -> dict:
    """通用：轮询 task-batch 直到 status ∈ {succeeded, failed, cancelled}"""
    deadline = time.time() + timeout_s
    iters = 0
    while True:
        with client.get(
            f"/api/v1/task-batches/{batch_id}",
            headers=auth_headers(token),
            name="GET /task-batches/{id}",
            catch_response=True,
        ) as r:
            data = _ok(r, "poll_task_batch")
            r.success()
        status = data.get("status")
        if status in ("succeeded",):
            return data
        if status in ("failed", "cancelled"):
            raise RuntimeError(
                f"poll_task_batch({label}) terminal={status} "
                f"succeeded={data.get('succeeded_items')} failed={data.get('failed_items')}"
            )
        iters += 1
        if iters % 3 == 0:
            print(
                f"  [{label}] status={status} progress={data.get('progress')} "
                f"succ={data.get('succeeded_items')}/{data.get('total_items')}"
            )
        if time.time() > deadline:
            raise TimeoutError(f"poll_task_batch({label}) timeout after {timeout_s}s; last={status}")
        time.sleep(interval_s)


def create_project(client, token: str, run_id: str, vu_id: int) -> str:
    """Step 8a · 建项目。返回 project_id"""
    payload = {
        "project_code": f"STRESS_{run_id}_{vu_id}",
        "project_name": f"压测项目_{run_id}_{vu_id}",
        "status": "active",
    }
    with client.post(
        "/api/v1/projects",
        json=payload,
        headers=auth_headers(token),
        name="POST /projects",
        catch_response=True,
    ) as r:
        data = _ok(r, "create_project")
        r.success()
    return data["id"]


def bind_template(client, token: str, project_id: str, template_id: str, version_id: str) -> None:
    """Step 8b · 绑 CRF 模板。需要 template_id + schema_version_id（后端会校验两者匹配）。"""
    payload = {
        "template_id": template_id,
        "schema_version_id": version_id,
        "binding_type": "primary_crf",
    }
    with client.post(
        f"/api/v1/projects/{project_id}/template-bindings",
        json=payload,
        headers=auth_headers(token),
        name="POST /projects/{id}/template-bindings",
        catch_response=True,
    ) as r:
        _ok(r, "bind_template")
        r.success()


def enroll_patient(client, token: str, project_id: str, patient_id: str) -> str:
    """Step 9 · 入组。返回 project_patient_id"""
    with client.post(
        f"/api/v1/projects/{project_id}/patients",
        json={"patient_id": patient_id},
        headers=auth_headers(token),
        name="POST /projects/{id}/patients",
        catch_response=True,
    ) as r:
        data = _ok(r, "enroll_patient")
        r.success()
    return data["id"]


def trigger_crf(client, token: str, project_id: str, project_patient_id: str) -> str:
    """Step 10 · 触发 CRF 全量。返回 batch_id"""
    with client.post(
        f"/api/v1/projects/{project_id}/patients/{project_patient_id}/crf/update-folder",
        headers=auth_headers(token),
        name="POST /projects/{id}/patients/{ppid}/crf/update-folder",
        catch_response=True,
    ) as r:
        data = _ok(r, "trigger_crf")
        r.success()
    return data["batch_id"]
