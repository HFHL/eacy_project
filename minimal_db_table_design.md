# 电子病历夹 / 科研 CRF 最小数据库表设计

> 适用范围：Python + FastAPI 后端第一版。  
> 设计目标：用尽量少的表，支撑「文档上传/OCR/归档 → 患者电子病历夹抽取 → 字段候选值/当前值/历史/溯源 → 科研项目 CRF 抽取」这一最小闭环。

---

## 1. 设计原则

### 1.1 最小化原则

第一版不追求把所有概念都拆成表，而是优先保证核心业务能跑通：

1. 患者可以创建和管理。
2. 文档可以上传、OCR、元数据抽取、归档到患者。
3. EHR 模板和 CRF 模板可以驱动前端目录与表单渲染。
4. AI 抽取结果可以作为候选值进入字段值系统。
5. 人工可以选择候选值作为当前值，也可以手动修改。
6. 字段值、表格行、表格单元格都可以追溯到来源文档和 PDF 坐标。
7. 科研项目可以绑定 CRF 模板，并将患者纳入项目。
8. 患者 EHR 和科研 CRF 共用同一套字段结果表。

---

### 1.2 不要按页面建表

前端页面是：

```text
分组 → 表单 → 字段 → 值 → 候选值 / 当前值 / 历史 / 溯源
```

数据库不要为每一个页面单独建表，而应该抽象成：

```text
模板版本 schema_json
    ↓
数据上下文 data_contexts
    ↓
表单实例 record_instances
    ↓
字段值事件 field_value_events
    ↓
当前值 field_current_values
    ↓
证据溯源 field_value_evidence
```

---

### 1.3 患者 EHR 和科研 CRF 共用字段值系统

不要分别建：

```text
patient_ehr_values
project_crf_values
```

推荐统一使用：

```text
data_contexts
record_instances
field_value_events
field_current_values
field_value_evidence
```

通过 `data_contexts.context_type` 区分：

```text
patient_ehr   患者电子病历夹
project_crf   科研项目 CRF
```

---

## 2. 最小表清单

第一版建议保留 14 张业务表。

| 分组 | 表名 | 作用 |
|---|---|---|
| 基础对象 | `patients` | 患者主表 |
| 基础对象 | `documents` | 文档主表 |
| 模板 Schema | `schema_templates` | 模板主表 |
| 模板 Schema | `schema_template_versions` | 模板版本与 schema JSON |
| 结构化结果 | `data_contexts` | 数据上下文，区分 EHR / CRF |
| 结构化结果 | `record_instances` | 表单实例，解决可重复表单 |
| 结构化结果 | `field_value_events` | 字段值事件，存候选值和历史值 |
| 结构化结果 | `field_current_values` | 字段当前值，供页面快速展示 |
| 结构化结果 | `field_value_evidence` | 字段证据溯源 |
| 抽取任务 | `extraction_jobs` | 抽取任务主表 |
| 抽取任务 | `extraction_runs` | 每次实际抽取运行记录 |
| 科研项目 | `research_projects` | 科研项目主表 |
| 科研项目 | `project_patients` | 项目患者入组关系 |
| 科研项目 | `project_template_bindings` | 项目与 CRF 模板版本绑定 |

> 用户表 `users` 建议直接沿用 FastAPI boilerplate 自带表，不纳入本最小业务表清单。

---

## 3. 表关系总览

```text
patients
  ├── documents
  ├── data_contexts(context_type = patient_ehr)
  └── project_patients
          └── data_contexts(context_type = project_crf)

schema_templates
  └── schema_template_versions
          ├── data_contexts
          └── project_template_bindings

data_contexts
  └── record_instances
          ├── field_value_events
          └── field_current_values

field_value_events
  ├── field_value_evidence
  └── field_current_values.selected_event_id

extraction_jobs
  └── extraction_runs
          └── field_value_events

research_projects
  ├── project_patients
  └── project_template_bindings
```

---

# 4. 基础对象表

---

## 4.1 `patients` 患者主表

### 作用

