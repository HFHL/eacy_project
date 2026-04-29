---
title: EHR-CRF 数据库与抽取落库设计
tags:
  - eacy/backend
  - eacy/database
  - eacy/extraction
  - eacy/llm
status: active
updated: 2026-04-29
aliases:
  - EHR CRF 字段值系统
  - 抽取落库设计
---

# EHR-CRF 数据库与抽取落库设计

> [!important]
> 本文记录当前真实数据库中已经跑通的 EHR/CRF 字段值系统、候选值、历史、溯源、可重复表单与多行表格的落库规则。后续接入 LLM 抽取时，只要按本文结构写入，前端候选值、历史、溯源和表单渲染会自然打通。

相关文档：[[EACY架构总览]]、[[Eacy后端开发文档]]、[[EACY 后端接口文档/EACY 后端接口文档 - Patients 与 EHR]]、[[EACY 后端接口文档/EACY 后端接口文档 - Extraction Jobs]]、[[EACY 后端接口文档/EACY 后端接口文档 - Schema Templates]]

## 1. 当前结论

- EHR 与科研 CRF **共用同一套字段值系统**，不要分别建 `patient_ehr_values` 或 `project_crf_values`。
- 模板 schema 写入 `schema_template_versions.schema_json`，运行时读取数据库中的 published 版本，不直接读本地 JSON 文件。
- 字段值以 `data_contexts` 为边界：
  - `context_type = patient_ehr`：患者电子病历夹。
  - `context_type = project_crf`：科研项目 CRF。
- 前端展示值来自 `field_current_values`。
- 抽取历史、候选值、人工修改都来自 `field_value_events`。
- 字段证据、PDF 坐标、原文片段来自 `field_value_evidence`。
- 多行表格与一级可重复表单都通过 `field_path` 中的数字下标表达。

## 2. 核心表关系

```text
schema_templates
  └── schema_template_versions(schema_json)
        └── data_contexts(context_type = patient_ehr/project_crf)
              └── record_instances
                    ├── field_current_values
                    └── field_value_events
                          └── field_value_evidence
```

科研项目额外关系：

```text
research_projects
  ├── project_template_bindings(schema_version_id)
  └── project_patients
        └── data_contexts(context_type = project_crf)
```

## 3. 模板 schema 入库

### 3.1 EHR 模板

当前 EHR schema 已导入真实数据库：

| 表 | 关键值 |
|---|---|
| `schema_templates.template_code` | `ehr_default` |
| `schema_templates.template_type` | `ehr` |
| `schema_templates.status` | `active` |
| `schema_template_versions.status` | `published` |
| `schema_template_versions.schema_json.$id` | `patient_ehr-V2.schema.json` |

导入脚本：

```bash
cd backend
./.venv/bin/python scripts/import_ehr_schema.py --execute
```

默认行为：

- 相同 schema 不重复创建版本。
- schema 变化后可创建新版本。
- 运行时通过 `template_type = ehr` 获取最新 published 版本。

### 3.2 运行时读取规则

后端通过 `SchemaService.get_latest_published("ehr")` 获取最新 EHR schema。

查询条件：

```text
schema_templates.template_type = 'ehr'
schema_templates.status = 'active'
schema_template_versions.status = 'published'
order by schema_template_versions.version_no desc
limit 1
```

## 4. data_contexts：数据上下文

`data_contexts` 是字段值系统的边界。

### 4.1 患者 EHR context

创建时机：

- 访问患者 EHR 接口时。
- 文档归档后触发 EHR 初始化时。
- 创建 `patient_ehr` 抽取任务时。

关键字段：

| 字段 | 说明 |
|---|---|
| `context_type` | 固定为 `patient_ehr` |
| `patient_id` | 患者 ID |
| `schema_version_id` | 当前 EHR schema 版本 |
| `status` | 通常为 `draft` |

### 4.2 科研 CRF context

创建时机：

- 患者入组项目后。
- 项目已绑定 active `primary_crf` 模板。
- 访问项目患者 CRF 页面时。

关键字段：

| 字段                   | 说明                  |
| -------------------- | ------------------- |
| `context_type`       | 固定为 `project_crf`   |
| `patient_id`         | 原始患者 ID             |
| `project_id`         | 科研项目 ID             |
| `project_patient_id` | 项目患者关系 ID           |
| `schema_version_id`  | 项目绑定的 CRF schema 版本 |

