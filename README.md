# EACY 项目总览

本文档放在仓库根目录，用来说明当前代码库的三件事：

1. 数据库现在有哪些核心表，初始化和迁移逻辑在哪里。
2. 后端现在暴露了哪些主要接口，分别归哪个路由文件负责。
3. 前端当前页面中的主要按钮，实际对应调用了哪些接口；如果只是前端占位、弹窗、跳转，也会明确标注。

说明：

- 数据库为 `SQLite`，文件路径是 `backend/eacy.db`。
- 数据库基础建表 SQL 在根目录 `database_schema.sql`。
- 运行时增量迁移和兜底建表逻辑在 `backend/src/db.ts`。
- 后端统一入口前缀是 `/api/v1`。
- 本文档依据当前仓库代码整理，重点覆盖正在使用的患者、文档、EHR、科研项目、CRF 相关主流程。

## 目录结构

当前主流程可以理解为 5 个层次：

| 层次 | 位置 | 说明 |
| --- | --- | --- |
| 前端 | `frontend/` | React + Vite，负责患者页、文档页、科研项目页 |
| 后端 API | `backend/` | Express + SQLite，提供 `/api/v1/*` |
| CRF Service | `crf-service/` | FastAPI + Celery，负责抽取任务下发与进度 |
| Worker | `metadata-worker/`、其他 worker | OCR / metadata / EHR 抽取相关处理 |
| 数据库 | `backend/eacy.db` | 运行时主库 |

## 数据库定义

### 数据库初始化与迁移

数据库启动逻辑在 `backend/src/db.ts`：

- 首次启动时，如果库里没有业务表，会直接执行根目录 `database_schema.sql`。
- 启动时会执行若干 `ALTER TABLE`，补齐历史版本缺少的列。
- 启动时会兜底创建 `projects`、`project_patients`、`project_extraction_tasks` 等项目相关表。
- 启用了 `WAL` 模式提升并发读性能。

### 核心表清单

#### 1. Schema / 模板相关

| 表名 | 作用 | 关键字段 |
| --- | --- | --- |
| `ehr_schema` | 历史 EHR schema 表 | `schema_id`, `version`, `schema_json` |
| `schemas` | 运行时模板表，既存 EHR 模板也存 CRF 模板 | `id`, `name`, `code`, `schema_type`, `version`, `content_json`, `is_active` |

当前代码里：

- 患者病历默认模板常用 `code = 'patient_ehr_v2'`
- 科研项目 CRF 模板也复用 `schemas` 表

#### 2. 患者与文档相关

| 表名 | 作用 | 关键字段 |
| --- | --- | --- |
| `patients` | 患者主表 | `id`, `name`, `identifier`, `metadata`, `created_at`, `updated_at` |
| `documents` | 文档主表 | `id`, `patient_id`, `file_name`, `status`, `metadata`, `raw_text`, `ocr_payload`, `extract_result_json` |
| `document_archive_batches` | 文档归档批次 | `id`, `operator`, `patient_id`, `status` |
| `archive_batch_items` | 批次内的文档项 | `batch_id`, `document_id`, `auto_matched_patient_id`, `selected_action`, `manual_patient_id` |

`documents` 是当前最核心的运行表，既保存上传信息，也保存流水线状态：

- OCR 状态：`ocr_status`, `ocr_started_at`, `ocr_completed_at`, `ocr_error_message`
- 元数据状态：`meta_status`, `meta_started_at`, `meta_completed_at`, `meta_error_message`
- 结构化抽取状态：`extract_status`, `extract_task_id`, `extract_result_json`
- 物化状态：`materialize_status`
- 归档绑定：`patient_id`, `status`

常见 `status`：

- `pending_upload`
- `ocr_pending`
- `ocr_succeeded`
- `archived`
- `deleted`

#### 3. 项目 / 入组 / 科研抽取相关