存患者基础信息。  
患者是文档归档、电子病历夹和科研项目入组的核心主体。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 患者 ID | 主键 |
| `name` | VARCHAR(100) | 是 | 患者姓名 | 建议保留为独立字段，便于搜索 |
| `gender` | VARCHAR(20) | 否 | 性别 | 男 / 女 / 不详 |
| `birth_date` | DATE | 否 | 出生日期 | 可为空 |
| `age` | INTEGER | 否 | 年龄 | 可由出生日期推算，也可人工维护 |
| `department` | VARCHAR(100) | 否 | 科室 | 页面顶部展示 |
| `main_diagnosis` | VARCHAR(500) | 否 | 主要诊断 | 页面顶部展示 |
| `doctor_name` | VARCHAR(100) | 否 | 主治医生 | 页面顶部展示 |
| `extra_json` | JSON / JSONB | 否 | 扩展信息 | 其他患者元数据统一放这里 |
| `created_at` | DATETIME | 是 | 创建时间 |  |
| `updated_at` | DATETIME | 是 | 更新时间 |  |
| `deleted_at` | DATETIME | 否 | 软删除时间 | 第一版也可以不用软删除 |

### 建议索引

| 索引 | 字段 |
|---|---|
| `idx_patients_name` | `name` |
| `idx_patients_department` | `department` |

### 备注

患者表只存高频检索和顶部展示字段。  
不要把所有电子病历字段都塞进 `patients` 表。详细 EHR 字段应该进入字段值系统。

---

## 4.2 `documents` 文档主表

### 作用

存上传文档、OCR 结果、元数据抽取结果、归档状态。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 文档 ID | 主键 |
| `patient_id` | UUID / TEXT | 否 | 归属患者 ID | 未归档时为空 |
| `original_filename` | VARCHAR(255) | 是 | 原始文件名 |  |
| `file_ext` | VARCHAR(20) | 否 | 文件扩展名 | pdf / jpg / png / docx |
| `mime_type` | VARCHAR(100) | 否 | MIME 类型 |  |
| `file_size` | BIGINT | 否 | 文件大小 |  |
| `storage_provider` | VARCHAR(50) | 否 | 存储方式 | local / oss |
| `storage_path` | TEXT | 是 | 文件存储路径 | 本地路径或 OSS key |
| `file_url` | TEXT | 否 | 文件访问地址 | 可临时生成，不一定持久保存 |
| `status` | VARCHAR(50) | 是 | 文档状态 | uploaded / ocr_pending / ocr_completed / metadata_completed / archived / failed |
| `ocr_status` | VARCHAR(50) | 否 | OCR 状态 | pending / running / completed / failed |
| `ocr_text` | TEXT | 否 | OCR 纯文本 | 第一版可直接存在这里 |
| `ocr_payload_json` | JSON / JSONB | 否 | OCR 原始结构 | 包含页码、段落、表格等 |
| `meta_status` | VARCHAR(50) | 否 | 元数据抽取状态 | pending / running / completed / failed |
| `metadata_json` | JSON / JSONB | 否 | 元数据抽取结果 | 文档类型、患者信息、日期等 |
| `doc_type` | VARCHAR(100) | 否 | 文档主类型 | 由元数据抽取结果同步 |
| `doc_subtype` | VARCHAR(100) | 否 | 文档子类型 | 可为空 |
| `doc_title` | VARCHAR(255) | 否 | 文档标题 |  |
| `effective_at` | DATETIME | 否 | 文档发生时间 | 例如检查日期、出院日期 |
| `uploaded_by` | UUID / TEXT | 否 | 上传人 | 可关联 users |
| `archived_at` | DATETIME | 否 | 归档时间 |  |
| `created_at` | DATETIME | 是 | 创建时间 |  |
| `updated_at` | DATETIME | 是 | 更新时间 |  |

### 建议索引

| 索引 | 字段 |
|---|---|
| `idx_documents_patient_id` | `patient_id` |
| `idx_documents_status` | `status` |
| `idx_documents_doc_type` | `doc_type` |
| `idx_documents_effective_at` | `effective_at` |

### 备注

第一版不单独拆 `document_pages` 和 `document_blocks`。  
OCR 结构化结果先放 `ocr_payload_json`，后面如果 PDF 定位、段落级检索变复杂，再拆表。

---

# 5. 模板 Schema 表

---

## 5.1 `schema_templates` 模板主表

### 作用

存模板的基本信息。  
模板分为 EHR 模板和 CRF 模板。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 模板 ID | 主键 |
| `template_code` | VARCHAR(100) | 是 | 模板编码 | 例如 ehr_v2、liver_cancer_crf |
| `template_name` | VARCHAR(200) | 是 | 模板名称 | 例如 电子病历_V2 |
| `template_type` | VARCHAR(50) | 是 | 模板类型 | ehr / crf |
| `description` | TEXT | 否 | 模板说明 |  |
| `status` | VARCHAR(50) | 是 | 状态 | draft / active / archived |
| `created_by` | UUID / TEXT | 否 | 创建人 | 可关联 users |
| `created_at` | DATETIME | 是 | 创建时间 |  |
| `updated_at` | DATETIME | 是 | 更新时间 |  |