## 5. record_instances：表单实例

`record_instances` 表示 schema 中的一级表单实例。它不是具体字段值。

当前 JSON Schema 结构按顶层两级生成 record：

```text
schema.properties.<folder>.properties.<form>
```

生成规则：

| record 字段 | 来源 |
|---|---|
| `group_key` | `<folder>` |
| `group_title` | `<folder>` |
| `form_key` | `<folder>.<form>` |
| `form_title` | `<form>` |
| `repeat_index` | 默认 `0` |
| `review_status` | `unreviewed` |

示例：

| schema 路径 | record_instances.form_key |
|---|---|
| `基本信息 → 人口学情况` | `基本信息.人口学情况` |
| `诊断记录 → 诊断记录` | `诊断记录.诊断记录` |
| `治疗情况 → 药物治疗` | `治疗情况.药物治疗` |

> [!note]
> 一级可重复表单（如 `诊断记录_1`、`诊断记录_2`）当前不是通过多个 `record_instances.repeat_index` 表达，而是通过字段路径里的数组下标表达。前端 `CategoryTree` 会根据 `draftData` 中数组长度显示 `_1/_2/_3`。

## 6. field_path 规则

### 6.1 普通字段

普通字段直接用 schema 层级路径：

```text
基本信息.人口学情况.身份信息.患者姓名
基本信息.人口学情况.身份信息.性别
基本信息.人口学情况.人口统计学.医保类型
```

### 6.2 点号路径与斜杠路径

数据库中的标准路径使用点号分隔：

```text
基本信息.人口学情况.联系方式.0.联系电话
```

前端部分审计、定位或展示逻辑中可能会把同一个路径转换成斜杠形式：

```text
/基本信息/人口学情况/联系方式/0/联系电话
```

两者含义相同，只是表达形式不同：

| 点号路径 | 斜杠路径 | 含义 |
|---|---|---|
| `联系方式.0.联系电话` | `/联系方式/0/联系电话` | 联系方式第 1 行的联系电话 |
| `联系方式.1.联系电话` | `/联系方式/1/联系电话` | 联系方式第 2 行的联系电话 |
| `诊断记录.诊断记录.0.入院日期` | `/诊断记录/诊断记录/0/入院日期` | `诊断记录_1` 的入院日期 |
| `诊断记录.诊断记录.1.入院日期` | `/诊断记录/诊断记录/1/入院日期` | `诊断记录_2` 的入院日期 |

> [!note]
> `0/1/2` 是数组下标，从 0 开始；前端显示给用户看的 `_1/_2/_3` 从 1 开始。因此数据库路径里的 `.0.` 对应前端标题里的 `_1`。

数字下标的作用：

- 区分同一表格或可重复表单中的多行/多实例。
- 避免多个同名字段互相覆盖。
- 让前端把 `current_values` 还原为数组。
- 让候选值、历史和 evidence 精确绑定到某一行某一列。
- 让后端可以在锚点归并不命中时创建下一个 index。

### 6.3 多行表格字段

表格字段如果是 `type = array`，路径中插入数字下标：

```text
基本信息.人口学情况.联系方式.0.联系电话
基本信息.人口学情况.联系方式.1.联系电话
基本信息.人口学情况.联系方式.2.联系电话
```

前端会把这些组装为：

```json
{
  "基本信息": {
    "人口学情况": {
      "联系方式": [
        { "联系电话": "13800138001" },
        { "联系电话": "021-55667788" },
        { "联系电话": "13900139002" }
      ]
    }
  }
}
```

### 6.4 一级可重复表单

一级可重复表单也是通过数组下标表达：

```text
诊断记录.诊断记录.0.入院诊断.主要诊断
诊断记录.诊断记录.1.入院诊断.主要诊断
诊断记录.诊断记录.2.入院诊断.主要诊断
```

前端 `CategoryTree` 会显示：

```text
诊断记录_1
诊断记录_2
诊断记录_3
```

### 6.5 嵌套对象字段

嵌套对象继续追加字段名：

```text
诊断记录.诊断记录.0.入院诊断.主要诊断
诊断记录.诊断记录.0.出院诊断.次要诊断
```

## 7. field_value_events：候选、历史与抽取事件

所有抽取值、候选值、人工修改都先进入 `field_value_events`。

