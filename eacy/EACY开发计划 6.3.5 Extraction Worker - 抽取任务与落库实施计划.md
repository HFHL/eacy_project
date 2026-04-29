---
title: EACY开发计划 6.3.5 Extraction Worker - 抽取任务与落库实施计划
tags:
  - eacy/backend
  - eacy/worker
  - eacy/extraction
  - eacy/database
status: active
updated: 2026-04-29
aliases:
  - Extraction Worker 实施计划
  - 抽取 Worker TODO
---

# EACY开发计划 6.3.5 Extraction Worker - 抽取任务与落库实施计划

> [!important]
> 本计划基于 [[EHR-CRF 数据库与抽取落库设计]]。目标是先打通 Celery extraction worker 与现有抽取落库服务，保证 job/run/status/current/candidate/evidence 闭环可运行；后续再接入 LLM 和 `x-merge-binding` 实例归并。

## 背景结论

- `extraction_jobs` / `extraction_runs` 表和 API 已存在。
- `StructuredValueService.record_ai_extracted_value()` 已能写入候选事件、evidence，并在 current 为空时自动设为当前值。
- `ExtractionService.create_and_process_job()` 当前是同步处理，不适合 worker 复用已有 job。
- `backend/app/workers/extraction_tasks.py` 目前仍是占位实现。

## 本阶段目标

1. 把抽取执行逻辑拆成“创建 job”和“处理已有 job”。
2. 实现 Celery extraction worker：按 `job_id` 执行已有 job。
3. 增加失败状态落库：job/run 均记录失败和错误信息。
4. 保持现有 API 行为兼容，暂不强制改成异步入队。
5. 为后续 LLM extractor 和 `RecordMergeResolver` 留清晰入口。

## TODO

- [x] 阅读 EHR/CRF 抽取落库设计，确认 candidate/current/evidence 规则。
- [x] 梳理现有 `ExtractionService`、`StructuredValueService`、Celery worker 代码。
- [x] 新增 `ExtractionService.process_existing_job(job_id)`，复用已有 pending/running job。
- [x] 抽出 run 执行公共方法，避免 create/retry/worker 三套逻辑分叉。
- [x] 在异常时更新 `extraction_jobs.status = failed` 与 `extraction_runs.status = failed`。
- [x] 实现 `process_extraction_job(job_id)` Celery task，参考 OCR/metadata worker 的 async DB session 包装。
- [x] 补充 worker/service 测试，覆盖成功处理、任务注册、失败状态。
- [x] 运行 extraction/worker 相关测试。

## 非本阶段范围

- [ ] 将 `POST /api/v1/extraction-jobs` 改为真正异步入队。
- [ ] 接入真实 LLM provider。
- [ ] 实现 `x-merge-binding` 的 `RecordMergeResolver`。
- [ ] CRF 专用 project context 抽取。

## 实施备注

- Worker 应只接收 `job_id`，不要在 Celery 参数里传患者、文档、schema 快照，避免重试时状态不一致。
- `process_existing_job()` 应重新从数据库读取 job，检查 job 存在且非 `cancelled`。
- 每次执行都创建新的 `ExtractionRun`，`run_no = len(existing_runs) + 1`。
- 抽取结果仍使用现有 flat `fields[]` 格式；后续 LLM record 级输出在 `_write_extracted_values()` 前增加 normalization/merge 阶段。

## 6.3.6 真实 LLM / LangGraph 接入记录

### 旧项目可复用点

- 可复用 `TaskRoot -> 单文档 OCR blocks -> LLM JSON -> 校验/修复` 的思路。
- 可复用 prompt 中要求 `result + audit/evidence`、证据必须来自原文的约束。
- 可复用 `x-sources` 按文档子类型筛选抽取单元的方向，但本阶段先做单文档全字段候选。

### 与当前设计冲突点

