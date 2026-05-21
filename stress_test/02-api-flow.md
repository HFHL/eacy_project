# 02 · API 流程

所有接口前缀 `/api/v1`。除注册外，全部要求 Header：

```
Authorization: Bearer <access_token>
```

下面按 01-scenario.md 的 11 步逐步给出。每一步标注：
- **必填请求字段**
- **返回里要捕获的关键字段**（供后续步骤使用）
- **异步轮询规则**（终止状态、字段名、推荐轮询频率）

---

## Step 1 · 注册账户

```
POST /api/v1/auth/register
Content-Type: application/json

{
  "email":    "stress_<run_id>_<vu_id>@stress.test",
  "password": "Stress@123456",
  "username": "stress_<run_id>_<vu_id>",
  "name":     "压测_<run_id>_<vu_id>"
}
```

**捕获**：

| 字段 | 用途 |
|---|---|
| `access_token` | 后续所有请求的 Bearer token |
| `refresh_token` | 暂不用（access 有效期 8 小时，单 run 足够） |
| `user.id` | 日志用 |

源码：`backend/app/api/v1/auth/router.py:55`

> **注意**：email 必须**全局唯一**，所以要带 `run_id + vu_id` 拼接。详见 03-setup.md「账户隔离」。

---

## Step 2 · 创建 patient

```
POST /api/v1/patients
Content-Type: application/json

{
  "name": "压测患者_<run_id>_<vu_id>"
}
```

可选字段：`gender / birth_date / age / department / main_diagnosis / doctor_name / extra_json`。压测建议全部留空，避免数据生成逻辑掩盖性能问题。

**捕获**：`id` → `patient_id`

源码：`backend/app/api/v1/patients/router.py:309`

---

## Step 3 · 上传 5 份文档

```
POST /api/v1/documents
Content-Type: multipart/form-data

file:       <二进制>      （必填）
patient_id: <patient_id>   （关键：传了就立即归档）
```

5 份文档可并发上传也可串行。建议**并发**（更真实地模拟前端"批量选文件上传"）。

**捕获**：每份返回的 `id` → `document_id`，存入列表 `doc_ids[]`。

返回里其他注意字段：
- `ocr_status = "queued"`（因为 `DOCUMENT_OCR_AUTO_ENQUEUE=True`）
- `status = "archived"`（因为传了 patient_id）—— 这就是为什么 Step 6 不需要单独调用

源码：`backend/app/api/v1/documents/router.py:465`，归档逻辑 `app/services/document_service.py:115-118`

---

## Step 4 · 等待 5 份 OCR 完成

**批量查询接口（推荐）**：

```
POST /api/v1/documents/statuses
Content-Type: application/json

{
  "document_ids": ["<id1>", "<id2>", ..., "<id5>"]
}
```

返回数组，每项包含 `ocr_status`、`meta_status`、`extract_status`。

**轮询规则**：
- 频率：**2 秒一次**（OCR 慢任务，1Hz 浪费）
- 终止条件：所有 `ocr_status ∈ {completed, failed}`
- 全部 completed → 成功
- 任意一份 failed → run 失败
- 超时：**5 分钟未全部 completed** → run 失败

`ocr_status` 取值集（`backend/app/services/document_service.py:116/240/261/290/327`）：

| 值 | 含义 | 终止？ |
|---|---|---|
| `pending` | 未入队 | 否 |
| `queued` | 已入 Celery 队列 | 否 |
| `running` | Celery worker 处理中 | 否 |
| `completed` | OCR 完成 | **是 · 成功** |
| `failed` | OCR 失败 | **是 · 失败** |

源码：`backend/app/api/v1/documents/router.py:521`

---

## Step 5 · 触发并等待元数据抽取

**触发**（5 次，并发）：

```
POST /api/v1/documents/<document_id>/metadata
```

无 body。返回 `meta_status = "queued"`，HTTP 202。

**轮询**：复用 Step 4 的批量接口 `POST /documents/statuses`，看 `meta_status` 字段。

`meta_status` 取值集（`backend/app/services/document_metadata_service.py:36/56/70/95/108`）：

| 值 | 含义 | 终止？ |
|---|---|---|
| `pending` / `queued` / `running` | 进行中 | 否 |
| `completed` | 完成 | **是 · 成功** |
| `skipped` | 该文档类型无需元数据 | **是 · 成功** |
| `failed` | 失败 | **是 · 失败** |

**轮询规则**：2 秒一次，超时 3 分钟。

源码：`backend/app/api/v1/documents/router.py:690`

---

## Step 6 · 归档（无需调用）

文档在 Step 3 上传时已携带 `patient_id`，后端在 `document_service.py:115-118` 自动写入 `archived_at` + `status='archived'`。

**此步在脚本中保留为一个 no-op 占位**，仅在日志里打一行 "archive: auto"，便于事后对照流程。

> 如果将来某次测试想模拟"先上传不归档，后批量归档"的路径，使用：
> - 单档：`POST /api/v1/documents/{id}/archive` body `{"patient_id":"...", "create_extraction_job": true}`
> - 批量：`POST /api/v1/documents/batch-archive`
> 当前压测**不走**这个路径。

---

## Step 7 · 触发病历夹（EHR）字段抽取

```
POST /api/v1/patients/<patient_id>/ehr/update-folder
```

无 body。HTTP 202。

**捕获**：

| 字段 | 用途 |
|---|---|
| `batch_id` | 用来轮询整体进度 |
| `job_ids[]` | 每个文档对应一个 job，调试用 |
| `planned_documents` | 后端规划要处理多少文档 |
| `created_jobs` | 实际建了多少 job |