关键字段：

| 字段 | 说明 |
|---|---|
| `context_id` | 所属 EHR/CRF context |
| `record_instance_id` | 所属一级表单实例 |
| `field_key` | 字段末级名称，如 `患者姓名` |
| `field_path` | 完整字段路径 |
| `event_type` | `ai_extracted` / `manual_edit` 等 |
| `value_type` | `text` / `number` / `date` / `datetime` / `json` |
| `value_text` | 文本值槽位 |
| `value_number` | 数值槽位 |
| `value_date` | 日期槽位 |
| `value_datetime` | 日期时间槽位 |
| `value_json` | 复杂结构槽位 |
| `confidence` | 抽取置信度 |
| `source_document_id` | 来源文档 |
| `review_status` | `candidate` / `accepted` |
| `extraction_run_id` | 抽取 run ID，可为空 |

### 7.1 候选值

候选值必须写入：

```text
field_value_events.review_status = 'candidate'
```

前端候选值接口会读取同一字段下的：

```text
review_status in ('candidate', 'accepted')
```

这样候选区既能显示“当前值”，也能显示可采用的候选值。

### 7.2 当前选中值

当某个 event 被采用时：

1. `field_current_values.selected_event_id = field_value_events.id`
2. `field_current_values` 复制该 event 的值槽位。
3. 该 event 的 `review_status` 可更新为 `accepted`。

### 7.3 历史

字段历史接口直接读取同一 `context_id + field_path` 下的 `field_value_events`，按 `created_at desc` 排序。

## 8. field_current_values：前端当前值

前端 EHR 表单当前值来自 `field_current_values`。

唯一约束：

```text
(context_id, record_instance_id, field_path)
```

关键字段：

| 字段 | 说明 |
|---|---|
| `selected_event_id` | 当前采用的 event |
| `value_type` | 当前值类型 |
| `value_text/value_number/value_date/value_datetime/value_json` | 当前值槽位 |
| `review_status` | 通常为 `unreviewed` 或 `confirmed` |
| `selected_at` | 采用时间 |
| `updated_at` | 更新时间 |

> [!tip]
> LLM 抽取落库时，如果字段还没有 current，可以自动把第一条候选设为 current，但 `review_status` 建议保持 `unreviewed`，让人工后续确认。

## 9. field_value_evidence：证据与坐标

每个抽取 event 建议至少写一条 evidence。

关键字段：

| 字段 | 说明 |
|---|---|
| `value_event_id` | 对应字段事件 |
| `document_id` | 来源文档 |
| `page_no` | PDF 页码 |
| `bbox_json` | 坐标或多边形 |
| `quote_text` | 原文片段 |
| `evidence_type` | `llm_extract` / `ocr_text` / `demo_seed` 等 |
| `start_offset` / `end_offset` | 文本偏移，可选 |
| `evidence_score` | 证据置信度 |

推荐 `bbox_json` 结构：

```json
{
  "x": 100,
  "y": 160,
  "w": 200,
  "h": 28
}
```

如果 OCR 返回 polygon，也可以存：

```json
{
  "polygon": [100, 160, 300, 160, 300, 188, 100, 188]
}
```

## 10. API 约定

### 10.1 获取患者 EHR

```http
GET /api/v1/patients/{patient_id}/ehr
```

返回：

```json
{
  "context": {},
  "schema": {},
  "records": [],
  "current_values": {
    "基本信息.人口学情况.身份信息.患者姓名": {}
  }
}
```

前端会把 `current_values` 按 `field_path` 还原成嵌套 `data`。

### 10.2 字段历史

```http
GET /api/v1/patients/{patient_id}/ehr/fields/{field_path}/events
```

返回该字段所有事件。

### 10.3 字段候选值

```http
GET /api/v1/patients/{patient_id}/ehr/fields/{field_path}/candidates
```

返回：

```json
{
  "candidates": [
    {
      "id": "event-id",
      "event_id": "event-id",
      "value": "右肺上叶腺癌",
      "value_type": "text",
      "review_status": "candidate",
      "confidence": 0.91,
      "source_document_id": "document-id",
      "source_page": 1,
      "source_text": "原文片段",
      "created_at": "2026-04-29T00:00:00"
    }
  ],
  "selected_candidate_id": "event-id",
  "selected_value": "右肺上叶腺癌",
  "has_value_conflict": true,
  "distinct_value_count": 2
}
```

