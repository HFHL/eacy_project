# EACY 前端测试清单 — 代码静态审查报告

> **审查方式**：仅阅读前后端源码，未执行真实 UI 测试或联调。  
> **对照清单**：`EACY_前端测试清单 - 完整测试用例.csv`（共 **103** 条）  
> **审查日期**：2026-05-20  
> **代码范围**：`frontend_new/src/`、`backend/app/`、`backend/core/`

---

## 1. 执行摘要

| 结论维度 | 数量 | 占比 |
|---------|------|------|
| ✅ **完成**（主路径代码齐全，逻辑与用例基本一致） | 31 | 30% |
| ⚠️ **部分完成**（有实现但与用例/其他入口不一致，或缺校验） | 47 | 46% |
| ❌ **未实现**（关键能力缺失或为桩代码） | 4 | 4% |
| 🔬 **需人工验证**（依赖模型效果、真实数据或 E2E 联调） | 21 | 20% |

**总体判断**：核心业务链路（上传 → OCR/元数据 → 归档 → 抽取 → 溯源）在代码层面**已贯通**，但测试清单与实现之间存在多处**规格偏差**；若干安全隔离、Stub 接口、隐藏菜单与死按钮问题会在按清单验收时暴露。

---

## 2. 审查方法说明

每条用例从三个维度评估：

1. **功能是否实现**：路由/API/组件是否存在可调用路径  
2. **实现是否正确**：校验规则、权限隔离、数据流是否与用例期望一致  
3. **能否静态确认**：准确率、布局、全链路耗时等须运行时验证的标记为「需人工验证」

**状态图例**

| 标记 | 含义 |
|------|------|
| ✅ 完成 | 代码路径完整，与用例期望无明显冲突 |
| ⚠️ 部分完成 | 有实现但存在偏差、缺口或多入口不一致 |
| ❌ 未实现 | 桩函数、TODO 或完全缺失 |
| 🔬 需人工验证 | 代码存在但效果/体验须实测 |

---

## 3. 跨模块共性问题（优先修复）

### 3.1 上传规格与清单不一致

| 项目 | 测试清单 | 代码实际 |
|------|---------|---------|
| 单文件大小 | ≤ **100MB**（DOC-005） | 前端统一 **50MB**（`DocumentUpload`、`FileList`、`PatientDetail` 等） |
| 单次数量 | **< 50**（DOC-006） | **无数量校验**；上传页文案写「批量≤100个」 |
| 后端校验 | 期望前后端一致 | `document_service.upload_document` **不做**类型/大小校验，可绕过前端直调 API |

**相关文件**

- `frontend_new/src/pages/DocumentUpload/index.jsx`（`validateFileFormat`、须知文案）
- `frontend_new/src/pages/FileList/index.jsx`
- `backend/app/services/document_service.py`

### 3.2 多入口行为不一致

- **文档上传页**支持 PDF/JPG/PNG/DOCX/XLSX/CSV  
- **文件列表内嵌上传**仅 PDF/JPG/PNG（DOC-009 在 FileList 路径不通过）  
- **仪表盘「文件上传」**跳转至 `/document/file-list?openUpload=1`，非 `/document/upload`（DSH-002）

### 3.3 权限与数据隔离风险

| 问题 | 位置 | 影响用例 |
|------|------|---------|
| `update_document` 未传 `uploaded_by` | `document_service.py` → `get_document(document_id)` | META-004、ADM-002 |
| 元数据队列 `get_visible_by_id` 未按用户过滤 | `document_metadata_service.py` | META-003 |
| EHR 读取患者未校验 `owner_id` | `ehr_service.py` | ADM-002 |
| 管理员在主业务列表仍按 `uploaded_by`/`owner_id` 过滤 | 各业务 router + `uuid_user_id_or_none` | ADM-001 |

### 3.4 桩代码 / TODO

| API / 功能 | 文件 | 影响用例 |
|-----------|------|---------|
| `generateAiSummary` / `getAiSummary` 返回空桩 | `frontend_new/src/api/patient.js:654-655` | PAT-003、PAT-004 |
| `markDocumentReview` 空桩 | `frontend_new/src/api/document.js:702` | 上传页「标记审核」无效 |
| `createPatientAndArchiveGroup` 空桩 | `document.js:795` | 归档分组创建（若走该 API） |
| AIProcessing 字段保存/换患者 TODO | `AIProcessing/index.jsx:196-224` | ARC 系列（若走该页） |