| 表名 | 作用 | 关键字段 |
| --- | --- | --- |
| `projects` | 科研项目主表 | `project_name`, `schema_id`, `status` |
| `project_patients` | 项目与患者多对多入组关系 | `project_id`, `patient_id`, `subject_label`, `metadata` |
| `project_documents` | 项目文档关系表 | `project_id`, `document_id`, `status` |
| `project_extractions` | 项目字段抽取结果表 | `project_id`, `document_id`, `field_path`, `value_json` |
| `project_extraction_tasks` | 项目级 CRF 抽取任务跟踪表 | `project_id`, `schema_id`, `status`, `job_ids_json`, `summary_json` |

说明：

- `projects.schema_id` 指向 `schemas.id`，也就是这个项目绑定的 CRF 模板。
- `project_patients` 用来描述患者是否已入组项目。
- `project_extraction_tasks` 用来追踪一次“项目整体抽取/专项抽取”的状态。

#### 4. 患者 EHR / CRF 实例化相关

这部分是“模板实例 + 字段值 + 溯源”的核心数据层。

| 表名 | 作用 | 关键字段 |
| --- | --- | --- |
| `schema_instances` | 某个患者在某个 schema 下的实例 | `patient_id`, `schema_id`, `instance_type`, `status` |
| `instance_documents` | 实例关联到哪些文档 | `instance_id`, `document_id`, `relation_type` |
| `section_instances` | 可重复 section 实例 | `instance_id`, `section_path`, `repeat_index` |
| `row_instances` | 可重复表格 / 行实例 | `section_instance_id`, `group_path`, `repeat_index` |
| `field_value_candidates` | 某字段的候选值集合，保留来源与证据 | `field_path`, `value_json`, `source_document_id`, `confidence`, `created_by` |
| `field_value_selected` | 当前最终采用值 | `field_path`, `selected_candidate_id`, `selected_value_json`, `selected_by` |
| `extraction_runs` | 一次抽取运行记录 | `instance_id`, `document_id`, `status`, `target_mode` |

实例类型目前主要有：

- `patient_ehr`: 患者电子病历实例
- `project_crf`: 项目 CRF 实例

#### 5. EHR 任务队列相关

| 表名 | 作用 | 关键字段 |
| --- | --- | --- |
| `ehr_extraction_jobs` | 文档级抽取任务队列表 | `document_id`, `patient_id`, `schema_id`, `job_type`, `status`, `attempt_count` |

用途：

- 跟踪某份文档的 `extract` / `materialize` 任务
- 避免同一文档同一 schema 的活跃任务重复提交

## 后端定义

### API 挂载入口

`backend/src/routes/apiV1.ts` 当前挂载关系如下：

| 前缀 | 路由文件 | 说明 |
| --- | --- | --- |
| `/health` | `apiV1.ts` | 健康检查 |
| `/patients` | `patients.ts` | 患者列表、病历夹更新 |
| `/patients` | `ehrData.ts` | 患者 EHR schema 数据、字段历史、合并 |
| `/documents` | `documents.ts` | 文档上传、详情、归档、抽取、解绑、删除 |
| `/archive-batches` | `archiveBatches.ts` | 文档归档分组/匹配辅助 |
| `/schemas` | `schemas.ts` | schema / CRF 模板查询 |
| `/projects` | `projects.ts` | 项目、入组患者、项目抽取 |
| `/auth` | `notImplemented.ts` | 未实现 |
| `/users` | `notImplemented.ts` | 未实现 |
| `/crf-templates` | `notImplemented.ts` | 未实现 |
| `/stats` | `notImplemented.ts` | 未实现 |

### 主要路由说明