**轮询**：

```
GET /api/v1/task-batches/<batch_id>
```

字段：`status`、`progress`（0-1）、`succeeded_items`、`failed_items`、`total_items`。

终止状态（`backend/app/services/task_progress_service.py:9`）：

| 值 | 含义 |
|---|---|
| `pending` / `running` | 进行中 |
| `succeeded` | 全部完成（**run 成功**） |
| `failed` | 至少一个 job 失败 |
| `cancelled` | 被取消 |

**轮询规则**：3 秒一次（这一步可能跑 30-90 秒），超时 5 分钟。

源码：`backend/app/api/v1/patients/router.py:366`，进度查询 `app/api/v1/tasks/router.py:80`

---

## Step 8 · 创建科研项目

```
POST /api/v1/projects
Content-Type: application/json

{
  "project_code": "STRESS_<run_id>_<vu_id>",
  "project_name": "压测项目_<run_id>_<vu_id>",
  "status":       "active"
}
```

**注意**：没有 `template_id` 字段。模板要单独绑定。

**捕获**：`id` → `project_id`

**绑定字段模板**（必须，否则 CRF 抽取没有目标字段）：

```
POST /api/v1/projects/<project_id>/template-bindings
Content-Type: application/json

{
  "template_id":        "<pre_seeded_template_id>",
  "schema_version_id":  "<published_version_id>",
  "binding_type":       "primary_crf"
}
```

> 后端会校验 `version.template_id == template_id`，所以两者必须配套。
> 模板必须是 `template_type=crf`（`ehr` 是病历夹自用，后端 `get_latest_published("ehr")` 自动拉，不要绑到项目上）。
> 用 `python -m scripts.discover_templates` 列出后端已有模板/版本。

源码：建项目 `backend/app/api/v1/research/router.py:360`，模板绑定 `:468`

---

## Step 9 · patient 入组项目

```
POST /api/v1/projects/<project_id>/patients
Content-Type: application/json

{
  "patient_id": "<patient_id>"
}
```

**捕获**：`id` → `project_patient_id`（**不是 patient_id**，是 ProjectPatient 表的主键）

源码：`backend/app/api/v1/research/router.py:509`

---

## Step 10 · CRF 全量抽取

```
POST /api/v1/projects/<project_id>/patients/<project_patient_id>/crf/update-folder
```

无 body。HTTP 202。

**捕获**：`batch_id`、`job_ids[]`、`created_jobs`

**轮询**：同 Step 7，`GET /api/v1/task-batches/<batch_id>`，终止条件相同。

**轮询规则**：3 秒一次，超时 **8 分钟**（CRF 字段多，慢）。

源码：`backend/app/api/v1/research/router.py:545`

> ❌ **不要**走通用入口 `POST /extraction-jobs` 触发 `job_type=project_crf` —— 它会绕过 update-folder 的去重逻辑，导致重复 job，与真实前端行为不一致。

---

## Step 11 · 靶向抽取

```
POST /api/v1/extraction-jobs
Content-Type: application/json

{
  "job_type": "project_crf",
  "project_id": "<project_id>",
  "project_patient_id": "<project_patient_id>",
  "target_form_key": "<form_key>",
  "input_json": {
    "field_paths": ["baseline.demographics.gender", "baseline.demographics.age"],
    "form_keys":   ["baseline"]
  }
}
```

`field_paths` 要选**模板里真实存在**的字段——见 03-setup.md「预置数据」。

**捕获**：`id` → `job_id`

**轮询**：

```
GET /api/v1/extraction-jobs/<job_id>
```

字段：`status`、`progress`。

终止状态：

| 值 | 含义 |
|---|---|
| `pending` / `running` | 进行中 |
| `completed` | **成功** |
| `failed` | 失败 |
| `cancelled` | 被取消 |

**轮询规则**：2 秒一次，超时 3 分钟。

源码：`backend/app/api/v1/extraction/router.py:87`，靶向参数解析 `app/services/extraction_service.py:992-1023`

---

## 轮询通用准则

| 项 | 推荐 |
|---|---|
| 起始延迟 | 触发后立刻轮一次（不要 sleep），后端可能秒级完成 |
| 退避 | 第一次失败不退避；连续 3 次 5xx 后改为 5s 一次，最多 10 次 |
| 超时 | 每步单独设置（见各步骤），**绝对不允许无限轮询** |
| 单次请求 timeout | 10 秒 |
| 轮询是"操作"吗？| **算**——这是"5 ops/sec"里的主要构成 |

## 一次 run 的总请求数（粗算）

| 步骤 | HTTP 调用次数 |
|---|---|
| Step 1-2 | 2 |
| Step 3 上传 | 5 |
| Step 4 OCR 轮询 | ~20-60 |
| Step 5 元数据触发 + 轮询 | 5 + ~15-30 |
| Step 7 EHR 触发 + 轮询 | 1 + ~10-30 |
| Step 8-9 | 2-3 |
| Step 10 CRF 触发 + 轮询 | 1 + ~20-60 |
| Step 11 靶向触发 + 轮询 | 1 + ~5-15 |
| **合计** | **~85-210 次/run** |

5 个 VU 同时跑、单 run 5 分钟，**平均 QPS ≈ (5 × 150) / 300 = 2.5 QPS**——不大，但**峰值时上传 + 触发**会形成短时高负载，且后端 Celery worker 同时被多个用户的任务塞满才是真正的瓶颈源。