前端候选区依赖字段：

| 字段                      | 用途              |
| ----------------------- | --------------- |
| `candidates[].id`       | 采用按钮参数          |
| `candidates[].value`    | 候选值显示           |
| `selected_candidate_id` | 标记当前值           |
| `selected_value`        | 当前值 fallback 匹配 |
| `has_value_conflict`    | 显示“多值差异”        |
| `distinct_value_count`  | 差异数量            |
| `source_document_id`    | 来源文档显示          |
| `source_page`           | 页码显示            |
| `source_text`           | 原文片段显示          |
| `confidence`            | 置信度显示           |
|                         |                 |

### 10.4 采用候选值

```http
POST /api/v1/patients/{patient_id}/ehr/fields/{field_path}/select-candidate
```

请求：

```json
{
  "candidate_id": "field_value_events.id"
}
```

效果：

- 调用同一套 `select_field_event` 逻辑。
- 更新 `field_current_values.selected_event_id`。
- 复制候选 event 的值槽位到 current。

### 10.5 字段证据

```http
GET /api/v1/patients/{patient_id}/ehr/fields/{field_path}/evidence
```

返回该字段所有 evidence。

## 11. LLM 抽取落库流程

推荐 LLM 抽取任务按以下步骤落库。

```text
1. 创建 extraction_jobs
2. 创建 extraction_runs
3. 读取 document.ocr_text / ocr_payload_json / parsed_content
4. 读取 schema_template_versions.schema_json
5. 按 schema 生成字段清单和 prompt
6. LLM 输出结构化 fields
7. 校验 value_type 和值槽位
8. 写 field_value_events(review_status = candidate)
9. 写 field_value_evidence
10. 如果 current 为空，自动 select 当前 event
11. run/job 标记 completed
```

### 11.1 LLM 输出建议

```json
{
  "fields": [
    {
      "field_path": "诊断记录.诊断记录.0.入院诊断.主要诊断",
      "field_key": "主要诊断",
      "field_title": "主要诊断",
      "value_type": "text",
      "value_text": "右肺上叶恶性肿瘤",
      "confidence": 0.91,
      "source_document_id": "document-id",
      "evidences": [
        {
          "document_id": "document-id",
          "page_no": 1,
          "bbox_json": { "x": 100, "y": 160, "w": 200, "h": 28 },
          "quote_text": "入院诊断：右肺上叶恶性肿瘤",
          "evidence_type": "llm_extract",
          "evidence_score": 0.91
        }
      ]
    }
  ]
}
```

### 11.2 类型和值槽位

| `value_type` | 使用槽位 | 示例 |
|---|---|---|
| `text` | `value_text` | `男` |
| `number` | `value_number` | `47` |
| `date` | `value_date` | `2026-04-10` |
| `datetime` | `value_datetime` | `2026-04-10T09:30:00` |
| `json` | `value_json` | `{ "items": [] }` |

不要同一个 event 同时写多个值槽位。


## 12. `x-merge-binding`：锚点字段与实例归并

> [!important]
> `x-merge-binding` 不应该只作为前端展示配置。它的核心作用是在 LLM 抽取结果写库前，决定一条抽取记录应该写入已有可重复实例的候选值，还是创建新的 `_2/_3` 实例。

### 12.1 当前 schema 中的配置形态

常见配置示例：

```text
诊断记录.诊断记录
x-merge-binding = anchor=出院日期;group_key=诊断机构;fallback=入院日期

治疗情况.药物治疗
x-merge-binding = anchor=开始日期;group_key=药物名称+给药途径

病理.活检组织病理
x-merge-binding = anchor=病理诊断报告日期;group_key=病理号;fallback=病理送检日期

基本信息.人口学情况.联系方式
x-merge-binding = group_key=联系电话
```

语义约定：

| 片段 | 说明 |
|---|---|
| `anchor=出院日期` | 主要时间锚点，用于判断是否为同一条表单实例 |
| `group_key=诊断机构` | 辅助分组键，可单字段或多字段组合 |
| `group_key=药物名称+给药途径` | 多字段组合键，拼接后参与匹配 |
| `fallback=入院日期` | anchor 缺失时的备用锚点 |

### 12.2 当前代码状态

截至当前阶段：

