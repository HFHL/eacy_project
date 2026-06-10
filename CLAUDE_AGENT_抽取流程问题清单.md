# Claude Code Agent 抽取流程问题清单

> 范围：项目把抽取引擎换成「封装 Claude Code CLI 的 Agent」之后，从完整业务流出发，
> 审查电子病历夹完整抽取、科研项目 CRF、靶向抽取、数据合并四条链路存在的问题。
> 每条问题独立确认后追加，附定位（文件:行）、触发条件、影响、修复方向。

## 涉及的核心代码

- Agent 封装：`backend/app/services/agent/claude_code_runner.py`、`claude_code_ehr_extractor.py`、`eacy_extraction_mcp_server.py`
- 编排：`backend/app/services/extraction_service.py`、`extraction_strategy.py`、`extraction_planner.py`
- 合并：`backend/app/services/record_instance_merge.py`
- 队列：`backend/app/workers/extraction_tasks.py`、`celery_app.py`、`docker-compose.prod.yml`

---

## 一、Agent 封装层（claude_code_runner / claude_code_ehr_extractor）

### 问题 A1：同步 `subprocess.run` 阻塞事件循环，且任务取消无法中断正在运行的 Claude 进程

- 定位：`claude_code_runner.py:297` `_run_command` 用 `subprocess.run(..., timeout=...)` 同步阻塞；
  在 `extraction_service.py:2064-2075` 的 async 路径里直接调用 `self.claude_code_ehr_extractor.extract(...)`（同步方法）。
- 现象：单条 (文档, 表单) 任务最长阻塞 `CLAUDE_CODE_TIMEOUT_SECONDS=300s`（`config.py:81`），
  这段时间 celery worker 内 `asyncio.run` 的事件循环被完全占住。
- 取消失效：`_process_job` 只在调用抽取**前**（`extraction_service.py:1799`）和**后**（`1805`）
  通过 `_raise_if_cancelled` 检查取消标志，Claude 子进程运行期间无人轮询。
  用户在前端点「取消」后，要等当前 Claude 跑完（最长 300s，叠加重试可达 ~600s）才会真正停止，
  且那次昂贵的 Claude 调用结果会被丢弃。
- 影响：长任务期间该 worker 无法响应取消/心跳；病历夹批量抽取的取消体验与资源回收都很差。
- 修复方向：用 `asyncio.create_subprocess_exec` + `asyncio.wait_for` 改成可等待、可取消的子进程，
  或在 worker 侧用 `run_in_executor` 并定期回查取消状态后 `terminate()` 子进程。

### 问题 A2：校验失败时整段「重跑」，延迟与 token 成本翻倍，且与 300s 超时叠加

- 定位：`claude_code_ehr_extractor.py:74-94`，首跑校验有 error 时再次 `self.runner.run_extraction(...)`，
  重新写入整份 OCR/reading_units/schema、重新跑一个完整 Claude 会话。
- 现象：一次抽取 = 最多两个完整 Claude 进程，每个独立享有 300s 超时，单 job 墙钟可达 ~600s；
  token 成本约为单跑的 2 倍（整份 OCR 语料被重复投喂）。
- 叠加：`CLAUDE_CODE_CONCURRENCY=1`（`config.py:91`、compose `worker-claude-code` 单并发），
  病历夹/CRF 的 (文档×表单) 任务在这条队列上**串行**执行，重跑机制让单文档基线时间直接翻倍，
  几十个文档的病历夹批量更新可能需要数小时。
- 修复方向：重跑只回传「失败字段 + 校验错误」做增量修复（已有 `repair_errors` 通道但仍重投全量输入），
  或对可自动规范化的错误（如行号写进 field_path）直接后处理而不重跑。

### 问题 A3：校验是「全有或全无」，单个字段不合格会丢弃整张表单的全部抽取结果

- 定位：`claude_code_ehr_extractor.py:96-97`，两次尝试后仍有 `errors` 即 `raise ClaudeCodeValidationError`；
  异常向上冒泡到 `_process_job` 的 except，`_write_extracted_values` 永不执行。