### 建议约束

| 约束 | 字段 |
|---|---|
| `uk_schema_templates_code` | `template_code` 唯一 |

### 备注

模板主表只存模板身份信息。  
真正决定前端渲染和抽取字段的是 `schema_template_versions.schema_json`。

---

## 5.2 `schema_template_versions` 模板版本表

### 作用

存具体 schema JSON。  
前端左侧目录、中间表单字段、字段类型、是否可重复、抽取来源等都由这里驱动。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 模板版本 ID | 主键 |
| `template_id` | UUID / TEXT | 是 | 模板 ID | 关联 `schema_templates.id` |
| `version_no` | INTEGER | 是 | 版本号 | 1、2、3 |
| `version_name` | VARCHAR(100) | 否 | 版本名称 | 例如 V2.0 |
| `schema_json` | JSON / JSONB | 是 | 模板结构 JSON | 核心字段 |
| `status` | VARCHAR(50) | 是 | 版本状态 | draft / published / deprecated |
| `published_at` | DATETIME | 否 | 发布时间 |  |
| `created_by` | UUID / TEXT | 否 | 创建人 | 可关联 users |
| `created_at` | DATETIME | 是 | 创建时间 |  |
| `updated_at` | DATETIME | 是 | 更新时间 |  |

### 建议约束

| 约束 | 字段 |
|---|---|
| `uk_template_version` | `template_id + version_no` 唯一 |

### `schema_json` 最小结构示例

```json
{
  "groups": [
    {
      "key": "basic",
      "title": "基本信息",
      "order": 1,
      "forms": [
        {
          "key": "demographics",
          "title": "人口学情况",
          "repeatable": false,
          "order": 1,
          "fields": [
            {
              "key": "gender",
              "path": "basic.demographics.gender",
              "title": "性别",
              "type": "single_select",
              "options": ["男", "女", "不详"],
              "required": false,
              "order": 1
            },
            {
              "key": "age",
              "path": "basic.demographics.age",
              "title": "年龄",
              "type": "number",
              "unit": "岁",
              "required": false,
              "order": 2
            }
          ]
        }
      ]
    }
  ]
}
```

### 备注

第一版不建议拆 `schema_nodes` 表。  
模板节点全部放在 `schema_json` 里，先保证灵活性和开发速度。

---

# 6. 结构化结果核心表

---

## 6.1 `data_contexts` 数据上下文表

### 作用

统一管理一份结构化数据的归属。  
同一套字段结果表既服务患者 EHR，也服务科研项目 CRF。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 上下文 ID | 主键 |
| `context_type` | VARCHAR(50) | 是 | 上下文类型 | patient_ehr / project_crf |
| `patient_id` | UUID / TEXT | 是 | 患者 ID | 关联 `patients.id` |
| `project_id` | UUID / TEXT | 否 | 科研项目 ID | EHR 场景为空 |
| `project_patient_id` | UUID / TEXT | 否 | 项目患者关系 ID | EHR 场景为空 |
| `schema_version_id` | UUID / TEXT | 是 | 模板版本 ID | 关联 `schema_template_versions.id` |
| `status` | VARCHAR(50) | 是 | 状态 | draft / extracting / reviewing / locked |
| `created_by` | UUID / TEXT | 否 | 创建人 | 可关联 users |
| `created_at` | DATETIME | 是 | 创建时间 |  |
| `updated_at` | DATETIME | 是 | 更新时间 |  |

### 建议约束

| 场景 | 约束 |
|---|---|
| 患者 EHR | `context_type = patient_ehr` 时，建议 `patient_id + schema_version_id` 唯一 |
| 项目 CRF | `context_type = project_crf` 时，建议 `project_patient_id + schema_version_id` 唯一 |

### 备注

这是连接模板和字段值系统的关键表。

示例：

```text
context_type = patient_ehr
patient_id = 高峰
project_id = null
表示：高峰的电子病历夹

context_type = project_crf
patient_id = 高峰
project_id = 肝癌研究项目
表示：高峰在该科研项目中的 CRF 数据
```

---

## 6.2 `record_instances` 表单实例表

### 作用

解决表单可重复的问题。

例如：

```text
诊断记录_1
诊断记录_2
药物治疗_1
药物治疗_2
病理_1
病理_2
```