#### 1. 文档路由 `backend/src/routes/documents.ts`

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `POST` | `/api/v1/documents/upload` | 直接上传文件并入库，自动触发 `ocr + meta` |
| `POST` | `/api/v1/documents/upload-init` | 老上传流程初始化 |
| `POST` | `/api/v1/documents/complete` | 老上传流程完成 |
| `GET` | `/api/v1/documents` | 文档列表，支持 `patientId`、`status`、`ids` |
| `GET` | `/api/v1/documents/:id` | 文档详情，含 `linked_patients`、`content_list`、`extraction_records` |
| `GET` | `/api/v1/documents/:id/temp-url` | 获取预览 URL |
| `PUT` | `/api/v1/documents/:id/metadata` | 保存元数据编辑结果 |
| `POST` | `/api/v1/documents/:id/extract-metadata` | 重新抽取元数据 |
| `POST` | `/api/v1/documents/:id/extract-ehr` | 发起文档级 EHR 结构化抽取 |
| `POST` | `/api/v1/documents/:id/reparse` | 重跑 OCR / 元数据流程 |
| `POST` | `/api/v1/documents/:id/unarchive` | 解除患者绑定 |
| `GET` | `/api/v1/documents/:id/operation-history` | 聚合操作历史 |
| `POST` | `/api/v1/documents/:id/archive` | 将文档归档到某患者 |
| `POST` | `/api/v1/documents/:id/ocr` | 直接 OCR（不落库） |
| `DELETE` | `/api/v1/documents/:id` | 软删除文档 |
| `POST` | `/api/v1/documents/archive-to-patient` | 多文档归档到已有患者 |
| `POST` | `/api/v1/documents/create-patient-and-archive` | 新建患者并归档文档 |

额外说明：

- `upload`、`complete`、`reparse` 会调用 `http://localhost:8100/api/pipeline/process`
- `extract-ehr` 会调用 `http://localhost:8100/api/extract`

#### 2. 患者路由 `backend/src/routes/patients.ts`

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/v1/patients` | 患者分页列表，支持 `search`、`project_id` |
| `POST` | `/api/v1/patients/:patientId/ehr-folder/update` | 提交患者未抽取文档到批量 EHR 抽取 |

说明：

- `ehr-folder/update` 会筛出该患者尚未抽取过的文档
- 然后调用 `http://localhost:8100/api/extract/batch`

#### 3. 患者 EHR 路由 `backend/src/routes/ehrData.ts`

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/v1/patients/:patientId/ehr-schema-data` | 获取患者 schema 与 draftData |
| `PUT` | `/api/v1/patients/:patientId/ehr-schema-data` | 保存患者手工编辑后的病历数据 |
| `GET` | `/api/v1/patients/:patientId/ehr-field-history` | 获取字段历史候选值 |
| `POST` | `/api/v1/patients/:patientId/merge-ehr` | 将文档抽取结果合并到患者病历实例 |

#### 4. Schema / CRF 模板路由 `backend/src/routes/schemas.ts`

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/v1/schemas` | 列出可用 schema，默认筛 `schema_type=crf` |
| `GET` | `/api/v1/schemas/:id` | 获取单个 schema 的 `content_json` |

#### 5. 项目路由 `backend/src/routes/projects.ts`

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/v1/projects` | 项目列表 |
| `POST` | `/api/v1/projects` | 新建项目 |
| `GET` | `/api/v1/projects/:projectId` | 项目详情，含模板信息与 `schema_json` |
| `GET` | `/api/v1/projects/:projectId/patients` | 项目患者列表 |
| `POST` | `/api/v1/projects/:projectId/patients` | 批量/单个入组 |
| `DELETE` | `/api/v1/projects/:projectId/patients/:patientId` | 将患者移出项目 |
| `GET` | `/api/v1/projects/:projectId/patients/:patientId` | 项目内患者详情 |
| `POST` | `/api/v1/projects/:projectId/crf/extraction` | 启动项目 CRF 抽取 |
| `GET` | `/api/v1/projects/:projectId/crf/extraction/progress` | 查询抽取进度 |
| `GET` | `/api/v1/projects/:projectId/crf/extraction/active` | 查询活跃抽取任务 |
| `DELETE` | `/api/v1/projects/:projectId/crf/extraction` | 取消抽取 |
| `POST` | `/api/v1/projects/:projectId/crf/extraction/reset` | 重置抽取状态 |

说明：

- 项目抽取内部同样会请求 `CRF_SERVICE_URL/api/extract/batch`
- `project_extraction_tasks` 用来记录项目层面的任务状态

#### 6. 归档辅助路由 `backend/src/routes/archiveBatches.ts`

当前已实现：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/v1/archive-batches/groups` | 根据文档 metadata 自动聚类，并尝试匹配患者 |

