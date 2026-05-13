---
type: api
module: 接口
status: draft
audience: [integrator, tech-lead]
code_path:
  - backend/app/api/v1/templates/router.py
  - backend/app/services/schema_service.py
api_endpoints:
  - GET /api/v1/schema-templates
  - POST /api/v1/schema-templates
  - GET /api/v1/schema-templates/{template_id}
  - PATCH /api/v1/schema-templates/{template_id}
  - DELETE /api/v1/schema-templates/{template_id}
  - POST /api/v1/schema-templates/{template_id}/versions
  - POST /api/v1/schema-template-versions/{version_id}/publish
  - DELETE /api/v1/schema-template-versions/{version_id}
related_tables: [schema_template, schema_template_version, project_template_binding]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# Templates（Schema 模板与版本）

> [!info] 参数表见 [[OpenAPI访问|OpenAPI]]
> 注意 `tags=["schema-templates"]` 但路由**没有公共前缀**——`/schema-templates` 与 `/schema-template-versions` 分两套挂载。

## 业务用途

承载 EHR / CRF 的**字段口径定义**。模板（`schema_template`）是逻辑容器，真正"字段树 JSON" 存在版本（`schema_template_version.schema_json`）里。绑定到科研项目的是**具体版本**，老数据不破。

## 主要场景与对应端点

### 模板生命周期

- `GET /api/v1/schema-templates` — 列表，可按 `template_type` / `status` 过滤
- `POST /api/v1/schema-templates` — 新建模板（未含版本，状态默认 `active`）
- `GET /api/v1/schema-templates/{id}` — 详情，**附带所有版本列表**
- `PATCH /api/v1/schema-templates/{id}` — 改名 / 改描述 / 改状态（不改 schema_json）
- `DELETE /api/v1/schema-templates/{id}` — 归档（软处理，仍返回 `SchemaTemplateResponse`，**非 204**）

### 版本生命周期

- `POST /api/v1/schema-templates/{template_id}/versions` — 在模板下新建一个版本（含完整 `schema_json`，状态默认 `draft`）
- `POST /api/v1/schema-template-versions/{version_id}/publish` — 发布版本（draft → published，写 `published_at`）
- `DELETE /api/v1/schema-template-versions/{version_id}` — 删除版本（仅 draft 可删；已发布且被绑定的不可删）

## 关键字段语义

| 字段 | 业务含义 | 备注 |
|---|---|---|
| `template_code` | 业务编码 | 全局唯一；不传由后端生成 |
| `template_type` | 模板类型 | 典型值 `patient_ehr`、`project_crf`，决定可绑定的 context 类型 |
| `status`（模板） | `active` / `archived` | `archived` 后不再可绑定 |
| `version_no` | 版本号，**业务侧严格递增** | 由调用方传入（不是 auto-increment） |
| `schema_json` | 字段树 JSON | 通过 `Field(alias="schema_json")`，请求体键名必须是 `schema_json` |
| `status`（版本） | `draft` / `published` / `archived` | 已发布版本不能改 `schema_json` |
| `published_at` | 发布时间戳 | 由 `publish` 端点写入 |

## 典型样例

> [!example] 创建一个版本
> ```http
> POST /api/v1/schema-templates/{template_id}/versions
> {
>   "version_no": 2,
>   "version_name": "2024 版",
>   "schema_json": { "groups": [...], "forms": [...] },
>   "status": "draft"
> }
> ```

> [!example] 发布版本
> ```http
> POST /api/v1/schema-template-versions/{version_id}/publish
> ```
> 发布后该版本即可被绑定到项目（见 [[业务API说明/Research|Research]] 的 `template-bindings`）。

## 副作用

- 新建模板 / 版本：写表，无异步任务。
- `publish`：写 `published_at`，状态置为 `published`。
- 归档模板：把 `status` 置为 `archived`，**不级联归档版本**（版本可独立存活；不允许新绑定但不影响老绑定）。

## 错误码业务含义

| 场景 | HTTP | 业务原因 |
|---|---|---|
| 模板 / 版本不存在 | 404 | `SchemaNotFoundError` |
| `version_no` 重复 | 409 | `SchemaConflictError` |
| 已发布版本再编辑 schema | 409 | 同上 |
| 已被绑定的版本被删 | 409 | 同上 |
| `template_code` 冲突 | 409 | 同上 |

## 关联

- [[表-schema_template]]、[[表-schema_template_version]]、[[表-project_template_binding]]
- [[业务流程-模板设计与发布]]
- [[业务流程-模板使用（绑定到项目）]]
- [[关键设计-Schema结构]]
- [[关键设计-模板版本化]]