每一个重复表单都是一条 `record_instances`。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 表单实例 ID | 主键 |
| `context_id` | UUID / TEXT | 是 | 数据上下文 ID | 关联 `data_contexts.id` |
| `group_key` | VARCHAR(100) | 否 | 分组编码 | 例如 treatment |
| `group_title` | VARCHAR(200) | 否 | 分组名称 | 例如 治疗情况 |
| `form_key` | VARCHAR(100) | 是 | 表单编码 | 例如 diagnosis、medication |
| `form_title` | VARCHAR(200) | 是 | 表单名称 | 例如 诊断记录、药物治疗 |
| `repeat_index` | INTEGER | 是 | 重复序号 | 非重复表单默认为 0 |
| `instance_label` | VARCHAR(200) | 否 | 页面显示名 | 例如 诊断记录_1 |
| `anchor_json` | JSON / JSONB | 否 | 锚点信息 | 例如诊断名称、手术日期、药物名称 |
| `source_document_id` | UUID / TEXT | 否 | 主要来源文档 | 可为空 |
| `created_by_run_id` | UUID / TEXT | 否 | 创建该实例的抽取运行 | 关联 `extraction_runs.id` |
| `review_status` | VARCHAR(50) | 是 | 审核状态 | unreviewed / reviewed / locked |
| `created_at` | DATETIME | 是 | 创建时间 |  |
| `updated_at` | DATETIME | 是 | 更新时间 |  |

### 建议约束

| 约束 | 字段 |
|---|---|
| `uk_record_instance` | `context_id + form_key + repeat_index` 唯一 |

### 备注

左侧目录中的 `#0`、`#1`、`#5` 可以由 `record_instances` 统计得到。  
不可重复表单也建议创建一条默认实例，`repeat_index = 0`，这样字段值系统可以统一处理。

---

## 6.3 `field_value_events` 字段值事件表

### 作用

存所有字段值事件。

包括：

1. AI 抽取值。
2. 人工编辑值。
3. 重新抽取值。
4. 从患者 EHR 同步到科研 CRF 的值。
5. 清空值。
6. 被拒绝的候选值。

这张表是候选值、历史值和审计记录的核心。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 字段值事件 ID | 主键 |
| `context_id` | UUID / TEXT | 是 | 数据上下文 ID | 冗余存储，便于查询 |
| `record_instance_id` | UUID / TEXT | 是 | 表单实例 ID | 关联 `record_instances.id` |
| `field_key` | VARCHAR(100) | 是 | 字段编码 | 例如 age、gender |
| `field_path` | VARCHAR(500) | 是 | 字段路径 | 例如 basic.demographics.age |
| `field_title` | VARCHAR(200) | 否 | 字段名称 | 例如 年龄 |
| `event_type` | VARCHAR(50) | 是 | 事件类型 | ai_extracted / manual_edit / imported / copy_from_ehr / cleared |
| `value_type` | VARCHAR(50) | 是 | 值类型 | text / number / date / boolean / single_select / multi_select / table / json |
| `value_text` | TEXT | 否 | 文本值 | 文本、单选可用 |
| `value_number` | DECIMAL(18,6) | 否 | 数字值 | 数字字段使用 |
| `value_date` | DATE | 否 | 日期值 | 日期字段使用 |
| `value_datetime` | DATETIME | 否 | 日期时间值 | 需要精确时间时使用 |
| `value_json` | JSON / JSONB | 否 | 复杂值 | 多选、表格、多行数据 |
| `unit` | VARCHAR(50) | 否 | 单位 | 例如 岁、mg、mmol/L |
| `normalized_text` | TEXT | 否 | 标准化文本 | 可选 |
| `confidence` | DECIMAL(5,4) | 否 | AI 置信度 | 0-1 |
| `extraction_run_id` | UUID / TEXT | 否 | 来源抽取运行 | 关联 `extraction_runs.id` |
| `source_document_id` | UUID / TEXT | 否 | 主来源文档 | 关联 `documents.id` |
| `source_event_id` | UUID / TEXT | 否 | 来源事件 ID | 用于从 EHR 同步到 CRF |
| `review_status` | VARCHAR(50) | 是 | 状态 | candidate / accepted / rejected / superseded |
| `created_by` | UUID / TEXT | 否 | 创建人 | system 或 users.id |
| `created_at` | DATETIME | 是 | 创建时间 |  |
| `note` | TEXT | 否 | 备注 |  |

### 建议索引

