---
title: EACY 后端接口文档 - Patients 与 EHR
tags:
  - EACY
  - backend
  - api
---

# EACY 后端接口文档 - Patients 与 EHR

本页覆盖患者基础信息接口，以及患者维度的 EHR 查询、字段更新、候选事件选择和证据查询。

## 数据结构

### PatientCreate

| 字段 | 类型 | 必填 | 限制 | 说明 |
|---|---|---|---|---|
| `name` | string | 是 | `1-100` 字符 | 患者姓名 |
| `gender` | string/null | 否 | 最长 20 | 性别 |
| `birth_date` | date/null | 否 | - | 出生日期 |
| `age` | integer/null | 否 | `0-150` | 年龄 |
| `department` | string/null | 否 | 最长 100 | 科室 |
| `main_diagnosis` | string/null | 否 | 最长 500 | 主要诊断 |
| `doctor_name` | string/null | 否 | 最长 100 | 医生姓名 |
| `extra_json` | object/null | 否 | - | 扩展信息 |

### PatientUpdate

与 `PatientCreate` 字段相同，但所有字段均可选。

### PatientResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 患者 ID |
| `name` | string | 患者姓名 |
| `gender` | string/null | 性别 |
| `birth_date` | date/null | 出生日期 |
| `age` | integer/null | 年龄 |
| `department` | string/null | 科室 |
| `main_diagnosis` | string/null | 主要诊断 |
| `doctor_name` | string/null | 医生姓名 |
| `extra_json` | object/null | 扩展信息 |
| `created_at` | datetime/null | 创建时间 |
| `updated_at` | datetime/null | 更新时间 |
| `deleted_at` | datetime/null | 删除时间 |

### EhrResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `context` | object/null | EHR 数据上下文 |
| `schema` | object/null | 当前 EHR schema |
| `records` | object[] | 记录实例列表 |
| `current_values` | object | 以字段路径为 key 的当前字段值映射 |

### EhrContextResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 上下文 ID |
| `context_type` | string | 上下文类型 |
| `patient_id` | string | 患者 ID |
| `project_id` | string/null | 项目 ID，EHR 场景通常为空 |
| `project_patient_id` | string/null | 项目患者 ID，EHR 场景通常为空 |
| `schema_version_id` | string | schema 版本 ID |
| `status` | string | 上下文状态 |
| `created_by` | string/null | 创建人 |
| `created_at` | datetime/null | 创建时间 |
| `updated_at` | datetime/null | 更新时间 |

### EhrRecordResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 记录实例 ID |
| `context_id` | string | 上下文 ID |
| `group_key` | string/null | 分组 key |
| `group_title` | string/null | 分组标题 |
| `form_key` | string | 表单 key |
| `form_title` | string | 表单标题 |
| `repeat_index` | integer | 重复实例序号 |
| `instance_label` | string/null | 实例标签 |
| `anchor_json` | object/null | 锚点信息 |
| `source_document_id` | string/null | 来源文档 ID |
| `created_by_run_id` | string/null | 来源抽取运行 ID |
| `review_status` | string | 审核状态 |
| `created_at` | datetime/null | 创建时间 |
| `updated_at` | datetime/null | 更新时间 |

### EhrCurrentValueResponse

除通用字段值槽位外，还包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 当前值 ID |
| `context_id` | string | 上下文 ID |
| `record_instance_id` | string | 记录实例 ID |
| `field_key` | string | 字段 key |
| `field_path` | string | 字段路径 |
| `selected_event_id` | string/null | 当前选中的事件 ID |
| `value_type` | string | 值类型 |
| `selected_by` | string/null | 选择人 |
| `selected_at` | datetime/null | 选择时间 |
| `review_status` | string | 审核状态 |
| `updated_at` | datetime/null | 更新时间 |

### EhrEventResponse

