---
title: EACY开发计划
tags:
  - eacy
  - backend
  - frontend
  - plan
status: active
created: 2026-04-27
---

# EACY 开发计划

> [!summary]
> 目标是先跑通最小业务闭环，同时保留后续扩展空间。第一步先把 `fastapi-boilerplate-master` 裁剪成稳定的 EACY 后端基础。后续每个需求都按“后端接口 + 前端接入 + 验证方法”同步推进。

关联文档：

- [[EACY架构总览]]
- [[Eacy后端开发文档]]
- [[Eacy前端开发文档]]

## 总目标

最小闭环优先跑通：

```text
患者创建/查看
  -> 文档上传/查看
  -> 创建抽取任务
  -> mock 抽取结果写入 EHR
  -> 前端查看患者 EHR / 文档 / 任务状态
```

第一阶段不追求完整 OCR、LLM、CRF 版本管理、复杂权限、项目级数据权限。先保证系统能从前端到后端、从 API 到数据库、从上传到任务再到结构化结果完整流转。

## 基本原则

- 后端基础一旦裁剪成型，后期都在这个基础上继续修改，不再频繁更换架构。
- 前后端同步开发，每个需求必须同时定义接口、页面接入点、验证方法。
- 开发前期权限尽量放开，但所有接口从第一天保留 `current_user` 注入点。
- 真实 OCR/LLM 暂时用 mock adapter 替代，接口和任务模型提前稳定。
- 每一步完成后都要能被测试，不接受“代码写了但流程没验证”。

## 阶段 1：后端模板裁剪与基础成型

目标：把 `fastapi-boilerplate-master` 裁剪成 `backend/`，形成 EACY 后端长期基座。

### 1.1 后端目录落位

子页面：[[EACY开发计划 1.1 后端目录落位实施路径]]

任务：

- [x] 将 `fastapi-boilerplate-master` 复制或重命名为 `backend`
- [x] 修改 `pyproject.toml` 项目信息为 `eacy-backend`
- [x] 保留 FastAPI 启动、配置、数据库、Alembic、中间件、异常、缓存基础能力
- [x] 清理模板示例业务，不沿用示例 `user/auth` 的复杂 DDD 结构

建议保留：

```text
main.py
app/server.py
core/config.py
core/db/
core/fastapi/
core/exceptions/
core/helpers/cache/
migrations/
tests/
docker/
```

建议重建：

```text
app/api/v1/
app/models/
app/schemas/
app/repositories/
app/services/
app/workers/
app/integrations/
app/storage/
app/utils/
```

验证方法：

```bash
cd backend
poetry install
python main.py --env local --debug
```

验收标准：

- [x] `/docs` 可以打开
- [x] 应用可以启动，无 import error
- [x] 项目目录已经从模板示例结构转为 EACY 目标结构

### 1.2 建立统一 API 路由

子页面：[[EACY开发计划 1.2 建立统一 API 路由实施路径]]

任务：

- [x] 新建 `app/api/v1/__init__.py`
- [x] 聚合 `auth / patients / documents / extraction / ehr / templates / research / admin` 路由
- [x] `app/server.py` 只注册一个 `api_router`

目标结构：

```text
app/api/v1/
├── __init__.py
├── auth/router.py
├── patients/router.py
├── documents/router.py
├── extraction/router.py
├── ehr/router.py
├── templates/router.py
├── research/router.py
└── admin/router.py
```

验证方法：

```bash
curl http://localhost:8000/api/v1/health
```

验收标准：

- [x] `/api/v1/health` 返回正常
- [x] Swagger 中能看到模块化 tags
- [x] 新增业务模块只需要在 `app/api/v1/__init__.py` 注册

### 1.3 开发期宽松鉴权

[[EACY开发计划 1.3 开发期宽松鉴权实施路径]]

任务：

- [x] 新建 `app/core/auth.py`
- [x] 新建 `app/core/security.py`
- [x] 增加配置 `ENABLE_AUTH=false`
- [x] `ENABLE_AUTH=false` 时自动注入 `dev_admin`
- [x] `ENABLE_AUTH=true` 时走 JWT 校验

开发期行为：

```text
ENABLE_AUTH=false
所有接口放行
request/current_user = dev_admin
role = admin
permissions = ["*"]
```

正式期行为：

```text
ENABLE_AUTH=true
校验 Authorization: Bearer <token>
无 token 返回 401
权限不足返回 403
```

验证方法：

```bash
curl http://localhost:8000/api/v1/auth/me
```

验收标准：

- [x] 未登录也能返回 dev 用户
- [x] 业务接口已经使用 `Depends(get_current_user)`
- [x] 后期打开 `ENABLE_AUTH=true` 时不需要大面积改接口

## 阶段 2：数据库与基础模型

目标：建立最小可用数据模型，不一次性设计完整医疗数据库。第一版围绕「文档上传/OCR/归档 → 患者电子病历夹抽取 → 字段候选值/当前值/历史/溯源 → 科研项目 CRF 抽取」这一最小闭环设计。

### 2.1 最小表结构

第一批业务表：

```text
patients
documents

schema_templates
schema_template_versions

data_contexts
record_instances
field_value_events
field_current_values
field_value_evidence

extraction_jobs
extraction_runs

research_projects
project_patients
project_template_bindings
```

说明：

- `users` 沿用 FastAPI boilerplate 自带用户表，不纳入 EACY 最小业务表清单。
- `data_contexts` 用于统一区分患者 EHR 与科研项目 CRF，避免拆成两套字段值表。
- `record_instances` 用于支持可重复表单，不可重复表单也创建 `repeat_index = 0` 的默认实例。
- `field_value_events` 存候选值、历史值、人工编辑值和 AI 抽取值。
- `field_current_values` 存页面当前展示值。
- `field_value_evidence` 存普通字段、表格行、表格单元格级别的证据溯源。

第一批模型文件：