- 旧项目 materializer 写 `schema_instances/section_instances/field_value_candidates`，当前真实库应写 `data_contexts/record_instances/field_value_events/field_current_values/field_value_evidence`。
- 旧项目让 LLM 输出任务 root 下的嵌套 `result`，并由旧 materializer 决定 section repeat；当前设计要求最终必须落为标准 `field_path`，候选先进入 `field_value_events`。
- 旧项目在重复 section 上存在按 document 或 anchor 找旧实例的逻辑；当前设计明确要求 `x-merge-binding` 在写库前由后端 resolver 决定 index，不让 LLM 直接决定 `_1/_2/_3`。
- 旧项目使用 ADK/LiteLLM；当前要求使用 LangGraph，因此只复用 prompt/流程思想，不复用 ADK runner。

### 当前实现策略

- 新增 `LlmEhrExtractor`，用 LangGraph 编排 `prepare -> call_llm -> normalize`。
- prompt 推荐 LLM 输出 `records[]`，但 normalize 会转换成当前落库需要的 flat `fields[]`。
- `EACY_EXTRACTION_STRATEGY=llm/langgraph/multi_agent` 时启用真实 LLM，否则保留 `SimpleEhrExtractor`。
- 本阶段仍不实现 `RecordMergeResolver`，但 prompt 明确禁止 LLM 自行决定展示编号；后续 resolver 接在 normalize 与 `_write_extracted_values()` 之间。

## 6.3.7 病历夹抽取任务编排、内部重试与 Job 重试 TODO

### 当前状态

- [x] 基础任务编排：`ExtractionService._process_job()` 已统一创建 run、调用 extractor、写候选值/evidence/current、更新 job/run 状态。
- [x] Worker 执行入口：`process_extraction_job(job_id)` 已能通过 Celery 执行已有 job。
- [x] LangGraph 基础链路：`LlmEhrExtractor` 已实现 `prepare -> call_llm -> normalize`。
- [ ] 内部重试：尚未实现 LLM 输出解析失败、结构校验失败、字段证据不完整时的图内自修复循环。
- [ ] Job 重试失败落库：`retry_job()` 已有入口，但失败时继续抛异常会触发事务 rollback，可能导致 failed 状态没有持久化。

### TODO 与实现方式

- [x] 修正 `retry_job()` 的失败状态持久化。
  - 实现方式：把 `_process_job(..., raise_on_failure=True)` 改成不会回滚失败状态的双阶段策略；推荐新增 `process_retry_job(job_id)` 或让 `retry_job()` 使用 `raise_on_failure=False` 后再按 API 需要返回 failed job。
  - 关键点：`_mark_failed()` 写入 `extraction_runs.status = failed` 和 `extraction_jobs.status = failed` 后必须 commit；不要在同一个 `@Transactional()` 中继续 raise 导致 rollback。
  - 验证方式：构造 document 缺失/LLM 异常场景，调用 `retry_job()` 后断言 job/run 均为 `failed`，且 `run_no` 递增。

- [x] 为 LangGraph 增加内部 validation/retry loop。
  - 实现方式：将当前 `prepare -> call_llm -> normalize` 扩展为 `prepare -> call_llm -> validate -> normalize`，并增加条件边：`validate` 失败且 `attempt < max_attempts` 时回到 `call_llm`。
  - State 增加字段：`attempt`、`max_attempts`、`validation_errors`、`repair_prompt`、`validation_status`。
  - `call_llm` 节点在第 1 次使用正常 prompt，后续使用 `repair_prompt`，要求模型只修复 JSON 输出，不重新发挥。
  - 验证方式：mock 第一次返回非 JSON/缺字段，第二次返回合法 JSON，断言最终成功且 `attempt = 2`。

- [x] 实现 LLM 输出 JSON 解析失败的修复重试。
  - 实现方式：`_parse_json_content()` 不直接终止整个 job；将原始 content 和解析错误写入 state，由 `validate` 生成 repair prompt。
  - repair prompt 内容：说明 JSON parse error、要求输出严格 JSON object、禁止 Markdown fence、保留原抽取含义。
  - 验证方式：mock 返回带多余解释或截断 JSON，确认第二轮可修复。