除通用字段值槽位外，还包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 事件 ID |
| `context_id` | string | 上下文 ID |
| `record_instance_id` | string | 记录实例 ID |
| `field_key` | string | 字段 key |
| `field_path` | string | 字段路径 |
| `field_title` | string/null | 字段标题 |
| `event_type` | string | 事件类型 |
| `value_type` | string | 值类型 |
| `normalized_text` | string/null | 归一化文本 |
| `confidence` | number/null | 置信度 |
| `extraction_run_id` | string/null | 抽取运行 ID |
| `source_document_id` | string/null | 来源文档 ID |
| `source_event_id` | string/null | 来源事件 ID |
| `review_status` | string | 审核状态 |
| `created_by` | string/null | 创建人 |
| `created_at` | datetime | 创建时间 |
| `note` | string/null | 备注 |

### EhrEvidenceResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 证据 ID |
| `value_event_id` | string | 字段值事件 ID |
| `document_id` | string | 文档 ID |
| `page_no` | integer/null | 页码 |
| `bbox_json` | object/array/null | 坐标框或版面坐标 |
| `quote_text` | string/null | 引用文本 |
| `evidence_type` | string | 证据类型 |
| `row_key` | string/null | 表格行 key |
| `cell_key` | string/null | 表格单元格 key |
| `start_offset` | integer/null | 文本起始偏移 |
| `end_offset` | integer/null | 文本结束偏移 |
| `evidence_score` | number/null | 证据分数 |
| `created_at` | datetime | 创建时间 |

## GET /api/v1/patients/

接口描述：分页查询患者列表。

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---:|---|
| `page` | integer | 否 | 1 | 页码 |
| `page_size` | integer | 否 | 20 | 每页数量，最大 100 |
| `keyword` | string | 否 | - | 搜索关键词 |
| `department` | string | 否 | - | 科室过滤 |

返回状态：`200`

返回格式：分页对象，`items` 为 `PatientResponse[]`。

## POST /api/v1/patients

接口描述：创建患者。

请求体：`PatientCreate`

返回状态：`201`

返回格式：`PatientResponse`

## GET /api/v1/patients/{patient_id}

接口描述：查询单个患者详情。

路径参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `patient_id` | string | 患者 ID |

返回状态：`200`

返回格式：`PatientResponse`

错误：患者不存在时返回 `404`。

## PATCH /api/v1/patients/{patient_id}

接口描述：更新患者基础信息。

路径参数：`patient_id`

请求体：`PatientUpdate`

返回状态：`200`

返回格式：`PatientResponse`

## DELETE /api/v1/patients/{patient_id}

接口描述：删除患者。

路径参数：`patient_id`

返回状态：`204`

返回格式：无响应体。

## GET /api/v1/patients/{patient_id}/ehr

接口描述：获取患者 EHR 结构化数据。若上下文不存在，Service 会按当前逻辑创建或初始化患者 EHR 上下文。

路径参数：`patient_id`

返回状态：`200`

返回格式：`EhrResponse`

## PATCH /api/v1/patients/{patient_id}/ehr/fields/{field_path}

接口描述：人工更新患者 EHR 的单个字段当前值，并记录字段值事件。

路径参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `patient_id` | string | 患者 ID |
| `field_path` | string | 字段路径 |

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

返回格式：`EhrCurrentValueResponse`

## GET /api/v1/patients/{patient_id}/ehr/fields/{field_path}/events

接口描述：查询某个 EHR 字段的历史值事件或候选值事件。

路径参数：`patient_id`、`field_path`

返回状态：`200`

返回格式：`EhrEventResponse[]`

## POST /api/v1/patients/{patient_id}/ehr/fields/{field_path}/select-event

接口描述：从字段事件中选择一个事件作为当前值。

路径参数：`patient_id`、`field_path`

请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `event_id` | string | 是 | 要选中的字段值事件 ID |

返回状态：`200`

返回格式：`EhrCurrentValueResponse`

## GET /api/v1/patients/{patient_id}/ehr/fields/{field_path}/evidence

接口描述：查询某个 EHR 字段关联的证据列表。

路径参数：`patient_id`、`field_path`

返回状态：`200`

返回格式：`EhrEvidenceResponse[]`