### 3.5 清单路由笔误（代码已存在正确路由）

| 清单写法 | 实际路由 |
|---------|---------|
| `/research/research/projects` | `/research/projects` |
| `/research/research/research/projects/.../patient/pool/...` | `/research/projects/:projectId/patients/:patientId` |
| PRJ-018「导出 CSV」 | 后端仅支持 **xlsx**（`research/router.py` 464-465） |

### 3.6 归档页菜单隐藏

- `/document/processing`（AIProcessing / 归档及审核）**路由存在但主菜单已注释隐藏**  
- ARC 系列用例标注该路由；**实际主路径在 `/document/file-list`** 的分组匹配与批量归档

---

## 4. 分模块逐条审查

### 4.1 文档上传（DOC）— 12 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| DOC-001 | 单文档上传 | P0 | ✅ | `POST /documents` + `DocumentUpload`/`FileList` 调 `uploadDocument` | — |
| DOC-002 | 多文档一次选择上传 | P0 | ⚠️ | `multiple` + 循环/`useUploadManager` 并发上传 | 无统一批次语义；失败逐条提示 |
| DOC-003 | 文件夹上传 | P1 | ⚠️ | `webkitdirectory`（`DocumentUpload` 1264-1301；`FileList` 3033+） | 两页 MIME 白名单不一致 |
| DOC-004 | 上传列表数量与所选一致 | P0 | ⚠️ | 前端 success/failed 计数；拖拽过滤 unsupported 有提示 | 直调 API 可绕过前端计数 |
| DOC-005 | 单文件大小限制（≤100MB） | P0 | ⚠️ | 前端 **50MB**；后端无限制 | **与清单 100MB 冲突** |
| DOC-006 | 单次文档数量限制（<50） | P0 | ❌ | 未发现 `files.length` 校验 | 文案写 100 个但无代码 |
| DOC-007 | PDF 格式支持 | P0 | ✅ | MIME `application/pdf`；上传后可自动排队 OCR | — |
| DOC-008 | JPG/PNG 图片格式 | P0 | ✅ | `image/jpeg`、`image/png` | — |
| DOC-009 | Word（.docx） | P1 | ⚠️ | 上传页支持 docx；**FileList 上传不支持** | 入口不一致 |
| DOC-010 | Word（.doc） | P2 | ❌ | 白名单无 `application/msword` | 后端仍可能接收 |
| DOC-011 | 不支持格式或异常文件 | P1 | ⚠️ | 前端标 invalid；后端无类型校验 | 安全/一致性风险 |
| DOC-012 | 上传后在下游可见 | P0 | 🔬 | 列表 API 带 `uploaded_by` 过滤 | 须在文件列表/患者池实测 |

---

### 4.2 OCR（OCR）— 3 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| OCR-001 | OCR 成功 | P0 | ✅ | `queue_document_ocr` + Celery；`POST /documents/{id}/ocr` | — |
| OCR-002 | 重新 OCR | P1 | ⚠️ | 同 `/ocr` 接口；`DocumentDetailModal` 重新解析 | 异步 202，文案易误导为同步完成 |
| OCR-003 | OCR 失败或超时提示 | P2 | ⚠️ | `ocr_status=failed`；详情页轮询超时 | 各列表失败展示须实测 |

---

### 4.3 元数据抽取（META）— 5 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| META-001 | 元数据字段有值 | P0 | 🔬 | `DocumentMetadataService`；详情 `metadata_json` 展示 | 依赖 LLM/OCR 质量 |
| META-002 | 元数据准确率（抽样） | P1 | 🔬 | — | 纯人工抽样 |
| META-003 | 重新抽取元数据 | P1 | ⚠️ | `POST /documents/{id}/metadata`；详情「重新提取」 | 队列路径缺 `uploaded_by` 隔离 |
| META-004 | 元数据手工修改与保存 | P0 | ⚠️ | `PATCH /documents/{id}`；`DocumentDetailModal` 保存 | `update_document` 未校验文档归属 |
| META-005 | 元数据与文档绑定一致 | P1 | 🔬 | 按 `document_id` 存储 | E2E 防串档须实测 |

---

### 4.4 归档与患者绑定（ARC）— 13 条