| 索引 | 字段 |
|---|---|
| `idx_field_events_context` | `context_id` |
| `idx_field_events_instance` | `record_instance_id` |
| `idx_field_events_field_path` | `field_path` |
| `idx_field_events_run` | `extraction_run_id` |
| `idx_field_events_doc` | `source_document_id` |

### 备注

不要只存最终值。  
AI 抽取出来的每个候选值、人工修改的每个值，都应该进入 `field_value_events`。

普通字段示例：

```text
field_key = age
value_type = number
value_number = 38
unit = 岁
```

表格字段示例：

```json
[
  {
    "row_id": "row_001",
    "drug_name": "奥沙利铂",
    "dose": "130mg",
    "start_date": "2024-01-01"
  },
  {
    "row_id": "row_002",
    "drug_name": "卡培他滨",
    "dose": "1000mg",
    "start_date": "2024-01-02"
  }
]
```

表格中的每一行必须有稳定的 `row_id`，用于证据溯源。

---

## 6.4 `field_current_values` 字段当前值表

### 作用

存每个字段当前被选中的值。  
页面中间表单展示的主要就是这张表。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 当前值 ID | 主键 |
| `context_id` | UUID / TEXT | 是 | 数据上下文 ID | 关联 `data_contexts.id` |
| `record_instance_id` | UUID / TEXT | 是 | 表单实例 ID | 关联 `record_instances.id` |
| `field_key` | VARCHAR(100) | 是 | 字段编码 |  |
| `field_path` | VARCHAR(500) | 是 | 字段路径 | 与 schema 对齐 |
| `selected_event_id` | UUID / TEXT | 否 | 当前选中的事件 ID | 关联 `field_value_events.id` |
| `value_type` | VARCHAR(50) | 是 | 值类型 | 与事件表一致 |
| `value_text` | TEXT | 否 | 当前文本值 |  |
| `value_number` | DECIMAL(18,6) | 否 | 当前数字值 |  |
| `value_date` | DATE | 否 | 当前日期值 |  |
| `value_datetime` | DATETIME | 否 | 当前日期时间值 |  |
| `value_json` | JSON / JSONB | 否 | 当前复杂值 | 多选、表格等 |
| `unit` | VARCHAR(50) | 否 | 单位 |  |
| `selected_by` | UUID / TEXT | 否 | 选择人 | system 或 users.id |
| `selected_at` | DATETIME | 否 | 选择时间 |  |
| `review_status` | VARCHAR(50) | 是 | 审核状态 | unreviewed / confirmed / locked |
| `updated_at` | DATETIME | 是 | 更新时间 |  |

### 建议约束

| 约束 | 字段 |
|---|---|
| `uk_current_field` | `context_id + record_instance_id + field_path` 唯一 |

### 备注

候选值可以有很多个，但当前值只能有一个。  
人工编辑字段时，建议先向 `field_value_events` 插入一条 `manual_edit` 事件，再把 `field_current_values.selected_event_id` 指向这条事件。

---

## 6.5 `field_value_evidence` 字段证据表

### 作用

存字段值的证据来源。  
支持普通字段、表格行、表格单元格级别溯源。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 证据 ID | 主键 |
| `value_event_id` | UUID / TEXT | 是 | 字段值事件 ID | 关联 `field_value_events.id` |
| `document_id` | UUID / TEXT | 是 | 来源文档 ID | 关联 `documents.id` |
| `page_no` | INTEGER | 否 | 页码 | 从 1 开始，或与前端约定 |
| `bbox_json` | JSON / JSONB | 否 | PDF 坐标 | 例如 x,y,w,h 或 polygon |
| `quote_text` | TEXT | 否 | 原文片段 | 用于右侧证据展示 |
| `evidence_type` | VARCHAR(50) | 是 | 证据类型 | field / table_row / table_cell |
| `row_key` | VARCHAR(100) | 否 | 表格行 ID | 例如 row_001 |
| `cell_key` | VARCHAR(100) | 否 | 表格列 key | 例如 dose、drug_name |
| `start_offset` | INTEGER | 否 | 文本起始位置 | 基于 OCR 文本 |
| `end_offset` | INTEGER | 否 | 文本结束位置 | 基于 OCR 文本 |
| `evidence_score` | DECIMAL(5,4) | 否 | 证据置信度 | 0-1 |
| `created_at` | DATETIME | 是 | 创建时间 |  |

### 建议索引

| 索引 | 字段 |
|---|---|
| `idx_evidence_event` | `value_event_id` |
| `idx_evidence_document` | `document_id` |
| `idx_evidence_row_cell` | `row_key + cell_key` |

