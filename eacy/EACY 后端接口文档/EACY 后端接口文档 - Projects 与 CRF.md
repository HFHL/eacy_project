---
title: EACY 后端接口文档 - Projects 与 CRF
tags:
  - EACY
  - backend
  - api
---

# EACY 后端接口文档 - Projects 与 CRF

本页覆盖研究项目、项目模板绑定、项目患者入组，以及项目患者 CRF 数据接口。

## 数据结构

### ResearchProjectCreate

| 字段 | 类型 | 必填 | 默认值 | 限制 | 说明 |
|---|---|---|---|---|---|
| `project_code` | string | 是 | - | `1-100` 字符 | 项目编码 |
| `project_name` | string | 是 | - | `1-200` 字符 | 项目名称 |
| `description` | string/null | 否 | - | - | 描述 |
| `status` | string | 否 | `active` | 最长 50 | 项目状态 |
| `start_date` | date/null | 否 | - | - | 开始日期 |
| `end_date` | date/null | 否 | - | - | 结束日期 |
| `extra_json` | object/null | 否 | - | - | 扩展信息 |

### ResearchProjectUpdate

| 字段 | 类型 | 必填 | 限制 | 说明 |
|---|---|---|---|---|
| `project_name` | string/null | 否 | 最长 200 | 项目名称 |
| `description` | string/null | 否 | - | 描述 |
| `status` | string/null | 否 | 最长 50 | 项目状态 |
| `start_date` | date/null | 否 | - | 开始日期 |
| `end_date` | date/null | 否 | - | 结束日期 |
| `extra_json` | object/null | 否 | - | 扩展信息 |

### ResearchProjectResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 项目 ID |
| `project_code` | string | 项目编码 |
| `project_name` | string | 项目名称 |
| `description` | string/null | 描述 |
| `status` | string | 项目状态 |
| `owner_id` | string/null | 负责人 ID |
| `start_date` | date/null | 开始日期 |
| `end_date` | date/null | 结束日期 |
| `extra_json` | object/null | 扩展信息 |
| `created_at` | datetime/null | 创建时间 |
| `updated_at` | datetime/null | 更新时间 |

### TemplateBindingCreate

| 字段 | 类型 | 必填 | 默认值 | 限制 | 说明 |
|---|---|---|---|---|---|
| `template_id` | string | 是 | - | - | 模板 ID |
| `schema_version_id` | string | 是 | - | - | schema 版本 ID |
| `binding_type` | string | 否 | `primary_crf` | 最长 50 | 绑定类型 |

### TemplateBindingResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 绑定 ID |
| `project_id` | string | 项目 ID |
| `template_id` | string | 模板 ID |
| `schema_version_id` | string | schema 版本 ID |
| `binding_type` | string | 绑定类型 |
| `status` | string | 绑定状态 |
| `locked_at` | datetime/null | 锁定时间 |
| `created_at` | datetime/null | 创建时间 |
| `updated_at` | datetime/null | 更新时间 |

### ProjectPatientCreate

| 字段 | 类型 | 必填 | 限制 | 说明 |
|---|---|---|---|---|
| `patient_id` | string | 是 | - | 患者 ID |
| `enroll_no` | string/null | 否 | 最长 100 | 入组编号 |
| `extra_json` | object/null | 否 | - | 扩展信息 |

### ProjectPatientResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 项目患者 ID |
| `project_id` | string | 项目 ID |
| `patient_id` | string | 患者 ID |
| `enroll_no` | string/null | 入组编号 |
| `status` | string | 入组状态 |
| `enrolled_at` | datetime/null | 入组时间 |
| `withdrawn_at` | datetime/null | 退出时间 |
| `extra_json` | object/null | 扩展信息 |
| `created_at` | datetime/null | 创建时间 |
| `updated_at` | datetime/null | 更新时间 |

### CrfResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `context` | object/null | CRF 数据上下文 |
| `schema` | object/null | 当前 CRF schema |
| `records` | object[] | 记录实例列表 |
| `current_values` | object | 以字段路径为 key 的当前字段值映射 |