- schema 中已经存在大量 `x-merge-binding`。
- 设计器可以保存/解析该字段。
- 前端表单可以读到该字段，但目前不展示。
- 后端抽取落库尚未真正使用该字段做实例归并。

也就是说，`x-merge-binding` 当前是“设计信息已存在，运行时归并逻辑待实现”。

### 12.3 它应该在哪个阶段生效

锚点归并应该在 **LLM 抽取结果解析之后、写入 `field_value_events/current` 之前** 生效。

推荐流程：

```text
OCR / 文档文本
  -> LLM 抽取结构化记录
  -> 结果规范化
  -> 读取 schema 中的 x-merge-binding
  -> 根据 anchor/group_key/fallback 生成实例签名
  -> 与当前 context 下已有实例数据比对
  -> 决定目标数组 index
  -> 生成最终 field_path
  -> 写 field_value_events / field_current_values / evidence
```

不建议在这些阶段生效：

| 阶段 | 原因 |
|---|---|
| schema 初始化阶段 | 此时没有具体抽取记录，无法判断 `_1/_2/_3` |
| 前端渲染阶段 | 前端不应承担归并决策，否则不同抽取任务会产生不一致结果 |
| LLM prompt 内部 | LLM 可以输出 anchor/group_key 值，但不应直接决定数据库 index |

### 12.4 候选值还是新建实例的判断

这是 **表单实例级别** 的判断，不是单字段级别判断。

以 `诊断记录.诊断记录` 为例：

```text
x-merge-binding = anchor=出院日期;group_key=诊断机构;fallback=入院日期
```

LLM 抽到一条诊断记录：

```json
{
  "入院日期": "2026-04-10",
  "出院日期": "2026-04-18",
  "诊断机构": "上海市示例医院",
  "入院诊断": {
    "主要诊断": "右肺上叶恶性肿瘤"
  }
}
```

后端应生成签名：

```text
form_path = 诊断记录.诊断记录
anchor = 出院日期:2026-04-18
group_key = 诊断机构:上海市示例医院
```

然后扫描当前 context 下已有 current values：

```text
诊断记录.诊断记录.0.出院日期
诊断记录.诊断记录.0.诊断机构
诊断记录.诊断记录.1.出院日期
诊断记录.诊断记录.1.诊断机构
```

决策规则：

| 判断结果 | 落库方式 | 前端效果 |
|---|---|---|
| 命中已有实例 `_1` | 写入 `.0.*` 字段的候选/历史 | `诊断记录_1` 中出现候选值 |
| 命中已有实例 `_2` | 写入 `.1.*` 字段的候选/历史 | `诊断记录_2` 中出现候选值 |
| 未命中任何实例 | 创建新 index `.2.*` | 前端出现 `诊断记录_3` |
| anchor 缺失但 fallback 命中 | 使用 fallback 匹配 | 尽量归并到已有实例 |
| anchor/fallback/group_key 都不足 | 新建低置信实例或进入人工待归并 | 避免误覆盖已有实例 |

### 12.5 多行表格也适用

例如联系方式：

```text
基本信息.人口学情况.联系方式
x-merge-binding = group_key=联系电话
```

抽到电话 `13800138001` 时：

- 如果已有 `基本信息.人口学情况.联系方式.0.联系电话 = 13800138001`，则写入 `.0.*` 的候选值。
- 如果没有任何行匹配，则写入下一个 index，例如 `.2.*`。

因此，多行表格和一级可重复表单使用同一套归并思想，只是前端展示不同：

| 类型 | 示例路径 | 前端表现 |
|---|---|---|
| 多行表格 | `基本信息.人口学情况.联系方式.2.联系电话` | 表格第 3 行 |
| 一级可重复表单 | `诊断记录.诊断记录.2.入院日期` | `诊断记录_3` |

### 12.6 推荐后端组件

后续实现 LLM 抽取时建议新增 `RecordMergeResolver`。

输入：

```python
context_id: str
schema_json: dict
form_path: str
extracted_record: dict
merge_binding: str
```

输出：

```python
{
  "matched": True,
  "target_index": 0,
  "field_path_prefix": "诊断记录.诊断记录.0",
  "match_reason": "anchor+group_key"
}
```

如果未命中：

```python
{
  "matched": False,
  "target_index": 2,
  "field_path_prefix": "诊断记录.诊断记录.2",
  "match_reason": "new_instance"
}
```