### 备注

这张表要支持三个层次的溯源：

#### 普通字段溯源

```text
evidence_type = field
row_key = null
cell_key = null
quote_text = 高峰
```

#### 表格行溯源

```text
evidence_type = table_row
row_key = row_001
cell_key = null
quote_text = 奥沙利铂 130mg 2024-01-01
```

#### 表格单元格溯源

```text
evidence_type = table_cell
row_key = row_001
cell_key = dose
quote_text = 130mg
```

这样才能支持“表格每一行、甚至每个单元格来自不同文档”的需求。

---

# 7. 抽取任务表

---

## 7.1 `extraction_jobs` 抽取任务表

### 作用

记录用户或系统发起的一次抽取任务。

例如：

```text
OCR 任务
元数据抽取任务
患者 EHR 抽取任务
项目 CRF 抽取任务
靶向抽取任务
物化任务
```

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 任务 ID | 主键 |
| `job_type` | VARCHAR(50) | 是 | 任务类型 | ocr / metadata / patient_ehr / project_crf / targeted / materialize |
| `status` | VARCHAR(50) | 是 | 任务状态 | pending / running / completed / failed / cancelled / partial_success |
| `priority` | INTEGER | 否 | 优先级 | 默认 0 |
| `patient_id` | UUID / TEXT | 否 | 患者 ID | 可为空 |
| `document_id` | UUID / TEXT | 否 | 文档 ID | 单文档任务使用 |
| `project_id` | UUID / TEXT | 否 | 项目 ID | CRF 任务使用 |
| `project_patient_id` | UUID / TEXT | 否 | 项目患者 ID | CRF 任务使用 |
| `context_id` | UUID / TEXT | 否 | 数据上下文 ID | EHR / CRF 抽取时使用 |
| `schema_version_id` | UUID / TEXT | 否 | 模板版本 ID |  |
| `target_form_key` | VARCHAR(100) | 否 | 靶向表单 key | 靶向抽取使用 |
| `input_json` | JSON / JSONB | 否 | 任务输入参数 | 文档列表、字段范围等 |
| `progress` | INTEGER | 否 | 进度 | 0-100 |
| `error_message` | TEXT | 否 | 错误信息 |  |
| `requested_by` | UUID / TEXT | 否 | 发起人 | system 或 users.id |
| `started_at` | DATETIME | 否 | 开始时间 |  |
| `finished_at` | DATETIME | 否 | 结束时间 |  |
| `created_at` | DATETIME | 是 | 创建时间 |  |
| `updated_at` | DATETIME | 是 | 更新时间 |  |

### 建议索引

| 索引 | 字段 |
|---|---|
| `idx_jobs_status` | `status` |
| `idx_jobs_type` | `job_type` |
| `idx_jobs_document` | `document_id` |
| `idx_jobs_context` | `context_id` |

### 备注

`extraction_jobs` 是任务入口，适合给前端展示任务列表和任务进度。  
真正每次执行的细节放在 `extraction_runs`。

---

## 7.2 `extraction_runs` 抽取运行表

### 作用

记录一次任务的实际运行。  
一个 job 可以有多次 run，用于失败重试和审计。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 运行 ID | 主键 |
| `job_id` | UUID / TEXT | 是 | 任务 ID | 关联 `extraction_jobs.id` |
| `run_no` | INTEGER | 是 | 第几次运行 | 1、2、3 |
| `status` | VARCHAR(50) | 是 | 运行状态 | running / completed / failed / cancelled |
| `model_name` | VARCHAR(200) | 否 | 使用的模型 | LLM 或 OCR 模型 |
| `prompt_version` | VARCHAR(100) | 否 | prompt 版本 |  |
| `input_snapshot_json` | JSON / JSONB | 否 | 输入快照 | OCR 文本、schema 片段等 |
| `raw_output_json` | JSON / JSONB | 否 | 原始输出 | LLM/OCR 原始响应 |
| `parsed_output_json` | JSON / JSONB | 否 | 解析后结果 | 入库前结构 |
| `validation_status` | VARCHAR(50) | 否 | 校验状态 | passed / failed / partial |
| `error_message` | TEXT | 否 | 错误信息 |  |
| `started_at` | DATETIME | 否 | 开始时间 |  |
| `finished_at` | DATETIME | 否 | 结束时间 |  |
| `created_at` | DATETIME | 是 | 创建时间 |  |

### 建议约束

| 约束 | 字段 |
|---|---|
| `uk_job_run_no` | `job_id + run_no` 唯一 |