## 前端按钮与接口对应

下面只整理“当前页面里真正有交互含义的按钮”。分成三类：

- `调用后端`: 会请求真实后端接口
- `本地动作`: 只开弹窗、切 Tab、跳转、刷新本地状态
- `占位 / stub`: 前端有按钮或函数名，但 API 目前仍是 `ok()` 假实现，没有真实后端联动

### 一、患者详情页 - 文档 Tab

位置：

- `frontend/src/pages/PatientDetail/tabs/DocumentsTab/index.jsx`
- `frontend/src/pages/PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal.jsx`

#### 1. 列表区按钮

| 按钮 | 页面位置 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- | --- |
| `上传文档` | 文档 Tab 顶部 | `setUploadVisible(true)` | 无，交给上层上传弹窗 | 本地动作 |
| `更新病历夹` | 文档 Tab 顶部 | `updatePatientEhrFolder(patientId)` | `POST /api/v1/patients/:patientId/ehr-folder/update` | 调用后端 |
| `卡片点击打开详情` | 文档卡片 | `handleCardClick` | 随后详情内会拉取接口 | 本地动作 |
| `搜索患者姓名或编号` | 患者匹配弹窗 | `getPatientList(...)` | `GET /api/v1/patients` | 调用后端 |
| `确认选择 / 确认更换` | 患者匹配弹窗 footer | `archiveDocument(...)` 或 `changeArchivePatient(...)` | `POST /api/v1/documents/:id/archive` 或未实现 | 混合 |
| `候选患者列表里的 选择 / 更换` | 患者匹配弹窗列表项 | `archiveDocument(...)` 或 `changeArchivePatient(...)` | `POST /api/v1/documents/:id/archive` 或未实现 | 混合 |

注意：

- `archiveDocument` 已对接真实后端。
- `changeArchivePatient` 在 `frontend/src/api/document.js` 里目前还是 `ok({})`，属于前端 stub，没有真实后端实现。
- `getDocumentAiMatchInfo` 目前也是 stub，所以“患者匹配详情”里的 AI 候选数据当前不是真实后端返回。

#### 2. 文档详情弹窗里的按钮

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `未绑定患者标签` | `onArchivePatient(document.id)` | 打开匹配弹窗，后续可能调用 `/documents/:id/archive` | 本地动作 |
| `查看患者详情` | 打开右侧 `Drawer` | 无 | 本地动作 |
| `更换绑定患者` | `onChangePatient(document.id)` | 后续走 `changeArchivePatient` stub | 占位 / stub |
| `解除绑定` | `unarchiveDocument(document.id)` | `POST /api/v1/documents/:id/unarchive` | 调用后端 |
| `删除` | `deleteDocument(document.id)` | `DELETE /api/v1/documents/:id` | 调用后端 |
| `保存修改` | `updateDocumentMetadata(document.id, metadata)` | `PUT /api/v1/documents/:id/metadata` | 调用后端 |
| `元数据区域 - 重新提取` | `extractDocumentMetadata(document.id)` | `POST /api/v1/documents/:id/extract-metadata` | 调用后端 |
| `唯一标识符 - 添加标识符` | 修改本地 `editedFields` | 无，最终由“保存修改”统一提交 | 本地动作 |
| `唯一标识符 - 删除` | 修改本地 `editedFields` | 无，最终由“保存修改”统一提交 | 本地动作 |
| `OCR 预览失败 - 重试` | `fetchPreviewUrl(document.id)` | `GET /api/v1/documents/:id/temp-url` | 调用后端 |
| `无法获取预览URL - 重新获取` | `fetchPreviewUrl(document.id)` | `GET /api/v1/documents/:id/temp-url` | 调用后端 |
| `抽取记录为空时 开始抽取` | `extractEhrDataAsync(document.id, payload)` | `POST /api/v1/documents/:id/extract-ehr` | 调用后端 |
| `抽取记录区 重新抽取` | `extractEhrDataAsync(document.id, payload)` | `POST /api/v1/documents/:id/extract-ehr` | 调用后端 |
| `抽取记录 - 合并到患者` | `mergeEhrData(patientId, { document_id, source_extraction_id })` | `POST /api/v1/patients/:patientId/merge-ehr` | 调用后端 |
| `操作历史 - 刷新` | `getDocumentOperationHistory(document.id)` | `GET /api/v1/documents/:id/operation-history` | 调用后端 |
| `可重复字段 - 查看全部` | 打开数组详情 Modal | 无 | 本地动作 |
| `数组详情 - 关闭` | 关闭 Modal | 无 | 本地动作 |
| `患者侧栏 - 查看完整档案` | `window.open('/patient/detail/...')` | 浏览器跳转 | 本地动作 |