CRF 的 `context`、`record`、`current value`、`event`、`evidence` 结构与患者 EHR 对应结构一致，只是业务语义为项目 CRF。字段细节见 [[EACY 后端接口文档 - Patients 与 EHR#数据结构]]。

## GET /api/v1/projects

接口描述：分页查询研究项目列表。

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---:|---|
| `page` | integer | 否 | 1 | 页码 |
| `page_size` | integer | 否 | 20 | 每页数量，最大 100 |
| `status` | string | 否 | - | 项目状态过滤 |

返回状态：`200`

返回格式：分页对象，`items` 为 `ResearchProjectResponse[]`。

## POST /api/v1/projects

接口描述：创建研究项目，负责人来自当前用户。

请求体：`ResearchProjectCreate`

返回状态：`201`

返回格式：`ResearchProjectResponse`

错误：资源冲突返回 `409`。

## GET /api/v1/projects/{project_id}

接口描述：查询研究项目详情。

路径参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `project_id` | string | 项目 ID |

返回状态：`200`

返回格式：`ResearchProjectResponse`

错误：项目不存在返回 `404`。

## PATCH /api/v1/projects/{project_id}

接口描述：更新研究项目。

路径参数：`project_id`

请求体：`ResearchProjectUpdate`

返回状态：`200`

返回格式：`ResearchProjectResponse`

错误：项目不存在返回 `404`；状态冲突返回 `409`。

## DELETE /api/v1/projects/{project_id}

接口描述：归档研究项目。该接口语义是归档，不是物理删除。

路径参数：`project_id`

返回状态：`200`

返回格式：`ResearchProjectResponse`

错误：项目不存在返回 `404`；状态冲突返回 `409`。

## POST /api/v1/projects/{project_id}/template-bindings

接口描述：为项目绑定 CRF 模板版本。

路径参数：`project_id`

请求体：`TemplateBindingCreate`

返回状态：`201`

返回格式：`TemplateBindingResponse`

错误：项目、模板或版本不存在返回 `404`；重复绑定或状态冲突返回 `409`。

## DELETE /api/v1/projects/{project_id}/template-bindings/{binding_id}

接口描述：停用项目模板绑定。

路径参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `project_id` | string | 项目 ID |
| `binding_id` | string | 绑定 ID |

返回状态：`200`

返回格式：`TemplateBindingResponse`

错误：资源不存在返回 `404`；状态冲突返回 `409`。

## GET /api/v1/projects/{project_id}/patients

接口描述：查询项目内入组患者列表。

路径参数：`project_id`

返回状态：`200`

返回格式：`ProjectPatientResponse[]`

错误：项目不存在返回 `404`。

## POST /api/v1/projects/{project_id}/patients

接口描述：将患者入组到研究项目。

路径参数：`project_id`

请求体：`ProjectPatientCreate`

返回状态：`201`

返回格式：`ProjectPatientResponse`

错误：项目或患者不存在返回 `404`；重复入组或状态冲突返回 `409`。

## GET /api/v1/projects/{project_id}/patients/{project_patient_id}/crf

接口描述：获取项目患者的 CRF 结构化数据。若上下文不存在，Service 会按当前逻辑创建或初始化 CRF 上下文。

路径参数：`project_id`、`project_patient_id`

返回状态：`200`

返回格式：`CrfResponse`

错误：资源不存在返回 `404`；项目患者与项目不匹配等冲突返回 `409`。

## PATCH /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}

接口描述：人工更新项目患者 CRF 的单个字段当前值，并记录字段值事件。

路径参数：`project_id`、`project_patient_id`、`field_path`

请求体：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `record_instance_id` | string/null | 否 | - | 记录实例 ID |
| `field_key` | string/null | 否 | - | 字段 key |
| `value_type` | string | 否 | `text` | 值类型，最长 50 |
| `value_text` | string/null | 否 | - | 文本值 |
| `value_number` | number/null | 否 | - | 数值 |
| `value_date` | date/null | 否 | - | 日期 |
| `value_datetime` | datetime/null | 否 | - | 日期时间 |
| `value_json` | object/array/null | 否 | - | 复杂值 |
| `unit` | string/null | 否 | - | 单位 |
| `note` | string/null | 否 | - | 备注 |

返回状态：`200`

返回格式：CRF 当前字段值对象，字段与 `EhrCurrentValueResponse` 一致。

错误：资源不存在返回 `404`；状态冲突返回 `409`。

## GET /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/events

接口描述：查询某个 CRF 字段的历史值事件或候选值事件。

路径参数：`project_id`、`project_patient_id`、`field_path`

返回状态：`200`

返回格式：CRF 字段事件数组，字段与 `EhrEventResponse` 一致。

错误：资源不存在返回 `404`；状态冲突返回 `409`。

## GET /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/candidates

接口描述：查询某个 CRF 字段的候选值集合、当前选中候选和冲突摘要。

路径参数：`project_id`、`project_patient_id`、`field_path`

返回状态：`200`

返回格式：

| 字段 | 类型 | 说明 |
|---|---|---|
| `candidates` | object[] | 候选事件列表，包含 `id`、`value`、`confidence`、`source_document_id`、`source_page`、`source_text`、`source_location` 等 |
| `selected_candidate_id` | string/null | 当前选中的事件 ID |
| `selected_value` | any/null | 当前值 |
| `has_value_conflict` | boolean | 是否存在多个不同候选值 |
| `distinct_value_count` | integer | 不同候选值数量 |

错误：资源不存在返回 `404`；状态冲突返回 `409`。

## POST /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/select-event

接口描述：从 CRF 字段事件中选择一个事件作为当前值。

路径参数：`project_id`、`project_patient_id`、`field_path`

请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `event_id` | string | 是 | 要选中的字段值事件 ID |

返回状态：`200`

返回格式：CRF 当前字段值对象，字段与 `EhrCurrentValueResponse` 一致。

错误：资源不存在返回 `404`；状态冲突返回 `409`。

## POST /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/select-candidate

接口描述：从候选值集合中选择一个候选事件作为当前值。该接口语义等同于 `select-event`，请求体字段名为 `candidate_id`，方便前端候选值组件调用。

路径参数：`project_id`、`project_patient_id`、`field_path`

请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `candidate_id` | string | 是 | 要选中的候选事件 ID |

返回状态：`200`

返回格式：CRF 当前字段值对象，字段与 `EhrCurrentValueResponse` 一致。

错误：资源不存在返回 `404`；状态冲突返回 `409`。

## DELETE /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}

接口描述：删除某个 CRF 字段的当前值、历史事件和证据。

路径参数：`project_id`、`project_patient_id`、`field_path`

返回状态：`204`

返回格式：无响应体。

错误：资源不存在返回 `404`；状态冲突返回 `409`。

## POST /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/records

接口描述：为项目患者 CRF 创建一个记录实例，用于可重复表单或动态表单实例。

路径参数：`project_id`、`project_patient_id`

请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `form_key` | string | 是 | 表单 key |
| `form_title` | string/null | 否 | 表单标题 |
| `group_key` | string/null | 否 | 分组 key |
| `group_title` | string/null | 否 | 分组标题 |
| `instance_label` | string/null | 否 | 实例显示名 |

返回状态：`201`

返回格式：CRF 记录实例对象，字段与 `EhrRecordResponse` 一致。

错误：资源不存在返回 `404`；状态冲突返回 `409`。

## DELETE /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/records/{record_instance_id}

接口描述：删除一个 CRF 记录实例，同时清理该实例下的当前值、事件和证据。

路径参数：`project_id`、`project_patient_id`、`record_instance_id`

返回状态：`204`

返回格式：无响应体。

错误：资源不存在返回 `404`；状态冲突返回 `409`。

## GET /api/v1/projects/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/evidence

接口描述：查询某个 CRF 字段关联的证据列表。

路径参数：`project_id`、`project_patient_id`、`field_path`

返回状态：`200`

返回格式：CRF 字段证据数组，字段与 `EhrEvidenceResponse` 一致。

错误：资源不存在返回 `404`；状态冲突返回 `409`。

## DELETE /api/v1/projects/{project_id}/patients/{project_patient_id}

接口描述：将患者从研究项目中退出。

路径参数：`project_id`、`project_patient_id`

返回状态：`200`

返回格式：`ProjectPatientResponse`

错误：资源不存在返回 `404`；状态冲突返回 `409`。