```text
app/models/user.py
app/models/patient.py
app/models/document.py

app/models/schema_template.py
app/models/schema_template_version.py

app/models/data_context.py
app/models/record_instance.py
app/models/field_value_event.py
app/models/field_current_value.py
app/models/field_value_evidence.py

app/models/extraction_job.py
app/models/extraction_run.py

app/models/research_project.py
app/models/project_patient.py
app/models/project_template_binding.py
```

核心设计规则：

- 模板结构放在 `schema_template_versions.schema_json`，第一版不拆 `schema_nodes`。
- OCR 页、段落、表格结构先放在 `documents.ocr_payload_json`，第一版不拆 `document_pages`、`document_blocks`。
- 字段值不要只存最终值，AI 候选、人工修改、清空、从 EHR 同步到 CRF 都进入 `field_value_events`。
- 当前值必须通过 `field_current_values.selected_event_id` 指回被选中的事件。
- 表格字段存入 `value_json`，每行必须有稳定 `row_id`，用于 `field_value_evidence.row_key` / `cell_key` 溯源。

验证方法：

```bash
alembic upgrade head
python -c "import app.models; from core.db import Base; assert len(Base.metadata.tables) == 14"
```

验证结果（2026-04-27）：

- [x] `.env` 中 `DATABASE_URL` 已被后端配置读取。
- [x] Alembic 当前版本：`20260427_2315`。
- [x] 14 张最小业务表均已存在。
- [x] 14 张表的目标字段结构校验通过，缺失字段为空。
- [x] 重复执行 `alembic upgrade head` 成功。
- [x] 目标库原本已有 `patients`、`documents`、`extraction_jobs`、`project_patients`，已通过兼容迁移补齐字段，没有删除旧列。

验收标准：

- [x] 数据库可创建所有最小表
- [x] `alembic upgrade head` 可重复在当前目标库执行成功
- [x] 模型字段能支持文档、模板、上下文、字段事件、当前值、证据、抽取任务、科研项目最小闭环
- [x] `patients` 只保存高频检索和顶部展示字段，详细 EHR 字段进入字段值系统
- [x] 患者 EHR 与科研 CRF 共用 `data_contexts`、`record_instances`、`field_value_events`、`field_current_values`、`field_value_evidence`

### 2.2 Repository 与 Service 基础层

任务：

- [x] 每个核心模型建立 repository
- [x] 每个业务域建立 service
- [x] API 层只处理参数、权限、响应，不写复杂业务逻辑
- [x] service 层负责写入规则：创建上下文、初始化表单实例、写入字段事件、更新当前值、记录证据溯源

目标结构：

```text
app/repositories/patient_repository.py
app/repositories/document_repository.py
app/repositories/schema_template_repository.py
app/repositories/data_context_repository.py
app/repositories/field_value_repository.py
app/repositories/extraction_job_repository.py
app/repositories/research_project_repository.py

app/services/patient_service.py
app/services/document_service.py
app/services/schema_service.py
app/services/structured_value_service.py
app/services/extraction_service.py
app/services/ehr_service.py
app/services/research_project_service.py
```

验证方法：

```bash
pytest tests/services
python -m compileall app core -q
python -m alembic upgrade head
```

验证结果（2026-04-27）：

- [x] `app.repositories`、`app.services` 可正常导入。
- [x] `tests/services/test_service_layer.py` 通过，覆盖默认 EHR 表单实例初始化、候选值选为当前值、AI 抽取事件与证据写入。
- [x] `python -m compileall app core -q` 通过。
- [x] `python -m alembic upgrade head` 重复执行成功。
- [x] 修复 `core.repository.enum` 在 Pydantic v2 下的导入问题。
- [x] 修复 `BaseRepo.get_by_id()` / `save()` 的异步调用问题，并支持字符串 / UUID ID。

验收标准：

- [x] service 测试可以不经过 HTTP 直接验证核心业务
- [x] API 层保持薄，后续业务变化主要改 service
- [x] 人工选择候选值时，会更新 `field_current_values` 并将对应 `field_value_events.review_status` 改为 `accepted`
- [x] 人工编辑字段时，会新增 `manual_edit` 事件，不删除旧值
- [x] AI 抽取字段时，会写入 `field_value_events` 和 `field_value_evidence`

## 阶段 3：后端最小业务闭环

目标：按 RESTful 风格先跑通后端最小业务闭环，不一次性实现全部后台能力。

```text
患者创建
  -> 文档上传
  -> 文档归档到患者
  -> 创建 / 读取患者 EHR 上下文
  -> 抽取任务写入候选字段值
  -> 人工确认 / 编辑当前值
  -> 创建科研项目
  -> 绑定 CRF 模板
  -> 患者入组
  -> 创建 / 读取项目 CRF 上下文
```

阶段 3 API 以资源为核心，用 HTTP method 表达操作语义。少数复杂状态转换允许使用 command endpoint，例如归档、发布、取消任务、重试任务。

### 3.1 RESTful 资源命名

| 资源 | 推荐路径 | 说明 |
|---|---|---|
| 患者 | `/api/v1/patients` | 对应 `patients` |
| 文档 | `/api/v1/documents` | 对应 `documents` |
| Schema 模板 | `/api/v1/schema-templates` | 对应 `schema_templates` |
| Schema 模板版本 | `/api/v1/schema-template-versions` | 对应 `schema_template_versions` |
| 抽取任务 | `/api/v1/extraction-jobs` | 对应 `extraction_jobs` |
| 科研项目 | `/api/v1/projects` | 对应 `research_projects` |
| 患者 EHR | `/api/v1/patients/{patient_id}/ehr` | `patient_ehr` 类型 `data_contexts` |
| 项目 CRF | `/api/v1/projects/{project_id}/patients/{project_patient_id}/crf` | `project_crf` 类型 `data_contexts` |

不建议阶段 3 直接暴露底层结构化表：

```text
/data-contexts
/record-instances
/field-value-events
/field-current-values
/field-value-evidence
```

这些表是内部存储模型。前端应通过 EHR / CRF 业务资源访问。

### 3.2 通用约定

分页参数：