额外说明：

- 文档详情弹窗打开时会自动调用：
  - `GET /api/v1/documents/:id`
  - `GET /api/v1/documents/:id/temp-url`
  - `GET /api/v1/documents/:id/operation-history`
- `reparseDocumentSync` 虽然已经对接 `POST /api/v1/documents/:id/reparse`，但当前弹窗里没有直接暴露“重新解析”按钮。

### 二、患者详情页 - Schema/EHR 区域

位置：

- `frontend/src/pages/PatientDetail/tabs/EhrTab/components/LeftPanel/index.jsx`
- `frontend/src/pages/PatientDetail/tabs/EhrTab/components/RightPanel/index.jsx`
- `frontend/src/pages/PatientDetail/tabs/SchemaEhrTab/ProjectSchemaEhrTab.jsx`

#### 1. 左侧树 / 文档侧栏

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `全部展开/收起` | `onExpandAll()` / `onCollapseAll()` | 无 | 本地动作 |
| `字段组节点点击` | `onGroupSelect` / `onGroupToggle` | 无 | 本地动作 |
| `文档列表项点击` | `onDocumentSelect(doc)` | 无 | 本地动作 |
| `+ 上传项目文档` | `onUploadDocument` | 取决于上层实现；当前项目患者详情页里只是 `console.log` | 占位 / stub |

#### 2. 右侧文档溯源面板

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `查看完整文档` | `onViewDocument` / `onViewFullDocument` | 由上层决定，通常会再去拿文档详情/预览 | 本地动作 |
| `图片点击放大` | 打开本地 Modal | 无 | 本地动作 |

#### 3. 项目模式 SchemaEhrTab

`ProjectSchemaEhrTab` 本身主要负责装配 `SchemaForm`，真实接口在上层传入：

| 动作 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| 加载项目模板 | `getProjectTemplate(projectId)` | 实际读 `GET /api/v1/projects/:projectId` | 调用后端 |
| 保存表单 | `onSave(data, type)` | 由上层决定 | 由上层决定 |
| 重置 | 恢复本地 `patientData` | 无 | 本地动作 |
| 上传项目文档 | `onUploadDocument` | 由上层决定 | 由上层决定 |

### 三、科研项目页 - 项目数据集视图

位置：`frontend/src/pages/ResearchDataset/ProjectDatasetView.jsx`

#### 1. 页面初始化自动请求

页面进入时会自动调：

- `getProject(projectId)` -> `GET /api/v1/projects/:projectId`
- `getProjectTemplateDesigner(projectId)` -> 本质仍是 `GET /api/v1/projects/:projectId`
- `getProjectPatients(projectId)` -> `GET /api/v1/projects/:projectId/patients`
- `getActiveExtractionTask(projectId)` -> `GET /api/v1/projects/:projectId/crf/extraction/active`

#### 2. 顶部和概览区按钮

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `返回项目列表` | `navigate('/research/projects')` | 无 | 本地动作 |
| `收起/展开` | `setStatisticsCollapsed` | 无 | 本地动作 |
| `CRF模版 - 查看` | `handleViewProjectTemplate` | 实际是页面跳转到模板编辑页 | 本地动作 |
| `字段筛选` | 无实际处理逻辑 | 无 | 占位 / stub |