> **主路径**：`/document/file-list`（分组树、匹配确认、批量归档）  
> **备用路径**：`/document/processing`（菜单隐藏；部分 TODO）

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| ARC-001 | 无已归档数据：单文档新建 | P0 | ⚠️ | `CreatePatientDrawer` + `archiveDocument` / `confirmCreatePatientAndArchive` | FileList 可完成；processing 页隐藏 |
| ARC-002 | 同患者多文档：同一分组 | P0 | ⚠️ | `batchArchiveDocuments`、`confirmGroupArchive` | — |
| ARC-003 | 不同患者多文档：不同分组 | P0 | ⚠️ | 分组树 + 按组确认归档 | — |
| ARC-004 | 单文档：新建 vs 已有患者 | P0 | ⚠️ | 匹配弹窗 + 选手动/已有患者 | — |
| ARC-005 | 多文档：手动/选择新建组合 | P1 | ⚠️ | FileList 批量交互 | UI 细节须实测 |
| ARC-006 | 患者信息缺失：新建与归档 | P0 | 🔬 | `createPatient` 表单校验 | 缺字段策略须实测 |
| ARC-007 | 已有患者：多文档自动推荐 | P0 | ⚠️ | `getDocumentAiMatchInfo`、`pickRecommendedPatientId` | — |
| ARC-008 | 手动选择绑定患者 | P0 | ⚠️ | FileList 搜索选患者 + `archiveDocument` | — |
| ARC-009 | 文档删除 | P1 | ✅ | `deleteDocument` 软删；删除前 `evidence-impact` | — |
| ARC-010 | 批量归档 | P0 | ⚠️ | `batchArchiveDocuments` | — |
| ARC-011 | 批量选择文档与分组 | P1 | ⚠️ | FileList 多选 + 分组筛选 | 须实测不误选 |
| ARC-012 | 批量删除 | P1 | ⚠️ | `deleteDocuments` + 确认 Modal | — |
| ARC-013 | 归档后患者池数据一致 | P0 | 🔬 | 患者详情文档列表、计数 API | 须 E2E 对账 |

---

### 4.5 文件列表（FIL）— 2 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| FIL-001 | 当前用户文档列表 | P0 | ⚠️ | `list_documents(..., uploaded_by=user_scope_id)` | 管理员不在此 API 见全库 |
| FIL-002 | 列表显示以及操作完整 | P0 | 🔬 | 患者/文件视图、`Segmented`、筛选、批量操作 | 大页面须 UI 实测 |

---

### 4.6 患者数据池（PAT）— 6 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| PAT-001 | 患者删除 | P1 | ✅ | `DELETE /patients/{id}`；池内 `batchDeletePatients` | 批量删亦支持单选 |
| PAT-002 | 患者新建 | P1 | ✅ | `POST /patients`；PatientPool 创建表单 | — |
| PAT-003 | AI 生成病情摘要 | P1 | ❌ | **`generateAiSummary` 空桩** | 无后端摘要 API |
| PAT-004 | 病情摘要异常处理 | P2 | ⚠️ | 前端有 catch/空态；摘要保存仅本地 | 因 Stub 无法测真实失败 |
| PAT-005 | 文档列表显示 | P1 | 🔬 | DocumentsTab + 筛选/排序/元数据展示 | 须实测 |
| PAT-006 | 文档上传（患者详情） | P1 | ⚠️ | `uploadAndArchiveAsync` + 进度轮询 + `updatePatientEhrFolder` | 全链路须 Celery 环境实测 |

---