### 备注

字段值事件表中的 `extraction_run_id` 指向这里。  
这样可以知道某个字段值到底是哪一次模型运行产生的。

---

# 8. 科研项目表

---

## 8.1 `research_projects` 科研项目表

### 作用

存科研项目基础信息。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 项目 ID | 主键 |
| `project_code` | VARCHAR(100) | 是 | 项目编码 | 唯一 |
| `project_name` | VARCHAR(200) | 是 | 项目名称 |  |
| `description` | TEXT | 否 | 项目说明 |  |
| `status` | VARCHAR(50) | 是 | 项目状态 | draft / active / archived |
| `owner_id` | UUID / TEXT | 否 | 项目负责人 | 可关联 users |
| `start_date` | DATE | 否 | 开始日期 |  |
| `end_date` | DATE | 否 | 结束日期 |  |
| `extra_json` | JSON / JSONB | 否 | 扩展信息 |  |
| `created_at` | DATETIME | 是 | 创建时间 |  |
| `updated_at` | DATETIME | 是 | 更新时间 |  |

### 建议约束

| 约束 | 字段 |
|---|---|
| `uk_project_code` | `project_code` 唯一 |

---

## 8.2 `project_patients` 项目患者表

### 作用

记录患者入组到科研项目的关系。  
一个患者可以进入多个科研项目。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 项目患者关系 ID | 主键 |
| `project_id` | UUID / TEXT | 是 | 科研项目 ID | 关联 `research_projects.id` |
| `patient_id` | UUID / TEXT | 是 | 患者 ID | 关联 `patients.id` |
| `enroll_no` | VARCHAR(100) | 否 | 入组编号 | 项目内编号 |
| `status` | VARCHAR(50) | 是 | 入组状态 | enrolled / withdrawn / excluded |
| `enrolled_at` | DATETIME | 否 | 入组时间 |  |
| `withdrawn_at` | DATETIME | 否 | 退出时间 |  |
| `extra_json` | JSON / JSONB | 否 | 扩展信息 |  |
| `created_at` | DATETIME | 是 | 创建时间 |  |
| `updated_at` | DATETIME | 是 | 更新时间 |  |

### 建议约束

| 约束 | 字段 |
|---|---|
| `uk_project_patient` | `project_id + patient_id` 唯一 |

### 备注

项目 CRF 的 `data_contexts.project_patient_id` 会关联这张表。

---

## 8.3 `project_template_bindings` 项目模板绑定表

### 作用

记录科研项目使用哪个 CRF 模板版本。

### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|---|---|---:|---|---|
| `id` | UUID / TEXT | 是 | 绑定 ID | 主键 |
| `project_id` | UUID / TEXT | 是 | 科研项目 ID | 关联 `research_projects.id` |
| `template_id` | UUID / TEXT | 是 | 模板 ID | 关联 `schema_templates.id` |
| `schema_version_id` | UUID / TEXT | 是 | 模板版本 ID | 关联 `schema_template_versions.id` |
| `binding_type` | VARCHAR(50) | 是 | 绑定类型 | primary_crf / secondary_crf |
| `status` | VARCHAR(50) | 是 | 状态 | active / disabled |
| `locked_at` | DATETIME | 否 | 锁定时间 | 项目开始后建议锁定版本 |
| `created_at` | DATETIME | 是 | 创建时间 |  |
| `updated_at` | DATETIME | 是 | 更新时间 |  |

### 建议约束

| 约束 | 字段 |
|---|---|
| `uk_project_template_binding` | `project_id + schema_version_id + binding_type` 唯一 |

### 备注

科研项目一旦开始抽取，建议绑定固定模板版本。  
不要直接绑定“模板主表”，否则模板一改，历史项目数据的解释就会变化。

---

# 9. 关键业务写入规则

---

## 9.1 创建患者 EHR

当创建患者或首次进入电子病历夹时：

```text
1. 查询当前 active 的 EHR schema_template_version。
2. 创建 data_contexts：
   context_type = patient_ehr
   patient_id = 当前患者
   schema_version_id = 当前 EHR 模板版本
3. 根据 schema_json 中的非重复表单，初始化 record_instances：
   repeat_index = 0
```

---

## 9.2 文档归档到患者

```text
1. 更新 documents.patient_id。
2. 更新 documents.status = archived。
3. 如果患者没有 EHR data_context，则创建。
4. 如果文档已有抽取结果，可以触发 materialize 或 patient_ehr 抽取任务。
```

---

## 9.3 AI 抽取字段值