- 放大因素：`_validate_raw_result`（`claude_code_ehr_extractor.py:172-193`）把
  「quote_text 不是 OCR 子串」的 warning 升级为 error，并强制每个有值字段必须带 confidence。
  只要模型对**一个**字段的引用/置信度有瑕疵，哪怕其余几十个字段都正确，整份结果一并作废，写入 0 字段。
- 影响：用户看到的是「失败」或「完成但未写入任何字段」（`extraction_service.py:1979-2001`），
  正确字段也被牺牲；对单文档多字段的病历摘要/CRF 表单尤其严重。
- 修复方向：区分「致命错误」（结构损坏）与「逐字段错误」，对单字段错误丢弃该字段并写入其余，
  把问题字段记入 `validation_warnings`/`uncertain_fields`，而非整体失败。

### 问题 A4：max_turns 预算与「必须一次性输出完整 JSON」相互矛盾，turn 耗尽即硬失败

- 定位：`claude_code_runner.py:223-229` 固定 `--max-turns 14`；prompt（`341-381`）要求模型先 MCP 校验、
  再 MCP 保存或最终回复完整 JSON。`_parse_result`（`307-327`）优先读 `output/result.json`，
  没有则解析 stdout，两者都拿不到合法 JSON object 时 `raise ClaudeCodeParseError`。
- 现象：字段多/OCR 长时，模型若把 turn 花在 `search_ocr`/`validate_candidate_fields` 上，
  可能在写出最终结果前耗尽 turn；Claude Code 退出但既无 `result.json` 又无合法 stdout JSON → ParseError。
- 分类：`ClaudeCodeParseError.error_type="parse_error"`，不在 `TRANSIENT_EXTRACTION_ERRORS` 内
  （`extraction_service.py:72-83`），worker 不会自动重试，直接落为永久失败，需人工 retry。
- 修复方向：max_turns 按字段数动态放大或拆分表单；prompt 明确「最后一个 turn 必须落 result.json」；
  对 ParseError 给一次有限自动重试或降级到 LlmEhrExtractor。

### 问题 A5：失败现场默认被清理，排障困难

- 定位：`claude_code_runner.py:142-144` `finally` 中 `keep_workspace=False`（`config.py:83`）即 `rmtree` workspace；
  workspace 根在 `/tmp/eacy-claude-code`（`config.py:80`），未挂载持久卷，容器重启也会丢。