- [x] 实现结构校验：顶层必须有 `records[]` 或 `fields[]`。
  - 实现方式：新增 `_validate_raw_output(raw_output, field_specs)`；要求顶层是 object，且至少包含非空 `records` 或 `fields`。
  - 对 `fields[]`：每项必须有可识别 `field_path`，且能匹配 schema 字段或 indexed path 去下标后匹配 schema 字段。
  - 对 `records[]`：每项必须有 `form_path` 和 `record`，`form_path` 必须匹配某个 `record_form_key`。
  - 验证方式：mock 返回错误 form_path/field_path，断言进入 repair loop，而不是写入无效候选。

- [x] 实现值类型与槽位校验。
  - 实现方式：normalize 前校验每个字段只允许写一个值槽位；`text/number/date/datetime/json` 必须分别落到 `value_text/value_number/value_date/value_datetime/value_json`。
  - 日期校验：`date` 必须是 `YYYY-MM-DD`；`datetime` 必须是可解析 ISO 字符串；不合法时生成 repair prompt。
  - 验证方式：mock 返回 `value_type=date` 但值为 `2026年4月10日`，确认 repair 后为 `2026-04-10`。

- [x] 实现枚举值归一化与校验。
  - 实现方式：利用 `SchemaField.options`；如果 LLM 输出不在 enum/options 中，先做本地包含匹配/同义归一，仍失败则进入 repair loop。
  - 注意：不要随意发明 enum；无法归一时丢弃该字段或要求模型修复。
  - 验证方式：`性别` options 为 `男/女`，mock 返回 `男性`，本地归一为 `男`。

- [x] 实现 evidence 基础校验与落库增强。
  - 实现方式：prompt 继续要求 `quote_text` 来自原文；validate 检查 `quote_text` 是否为 OCR 文本子串。
  - normalize 时保留字段级 evidence：当前 `_write_extracted_values()` 只读 `quote_text`，后续可扩展支持 `evidences[]` 中的 `page_no/bbox_json/start_offset/end_offset`。
  - 验证方式：mock 返回不存在于 OCR 的 quote，确认进入 repair 或降级丢弃 quote。

- [x] 在 `extraction_runs` 中记录内部重试轨迹。
  - 实现方式：`LlmEhrExtractor.extract()` 返回 `validation_log`、`attempt_count`、`raw_output`；`ExtractionService._process_job()` 将这些写入 `run.parsed_output_json` 或 `run.raw_output_json`。
  - 推荐结构：`parsed_output_json = { fields, validation_status, validation_log, attempt_count }`。
  - 验证方式：测试 run 的 parsed output 包含每轮错误和最终成功状态。

- [x] 实现 job 级 retry 的幂等策略。
  - 实现方式：每次 job retry 创建新 run，但不要删除旧 run/events；新 run 写入新的 candidate events，通过 `extraction_run_id` 区分来源。
  - current 为空才自动选中；已有 current 不覆盖，保持当前 `StructuredValueService.record_ai_extracted_value(auto_select_if_empty=True)` 语义。
  - 验证方式：同一字段已有 current，再 retry 抽到不同值，应新增 candidate，但 current 不变。

- [x] 增加 Celery task 级自动重试策略。
  - 实现方式：给 `@celery_app.task` 增加 `autoretry_for`、`retry_backoff`、`retry_kwargs`，仅对临时错误启用，如网络超时、数据库连接瞬断。
  - 注意：业务错误如 document 不属于 patient、schema 缺失，不应 Celery 自动重试，应直接 failed。
  - 验证方式：mock LLM timeout 第一次失败第二次成功，确认 Celery retry 后 job completed；mock schema missing 不 retry。