#### 3. 数据表格主操作区按钮

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `添加患者` | `handleAddPatients()` | 先弹窗，再加载患者池 | 调用后端 |
| `开始抽取` | `handleStartExtraction(null, 'full')` | `POST /api/v1/projects/:projectId/crf/extraction` | 调用后端 |
| `暂停` | `handleCancelExtraction()` | `DELETE /api/v1/projects/:projectId/crf/extraction` | 调用后端 |
| `重新抽取` | `handleReextract('full')` | 先 `POST /crf/extraction/reset`，再 `POST /crf/extraction` | 调用后端 |
| `质量检查` | `setQualityCheckVisible(true)` | 无真实接口 | 本地动作 |
| `导出数据` | `setExportModalVisible(true)` | 点击确认后才会调用后端 | 本地动作 |
| `项目设置` | `setEditProjectVisible(true)` | 当前未见真实保存接口 | 本地动作 / 占位 |

#### 4. 抽取相关弹窗按钮

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `专项抽取 - 开始抽取` | `handleSubmitTargetedExtraction()` | `POST /api/v1/projects/:projectId/crf/extraction` | 调用后端 |
| `专项抽取 - 全选/选择未完成/清空` | 本地设置 `extractionModalGroups` | 无 | 本地动作 |
| `抽取错误弹窗 - 打开患者` | `navigate(...)` | 无 | 本地动作 |

#### 5. 导出弹窗按钮

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `开始导出` | `handleConfirmExport()` | 期望 `exportProjectCrfFile(projectId, payload)` | 当前为 stub |

重要说明：

- `frontend/src/api/project.js` 里的 `exportProjectCrfFile` 当前仍是 `ok(new Blob(...))`，不是真实后端请求。
- 所以“导出数据”功能前端流程已经写好，但 API 层还是占位实现。

#### 6. 患者池弹窗按钮

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `搜索患者` | `fetchPatientPool(...)` | `GET /api/v1/patients?project_id=...` | 调用后端 |
| `添加选中患者到项目` | `handleConfirmAddPatients()` | `POST /api/v1/projects/:projectId/patients` | 调用后端 |
| `移出患者` | `handleRemovePatients()` | `DELETE /api/v1/projects/:projectId/patients/:patientId` | 调用后端 |
| `清空选择` | `setSelectedPatients([])` | 无 | 本地动作 |

#### 7. 表格行内按钮

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `字段组 - 抽取` | `handleExtractGroup(patientId, groupKey)` | `POST /api/v1/projects/:projectId/crf/extraction` | 调用后端 |
| `字段组 - 查看详情` | 打开详情 Modal | 无 | 本地动作 |
| `打开患者` | `navigate(...)` | 无 | 本地动作 |
| `文档明细 - 打开文档详情` | `openDocDetail(d.id)` | 取决于上层详情实现 | 本地动作 |

### 四、科研项目页 - 项目内患者详情

位置：`frontend/src/pages/ResearchDataset/ProjectPatientDetail.jsx`

#### 1. 页面初始化与保存

| 动作 / 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| 页面加载患者项目详情 | `useProjectPatientData(...)` | 底层一般会请求 `GET /api/v1/projects/:projectId/patients/:patientId` | 调用后端 |
| 保存 Schema 表单 | `updateProjectPatientCrfFields(...)` | 当前 `frontend/src/api/project.js` 里仍是 stub | 占位 / stub |

#### 2. 顶部按钮

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `返回项目` | `navigate(...)` | 无 | 本地动作 |
| `解决冲突` | `openConflictModal()` | 弹窗打开后会调冲突接口 | 调用后端 |
| `收起/展开` | `setStatisticsCollapsed(...)` | 无 | 本地动作 |

#### 3. 冲突解决弹窗

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `全部保留旧值` | `handleResolveAll('keep')` | `resolveAllProjectPatientCrfConflicts(...)` | 当前为 stub |
| `全部采用新值` | `handleResolveAll('adopt')` | `resolveAllProjectPatientCrfConflicts(...)` | 当前为 stub |
| `采用新值` | `handleResolveConflict(id, 'adopt')` | `resolveProjectPatientCrfConflict(...)` | 当前为 stub |
| `保留旧值` | `handleResolveConflict(id, 'keep')` | `resolveProjectPatientCrfConflict(...)` | 当前为 stub |
| `忽略` | `handleResolveConflict(id, 'ignore')` | `resolveProjectPatientCrfConflict(...)` | 当前为 stub |
| `预览来源` | 打开 `FieldSourceModal` | 无 | 本地动作 |