### 12.7 LLM 输出建议

不要让 LLM 直接输出最终 indexed path：

```json
{
  "field_path": "诊断记录.诊断记录.2.入院诊断.主要诊断"
}
```

更推荐让 LLM 输出表单级 record：

```json
{
  "form_path": "诊断记录.诊断记录",
  "record": {
    "入院日期": "2026-04-10",
    "出院日期": "2026-04-18",
    "诊断机构": "上海市示例医院",
    "入院诊断": {
      "主要诊断": "右肺上叶恶性肿瘤"
    }
  },
  "evidence": []
}
```

由后端根据 `x-merge-binding` 决定最终 index，然后展开为字段事件：

```text
诊断记录.诊断记录.0.入院日期
诊断记录.诊断记录.0.出院日期
诊断记录.诊断记录.0.诊断机构
诊断记录.诊断记录.0.入院诊断.主要诊断
```

> [!warning]
> 如果让 LLM 直接决定 `_1/_2/_3`，多文档、多次抽取、重试任务会很容易产生重复实例或误覆盖。

## 13. 已验证的真实库演示数据

当前真实库里已为患者 `胡世涛` 写入演示数据：

| 项 | 数量 |
|---|---:|
| EHR context | 1 |
| record instances | 37 |
| 人口学 current values | 41 |
| 人口学 events | 82 |
| 人口学 candidate fields | 41 |
| 人口学 evidence | 82 |
| 诊断记录可重复表单实例 | 3 |
| 诊断记录 current fields | 21 |
| 诊断记录 candidate fields | 21 |

示例患者：

```text
patient_id = fd0f5c01-34ba-4a2c-9fde-01df69cf6a00
name = 胡世涛
```

### 13.1 多行表格验证路径

```text
基本信息.人口学情况.联系方式.0.联系电话
基本信息.人口学情况.联系方式.1.联系电话
基本信息.人口学情况.联系方式.2.联系电话
```

前端显示为联系方式表格多行。

### 13.2 一级可重复表单验证路径

```text
诊断记录.诊断记录.0.入院诊断.主要诊断
诊断记录.诊断记录.1.入院诊断.主要诊断
诊断记录.诊断记录.2.入院诊断.主要诊断
```

前端显示为：

```text
诊断记录_1
诊断记录_2
诊断记录_3
```

## 14. 后续接入 LLM 的注意事项

> [!warning]
> LLM 抽取时最容易出错的是 `field_path`。只要 `field_path` 与 schema/前端路径不一致，前端就无法正确显示 current、候选值和历史。

### 14.1 必须保证

- `field_path` 使用点号分隔。
- 数组行使用 `0/1/2` 数字下标。
- `record_instance_id` 对应 `field_path` 前两级的 `record_instances.form_key`。
- 每个候选 event 至少写一条 evidence。
- `source_document_id` 必须是患者已归档文档。
- 日期统一为 `YYYY-MM-DD`。
- 枚举值尽量归一化为 schema `$defs` 中的枚举项。

### 14.2 推荐先做的 LLM 能力

- 单文档 EHR 抽取。
- 多文档合并候选，不直接覆盖 current。
- 候选冲突检测，依赖 `distinct_value_count`。
- evidence 坐标从 OCR payload 映射到 `bbox_json`。
- CRF 抽取复用 EHR current + 原始文档 evidence。

## 15. 代码入口索引

| 功能 | 文件 |
|---|---|
| EHR context / current / candidates service | `backend/app/services/ehr_service.py` |
| 字段值写入 service | `backend/app/services/structured_value_service.py` |
| 抽取任务 service | `backend/app/services/extraction_service.py` |
| JSON Schema 字段规划 | `backend/app/services/schema_field_planner.py` |
| EHR API 路由 | `backend/app/api/v1/patients/router.py` |
| 字段值 repository | `backend/app/repositories/field_value_repository.py` |
| 前端 EHR API | `frontend_new/src/api/patient.js` |
| 前端 Schema 表单与候选 UI | `frontend_new/src/components/SchemaForm/SchemaForm.jsx` |
| EHR schema 导入脚本 | `backend/scripts/import_ehr_schema.py` |
| 演示数据脚本 | `backend/scripts/seed_patient_ehr_demo.py` |