### 4.7 CRF 与表单设计（CRF）— 21 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| CRF-001 | 支持上传 CSV 定义表单 | P1 | ✅ | `CRFDesigner` → `importCSV` / `CSVConverter` | — |
| CRF-002 | 四院 CSV 样例导入 | P0 | 🔬 | 同上 CSV 链路 | 须样例文件验收 |
| CRF-003 | 新增分组 | P0 | ✅ | `FolderTree` + `DesignModel.addFolder` | — |
| CRF-004 | 新增表单 | P0 | ✅ | 分组下 `GroupCard` / `DesignCanvas` | — |
| CRF-005 | 基础信息提示词是否可重复 | P1 | ⚠️ | `FieldConfigPanel` 可填 `extractionPrompt` | **无唯一性校验** |
| CRF-006 | 新增字段 | P0 | ✅ | 组件库拖拽 + `DesignModel.addField` | — |
| CRF-007 | 组件可拖拽 | P0 | ✅ | `@dnd-kit/sortable`（Field/Group/Canvas） | — |
| CRF-008 | 文件夹排序 | P1 | ✅ | `FolderTree` 拖拽 + `reorderFolders` | 保存后项目侧须对账 |
| CRF-009 | 表单排序 | P1 | ✅ | 组内拖拽排序 | 同上 |
| CRF-010 | 字段排序 | P0 | ✅ | `DesignModel.moveField` | — |
| CRF-011 | 子表内字段顺序 | P1 | ✅ | 子字段 CRUD/排序 | — |
| CRF-012 | 字段配置项完整性与回显 | P0 | ⚠️ | `FieldConfigPanel` + `SchemaGenerator` | 运行态必填须填报页实测 |
| CRF-013 | 文件/URL 类型可点击下载 | P1 | ⚠️ | 预览 `FormRenderer` → `FieldRenderer` | 依赖样例值 |
| CRF-014 | 「不参与抽取」字段 | P1 | ❌ | 抽取规划遍历全部叶子字段 | **无 skip/exclude 契约** |
| CRF-015 | 删除 CRF/模板 | P1 | ✅ | `DELETE /schema-templates/{id}` | 关联项目提示须实测 |
| CRF-016 | 复制模板 | P1 | ✅ | `cloneCrfTemplate` | UI 入口须确认 |
| CRF-017 | 系统模板 | P1 | ⚠️ | `is_system` 展示于创建向导 | 只读/复制策略须对权限 |
| CRF-018 | 基础信息修改 | P1 | ✅ | `updateCrfTemplateMeta` | — |
| CRF-019 | 预览 | P0 | ✅ | FormDesigner 预览 Modal | 复杂布局须目视 |
| CRF-020 | 导入科研项目后字段齐全 | P0 | ⚠️ | `assignTemplateToProject` + 项目 Schema 渲染 | 须应用后逐项核对 |
| CRF-021 | 导入科研项目后排序正确 | P0 | ⚠️ | `schema_json` 分层顺序 | 须设计器 vs 项目页对比 |

---

### 4.8 科研项目与抽取（PRJ）— 19 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| PRJ-001 | 创建科研项目 | P0 | ✅ | `POST /research/projects`；ResearchDataset 向导 | 路由 `/research/projects` |
| PRJ-002 | 项目流程（状态流转） | P1 | ⚠️ | `status` 字段 + `projectStatusMeta` | 状态机/UI 须实测 |
| PRJ-003 | 删除项目 | P1 | ⚠️ | `archive_project` → `status=deleted` | **软删**非物理删除 |
| PRJ-004 | 抽取 Pipeline 启动 | P0 | ✅ | `ExtractionService` + 进度 SSE/轮询 | 依赖 Worker |
| PRJ-005 | 表单与文档匹配正确 | P0 | ⚠️ | `extraction_planner` + `target_form_key` | 多文档须实数据 |
| PRJ-006 | 命中率（抽样） | P1 | 🔬 | — | 人工抽样 |
| PRJ-007 | 准确率（抽样） | P1 | 🔬 | — | 人工抽样 |
| PRJ-008 | 覆盖率 | P1 | 🔬 | 项目 stats / completeness | 人工统计 |
| PRJ-009 | 溯源：字段对应源文档 | P0 | ✅ | `FieldSourceViewer`、`ProjectPatientDetail` audit | — |
| PRJ-010 | 定位信息完整率 | P1 | 🔬 | bbox/页码/`EvidenceLocationResolver` | 须抽样 ≥20 字段 |
| PRJ-011 | 历史记录信息完整 | P0 | ⚠️ | `CrfEvent` / field history API + SchemaForm | 须实测时间轴 |
| PRJ-012 | 切换当前值为历史版本 | P0 | ⚠️ | `select-candidate` 等 API | 保存策略须实测 |
| PRJ-013 | 手工修改并保存 | P0 | ✅ | `PATCH .../crf/fields` | — |
| PRJ-014 | 右下角溯源信息齐全 | P0 | ⚠️ | `FieldSourceViewer` + PDF 高亮 | bbox 对齐须真档 |
| PRJ-015 | 多次抽取值切换 | P0 | ⚠️ | SchemaForm 候选值切换 | — |
| PRJ-016 | 切换后手动保存 | P0 | ⚠️ | 候选选定 + 保存 API | — |
| PRJ-017 | 历史展示多次抽取与手动保存 | P0 | ⚠️ | history 事件聚合 | 须区分来源 |
| PRJ-018 | 抽取结果导出 CSV | P0 | ⚠️ | **`POST .../export` 仅 xlsx** | **与清单 CSV 字面不符** |
| PRJ-019 | 导出 CSV 字段完整性 | P1 | ⚠️ | `ResearchProjectExportService.export_crf_xlsx` | 须打开 xlsx 核对 |