```text
1. 创建 extraction_jobs。
2. 创建 extraction_runs。
3. 按抽取结果找到或创建 record_instances。
4. 每个字段候选值插入 field_value_events。
5. 每个字段证据插入 field_value_evidence。
6. 如果字段没有人工确认过，可以自动 upsert field_current_values。
```

---

## 9.4 人工选择候选值作为当前值

```text
1. 用户选择某条 field_value_events。
2. 更新 field_current_values.selected_event_id。
3. 同步 current 表中的 value_text / value_number / value_json。
4. 将该 event 的 review_status 改为 accepted。
5. 同字段其他候选值可保持 candidate 或改为 superseded。
```

---

## 9.5 人工编辑字段

```text
1. 新增一条 field_value_events：
   event_type = manual_edit
2. 如有备注，写入 note。
3. 更新 field_current_values 指向新 event。
4. 保留历史事件，不删除旧值。
```

---

## 9.6 表格字段溯源

表格字段整体值存入：

```text
field_value_events.value_json
```

每一行必须有 `row_id`：

```json
[
  {
    "row_id": "row_001",
    "drug_name": "奥沙利铂",
    "dose": "130mg"
  }
]
```

证据存入：

```text
field_value_evidence
```

如果整行来自一个来源：

```text
evidence_type = table_row
row_key = row_001
cell_key = null
```

如果单元格来自不同来源：

```text
evidence_type = table_cell
row_key = row_001
cell_key = dose
```

---

## 9.7 科研项目 CRF 创建

当患者被加入科研项目后：

```text
1. 查询 project_template_bindings 中 active 的 CRF 模板版本。
2. 创建 data_contexts：
   context_type = project_crf
   patient_id = 当前患者
   project_id = 当前项目
   project_patient_id = 当前项目患者关系
   schema_version_id = 项目绑定的 CRF 模板版本
3. 初始化非重复表单 record_instances。
```

---

# 10. 第一版暂不设计的表

以下表第一版可以暂时不建：

| 表名 | 暂不建原因 |
|---|---|
| `schema_nodes` | schema 先整体存在 `schema_json`，避免过早复杂化 |
| `document_pages` | OCR 页级结构先放 `ocr_payload_json` |
| `document_blocks` | OCR block 先放 JSON，后续再拆 |
| `audit_logs` | 字段历史已经由 `field_value_events` 支撑 |
| `llm_call_logs` | 第一版可先放 `extraction_runs.raw_output_json` |
| `quality_rules` | 校验规则先放 schema_json |
| `field_locks` | 第一版用 `field_current_values.review_status = locked` |
| `export_jobs` | 导出功能后置 |
| `roles` / `permissions` | 可先使用 boilerplate 自带权限体系 |

---

# 11. 最小闭环对应表

| 业务动作 | 涉及表 |
|---|---|
| 上传文档 | `documents` |
| OCR 完成 | `documents.ocr_text`, `documents.ocr_payload_json`, `extraction_jobs`, `extraction_runs` |
| 元数据抽取 | `documents.metadata_json`, `documents.doc_type`, `extraction_jobs`, `extraction_runs` |
| 归档到患者 | `documents.patient_id`, `data_contexts` |
| 打开电子病历夹 | `schema_template_versions`, `data_contexts`, `record_instances`, `field_current_values` |
| AI 抽取 EHR | `extraction_jobs`, `extraction_runs`, `field_value_events`, `field_value_evidence`, `field_current_values` |
| 查看字段候选值 | `field_value_events` |
| 查看字段来源 | `field_value_evidence`, `documents` |
| 人工确认字段 | `field_current_values`, `field_value_events` |
| 创建科研项目 | `research_projects` |
| 绑定 CRF 模板 | `project_template_bindings` |
| 患者入组 | `project_patients`, `data_contexts` |
| 项目 CRF 抽取 | `extraction_jobs`, `extraction_runs`, `field_value_events`, `field_value_evidence`, `field_current_values` |

---

# 12. 最终总结

第一版数据库设计的核心不是表多，而是边界清楚。

最小表结构是：

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

其中最关键的是：

```text
data_contexts
record_instances
field_value_events
field_current_values
field_value_evidence
```

这 5 张表负责支撑：

```text
患者 EHR
科研 CRF
可重复表单
字段候选值
字段当前值
字段历史
字段证据溯源
表格行级溯源
表格单元格级溯源
```

只要这 5 张表设计稳定，前端复杂表单和后端 AI 抽取结果落库就可以统一起来。