- [x] 增加 job 状态机约束。
  - 实现方式：定义允许流转：`pending -> running -> completed/failed/cancelled`，`failed -> running` 仅通过 retry，`completed` 默认不允许 process。
  - 在 `process_existing_job()` 和 `retry_job()` 中集中校验，避免 worker 重复消费 completed job。
  - 验证方式：completed job 调 worker 返回 conflict；failed job 调 retry 可进入 running 并生成新 run。

- [x] 为后续 `RecordMergeResolver` 预留图节点。
  - 实现方式：LangGraph normalize 后增加可选节点 `resolve_merge`，输入 `records[]/fields[] + schema + context current values`，输出带最终 index 的 `fields[]`。
  - 当前阶段先不查库，保留接口和 state 字段：`merge_decisions`、`resolved_fields`。
  - 验证方式：单元测试先覆盖无 resolver 时直通；后续实现 resolver 后补 anchor/group_key 命中测试。

### 实施记录（2026-04-29）

- 已实现 `retry_job()` 失败状态持久化：retry 使用不回滚失败状态的处理路径，`_mark_failed()` 保存 run/job failed 后显式 commit；失败 retry 会创建新的 run，旧 run/events 保留。
- 已实现 LangGraph `prepare -> call_llm -> validate -> normalize -> resolve_merge`，`validate` 失败且未超过 `max_attempts` 时回到 `call_llm`，后续请求使用 `repair_prompt`。
- 已实现 JSON parse error 修复重试：LLM 原始输出和 parse error 写入 state，由 validate 生成严格 JSON 修复 prompt。
- 已实现 raw output 结构校验：顶层必须包含非空 `records[]` 或 `fields[]`；校验 field_path、indexed path、form_path 与 schema form。
- 已实现值类型与槽位校验：限制单字段单槽位，校验 `value_type` 对应槽位，校验 `date` 为 `YYYY-MM-DD`、`datetime` 为 ISO 字符串。
- 已实现枚举归一化与校验：基于 `SchemaField.options` 做本地同义/包含归一（如 `男性 -> 男`），无法归一则进入 repair loop。
- 已实现 evidence 校验与落库增强：校验 `quote_text` 为 OCR 子串；normalize 保留 `evidences[]`，落库支持 `page_no/bbox_json/start_offset/end_offset`。
- 已实现 run 内部重试轨迹记录：`parsed_output_json` 写入 `{ fields, validation_status, validation_log, attempt_count, raw_output }`。
- 已保持 job retry 幂等策略：每次 retry 新建 run；candidate 通过 `extraction_run_id` 区分；current 自动选择仍沿用 `auto_select_if_empty=True`，已有 current 不覆盖。
- 已实现 Celery task transient retry：`process_extraction_job` 增加 `autoretry_for`、`retry_backoff`、`retry_kwargs`，仅透传临时错误触发 Celery 自动重试，业务错误落 failed。
- 已实现 job 状态机约束：`completed/cancelled` 不允许普通 process；`failed` 必须 retry；`running/cancelled` 不允许 retry。
- 已预留 `resolve_merge` 图节点：当前 passthrough，后续可接入 `RecordMergeResolver` 输出最终 index 字段。

验证：

```bash
cd backend && .venv/bin/pytest tests/services/test_llm_ehr_extractor.py \
  tests/services/test_service_layer.py::test_extraction_service_process_existing_job_marks_failed_without_raising \
  tests/services/test_service_layer.py::test_extraction_service_retry_marks_failed_and_creates_new_run \
  tests/services/test_service_layer.py::test_extraction_service_rejects_failed_job_without_retry \
  tests/app/test_worker_framework.py -q
# 11 passed in 0.28s
```


### 复用改造记录（2026-04-29）