---

### 4.9 靶向抽取（TGT）— 4 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| TGT-001 | 上传后自动绑定患者 | P1 | ⚠️ | 患者详情 `uploadAndArchiveAsync` | 依赖元数据匹配质量 |
| TGT-002 | 自动抽取指定表单 | P1 | ⚠️ | `target_form_keys` + `update-folder` API | 是否自动触发看前端流程 |
| TGT-003 | 未覆盖字段被新抽取覆盖 | P0 | ⚠️ | `incremental` 按**表单级**跳过已抽文档 | **非字段级**空值补齐 |
| TGT-004 | 靶向重新抽取 | P1 | ⚠️ | 再次 `update-folder` / 靶向 job | 历史可追溯须 UI 实测 |

---

### 4.10 仪表板（DSH）— 4 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| DSH-001 | 统计数量正确 | P0 | ⚠️ | `dashboard_service` 按用户 scope 聚合 | 「无冲突」分布 value 固定 0 |
| DSH-002 | 跳转：文档上传 | P0 | ⚠️ | 快捷入口 → **file-list?openUpload=1** | 非 `/document/upload` |
| DSH-003 | 跳转：患者池/科研等 | P1 | ✅ | KPI `navigate` 至 pool/research/file-list | — |
| DSH-004 | 刷新后数据一致 | P2 | 🔬 | 挂载拉取 + 定时轮询 | F5 后须目测 |

---

### 4.11 用户与账号（USR）— 4 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| USR-001 | 登录 | P0 | ✅ | `Login.jsx` + `POST /auth/login` | 微信 Tab 为模拟 |
| USR-002 | 注册 | P1 | ✅ | `POST /register` + 邮箱验证码 | — |
| USR-003 | 消息通知 | P1 | ⚠️ | 铃铛 + Redux + localStorage | **无 `/user/notifications` 路由** |
| USR-004 | 搜索 | P1 | ⚠️ | 患者/文件列表 keyword 有效 | **科研项目搜索前后端均未实现过滤** |

---

### 4.12 管理员与权限（ADM）— 3 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| ADM-001 | 管理员可见所有用户数据 | P0 | ⚠️ | `/admin` 全站视图；**主列表仍个人 scope** | 与「主界面见全库」常见预期不符 |
| ADM-002 | 普通用户数据隔离 | P0 | ⚠️ | 患者/文档/项目 owner 过滤 | **EHR API 缺 owner 校验** |
| ADM-003 | 管理端列表字段与操作 | P2 | ✅ | `Admin/index.jsx` 多 Tab 表格 | — |

---

### 4.13 通用 UI（UI）— 4 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| UI-001 | 主要页面布局（大屏） | P1 | 🔬 | Ant Design Layout + 各页栅格 | 须 1920×1080 目视 |
| UI-002 | 主要页面布局（笔记本） | P1 | 🔬 | 同上 | 须 1366/1440 目视 |
| UI-003 | 未实现功能不得裸露无效按钮 | P0 | ⚠️ | 归档/抽取等菜单已隐藏 | 科研「高级筛选」无 onClick |
| UI-004 | 加载与空态 | P2 | 🔬 | 各页 Spin/Empty | 慢网络须实测 |

---

### 4.14 端到端冒烟（SMK）— 3 条

| 编号 | 用例标题 | 优先级 | 状态 | 代码实现要点 | 正确性 / 备注 |
|------|---------|--------|------|-------------|--------------|
| SMK-001 | 全链路冒烟 | P0 | 🔬 | 上传→OCR→元数据→归档→抽取→溯源→导出模块均存在 | **须 Celery/OCR/LLM 环境联调** |
| SMK-002 | 缺陷归因 | P1 | 🔬 | — | 测试管理流程，非代码项 |
| SMK-003 | 与 PRJ/FIL 交叉复核 | P2 | 🔬 | — | 测试管理流程，非代码项 |

---

