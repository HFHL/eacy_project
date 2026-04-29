---
title: EACY 后端接口文档
tags:
  - EACY
  - backend
  - api
aliases:
  - EACY API 文档
---

# EACY 后端接口文档

本文档基于当前 `backend` 代码编写，覆盖 FastAPI 应用架构、通用接口约定，以及各业务模块接口。接口细节拆分到子页面维护。

## 文档目录

- [[EACY 后端接口文档 - 通用约定]]
- [[EACY 后端接口文档 - Auth 与基础状态]]
- [[EACY 后端接口文档 - Patients 与 EHR]]
- [[EACY 后端接口文档 - Documents]]
- [[EACY 后端接口文档 - Extraction Jobs]]
- [[EACY 后端接口文档 - Schema Templates]]
- [[EACY 后端接口文档 - Projects 与 CRF]]

## 当前后端架构

### 应用入口

- 后端项目目录：`backend/`
- FastAPI 应用入口：`backend/app/server.py`
- 本地启动入口：`backend/main.py`
- API 聚合入口：`backend/app/api/v1/__init__.py`
- 统一 API 前缀：`/api/v1`
- OpenAPI 文档地址：非生产环境启用 `/docs` 与 `/redoc`；生产环境关闭。

### 分层结构

当前后端采用清晰的分层结构：

| 层级 | 目录 | 职责 |
|---|---|---|
| API 层 | `app/api/v1/*/router.py` | 定义 HTTP 路由、请求模型、响应模型、状态码、依赖注入、错误转换 |
| Service 层 | `app/services/` | 承载业务流程，例如患者、文档、EHR、CRF、抽取任务、模板管理 |
| Repository 层 | `app/repositories/` | 封装数据库查询与持久化操作 |
| Model 层 | `app/models/` | SQLAlchemy ORM 模型，对应 EACY 业务表 |
| Core 层 | `core/` | 配置、数据库会话、中间件、异常、缓存、通用仓储基类 |
| Worker 层 | `app/workers/` | Celery 后台任务框架，按 OCR、metadata、extraction 队列拆分 |
| Storage 层 | `app/storage/` | 文档文件存储抽象，目前支持本地存储配置 |

### 路由组织

`app/api/v1/__init__.py` 创建带 `/api/v1` 前缀的聚合路由，并注册以下模块：

| 模块               | 前缀                                                            | 子页面                                |
| ---------------- | ------------------------------------------------------------- | ---------------------------------- |
| 健康检查             | `/api/v1/health`                                              | [[EACY 后端接口文档 - Auth 与基础状态]]       |
| Auth             | `/api/v1/auth`                                                | [[EACY 后端接口文档 - Auth 与基础状态]]       |
| Admin            | `/api/v1/admin`                                               | [[EACY 后端接口文档 - Auth 与基础状态]]       |
| EHR 状态           | `/api/v1/ehr`                                                 | [[EACY 后端接口文档 - Auth 与基础状态]]       |
| Patients         | `/api/v1/patients`                                            | [[EACY 后端接口文档 - Patients 与 EHR]]   |
| Documents        | `/api/v1/documents`                                           | [[EACY 后端接口文档 - Documents]]        |
| Extraction Jobs  | `/api/v1/extraction-jobs`                                     | [[EACY 后端接口文档 - Extraction Jobs]]  |
| Schema Templates | `/api/v1/schema-templates`、`/api/v1/schema-template-versions` | [[EACY 后端接口文档 - Schema Templates]] |
| Projects / CRF   | `/api/v1/projects`                                            | [[EACY 后端接口文档 - Projects 与 CRF]]   |
|                  |                                                               |                                    |
|                  |                                                               |                                    |
|                  |                                                               |                                    |

### 中间件与横切能力

当前应用注册的中间件顺序包括：

| 能力 | 说明 |
|---|---|
| CORS | 当前允许任意来源、方法、请求头，并允许 credentials |
| AuthenticationMiddleware | 解析 Bearer JWT，供 Starlette request user 使用 |
| SQLAlchemyMiddleware | 每个请求创建独立 session context，请求结束后移除 session |
| ResponseLogMiddleware | 响应日志中间件 |
| Logging 依赖 | FastAPI 全局依赖，用于请求日志上下文 |

### 认证与用户上下文

业务接口通过 `get_current_user` 获取当前用户：

- 当 `ENABLE_AUTH=false` 时，所有依赖当前用户的接口使用开发期默认用户 `dev_admin`。
- 当 `ENABLE_AUTH=true` 时，请求必须携带 `Authorization: Bearer <JWT>`。
- JWT 中用户标识优先读取 `user_id`，其次读取 `sub`。
- 用户名优先读取 `username`，其次读取 `name`，最后回退为用户标识。
- 权限字段读取 `permissions`，包含 `*` 时视为管理员权限。

### 数据库与事务

数据库访问基于 SQLAlchemy async：

- `core/db/session.py` 创建 writer 与 reader 两类 engine。
- 写入、更新、删除以及 flush 中的操作走 writer。
- 普通查询默认走 reader。
- session 使用 `async_scoped_session`，按请求级 `session_context` 隔离。
- Service 层中需要事务的操作通过 `Transactional` 装饰器提交或回滚。

### 缓存与后台任务

- 缓存通过 `Cache.init` 接入 Redis backend。
- Celery 应用定义在 `app/workers/celery_app.py`。
- 当前后台队列包括 `ocr`、`metadata`、`extraction`。
- 当前任务名包括文档 OCR、文档元数据抽取、抽取任务处理。

### 主要业务数据模型

当前 ORM 模型包括：

| 模型 | 业务含义 |
|---|---|
| `Patient` | 患者基础信息 |
| `Document` | 上传文档、OCR 与元数据状态 |
| `ResearchProject` | 研究项目 |
| `ProjectPatient` | 项目内入组患者 |
| `SchemaTemplate` | 表单/字段模板 |
| `SchemaTemplateVersion` | 模板版本与 schema_json |
| `ProjectTemplateBinding` | 项目与模板版本绑定 |
| `DataContext` | EHR 或 CRF 的数据上下文 |
| `RecordInstance` | 表单记录实例 |
| `FieldCurrentValue` | 字段当前选中值 |
| `FieldValueEvent` | 字段值事件，包括人工录入、抽取候选等 |
| `FieldValueEvidence` | 字段值证据，指向文档位置或文本片段 |
| `ExtractionJob` | 抽取任务 |
| `ExtractionRun` | 抽取运行记录 |

## 当前接口总览

当前 OpenAPI 路由中共有以下主要接口：

| 模块 | 数量 | 说明 |
|---|---:|---|
| 基础状态/Auth/Admin/EHR 状态 | 5 | 健康检查、当前用户、模块状态 |
| Patients 与 EHR | 10 | 患者 CRUD、患者 EHR 查询、字段更新、事件选择、证据查询 |
| Documents | 7 | 文档上传、列表、详情、更新、删除、归档、取消归档 |
| Extraction Jobs | 6 | 抽取任务创建、查询、运行记录、取消、重试、删除 |
| Schema Templates | 7 | 模板列表、创建、详情、归档、版本创建、发布、删除 |
| Projects 与 CRF | 15 | 项目 CRUD、模板绑定、患者入组、CRF 查询和字段操作 |

> [!note]
> FastAPI 自动处理请求体验证错误，通常返回 `422 Unprocessable Entity`。业务代码中显式处理的常见错误包括 `401`、`403`、`404`、`409` 和 `204` 空响应。