- 已将抽取服务扩展为通用 schema/context 抽取：`patient_ehr`、`project_crf`、`targeted_schema` 且带 `document_id` 时复用同一套 `LlmEhrExtractor`/`SimpleEhrExtractor`。
- 已避免科研抽取误用患者 EHR context：当 job 已传 `context_id` + `schema_version_id` 时，`_prepare_job()` 不再覆盖为患者 EHR context。
- 已实现科研项目 CRF 抽取：`project_crf` 要求 `context_id`，并校验 `context_type/project_id/project_patient_id/patient_id/document.patient_id` 一致后，按 `schema_version_id` 规划字段并写入对应 CRF context。
- 已实现靶向抽取：`targeted_schema`/通用 schema job 支持通过 `target_form_key`、`input_json.form_keys`、`input_json.field_paths`、`input_json.field_keys`、`input_json.group_keys` 过滤抽取字段。
- 已保留统一落库语义：抽取结果仍通过 `context_id + record_instance + extraction_run_id` 写入候选值，科研项目和专项抽取可复用 candidate/current/evidence 机制。

验证：

```bash
cd backend && .venv/bin/pytest tests/services/test_llm_ehr_extractor.py \
  tests/services/test_service_layer.py::test_extraction_service_process_existing_job_marks_failed_without_raising \
  tests/services/test_service_layer.py::test_extraction_service_retry_marks_failed_and_creates_new_run \
  tests/services/test_service_layer.py::test_extraction_service_rejects_failed_job_without_retry \
  tests/services/test_service_layer.py::test_project_crf_extraction_reuses_schema_extractor_and_context \
  tests/services/test_service_layer.py::test_targeted_schema_extraction_filters_field_paths \
  tests/services/test_service_layer.py::test_project_crf_extraction_rejects_context_mismatch \
  tests/app/test_worker_framework.py -q
# 14 passed in 0.23s

cd backend && .venv/bin/python -m py_compile app/services/extraction_service.py
```

### Planner 编排实现记录（2026-04-29）

- 已新增 `ExtractionPlanner`：把一次文档级抽取规划成一个或多个靶向表单抽取任务。
- 已支持自动路由：根据文档 `doc_type/doc_subtype/doc_title/metadata_json/original_filename` 与 schema 表单 `x-sources.primary/secondary` 匹配目标表单。
- 已支持显式靶向：传入 `target_form_key` 或 `input_json.form_keys` 时跳过自动路由，直接创建当前页面/指定表单对应的靶向任务。
- 已接入 `ExtractionService.create_planned_jobs()`：按 plan item 批量创建并执行 `project_crf`/`targeted_schema` 子任务，每个子任务写入 `target_form_key`、`input_json.form_keys`、`planned_reason`、`match_role`。
- 已新增 API 入口：`POST /api/v1/extraction-jobs/plan`，返回 `{ jobs: [...] }`，用于电子病历夹/科研数据抽取的一次规划、多任务执行。
- 已补测试覆盖：文档子类型自动匹配表单、当前页面显式表单靶向、科研 context 复用、字段级过滤、context mismatch 失败。

验证：

```bash
cd backend && .venv/bin/pytest tests/services/test_llm_ehr_extractor.py \
  tests/services/test_service_layer.py::test_extraction_service_process_existing_job_marks_failed_without_raising \
  tests/services/test_service_layer.py::test_extraction_service_retry_marks_failed_and_creates_new_run \
  tests/services/test_service_layer.py::test_extraction_service_rejects_failed_job_without_retry \
  tests/services/test_service_layer.py::test_project_crf_extraction_reuses_schema_extractor_and_context \
  tests/services/test_service_layer.py::test_targeted_schema_extraction_filters_field_paths \
  tests/services/test_service_layer.py::test_project_crf_extraction_rejects_context_mismatch \
  tests/services/test_service_layer.py::test_create_planned_jobs_routes_document_subtype_to_target_forms \
  tests/services/test_service_layer.py::test_create_planned_jobs_uses_explicit_current_form_target \
  tests/app/test_worker_framework.py -q
# 16 passed in 0.24s

cd backend && .venv/bin/python -m py_compile app/services/extraction_planner.py app/services/extraction_service.py app/api/v1/extraction/router.py
```