- 影响：超时/解析失败后，task.md、input/*、Claude stdout、可能的半成品 result.json 全部消失，
  只剩 `llm_call_logs` 里截断后的 stdout，难以复现「模型当时看到了什么、写了什么」。
- 修复方向：失败时保留 workspace 或把关键产物（prompt、input 哈希、stdout、result.json）落到持久日志/对象存储。

---

## 二、数据合并流程（record_instance_merge.py + _write_extracted_values）

### 问题 B1：无 merge_binding 的表单会「每个文档复制一份」，单例表单被反复重建

- 定位：`record_instance_merge.py:143-153` 当字段没有 anchor/fallback 绑定时 `fallback_used=True`，
  merge_key 退化为 `form=... | document=<源文档id> | local_repeat_index=N`。
- 链路：`_write_extracted_values`（`extraction_service.py:2244` 起）对每个 (文档, 表单) job 单独事务执行；
  `resolve_record_for_group`（`record_instance_merge.py:47-91`）先按 merge_key 找已存在记录，
  找不到再尝试认领空白的 `records[0]`（`_can_claim_default_record`，`215-221`），否则 `_next_repeat_index` 新建。
- 缺陷推演（单例表单、无绑定）：
  - 文档①：merge_key=fallback(doc1)，无匹配 → 认领 records[0]，写入 anchor_json.merge_key=fallback(doc1)。
  - 文档②：merge_key=fallback(doc2)≠doc1；records[0] 已有 merge_key 不能再认领（`219`）→ 新建 repeat_index=1。
  - 结果：本应只有一份的「诊断/基本信息」表单，因来自两个文档被拆成两条 RecordInstance。
- 影响：病历夹/CRF 里「应合并成一行」的单例表单随文档数量线性膨胀成多行，
  下游导出（`research_project_export_service`）和人工核对都会看到重复行。
- 修复方向：对 `x-is-extraction-unit=false` 的单例表单不要把 document_id 放进 merge_key（按 form_key 单例合并）；
  或对无绑定表单按 form_key 复用 repeat_index=0 记录而非新建。

### 问题 B2：跨文档合并完全依赖 Claude 输出锚点值「逐字一致」，OCR/归一差异即产生重复记录

- 定位：`build_anchor_json`（`record_instance_merge.py:93-165`）的 merge_key 由锚点字段**值**拼成；
  文本归一仅 `_normalize_value`（`311-324`）做去空格+小写，日期在 `granularity=="day"` 时才规整。
- 现象：同一逻辑记录（例如「第 2 周期化疗」）在文档 A 写「周期2」、文档 B 写「第2周期」、
  或日期一个含「2024-01-05」一个含「2024.1.5」但无 day 粒度声明时，merge_key 不同 → 判为两条记录，未合并。
- 依赖：锚点字段本身必须在**同一次抽取**里被成功抽出且 label 能对上
  （`_fields_by_label` 用 field_title/field_key/末段路径匹配，`255-267`）；
  锚点缺失/为空 → `anchor_values` 空 → 落回 fallback(document) → 同样不跨文档合并（见 B1）。
- 影响：合并召回率取决于模型与 OCR 的一致性，重复记录会静默产生，且与 B1 叠加放大。
- 修复方向：锚点值做更强归一（同义词/全角半角/数字中文、日期统一解析）；
  合并失败时给出可疑重复提示而非静默新建；对关键锚点字段缺失的组拒绝写入或标记。

### 问题 B3：上下文无 RecordInstance 时，抽取结果被静默丢弃

- 定位：`extraction_service.py:2257-2259` `records = list_by_context(...)`，`if not records: return`。
- 现象：若该 context 尚未种出任何 record（初始化时序异常、并发清理、新表单未播种），
  Claude 已经花费算力抽到的字段会被直接丢掉，job 仍标记 completed，
  顶多触发 `_empty_result_message` 的「完成但未写入任何字段」（`1979-2001`），但原因指向「模板字段定义」，误导排障。
- 影响：用户看到「完成但空」，实际是 record 播种缺失；昂贵的 Claude 调用白跑。
- 修复方向：无 record 时按输出表单**按需播种** record（已有 `_create_output_record`/`_create_record` 能力），
  而不是 return；或显式报错区分「无播种」与「模型确实没抽到」。

### 问题 B4：`default_record = records[0]` 作为兜底，易把字段错写到不相关表单

- 定位：`extraction_service.py:2261` `default_record = records[0]`（按 created_at 最早的一条）；
  `record_instance_merge.py:49,53` 当字段没有 form_key 时返回 `default_record`。
- 现象：Claude 输出里 `field_path`/`record_form_key` 缺失或不规范、
  `record_form_key_from_field_path` 解析不出 form_key（`229-233`，少于两段路径）时，
  字段会被写到「最早创建的那条记录」，而它未必属于该字段对应的表单。
- 影响：错位写入产生脏数据，且带着证据一起落库，人工不易察觉。
- 修复方向：无法解析 form_key 的字段应丢弃并记入 `validation_warnings`，不要兜底塞进 default_record。

### 问题 B5：合并写入与并发——advisory 锁粒度与 hashtext 冲突

- 定位：`extraction_service.py:2254-2255` 用 `pg_advisory_xact_lock(hashtext(:context_id))` 串行化同 context 写入。
- 现象：`hashtext` 返回 int4，不同 context_id 存在哈希碰撞概率，碰撞时两个本应并行的 context 写入被无谓串行；
  反之该锁只在「非测试 value_service」时获取，逻辑正确但依赖部署始终走真实 service。
- 影响：偶发性能折损（可接受），但若未来放开 claude-code 并发（当前=1）会成为隐藏瓶颈/争用点。
- 修复方向：用 `hashtextextended`/双关键字（context_id 哈希到 bigint）降低碰撞；并在文档中明确「同 context 串行」是刻意设计。

---

## 三、电子病历夹完整抽取流程（update_patient_ehr_folder）

### 问题 C1：公平调度器的并发额度与 claude-code 单并发队列「双重排队」，全局并发形同虚设

- 定位：调度器按 `EXTRACTION_GLOBAL_CONCURRENCY=4 / USER=1 / PROJECT=2`（`config.py:45-47`）选 job，
  把「queued+running」都算作 active（`extraction_service.py:1247`、repo `list_active_for_scheduler:43-51`）；
  但 claude_code 策略下所有 schema 抽取 job 都路由到 `claude-code` 队列
  （`extraction_strategy.py:53-59`），而该队列 worker `--concurrency=1`（compose `worker-claude-code:198`、`config.py:91`）。
- 现象：调度器一次可放行 4 个 job，它们全部涌入只有 1 个执行槽的 claude-code 队列；
  其中 1 个在跑，另外 3 个在 broker 里 `queued`，却被调度器记为「占用全局额度」。
  结果：真实吞吐恒为 1，而 3 个全局槽位被「排队但没在跑」的 job 占着，反而挤掉其它用户/项目的派发机会。
- 影响：病历夹批量更新（几十个文档 × 每文档多表单）在单 worker 上**串行**，叠加问题 A2 的重跑（×2）和 A1 的 300s 超时，
  整夹更新可能耗时数小时；公平调度的 user/project 限额在「真正运行只有 1 个」的前提下失去意义。
- 修复方向：claude-code 队列扩容（多 worker/多并发，但要核算 Claude 额度与机器资源）；
  或让调度器按「实际运行中」而非「queued+running」计 active；或为 claude-code 单独设并发额度对齐队列容量。

### 问题 C2：增量模式的幂等判定基于 job 是否存在，failed/empty 文档会被永久跳过

- 定位：`update_patient_ehr_folder` 增量分支（`extraction_service.py:619-627`）把
  status ∈ {pending, queued, running, completed} 的文档视为「已抽取」并排除；
  表单级判定 `_existing_target_forms_by_document`（`257-280`）同样把 completed 计入。
- 现象：某文档上一轮抽取「completed 但 0 字段」（A3/B3 导致），或表单已建 job 但结果作废，
  下次「更新电子病历夹」（增量）会因为「已有 completed/ pending job」而**跳过**它，
  用户以为再点一次能补抽，实际不会重试，必须手动 full 模式或逐个 retry。
- 影响：抽取失败/空结果的文档在增量更新里「卡死」，与 A3「整表单作废」叠加形成数据黑洞。
- 修复方向：幂等判定应区分「成功且有数据」与「completed 但 empty/failed」；后者在增量模式也应重新入队。

### 问题 C3：批量入队部分失败时整批事务回滚，已规划的 job 与进度快照不一致

- 定位：`extraction_service.py:676-685` 先 `create_item_for_job` 再
  `_commit_pending_jobs_before_enqueue()`（`1326-1330`，吞掉 LookupError）后逐个 `_schedule_or_enqueue_extraction_task`。
  若某个 job enqueue 抛错，`_enqueue_extraction_task`（`1300-1310`）会把该 job 标 failed 并 `session.commit()`。
- 现象：批量循环中途某次 enqueue 失败会单独提交该 job 的 failed 状态，但循环并无整体补偿；
  已 commit 的 jobs 已入队、未到的 jobs 留在 pending，batch 计数（返回体里的 created_jobs/submitted_jobs）
  与真实入队状态可能不一致。调度器开启时走的是 `mark_job_waiting_for_scheduler`，路径不同但同样缺乏批量原子性。
- 影响：病历夹更新的「计划 N 个、实际入队 M 个」对用户不透明，进度条可能停在不一致状态。
- 修复方向：批量入队失败要么整体重试该 job 要么收集失败清单回传给前端，并在 batch 聚合里如实反映。

### 问题 C4：`_document_ready_for_extraction` 接受 `ocr_status=None`，可能对未 OCR 文档启动抽取

- 定位：`extraction_service.py:2027-2034`，只要有 `ocr_text/parsed_content/ocr_payload_json/parsed_data` 任一非空
  且 `ocr_status ∈ {None, completed, success}` 即视为可抽取。
- 现象：`ocr_status=None`（历史数据/未跑 OCR 但有 parsed_content 的文档）会被纳入 eligible，
  送进 Claude 的 `reading_units` 可能为空或仅有低质量解析文本（`build_ocr_reading_units` 退化到 `text`）。
- 影响：对没有可靠 OCR 证据的文档也消耗一次（甚至两次）Claude 调用，且抽出的字段证据定位不可信
  （evidence 走 fallback，`_resolve_evidence_type` 标 `document_text`/`sibling_page_hint`）。
- 修复方向：claude_code 路径要求 reading_units 非空或 ocr_status 明确 success，否则跳过并提示「请先完成 OCR」。

### 问题 C5：每文档每表单一个 job，证据/合并的「跨表单上下文」被割裂

- 定位：规划阶段 `_pending_plan_items_for_document`（`282-301`）对一个文档按表单拆成多个 targeted_schema job，
  每个 job 独立调用 Claude（独立 workspace、独立 session、独立写入事务）。
- 现象：同一份病历里跨表单共享的锚点（如同一次就诊的日期、周期号）被拆到不同 job 后无法互相参照，
  合并锚点只能各自从本 job 字段里找（B2），且 `_apply_sibling_evidence_fallback`（`2426-2469`）的兄弟证据兜底
  只在**单 job 内**生效，跨表单的页码线索拿不到。
- 影响：合并召回率与证据定位质量都受「按表单切 job」的粒度限制；同文档多表单还会重复投喂整份 OCR（成本×表单数）。
- 修复方向：对同一文档的多个目标表单合并为一次 Claude 调用（一次投喂 OCR、一次产出多表单结果），
  既省 token 又保留跨表单上下文。

---

## 四、科研项目 CRF 抽取流程（update_project_crf_folder / _batch）

### 问题 D1：CRF 文档检索按 `uploaded_by=requested_by` 过滤，协作项目里会漏抽别人上传的文档

- 定位：`update_project_crf_folder`（`extraction_service.py:749-753`）和 batch 版（`955-959`）
  都用 `list_by_patient(patient_id, limit=1000, uploaded_by=requested_by)`；
  repo 实现 `document_repository.py:24-25` 在 `uploaded_by` 非空时强制 `Document.uploaded_by == requested_by`。
- 现象：科研项目本质是多人协作，患者文档可能由 PI、CRC、其他成员分别上传；
  当前发起 CRF 抽取的人只能「看到并抽取自己上传的文档」，他人上传的同患者文档被静默排除在 eligible 之外。
- 影响：CRF 完整度被低估，关键文档漏抽，且 `documents_total/eligible_documents` 统计也只反映本人文档，误导用户。
- 修复方向：项目场景下文档可见性应基于「项目成员/患者归属」而非「上传者本人」；
  对已通过 `_ensure_project_access` 的请求放开 uploaded_by 限制。

### 问题 D2：CRF context 懒创建 + 默认 record 播种，与并发批量抽取存在竞态

- 定位：`get_or_create_project_crf_context`（`research_project_service.py:736-761`）先查后建，
  无 record 时 `initialize_default_record_instances`；`update_project_crf_folder` 在规划前才调用 `get_project_crf` 触发它。
- 现象：batch 模式（`update_project_crf_folder_batch`）对多个 project_patient 顺序处理尚可，
  但若同一 project_patient 的多个入口并发（例如用户连点、或单患者抽取与批量抽取重叠），
  「先查后建」无唯一约束保护时可能创建出两个 project_crf context 或重复播种 record。
- 关联：完整度计算（`research_project_service.py:216-221,372-378`）已用「取 created_at 最新 context」来容忍重复 context，
  侧面印证「同 (project_patient, schema_version) 出现多 context」是已知会发生的状态。
- 影响：重复 context/record 会让 CRF 数据分裂到两个上下文，抽取结果写到一个、展示读另一个，出现「抽了但看不到」。
- 修复方向：(project_patient_id, schema_version_id, context_type) 加唯一约束 + upsert；播种用 advisory 锁或幂等保护。

### 问题 D3：CRF 批量抽取强制 `enqueue_async=True`，但单患者/单文档路径不一定，行为不一致

- 定位：CRF folder（`extraction_service.py:813`）与 batch（`1030`）的 input_json 固定 `enqueue_async: True`；
  而病历夹 `update_patient_ehr_folder`（`653-658`）的 input_json **没有** `enqueue_async`，靠 folder 流程末尾统一 enqueue。
  靶向单 job 走 `create_and_process_job` 时，是否 async 取决于 `enqueue_async/wait_for_document_ready`（`486`）。
- 现象：CRF 与 EHR 两条 folder 流程对「是否异步、是否被公平调度器接管」的默认值不一致，
  叠加 C1（claude-code 单并发队列）后，CRF 批量任务的实际并发/排队行为更难预测。
- 影响：同样是「更新一个夹子」，CRF 和病历夹的吞吐、可取消性、进度反馈不一致，运维与用户心智负担大。
- 修复方向：统一两条 folder 流程的入队语义（都走调度器或都直接入队），并在文档里写清。

### 问题 D4：CRF 与病历夹共用同一份 (文档→Claude) 抽取，但 schema/字段语义不同，重跑成本叠加

- 定位：CRF job（`job_type=project_crf`）与 EHR job 都走 `_use_claude_code_extractor`→同一 `ClaudeCodeEhrExtractor`
  （`extraction_service.py:2064-2075`），prompt/skills 也相同（`claude_code_runner.py:341-381` 通用医疗抽取 prompt）。
- 现象：同一患者的同一份文档，若既要抽进病历夹（EHR schema）又要抽进项目 CRF（CRF schema），
  会被规划成**两套独立 job**，各自投喂整份 OCR、各自最多重跑两次（A2），各自占 claude-code 串行队列。
- 影响：同文档被 Claude 处理 2×（表单数）×（重跑次数）次，token 与时间成本成倍叠加；
  且两套抽取对同一原文的理解可能不一致，下游对照困难。
- 修复方向：以「文档→一次抽取产出多 schema/多表单」为目标做合并调用与结果缓存复用（与 C5 同源），
  CRF 与 EHR 复用同一次 OCR 理解结果。

---

## 五、靶向抽取流程（targeted_schema / target_form_key）

### 问题 E1：单条靶向抽取可能在 HTTP 请求里同步跑 Claude，阻塞请求最长 ~600s

- 定位：`POST /extraction`（`extraction/router.py:87-100`）→ `create_and_process_job`；
  当 `target_form_key` 存在时 job_type 改写为 `targeted_schema`（`extraction_service.py:476-477`）。
  若 input_json **没有** `enqueue_async`/`wait_for_document_ready`，则不走异步分支，
  直接 `await self._process_job(...)`（`513`）在请求协程里执行抽取 → 同步调用 Claude（A1）。
- 现象：前端调一次靶向抽取，HTTP 连接会被挂住，直到 Claude 单跑或重跑（A2）结束，最长 300s×2 ≈ 600s；
  网关/反代（nginx `API_TIMEOUT_SECONDS:-180`）大概率先超时返回 504，但后台 Claude 仍在跑且会写库，
  造成「前端报错、数据却已写入」的不一致。
- 影响：靶向抽取的交互体验差、易超时、易产生「幽灵成功」；占用 api worker 的执行槽。
- 修复方向：靶向抽取统一走异步入队（默认 `enqueue_async=True`），请求立即返回 job_id，前端轮询进度。

### 问题 E2：靶向 `field_paths`/`field_keys` 过滤与合并所需「锚点字段」可能互斥，导致合并退化

- 定位：`_filter_schema_fields`（`extraction_service.py:2201-2220`）按 form_keys/field_paths/field_keys/group_keys
  做**交集**过滤；只抽用户指定的少数字段时，merge_binding 里声明的 anchor/group 字段若不在选中集合内，就不会被抽取。
- 现象：合并锚点依赖「同一次抽取里抽到锚点值」（B2），而靶向只抽 1~2 个目标字段、不含锚点字段时，
  `build_anchor_json` 的 `anchor_values` 为空 → 落回 fallback(document)（`record_instance_merge.py:143-153`）→
  无法与既有记录合并，新建一条只含目标字段的孤立 record。
- 影响：靶向「补抽某字段」时，本应写进已有记录的值被写到新建的重复记录里，数据更碎。
- 修复方向：靶向过滤时自动**附带**该表单 merge_binding 引用的 anchor/group 字段一起抽取，
  或在写入阶段允许用「目标字段所属 form_key + 已有唯一记录」做软合并。

### 问题 E3：靶向 `field_paths` 直接信任用户输入，无 schema 校验，错路径静默抽 0 字段

- 定位：`_filter_schema_fields` 用 `field.field_path in target_field_paths` 过滤（`2206,2217`），
  靶向请求体 `field_paths`（来自 input_json）没有任何「是否属于该 schema」的前置校验。
- 现象：调用方传了拼写错误/旧版本/不存在的 field_path 时，过滤结果为空 → `_extract` 抛
  `ExtractionConflictError("No schema fields matched extraction target")`（`2062-2063`）或抽 0 字段，
  但错误信息笼统，调用方不知道是「路径写错」还是「文档没内容」。
- 影响：靶向抽取的可调试性差，集成方容易踩坑而无明确反馈。
- 修复方向：靶向请求在创建 job 前校验 field_paths/form_keys 是否存在于目标 schema_version，
  不存在直接 400 并列出可用路径。

### 问题 E4：靶向 full 模式对每个文档无条件重抽，缺乏「该文档是否含该表单」预判

- 定位：靶向（`options.target_form_keys` 非空）在 EHR/CRF folder 里都强制
  `pending_documents = eligible_documents`、`mode` 视同 full（`extraction_service.py:615-618,765-768`），
  且 `_pending_plan_items_for_document` 在 full 模式直接返回 plan_items（`298-299`）不做去重。
- 现象：对患者下**所有** eligible 文档都生成 (文档×靶向表单) job，即使某文档与该表单的 x-sources 毫不相关。
  规划用的是 explicit_form_keys 分支（`extraction_planner.py:32-43`），它**跳过 x-sources 匹配**，
  对所有文档一律生成该表单 job。
- 影响：靶向「只想补某表单」却对几十个无关文档逐个起 Claude（claude-code 串行队列），
  大量 job 抽出 0 字段（A3/B3），白白消耗 token 和时间，还会污染 batch 统计。
- 修复方向：靶向也先用 x-sources/文档类型做候选过滤，只对「可能含该表单」的文档起 job；
  或允许调用方显式指定 document_ids 缩小范围。

---

## 附：贯穿四条链路的系统性根因

1. **claude-code 队列单并发 + 全量重跑 + 同步阻塞**（A1/A2/C1）是吞吐与体验的主瓶颈，批量场景成倍放大。
2. **按 (文档×表单) 切 job**（C5/D4/E4）导致重复投喂 OCR、跨表单上下文丢失、合并锚点抽不全。
3. **合并依赖模型输出锚点逐字一致**（B1/B2/E2）使去重召回率不可控，静默产生重复记录。
4. **「全有或全无」校验 + completed-empty 当成功**（A3/B3/C2）形成数据黑洞：失败字段拖垮整表单，且增量更新不再重试。
5. **可见性与幂等的边界条件**（D1/D2/C2/E3）在多人协作、并发、错误输入下暴露漏抽/重复/误导。

> 建议优先级：C1 + A2（吞吐）> A3 + C2（数据黑洞）> B1/B2（合并质量）> E1（靶向同步阻塞）> D1（协作漏抽）。