## 5. P0 用例专项汇总（共 38 条）

| 状态 | P0 数量 | 编号 |
|------|---------|------|
| ✅ 完成 | 11 | DOC-001,007,008, OCR-001, ARC-009, FIL-001*, PRJ-001,004,009,013, DSH-003, USR-001, ADM-*（001/002 为⚠️） |
| ⚠️ 部分完成 | 19 | DOC-002,004,005,009,011, META-003,004, ARC-001~004,007,008,010, PRJ-005,011~017,018, TGT-003, DSH-001,002, USR-003,004, ADM-001,002, UI-003 |
| ❌ 未实现 | 1 | **DOC-006** |
| 🔬 需人工验证 | 7 | DOC-012, META-001, ARC-006,013, FIL-002, SMK-001 |

\*FIL-001 标注 ⚠️：实现为「当前用户 scope」，非管理员全库视图。

**P0 最可能在验收中失败的项**：DOC-005/006（规格偏差）、DOC-010（.doc）、PAT-003（摘要 Stub）、CRF-014（跳过抽取）、PRJ-018（CSV vs xlsx）、ADM-002（EHR 越权）、UI-003（死按钮）。

---

## 6. 建议修复优先级

### P0 — 阻塞清单验收或存在安全风险

1. **统一上传规格**：决定 50MB 还是 100MB、49 还是 50/100 上限；前后端同时校验  
2. **文档 PATCH / 元数据队列加 `uploaded_by`**  
3. **EHR 读取加 `owner_id` 校验**（ADM-002）  
4. **实现或下线 PAT-003 AI 摘要**（当前 Stub 假成功）  
5. **PRJ-018**：支持 CSV 导出或更新清单为 xlsx  
6. **科研项目列表搜索**：后端加 keyword 或前端 client-side filter  

### P1 — 体验与一致性

7. 统一 DocumentUpload 与 FileList 的 MIME 白名单  
8. 实现 CRF「不参与抽取」字段契约（CRF-014）  
9. 修复仪表盘冲突分布「无冲突=0」硬编码  
10. 归档主路径文档化：清单路由从 hidden `/document/processing` 改为 `/document/file-list`  
11. 实现或移除：`markDocumentReview`、科研「高级筛选」、AIProcessing TODO  

### P2 — 文档与清单维护

12. 修正清单中的重复 `/research/research/` 路由笔误  
13. 明确 .doc、微信登录、V2 测试页是否在本迭代范围  

---

## 7. 关键代码索引

| 能力 | 前端 | 后端 |
|------|------|------|
| 文档上传 | `pages/DocumentUpload/index.jsx` | `api/v1/documents/router.py` |
| 文件列表/归档 | `pages/FileList/index.jsx` | `services/document_service.py` |
| OCR | `api/document.js` `parseDocument` | `workers/ocr_tasks.py` |
| 元数据 | `DocumentDetailModal.jsx` | `document_metadata_service.py` |
| 患者池 | `pages/PatientPool/index.jsx` | `api/v1/patients/router.py` |
| CRF 设计器 | `components/FormDesigner/` | `api/v1/schema_templates/` |
| 项目抽取/溯源 | `ResearchDataset/ProjectPatientDetail.jsx` | `services/extraction_service.py` |
| 导出 | `ProjectDatasetView.jsx` | `research/router.py` export |
| 仪表板 | `pages/Dashboard/index.jsx` | `services/dashboard_service.py` |
| 管理后台 | `pages/Admin/index.jsx` | `api/v1/admin/router.py` |
| 鉴权 | `pages/UserSystem/Login.jsx` | `api/v1/auth/router.py` |

---

## 8. 结论

从代码静态分析看，EACY 已具备医疗文档处理平台的核心能力：**多格式上传、异步 OCR/元数据、患者归档匹配、CRF 设计、科研项目抽取与字段溯源**。  

与测试清单对照，**约 30% 用例可认为代码层面就绪**，**近半数为部分完成**（多因规格不一致、多入口差异、Stub 或权限缺口），**4 条明确未实现**，**约 20% 必须人工/联调验证**（准确率、布局、全链路）。  

建议在正式走清单前：**先对齐 DOC-005/006、PRJ-018 的产品规格**，并修复第 6 节 P0 项，可显著降低验收过程中的「代码已实现但用例失败」误判。

---

*本报告由源码静态审查生成，不代表运行时测试结果。*