已解决环境问题：`backend/.venv` 已安装 `python-multipart`，并已同步到 `backend/pyproject.toml` 与 `backend/poetry.lock`。`tests/app/test_extraction_job_api.py` 已通过：`1 passed in 0.42s`。

### 电子病历夹真实更新链路记录（2026-04-29）

- 已实现患者文档页“更新电子病历夹”真实后端入口：`POST /api/v1/patients/{patient_id}/ehr/update-folder`。
- 更新逻辑：获取患者 EHR context/schema，扫描患者下已归档且 OCR/文本就绪的文档，跳过已有 `pending/running/completed` 抽取任务的文档。
- 路由逻辑：仅匹配 schema 表单 `x-sources.primary`，不考虑 `secondary`；按文档 `doc_type/doc_subtype/doc_title/metadata_json/original_filename` 与 primary 来源匹配。
- 任务创建：每个匹配表单创建一个 `targeted_schema` 子任务，写入 `target_form_key`、`input_json.form_keys`、`planned_reason`、`match_role=primary`，随后复用通用 schema/context 抽取链路执行并落库。
- 前端已接入：患者文档页按钮 `更新电子病历夹` 调用 `updatePatientEhrFolder(patientId)`，接口返回创建的任务数量并刷新页面。

验证：

```bash
cd backend && .venv/bin/pytest tests/services/test_llm_ehr_extractor.py \
  tests/services/test_service_layer.py::test_update_patient_ehr_folder_creates_primary_source_target_jobs_only \
  tests/services/test_service_layer.py::test_update_patient_ehr_folder_skips_existing_extracted_documents \
  tests/services/test_service_layer.py::test_create_planned_jobs_routes_document_subtype_to_target_forms \
  tests/app/test_extraction_job_api.py tests/app/test_worker_framework.py -q
# 12 passed, 2 warnings in 0.60s

cd frontend_new && npm run build
# built successfully
```

### 异步提交改造记录（2026-04-29）

- 已将 `POST /api/v1/patients/{patient_id}/ehr/update-folder` 改为异步提交：接口只扫描文档、匹配 primary source、创建 `pending` 抽取任务并投递 Celery `eacy.extraction.process_extraction_job`。
- 已避免 HTTP 请求内直接调用 LLM：任务创建后先 commit，再投递到 `extraction` queue，防止 worker 抢跑看不到未提交 job。
- 接口返回语义调整：`submitted_jobs` 表示已提交后台任务数，`completed_jobs/failed_jobs` 在提交阶段均为 0，后续由 worker 更新 job/run 状态。
- 前端提示调整为“已提交 N 个电子病历夹抽取任务，后台正在抽取”。
- 注意：真实抽取必须启动 Celery worker 并监听 extraction 队列，否则 job 会停留在 pending。

验证：

```bash
cd backend && .venv/bin/pytest tests/services/test_llm_ehr_extractor.py \
  tests/services/test_service_layer.py::test_update_patient_ehr_folder_creates_primary_source_target_jobs_only \
  tests/services/test_service_layer.py::test_update_patient_ehr_folder_skips_existing_extracted_documents \
  tests/services/test_service_layer.py::test_update_patient_ehr_folder_keeps_going_when_target_job_fails \
  tests/services/test_service_layer.py::test_update_patient_ehr_folder_marks_empty_extraction_completed \
  tests/app/test_extraction_job_api.py tests/app/test_worker_framework.py -q
# 15 passed, 2 warnings in 0.55s

cd frontend_new && npm run build
# built successfully
```

### 推荐实施顺序

1. 先修 `retry_job()` 失败落库事务语义，避免线上 job 状态丢失。
2. 再做 LangGraph `validate -> repair` 内部循环，先覆盖 JSON 和结构校验。
3. 然后补值类型、枚举、evidence 校验。
4. 最后加 Celery transient error 自动重试和 `RecordMergeResolver` 预留节点。
