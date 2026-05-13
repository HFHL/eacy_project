---
type: index
module: AI抽取
status: draft
audience: [tech-lead, integrator, reviewer]
code_path:
  - backend/app/api/v1/extraction/router.py
  - backend/app/services/extraction_service.py
  - backend/app/services/extraction_planner.py
  - backend/app/services/schema_field_planner.py
  - backend/app/services/llm_ehr_extractor.py
  - backend/app/services/structured_value_service.py
  - backend/app/services/evidence_location_resolver.py
  - backend/app/services/task_progress_service.py
  - backend/app/workers/extraction_tasks.py
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# AI 抽取

> AI 抽取是 EACY 的"价值闭环"中枢：把已 OCR 的医疗文档 → 按 Schema 模板 → 结构化为可审、可改、可溯源的字段值。本域上接 [[文档与OCR/README]]，下接 [[Schema模板与CRF/README]] 与 [[科研项目与数据集/README]]。

## 在端到端链路中的位置

```text
[文档与OCR] ──OCR 文本+坐标──→ [AI抽取]
                                ├─ 抽取规划 (form_key 候选)
                                ├─ LLM 抽取 (字段值 + quote_text)
                                ├─ 证据归因 (定位回 OCR 坐标)
                                └─ 落库 (FieldCurrentValue / Event / Evidence)
                                          ↓
                              [Schema 模板] 当前值 + 历史 + 证据
                                          ↓
                              [人工审核] / [科研数据集导出]
```

完整链路见 [[端到端数据流]] 的 [4][5][6] 阶段。

## 文档清单

| 文档 | 内容 |
|---|---|
| [[业务概述]] | 角色定位、核心模型（DataContext / ExtractionJob / ExtractionRun / FieldCurrentValue / Event / Evidence）、与上下游域的关系 |
| [[业务流程-Schema字段规划]] | ExtractionPlanner + SchemaFieldPlanner：从 doc_type 到 form_key 到 SchemaField 清单 |
| [[业务流程-抽取任务生命周期]] | Job 状态机、Run 与 Job 关系、自动重试与失败处理 |
| [[业务流程-病例EHR批量更新]] | `update_patient_ehr_folder` 的批量编排（项目 CRF 版本同形） |
| [[关键设计-证据归因机制]] | LLM `quote_text` 与 OCR 坐标的对齐、`FieldValueEvidence` 的契约 |
| [[关键设计-字段值历史与变更链]] | `FieldCurrentValue` ⇄ `FieldValueEvent` 双表协作、AI vs 人工的区分 |
| [[关键设计-嵌套字段与RecordInstance]] | 用药记录等可重复字段如何建模与扁平化写入 |
| [[关键设计-异步任务进度追踪]] | `TaskProgressService` + `async_task` 表 + 前端轮询 |
| [[验收要点]] | 8 条覆盖证据正确性、历史可见、批量进度、失败重试 |

## 与其他业务域的关系

| 关系方向 | 对方域 | 关联点 |
|---|---|---|
| 上游 | [[文档与OCR/README]] | 抽取依赖 `document.parsed_data` / `ocr_payload_json`（OCR 文本 + 坐标） |
| 上游 | [[Schema模板与CRF/README]] | 模板版本号决定可抽取字段清单与 `record_form_key` |
| 平行 | [[病例管理/README]] | `patient_ehr` 任务挂在病例上；`update-folder` 批量入口由病例详情触发 |
| 下游 | [[科研项目与数据集/README]] | `project_crf` 任务为某项目-病例落 `FieldCurrentValue`；导出读这张表 |
| 平行 | [[管理后台/README]] | `async_task_batch / item / event` 表统一观测，由前端 `globalBackgroundTaskPoller` 轮询 |

## 关键代码锚点

- 路由：`backend/app/api/v1/extraction/router.py`（任务 CRUD、重试、取消）
- 服务：`backend/app/services/extraction_service.py`（核心编排，1200+ 行）
- 规划：`backend/app/services/extraction_planner.py`（doc_type → form_key）
- 字段：`backend/app/services/schema_field_planner.py`（schema_json → SchemaField[]）
- LLM：`backend/app/services/llm_ehr_extractor.py`（LangGraph 4 节点）
- 回退：`backend/app/services/simple_ehr_extractor.py`（无 LLM 时的规则式抽取）
- 证据：`backend/app/services/evidence_location_resolver.py`（坐标对齐）
- 落库：`backend/app/services/structured_value_service.py`（三表 UPSERT）
- 进度：`backend/app/services/task_progress_service.py`（批/项/事件三层观测）
- Worker：`backend/app/workers/extraction_tasks.py`（Celery 入口 + 重试）
- 表：[[表-extraction_job]] [[表-extraction_run]] [[表-field_current_value]] [[表-field_value_event]] [[表-field_value_evidence]] [[表-data_context]] [[表-record_instance]] [[表-async_task_batch]] [[表-async_task_item]] [[表-async_task_event]]
