---
title: EACY 后端接口文档 - Extraction Jobs
tags:
  - EACY
  - backend
  - api
---

# EACY 后端接口文档 - Extraction Jobs

本页覆盖结构化抽取任务接口。当前创建接口返回 `202`，但业务 Service 中会执行当前实现的创建与处理流程；Celery 框架已存在，后续可把耗时处理迁移到 worker。

## 数据结构

### ExtractionJobCreate

| 字段 | 类型 | 必填 | 默认值 | 限制 | 说明 |
|---|---|---|---|---|---|
| `job_type` | string | 否 | `patient_ehr` | 最长 50 | 任务类型 |
| `priority` | integer | 否 | 0 | - | 优先级 |
| `patient_id` | string/null | 否 | - | 患者 ID |
| `document_id` | string/null | 否 | - | 文档 ID |
| `project_id` | string/null | 否 | - | 项目 ID |
| `project_patient_id` | string/null | 否 | - | 项目患者 ID |
| `context_id` | string/null | 否 | - | 数据上下文 ID |
| `schema_version_id` | string/null | 否 | - | schema 版本 ID |
| `target_form_key` | string/null | 否 | - | 最长 100，目标表单 key |
| `input_json` | object/null | 否 | - | - | 任务输入参数 |

### ExtractionJobResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 任务 ID |
| `job_type` | string | 任务类型 |
| `status` | string | 任务状态 |
| `priority` | integer/null | 优先级 |
| `patient_id` | string/null | 患者 ID |
| `document_id` | string/null | 文档 ID |
| `project_id` | string/null | 项目 ID |
| `project_patient_id` | string/null | 项目患者 ID |
| `context_id` | string/null | 数据上下文 ID |
| `schema_version_id` | string/null | schema 版本 ID |
| `target_form_key` | string/null | 目标表单 key |
| `input_json` | object/null | 输入参数 |
| `progress` | integer/null | 进度 |
| `error_message` | string/null | 错误信息 |
| `requested_by` | string/null | 请求人 |
| `started_at` | datetime/null | 开始时间 |
| `finished_at` | datetime/null | 完成时间 |
| `created_at` | datetime/null | 创建时间 |
| `updated_at` | datetime/null | 更新时间 |

### ExtractionRunResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 运行记录 ID |
| `job_id` | string | 所属任务 ID |
| `run_no` | integer | 第几次运行 |
| `status` | string | 运行状态 |
| `model_name` | string/null | 模型名称 |
| `prompt_version` | string/null | Prompt 版本 |
| `input_snapshot_json` | object/null | 输入快照 |
| `raw_output_json` | object/null | 原始输出 |
| `parsed_output_json` | object/null | 解析后输出 |
| `validation_status` | string/null | 校验状态 |
| `error_message` | string/null | 错误信息 |
| `started_at` | datetime/null | 开始时间 |
| `finished_at` | datetime/null | 完成时间 |
| `created_at` | datetime | 创建时间 |

## POST /api/v1/extraction-jobs

接口描述：创建抽取任务，并按当前 Service 实现处理任务。

请求体：`ExtractionJobCreate`

返回状态：`202`

返回格式：`ExtractionJobResponse`

错误：目标资源不存在返回 `404`；资源状态冲突返回 `409`。

## GET /api/v1/extraction-jobs/{job_id}

接口描述：查询抽取任务详情。

路径参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `job_id` | string | 抽取任务 ID |

返回状态：`200`

返回格式：`ExtractionJobResponse`

错误：任务不存在返回 `404`。

## GET /api/v1/extraction-jobs/{job_id}/runs

接口描述：查询抽取任务的运行记录列表。

路径参数：`job_id`

返回状态：`200`

返回格式：`ExtractionRunResponse[]`

错误：任务不存在返回 `404`；状态冲突返回 `409`。

## POST /api/v1/extraction-jobs/{job_id}/cancel

接口描述：取消抽取任务。

路径参数：`job_id`

请求参数：无。

返回状态：`200`

返回格式：`ExtractionJobResponse`

错误：任务不存在返回 `404`；当前状态不允许取消时返回 `409`。

## POST /api/v1/extraction-jobs/{job_id}/retry

接口描述：重试抽取任务。

路径参数：`job_id`

请求参数：无。

返回状态：`200`

返回格式：`ExtractionJobResponse`

错误：任务不存在返回 `404`；当前状态不允许重试时返回 `409`。

## DELETE /api/v1/extraction-jobs/{job_id}

接口描述：删除抽取任务。

路径参数：`job_id`

返回状态：`204`

返回格式：无响应体。

错误：任务不存在返回 `404`；当前状态不允许删除时返回 `409`。