```text
page=1
page_size=20
```

分页响应：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 20
}
```

错误响应：

```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "资源不存在",
  "detail": {}
}
```

状态码：

| 状态码 | 场景 |
|---:|---|
| `200` | 查询、更新、状态转换成功 |
| `201` | 创建成功 |
| `202` | 异步任务已创建 |
| `204` | 删除成功且无响应体 |
| `400` | 请求参数不合法 |
| `401` | 未认证 |
| `403` | 无权限 |
| `404` | 资源不存在 |
| `409` | 资源冲突，例如重复入组、重复编码、资源已被引用 |
| `422` | 请求体结构校验失败 |

### 3.3 删除策略

阶段 3 默认不做物理删除。删除接口使用 `DELETE` method，但服务层应转换为软删除或状态流转。

当前数据库对软删除的支持不是完全统一的：

| 资源 | 当前数据库字段 | 删除语义 |
|---|---|---|
| 患者 | `patients.deleted_at` | 设置 `deleted_at`，列表默认过滤 |
| 文档 | `documents.status`，`documents.archived_at` | 阶段 3 建议设置 `status = deleted`；如不引入新状态，则只允许未归档、未进入抽取链路的文档删除 |
| Schema 模板 | `schema_templates.status` | 设置 `status = archived` |
| Schema 模板版本 | `schema_template_versions.status` | `draft` 可删除；`published` 只能设置 `deprecated` |
| 科研项目 | `research_projects.status` | 设置 `status = archived` |
| 项目患者 | `project_patients.status`，`project_patients.withdrawn_at` | 设置 `status = withdrawn` 和 `withdrawn_at` |
| 项目模板绑定 | `project_template_bindings.status` | 设置 `status = disabled` |
| 抽取任务 | `extraction_jobs.status` | 未完成任务可 `cancelled`；已产生结果的任务不建议删除 |

如果后续希望所有资源统一使用 `deleted_at`，需要新增迁移；阶段 3 先沿用现有字段，避免扩大数据库变更。

### 3.4 患者 API

后端接口：

```text
GET     /api/v1/patients
POST    /api/v1/patients
GET     /api/v1/patients/{patient_id}
PATCH   /api/v1/patients/{patient_id}
DELETE  /api/v1/patients/{patient_id}
```

删除语义：

```text
patients.deleted_at = now()
```

服务层规则：

- [x] 创建患者时，可同时确保存在默认 EHR `data_contexts` 和非重复 `record_instances`
- [x] 患者列表默认过滤 `deleted_at is not null`
- [x] 若患者已有文档、EHR、项目入组记录，阶段 3 不级联删除
- [x] 如业务不允许删除已有业务数据的患者，返回 `409`

前端对应：

```text
frontend_new/src/api/patient.js
PatientPool
PatientDetail
```

验收标准：

- [x] 可以创建患者
- [x] 可以查询患者列表
- [x] 可以更新患者基础信息
- [x] 可以软删除患者
- [x] 前端患者池能显示真实数据

### 3.5 文档 API

后端接口：

```text
POST    /api/v1/documents
GET     /api/v1/documents
GET     /api/v1/documents/{document_id}
PATCH   /api/v1/documents/{document_id}
DELETE  /api/v1/documents/{document_id}
POST    /api/v1/documents/{document_id}/archive
POST    /api/v1/documents/{document_id}/unarchive
```

上传使用 `multipart/form-data`：

```text
file
patient_id 可选
```

删除语义：

```text
documents 表当前没有 deleted_at
阶段 3 建议 documents.status = deleted
已作为字段证据来源的文档不应物理删除
```

归档服务层规则：

- [x] 更新 `documents.patient_id`
- [x] 更新 `documents.status = archived`
- [x] 设置 `documents.archived_at`
- [x] 确保患者存在 EHR `data_contexts`
- [x] 如有必要，创建 `materialize` 或 `patient_ehr` 抽取任务

前端对应：

```text
frontend_new/src/api/document.js
DocumentUpload
FileList
PatientDetail/DocumentsTab
```

验收标准：

- [x] 文件保存到本地 `uploads/`
- [x] `documents` 表写入记录
- [x] 文件列表能查到上传记录
- [x] 文档可以归档到患者
- [x] 文档可以按状态软删除或拒绝删除
- [ ] 前端上传页面能完成一次真实上传

### 3.6 患者 EHR API

后端接口：

```text
GET    /api/v1/patients/{patient_id}/ehr
PATCH  /api/v1/patients/{patient_id}/ehr/fields/{field_path}
GET    /api/v1/patients/{patient_id}/ehr/fields/{field_path}/events
POST   /api/v1/patients/{patient_id}/ehr/fields/{field_path}/select-event
GET    /api/v1/patients/{patient_id}/ehr/fields/{field_path}/evidence
```

响应结构：

```json
{
  "context": {},
  "schema": {},
  "records": [],
  "current_values": {}
}
```

字段编辑服务层规则：

- [x] 人工编辑时新增 `field_value_events`，`event_type = manual_edit`
- [x] 更新或创建 `field_current_values`
- [x] 保留旧事件，不做物理删除
- [x] 选择候选值时更新 `field_current_values.selected_event_id`

前端对应：

```text
PatientDetail/EhrTab
PatientDetail/SchemaEhrTab
PatientDetail/AiSummaryTab
```

验收标准：

- [x] 抽取任务完成后能查询到 EHR 数据
- [x] 可以手动更新 EHR 字段
- [x] 可以查看字段候选值 / 历史
- [x] 可以查看字段证据
- [ ] 前端患者详情页能显示真实 EHR 数据

### 3.7 Schema 模板 API

后端接口：

```text
GET     /api/v1/schema-templates
POST    /api/v1/schema-templates
GET     /api/v1/schema-templates/{template_id}
DELETE  /api/v1/schema-templates/{template_id}
POST    /api/v1/schema-templates/{template_id}/versions
POST    /api/v1/schema-template-versions/{version_id}/publish
DELETE  /api/v1/schema-template-versions/{version_id}
```

删除语义：

- [x] 模板删除设置 `schema_templates.status = archived`
- [x] `draft` 版本可以删除
- [x] `published` 版本不物理删除，只能设置 `status = deprecated`
- [x] 已被 `data_contexts` 或 `project_template_bindings` 引用的版本不允许物理删除

前端对应：

```text
frontend_new/src/api/crfTemplate.js
CRFDesigner
ResearchDataset/ProjectTemplateDesigner
components/FormDesigner
```

验收标准：

- [x] 可以创建 EHR / CRF 模板
- [x] 可以创建模板版本
- [x] 可以发布模板版本
- [x] 可以按删除策略归档或废弃模板

### 3.8 抽取任务 API

后端接口：

```text
POST    /api/v1/extraction-jobs
GET     /api/v1/extraction-jobs/{job_id}
GET     /api/v1/extraction-jobs/{job_id}/runs
POST    /api/v1/extraction-jobs/{job_id}/cancel
POST    /api/v1/extraction-jobs/{job_id}/retry
DELETE  /api/v1/extraction-jobs/{job_id}
```

创建任务响应状态码使用 `202`。

第一版实现：

```text
MockExtractor
创建 job -> pending
创建 run
立即处理 -> completed
写入 extraction_runs.raw_output_json / parsed_output_json
同步写入 field_value_events / field_value_evidence / field_current_values
```

删除语义：

- [x] 阶段 3 不建议删除抽取任务
- [x] 未开始任务可转换为 `status = cancelled`
- [x] 已产生 `extraction_runs` 或字段值事件的任务返回 `409` 或仅允许取消未完成状态

前端对应：

```text
ExtractionV2
ExtractionDashboard
ParseProgress
useExtractionProgressSSE 后期再接，第一版先轮询或手动刷新
```

验收标准：

- [x] 创建任务后能查询任务状态
- [x] 任务能从 `pending` 进入 `completed`
- [x] run 有 mock 结构化结果
- [x] 对应患者的 EHR 字段值事件和当前值被写入

### 3.9 科研项目 API

后端接口：

```text
GET     /api/v1/projects
POST    /api/v1/projects
GET     /api/v1/projects/{project_id}
PATCH   /api/v1/projects/{project_id}
DELETE  /api/v1/projects/{project_id}
POST    /api/v1/projects/{project_id}/template-bindings
DELETE  /api/v1/projects/{project_id}/template-bindings/{binding_id}
GET     /api/v1/projects/{project_id}/patients
POST    /api/v1/projects/{project_id}/patients
DELETE  /api/v1/projects/{project_id}/patients/{project_patient_id}
```

删除语义：

- [x] 项目删除设置 `research_projects.status = archived`
- [x] 项目模板绑定删除设置 `project_template_bindings.status = disabled`
- [x] 项目患者删除设置 `project_patients.status = withdrawn` 和 `withdrawn_at = now()`
- [x] 不删除已产生的 CRF `data_contexts` 和字段值历史

患者入组服务层规则：

- [x] 创建 `project_patients`
- [x] 查找项目 active `primary_crf` 模板绑定
- [x] 创建 `project_crf` 类型 `data_contexts`
- [x] 初始化非重复 `record_instances`

前端对应：

```text
frontend_new/src/api/project.js
ResearchDataset
ProjectDatasetView
ProjectPatientDetail
```

验收标准：

- [x] 可以创建科研项目
- [x] 可以绑定 CRF 模板版本
- [x] 可以将患者入组到项目
- [x] 入组后能创建项目 CRF 上下文
- [x] 可以按状态归档项目、禁用模板绑定、移除项目患者

### 3.10 项目 CRF API

后端接口：

```text
GET    /api/v1/projects/{project_id}/patients/{project_patient_id}/crf
PATCH  /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}
GET    /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/events
POST   /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/select-event
GET    /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/evidence
```

响应结构与患者 EHR 一致：

```json
{
  "context": {},
  "schema": {},
  "records": [],
  "current_values": {}
}
```

验收标准：

- [x] 项目患者可以打开 CRF 数据页
- [x] 可以查看 CRF 当前值
- [x] 可以编辑 CRF 字段
- [x] 可以查看 CRF 字段候选值 / 历史
- [x] 可以查看 CRF 字段证据

### 3.11 阶段 3 暂不实现

以下接口不进入阶段 3 最小闭环：

```text
后台统计看板
复杂批量删除
患者合并
文件分组
复杂冲突解决
CRF 导出
项目成员管理
完整任务日志检索
LLM 调用日志
高级权限和角色
```

这些能力可以在闭环稳定后进入后续阶段。

### 3.12 当前代码差异

当前后端已经有以下 router 占位：

```text
/api/v1/patients
/api/v1/documents
/api/v1/ehr
/api/v1/schema-templates
/api/v1/schema-template-versions
/api/v1/extraction-jobs
/api/v1/projects
/api/v1/admin
/api/v1/auth
```

阶段 3 实现时建议调整：

- [ ] 保留 `/patients`、`/documents`、`/auth`
- [x] 将 `/templates` 调整为 `/schema-templates`
- [x] 将 `/extraction` 调整为 `/extraction-jobs`
- [x] 将 `/research` 调整为 `/projects`
- [x] EHR 和 CRF 优先作为患者 / 项目的嵌套资源实现
- [ ] 如需兼容前端旧调用，在前端 API 层做适配，不建议后端长期维护两套路径

## 阶段 4：前后端同步接入规则

每个新需求都按下面模板推进。

### 需求开发模板

```text
需求名称：
业务目标：
后端接口：
后端数据表/字段：
后端 service：
前端页面：
前端 API 文件：
状态管理：
验证命令：
前端验证路径：
验收标准：
```

### 同步开发流程

1. 先写接口契约
   - URL
   - method
   - request schema
   - response schema
   - 错误码

2. 后端实现 service 与接口
   - repository 只处理数据读写
   - service 处理业务规则
   - router 保持薄

3. 后端测试
   - service 单测
   - API 集成测试
   - curl 手动验证

4. 前端接入
   - 修改 `src/api/*.js`
   - 页面仍保留 loading / error / empty 状态
   - 不一次性替换所有 mock，只替换当前需求相关接口

5. 前端验证
   - 页面路径验证
   - 浏览器控制台无错误
   - 刷新后数据仍存在

6. 记录结果
   - 在本计划中勾选任务
   - 如有接口变更，更新后端/前端开发文档

## 阶段 5：第一批前端真实接入

实施路径：[[EACY开发计划 5.1 第一批前端真实接入实施路径]]

优先替换这些 mock API：

```text
src/api/request.js
src/api/auth.js
src/api/patient.js
src/api/document.js
```

暂缓替换：

```text
src/api/project.js
src/api/crfTemplate.js
src/api/stats.js
src/api/admin.js
src/api/websocket.js
```

验证方法：

```bash
npm run dev
```

前端页面验证顺序：

```text
/patient/pool
/document/upload
/document/file-list
/patient/detail/:patientId
```

验收标准：

- [x] 患者池读取真实后端
- [ ] 文档上传调用真实后端
- [ ] 文件列表读取真实后端
- [ ] 患者详情读取真实 EHR
- [ ] mock 与真实 API 可以阶段性共存

## 阶段 6：扩展业务模块

在最小闭环稳定后，再逐步扩展。

### 6.1 CRF 模板

任务：

- [ ] 模板列表
- [ ] 模板详情
- [ ] 模板保存
- [ ] 模板发布状态

验证：

- [ ] `CRFDesigner` 能保存模板
- [ ] 刷新页面后模板仍存在

### 6.2 科研项目

任务：

- [ ] 项目列表
- [ ] 创建项目
- [ ] 项目患者入组
- [ ] 项目 CRF 数据视图

验证：

- [ ] `ResearchDataset` 能读取真实项目
- [ ] 患者可以加入项目
- [ ] 项目患者列表能稳定显示

### 6.3 真实抽取能力

实施路径：[[EACY开发计划 6.3 Celery 后台任务实施路径]]

目标：先把 Celery 后台任务基础框架搭好，再按 `ocr -> metadata -> extraction` 三条队列逐步开发和验收。当前阶段暂不实现 `maintenance` worker、Celery Beat、自动补偿扫描、批量导出 worker。

#### 6.3.1 Worker 架构

第一阶段只保留三个业务 worker queue：

```text
ocr
  负责文档 OCR、PDF/图片解析、版面结构识别。

metadata
  负责 OCR 后的文档元数据提取，例如文档类型、文档日期、患者姓名、患者编号、住院号、科室、就诊时间等。

extraction
  负责患者 EHR / 项目 CRF 字段抽取、LLM 调用、结构化结果解析、字段候选值与证据落库。
```

推荐目录：

```text
backend/app/workers/
├── __init__.py
├── celery_app.py
├── ocr_tasks.py
├── metadata_tasks.py
└── extraction_tasks.py
```

推荐任务入口：

```text
process_document_ocr(document_id)
extract_document_metadata(document_id)
process_extraction_job(job_id)
```

推荐流水线：

```text
用户上传文档
  -> documents.ocr_status = pending
  -> process_document_ocr(document_id)
  -> documents.ocr_status = completed
  -> documents.meta_status = pending
  -> extract_document_metadata(document_id)
  -> documents.meta_status = completed
  -> 如需要结构化字段抽取，创建 extraction_jobs
  -> process_extraction_job(job_id)
  -> 写入 extraction_runs / field_value_events / field_value_evidence / field_current_values
```

状态字段约定：

```text
documents.ocr_status:
  pending / queued / running / completed / failed

documents.meta_status:
  pending / queued / running / completed / failed

extraction_jobs.status:
  pending / queued / running / completed / failed / cancelled
```

#### 6.3.2 基础框架任务

任务：

- [ ] 新建 `backend/app/workers/celery_app.py`
- [ ] Celery app 从 `core.config.config` 读取 `CELERY_BROKER_URL` / `CELERY_BACKEND_URL`
- [ ] 第一阶段统一使用 Redis broker/backend，不引入 RabbitMQ
- [ ] 配置 task include：`ocr_tasks`、`metadata_tasks`、`extraction_tasks`
- [ ] 配置 task routes：`ocr`、`metadata`、`extraction`
- [ ] 增加 worker 启动命令到后端 README 或本计划
- [ ] 增加测试配置，支持 Celery eager mode

启动命令：

```bash
cd backend
celery -A app.workers.celery_app.celery_app worker -Q ocr --loglevel=info
celery -A app.workers.celery_app.celery_app worker -Q metadata --loglevel=info
celery -A app.workers.celery_app.celery_app worker -Q extraction --loglevel=info
```

验收：

- [ ] `python -m compileall app core -q` 通过
- [ ] Celery worker 可以启动并发现三个 task 模块
- [ ] Redis 连接可用
- [ ] 测试环境可以用 eager mode 同步执行 task

#### 6.3.3 OCR Worker



任务：

- [ ] 新建 `backend/app/workers/ocr_tasks.py`
- [ ] 实现 `process_document_ocr(document_id)`
- [ ] OCR 开始时写 `documents.ocr_status = running`
- [ ] OCR 成功时写 `documents.ocr_text`、`documents.ocr_payload_json`、`documents.ocr_status = completed`
- [ ] OCR 失败时写 `documents.ocr_status = failed`，并保留错误信息
- [ ] OCR 成功后触发 `extract_document_metadata.delay(document_id)`

第一版 adapter：

- [ ] 先实现 mock/local adapter，保证流程闭环
- [ ] 真实 OCR adapter 后续通过配置切换

验收：

- [ ] 上传文档后可手动触发 OCR task
- [ ] 文档状态从 `pending/queued` 进入 `running/completed`
- [ ] `documents.ocr_text` 有结果
- [ ] `documents.ocr_payload_json` 有可追溯的页/块/表格结构占位
- [ ] OCR 失败能落 `failed` 状态

#### 6.3.3.1 真实文档上传 + OCR 链路实施计划

目标：用户在前端上传文档后，后端保存文件、写入 `documents` 记录、自动投递 OCR 任务；前端通过文档详情或列表查询 OCR 状态。当前阶段只完成上传与 OCR，不把 metadata 和 EHR/CRF extraction 混进同一个验收项。

链路总览：

```text
前端上传文件
  -> POST /api/v1/documents
  -> 鉴权 / current_user
  -> DocumentService.upload_document
  -> 本地 storage 保存原始文件
  -> documents 写入 uploaded/archived + ocr_status=queued
  -> ocr queue 投递 process_document_ocr(document_id)
  -> OCR worker 读取 document
  -> 解析本地文件路径或文件访问地址
  -> 调用 OCR integration
  -> 写 documents.ocr_text / ocr_payload_json / ocr_status
  -> 前端轮询 GET /api/v1/documents/{document_id} 或 GET /api/v1/documents
```

涉及代码模块：

| 模块 | 责任 |
|---|---|
| `frontend_new/src/api/document.js` | 上传文件、查询文档列表/详情、规范化 `ocr_status` 给页面使用 |
| `backend/app/api/v1/documents/router.py` | `POST /documents` 接收 multipart 上传，注入 `current_user`，返回文档记录 |
| `backend/app/core/auth.py` | 开发期 `ENABLE_AUTH=false` 注入 `dev_admin`；正式期校验用户身份 |
| `backend/app/services/document_service.py` | 保存文件、计算 hash、写 `documents`、决定是否投递 OCR task |
| `backend/app/repositories/document_repository.py` | 读取/更新 `documents` 记录 |
| `backend/app/models/document.py` | 存储 `storage_path`、`file_url`、`ocr_status`、`ocr_text`、`ocr_payload_json` |
| `backend/app/storage/` | 封装本地文件读取；后续扩展 OSS 时不影响 OCR worker |
| `backend/app/workers/ocr_tasks.py` | Celery 任务入口 `process_document_ocr(document_id)` |
| `backend/app/integrations/` | OCR adapter；第一版可用 mock/local adapter，后续替换真实 OCR 服务 |
| `backend/app/workers/metadata_tasks.py` | OCR 成功后下一步触发 metadata；当前验收只确认可触发，不强制实现 metadata |

上传 API 行为：

- `POST /api/v1/documents` 使用 `multipart/form-data`。
- 入参包括 `file`，可选 `patient_id`。
- 如果带 `patient_id`，后端先校验患者存在；不存在返回 `404`。
- 上传成功后，文件写入本地 `uploads/YYYY/MM/`。
- `documents.storage_provider = local`，`documents.storage_path` 保存后端可读取的文件路径。
- `documents.file_url` 第一阶段可为空；OCR worker 优先使用 `storage_path` 读取文件。
- `documents.status`：
  - 未指定患者：`uploaded`
  - 指定患者：`archived`
- `documents.ocr_status` 上传后应从 `pending` 调整为 `queued`，表示已经准备投递或已投递 OCR。

OCR 入队策略：

- 第一阶段建议上传成功后自动投递 OCR，不要求前端单独点“解析”。
- 入队动作发生在 `DocumentService.upload_document` 完成文档记录创建之后。
- 入队目标：`process_document_ocr(document_id)`。
- 如果 Celery 投递成功，保持 `ocr_status = queued`。
- 如果 Celery 投递失败，文档记录仍保留，但 `ocr_status = failed` 或 `ocr_status = pending` 二选一：
  - 推荐第一版用 `failed`，并记录错误信息，便于前端明确展示失败。
  - 后续如果实现 `maintenance` worker，再改为 pending 补偿扫描。

OCR worker 行为：

- worker 收到 `document_id` 后读取 `documents`。
- 文档不存在或已删除：任务结束，记录为不可处理错误。
- 文档没有 `storage_path` 且没有可访问 `file_url`：`ocr_status = failed`。
- 开始处理前写 `ocr_status = running`。
- 获取文件来源：
  - 本地存储：读取 `documents.storage_path`。
  - 未来 OSS：通过 `storage_provider + storage_path/file_url` 生成临时访问地址。
- 调用 OCR adapter：
  - 第一版 adapter 可以是 mock/local，占位返回 `ocr_text` 和基础 `ocr_payload_json`。
  - 真实 adapter 后续放在 `backend/app/integrations/ocr_*`。
- 成功后写：
  - `documents.ocr_status = completed`
  - `documents.ocr_text`
  - `documents.ocr_payload_json`
  - `documents.updated_at`
- 失败后写：
  - `documents.ocr_status = failed`
  - 错误原因进入可追踪字段；若当前表无专用错误字段，先放入 `ocr_payload_json.error`

OCR 状态约定：

```text
pending   已创建记录，但尚未投递 OCR
queued    已投递 OCR 队列
running   OCR worker 正在处理
completed OCR 成功，ocr_text / ocr_payload_json 已写入
failed    OCR 失败，错误原因已记录
```

异常处理：

| 场景 | 后端行为 | 前端展示 |
|---|---|---|
| 文件为空或上传体非法 | `POST /documents` 返回 `422/400` | 上传失败 |
| `patient_id` 不存在 | `POST /documents` 返回 `404` | 提示患者不存在 |
| 文件保存失败 | `POST /documents` 返回 `500`，不创建或回滚 document | 上传失败 |
| document 已创建但 OCR 入队失败 | 返回上传成功文档，`ocr_status=failed` 或 `pending` | 文件存在，解析失败/待解析 |
| worker 找不到文件 | `ocr_status=failed`，记录错误原因 | 解析失败 |
| OCR 服务超时/失败 | `ocr_status=failed`，保留错误原因 | 解析失败，可后续重试 |
| OCR 返回空文本 | `ocr_status=completed` 或 `failed` 按 adapter 规则判断；推荐空文件为 `failed` | 解析无结果 |

前端接入：

- 上传页继续调用 `frontend_new/src/api/document.js` 的 `uploadDocument()`。
- 上传成功后页面拿到 `document_id`。
- OCR 进度第一版通过轮询文档详情或文档列表获取，不引入 SSE/WebSocket。
- 页面判断 `ocr_status`：
  - `queued/running`：显示解析中
  - `completed`：显示解析完成
  - `failed`：显示解析失败
- `getDocumentTempUrl()` 当前仍是空实现；OCR 链路不依赖前端获取临时 URL。

验收顺序：

1. 上传一个 txt/jpg/pdf 文件，`POST /api/v1/documents` 返回 `201` 和 `document_id`。
2. 数据库 `documents` 有记录，`storage_path` 指向真实文件。
3. 上传后 `ocr_status` 进入 `queued`。
4. 启动 `ocr` worker 后，状态进入 `running`，最终进入 `completed` 或 `failed`。
5. 成功场景下 `ocr_text` 非空，`ocr_payload_json` 有基础结构。
6. 前端文件列表或详情页能看到 OCR 状态变化。
7. 关闭 worker 后上传文件，文档仍能保存；OCR 状态不应误报 completed。

Todo list：

后端上传链路：

- [ ] 确认 `POST /api/v1/documents` 已注入 `current_user`
- [ ] 确认 `ENABLE_AUTH=false` 时上传接口可使用 `dev_admin`
- [ ] 校验上传文件为空时返回明确错误
- [ ] 校验带 `patient_id` 上传时患者不存在返回 `404`
- [ ] 确认文件保存到 `uploads/YYYY/MM/`
- [ ] 确认 `storage_provider = local`
- [ ] 确认 `storage_path` 为后端 worker 可读取路径
- [ ] 确认 `file_hash`、`file_size`、`mime_type`、`file_ext` 正确写入
- [ ] 未带 `patient_id` 时 `documents.status = uploaded`
- [ ] 带 `patient_id` 时 `documents.status = archived`
- [ ] 上传成功后 `documents.ocr_status = queued`

OCR 入队：

- [ ] 在文档记录创建成功后投递 `process_document_ocr(document_id)`
- [ ] 投递到 `ocr` queue
- [ ] Celery broker 使用 Redis
- [ ] Celery 投递成功时保留 `ocr_status = queued`
- [ ] Celery 投递失败时不丢失已上传文件
- [ ] Celery 投递失败时文档状态可被前端识别为解析失败或待解析
- [ ] 上传接口返回体包含 `id`、`status`、`ocr_status`、`storage_path`、`created_at`

OCR worker：

- [ ] `ocr` worker 可通过 README 命令启动
- [ ] `process_document_ocr(document_id)` 能读取 document
- [ ] document 不存在时任务可正常结束并记录原因
- [ ] document 已删除时不继续 OCR
- [ ] document 缺少可读文件路径时写 `ocr_status = failed`
- [ ] worker 开始处理时写 `ocr_status = running`
- [ ] worker 能从 `storage_path` 读取本地文件
- [ ] OCR adapter 调用入口放在 `backend/app/integrations/`
- [ ] 第一版 mock/local OCR adapter 能返回可验证文本
- [ ] 成功后写 `ocr_status = completed`
- [ ] 成功后写 `ocr_text`
- [ ] 成功后写 `ocr_payload_json`
- [ ] 成功后更新 `updated_at`
- [ ] 失败后写 `ocr_status = failed`
- [ ] 失败后记录错误原因到可追踪字段

前端接入：

- [ ] `frontend_new/src/api/document.js` 能保留并透传 `ocr_status`
- [ ] 上传成功后页面拿到 `document_id`
- [ ] 文件列表能展示 `queued/running/completed/failed`
- [ ] 文档详情能展示 `ocr_status`
- [ ] 轮询逻辑使用 `GET /api/v1/documents/{document_id}` 或列表刷新
- [ ] `queued/running` 显示解析中
- [ ] `completed` 显示解析完成
- [ ] `failed` 显示解析失败
- [ ] 前端不依赖 `getDocumentTempUrl()` 完成 OCR 链路

异常验收：

- [ ] 空文件上传失败
- [ ] 非法 multipart 请求失败
- [ ] 患者不存在时上传失败
- [ ] 文件保存失败时不产生脏 document
- [ ] worker 找不到文件时 `ocr_status = failed`
- [ ] OCR adapter 超时时 `ocr_status = failed`
- [ ] OCR adapter 抛异常时 `ocr_status = failed`
- [ ] OCR 返回空结果时按约定处理为 failed 或 completed-with-empty
- [ ] worker 关闭时上传仍成功，但不会误报 `completed`

集成验收：

- [ ] 上传 txt 文件后 OCR 完成并写入 `ocr_text`
- [ ] 上传图片文件后 OCR 完成或明确失败
- [ ] 上传 PDF 文件后 OCR 完成或明确失败
- [ ] 文档列表刷新后状态与数据库一致
- [ ] 文档详情刷新后状态与数据库一致
- [ ] 后端 `python -m compileall app core -q` 通过
- [ ] 后端 OCR 相关测试通过
- [ ] 手动启动 `ocr` worker 后能消费新上传文档
- [ ] 不启动 `metadata` / `extraction` worker 时 OCR 链路仍可独立验收

#### 6.3.4 Metadata Worker

设计子页：[[EACY开发计划 6.3.4 Metadata Worker - Agent Prompt 与入库设计]]

任务：

- [ ] 新建 `backend/app/workers/metadata_tasks.py`
- [ ] 实现 `extract_document_metadata(document_id)`
- [ ] metadata 开始时写 `documents.meta_status = running`
- [ ] 从 `documents.ocr_text` / `documents.ocr_payload_json` 提取文档元数据
- [ ] 成功时写 `documents.metadata_json`、`documents.doc_type`、`documents.meta_status = completed`
- [ ] 失败时写 `documents.meta_status = failed`，并保留错误信息

建议 metadata 输出：

```json
{
  "doc_type": "discharge_summary",
  "document_date": "2026-04-28",
  "patient_name": "",
  "patient_identifier": "",
  "visit_no": "",
  "department": "",
  "confidence": 0.0,
  "source": "mock"
}
```

验收：

- [ ] OCR completed 后能自动触发 metadata task
- [ ] `documents.meta_status` 可以从 `pending/queued` 进入 `running/completed`
- [ ] `documents.metadata_json` 有结构化结果
- [ ] `documents.doc_type` 可由 metadata 同步得到
- [ ] metadata 失败不影响已完成的 OCR 结果

#### 6.3.5 Extraction Worker

任务：

- [ ] 新建 `backend/app/workers/extraction_tasks.py`
- [ ] 实现 `process_extraction_job(job_id)`
- [ ] 修改 `POST /api/v1/extraction-jobs`：只创建 job 并入队，不在 HTTP 请求内同步处理
- [ ] 将 `ExtractionService.create_and_process_job()` 拆为 `create_job()` 与 worker 内部使用的 `process_job(job_id)`
- [ ] worker 开始时写 `extraction_jobs.status = running`
- [ ] 创建 `extraction_runs`
- [ ] 调用 mock/真实 LLM extraction adapter
- [ ] 写 `extraction_runs.raw_output_json` / `parsed_output_json`
- [ ] 写 `field_value_events` / `field_value_evidence` / `field_current_values`
- [ ] 成功时写 `extraction_jobs.status = completed`、`progress = 100`
- [ ] 失败时写 `extraction_jobs.status = failed`、`error_message`

验收：

- [ ] `POST /api/v1/extraction-jobs` 返回 `202` 时任务尚未同步完成
- [ ] 启动 extraction worker 后 job 可从 `pending/queued` 进入 `running/completed`
- [ ] `GET /api/v1/extraction-jobs/{job_id}` 能查到最新状态
- [ ] `GET /api/v1/extraction-jobs/{job_id}/runs` 能查到 run
- [ ] 抽取结果能写入 EHR / CRF 字段候选值和证据
- [ ] 失败任务能记录 `job.error_message` 和 `run.error_message`

#### 6.3.6 暂不实现

以下能力后置，不进入当前三 worker 基础框架：

- [ ] `maintenance` worker
- [ ] pending job 定时扫描
- [ ] running 超时自动修复
- [ ] Celery Beat
- [ ] 自动重试编排
- [ ] 批量导出 worker
- [ ] SSE/WebSocket 实时进度推送

### 6.4 权限收紧

任务：

- [ ] `ENABLE_AUTH=true`
- [ ] 登录接口
- [ ] access token / refresh token
- [ ] 角色权限
- [ ] 项目级数据权限

验证：

- [ ] 无 token 访问受保护接口返回 401
- [ ] 权限不足返回 403
- [ ] admin 可以访问管理接口
- [ ] 普通用户不能访问管理接口

## 暂不实现清单

为了最快跑通最小流程，以下内容后置：

- [ ] 微信登录
- [ ] 邮箱/短信验证码
- [ ] 复杂 RBAC 后台
- [ ] 多租户
- [ ] OSS 文件存储
- [ ] WebSocket/SSE 实时进度
- [ ] 向量检索
- [ ] reranker
- [ ] 完整审计日志
- [ ] CRF 复杂版本对比
- [ ] 数据导出权限审批

## 当前优先级

1. 后端裁剪成 `backend/`
2. 跑通 `/api/v1/health`
3. 跑通开发期宽松鉴权
4. 跑通患者 CRUD
5. 跑通文档上传
6. 跑通 mock 抽取任务
7. 跑通患者 EHR 查询
8. 前端逐步替换相关 mock API

## 每日开发检查表

- [ ] 今天新增或修改的接口是否有 curl 验证？
- [ ] 今天新增或修改的 service 是否有测试？
- [ ] 前端页面是否验证 loading / empty / error / success？
- [ ] 数据刷新后是否仍然存在？
- [ ] 是否更新了相关 Obsidian 文档？
- [ ] 是否避免把后期能力提前复杂化？

## 2026-04-28 文档上传真实 OSS 接入记录

本次把文档上传存储从固定本地落盘改为可配置 storage backend：

- `DOCUMENT_STORAGE_PROVIDER=local`：默认行为，继续写入本地 `uploads/YYYY/MM/`。
- `DOCUMENT_STORAGE_PROVIDER=oss`：通过阿里云 OSS `PUT Object` 写入 `OSS_BUCKET_NAME`，object key 前缀由 `OSS_BASE_PREFIX` 控制，默认 `documents`。
- 上传成功后 `documents.storage_provider` 记录 `local` 或 `oss`，`documents.storage_path` 记录本地路径或 OSS object key，`documents.file_url` 在 OSS 模式下记录可定位 URL。

验收标准：

- [x] 配置层读取 `DOCUMENT_STORAGE_PROVIDER`、`LOCAL_UPLOAD_ROOT`、`OSS_*`。
- [x] 后端新增 storage adapter，上传服务不直接依赖本地路径。
- [x] OSS 模式不把密钥写死在代码里。
- [x] 后端测试验证 OSS metadata 写入契约。
- [x] `python -m pytest tests/app/test_document_api.py tests/services/test_document_service_storage.py` 通过。
- [x] `python -m compileall app core -q` 通过。
- [x] 已完成 storage backend 真实 OSS 上传，确认 bucket object 创建成功。
- [ ] 联调环境继续通过 `/api/v1/documents` 验收数据库 `documents` 记录一致。

### 真实 OSS 验收补充（2026-04-28）

- [x] 已在后端环境临时设置 `DOCUMENT_STORAGE_PROVIDER=oss` 并执行真实上传。
- [x] OSS object key：`documents/2026/04/de13add2-f7b3-4d12-8a84-d4fc1a7b93b0.txt`。
- [x] 后端 storage backend 返回 `provider=oss`、`url`、`size`、`sha256`。