说明：

- `getProjectPatientCrfConflicts`
- `resolveProjectPatientCrfConflict`
- `resolveAllProjectPatientCrfConflicts`

这几个在 `frontend/src/api/project.js` 里目前仍是本地 `ok()`，前端页面已写好，但真实后端接口还没对接。

#### 4. 项目患者页内抽取弹窗

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `专项抽取 - 开始抽取` | `handleSubmitTargetedExtraction()` | `POST /api/v1/projects/:projectId/crf/extraction` | 调用后端 |
| `全选/选择未完成/清空` | 本地设置选中组 | 无 | 本地动作 |

#### 5. AI 助手窗口

| 按钮 | 前端调用 | 后端接口 | 状态 |
| --- | --- | --- | --- |
| `发送` | `handleSendAiMessage()` | 无真实接口，当前仅本地追加一条模拟回复 | 占位 / stub |
| `清空` | `handleClearChat()` | 无 | 本地动作 |
| `快速提问按钮` | `setAiInput(...)` | 无 | 本地动作 |

### 五、当前“前端已有入口，但后端未真实打通”的接口

下面这些是当前文档里需要特别提醒的点：

| 前端 API 方法 | 当前状态 | 影响到的按钮/页面 |
| --- | --- | --- |
| `changeArchivePatient` | `stub` | 文档详情里的“更换绑定患者” |
| `getDocumentAiMatchInfo` | `stub` | 文档匹配详情弹窗 |
| `updateProjectPatientCrfFields` | `stub` | 项目患者详情页保存 CRF |
| `getProjectPatientCrfConflicts` | `stub` | 项目患者详情页冲突列表 |
| `resolveProjectPatientCrfConflict` | `stub` | 项目患者详情页单条冲突处理 |
| `resolveAllProjectPatientCrfConflicts` | `stub` | 项目患者详情页批量冲突处理 |
| `getProjectExtractionTasks` | `stub` | 项目数据集页历史任务 |
| `exportProjectCrfFile` | `stub` | 项目数据集页导出数据 |

也就是说，当前代码状态是：

- 文档上传、文档详情、元数据保存、EHR 抽取、归档、解绑、患者列表、项目列表、项目入组、项目抽取，这些主干接口已经打通。
- 患者 AI 匹配、更换归档患者、项目患者冲突处理、项目导出等功能，前端页面结构已有，但 API 还没完全落到真实后端。

## 当前主流程总结

### 1. 文档流

1. 前端上传文档。
2. 后端写入 `documents`。
3. 后端调用 `CRF Service` 触发 OCR / metadata。
4. 用户可在文档详情里编辑 metadata、再次抽取、合并到患者病历。

### 2. 患者病历流

1. 患者打开 EHR 页面时，如果没有实例，后端会自动初始化 `schema_instances`。
2. AI 抽取或手工修改都会写入 `field_value_candidates`。
3. 当前采用值写入 `field_value_selected`。
4. 前端通过 `/ehr-schema-data` 组装成可编辑表单。

### 3. 科研项目流

1. 项目绑定一份 `schemas` 里的 CRF 模板。
2. 患者通过 `project_patients` 入组。
3. 项目发起抽取时，后端按患者找到文档，转发到 `CRF Service`。
4. 结果回写后，前端按项目模板渲染 CRF 数据。

## 补充建议

如果后面要继续整理系统，建议优先补齐以下部分：

1. 给 `changeArchivePatient` 和 `getDocumentAiMatchInfo` 补真实后端接口。
2. 给项目患者详情里的冲突处理接口补真实后端实现。
3. 给 `exportProjectCrfFile` 和 `getProjectExtractionTasks` 补真实 API。
4. 再补一张“前端页面 -> API 文件 -> 后端路由 -> 数据表”的完整链路图，会更方便新同事接手。
