# EACY 前端测试清单 — 「部分完成」用例专项分析

> **对照清单**：`EACY_前端测试清单 - 完整测试用例.csv`  
> **关联报告**：`EACY_前端测试清单_代码审查报告.md`  
> **更新日期**：2026-05-20  
> **说明**：本文档仅分析原报告中标记为 ⚠️ **部分完成** 的用例；已在前序开发中升为 ✅ 的条目单独列出。

---

## 1. 执行摘要

| 维度 | 数量 |
|------|------|
| 原报告「部分完成」 | 47 |
| 已在前序开发中升为 ✅ | 7 |
| **当前仍属部分完成** | **~40** |
| 其中 P0 | ~22 |
| 纯规格/清单问题（改文档或小幅改代码） | ~6 |
| 安全/权限缺口 | ~5 |
| 桩代码 / TODO / 死按钮 | ~5 |
| 需联调或实测才能定论 | ~15 |
| 纯代码可较快闭合 | ~10 |

**结论**：「部分完成」不等于功能大段缺失，主要是 **规格不一致、多入口分散、权限未收口、桩/死按钮、业务语义比用例粗** 五类问题叠加。

---

## 2. 已从前序开发升为「完成」的条目

以下条目在原审查中为 ❌ 或 ⚠️，经 2026-05-20 代码改动后，可视为 **基本完成**：

| 编号 | 原状态 | 现状态 | 改动要点 |
|------|--------|--------|----------|
| DOC-006 | ❌ | ✅ | `uploadLimits.js`：单次最多 49 个；4 个上传入口 + 后端校验 |
| DOC-010 | ❌ | ✅ | `.doc` 明确拒绝；`document_upload_validation.py` |
| DOC-011 | ⚠️ | ✅/⚠️ | 后端类型/大小校验已加；损坏 PDF 等仍须实测 |
| DOC-009 | ⚠️ | ✅ | FileList 统一走 `uploadLimits`，含 docx |
| CRF-014 | ❌ | ✅ | `x-skip-extraction`：设计器 → Schema → `schema_field_planner` |
| PAT-003 | ❌ | ✅ | `PatientSummaryService` + `/ai-summary` API |
| PAT-004 | ⚠️ | ✅/⚠️ | `saveAiSummary` 持久化；LLM 失败场景须联调 |

**相关新增/修改文件**

- `frontend_new/src/constants/uploadLimits.js`
- `backend/app/services/document_upload_validation.py`
- `backend/app/services/patient_summary_service.py`
- `backend/app/api/v1/patients/router.py`（ai-summary 路由）
- `backend/app/services/schema_field_planner.py`（skip extraction）
- `frontend_new/src/components/FormDesigner/`（skipExtraction 开关）

---

## 3. 根因分类（6 类）

### 3.1 类型 A — 产品规格 vs 测试清单不一致

改清单或改代码二选一即可闭合，不必同时大改。

| 编号 | 优先级 | 缺口 | 建议 |
|------|--------|------|------|
| DOC-005 | P0 | 清单 ≤100MB，代码统一 **50MB**（前后端已一致） | 改清单为 50MB，或把 `MAX_UPLOAD_FILE_SIZE` / `DOCUMENT_MAX_FILE_SIZE_BYTES` 改为 100MB |
| PRJ-018 | P0 | 清单写 **CSV**，实现仅 **xlsx** | 增加 CSV 导出，或改清单/验收标准为 Excel |
| PRJ-019 | P1 | 同上 | 打开 xlsx 核对字段；或随 PRJ-018 一并定口径 |
| DSH-002 | P0 | 清单 `/document/upload`，仪表盘跳 **file-list?openUpload=1** | 改 Dashboard 跳转，或清单写「等价入口」 |
| PRJ-002 | P1 | 「状态流转」是否有完整 UI 状态机未静态确认 | 按 `projectStatusMeta` 实测各状态按钮 |
| PRJ-003 | P1 | 「删除」实为 **软删** `status=deleted` | 清单注明软删，或补物理删除 API |

---

### 3.2 类型 B — 多入口 / 多页面行为不一致

| 编号 | 优先级 | 缺口 | 建议 |
|------|--------|------|------|
| DOC-002 | P0 | 上传页串行上传，FileList 用 `useUploadManager` 并发；无统一批次 ID | 抽统一上传层；批次结果汇总（成功/失败/总数） |
| DOC-003 | P1 | 文件夹上传会过滤非法文件，数量与「所选」可能不一致 | 上传前汇总：「共选 N，合法 M，拒绝 K」 |
| DOC-004 | P0 | 同上；直调 API 不受前端计数约束 | 后端批量接口或审计；前端统一批次 UX |
| ARC-001~012 | P0/P1 | 清单写 `/document/processing`，**主菜单隐藏**且页内 TODO；主路径在 **FileList** | 更新清单路由；或恢复菜单并补全 AIProcessing |
| ARC-005 | P1 | FileList 批量交互细节 | UI 实测：手动/选择新建组合 |
| ARC-011 | P1 | 多选 + 分组筛选 | 实测不误选其他组 |

**归档页说明**

- 路由仍存在：`/document/processing`（`AIProcessing`）
- 主菜单已注释隐藏（`router/index.jsx`）
- **实际主路径**：`/document/file-list`（分组树、匹配、批量归档）

---

### 3.3 类型 C — 安全 / 权限隔离缺口（P0 风险）

| 编号 | 优先级 | 缺口 | 代码位置 | 建议 |
|------|--------|------|----------|------|
| META-003 | P1 | 元数据队列未按用户过滤 | `document_metadata_service.py` 第 30、49、104 行 `get_visible_by_id(document_id)` 未传 `uploaded_by` | 路由传入 `user_scope_id`，队列与处理均校验 |
| META-004 | P0 | PATCH 文档未校验归属 | `document_service.py` → `update_document` → `get_document(document_id)` 未传 `uploaded_by` | PATCH 必须带 owner 校验 |
| ADM-002 | P0 | EHR 读取未校验患者归属 | `ehr_service.py` 第 68、81 行 `get_active_by_id(patient_id)` 未传 `owner_id` | 与患者详情 API 一致 |
| ADM-001 | P0 | 管理员在主业务列表仍只看本人 scope | 各业务 router + `uuid_user_id_or_none` | 与产品定：主列表是否扩权；全库仅在 `/admin` 是否可接受 |
| FIL-001 | P0 | 同上，文件列表不按 admin 放宽 | `documents/router.py` `list_documents(..., uploaded_by=...)` | 与 ADM-001 一并定方案 |

---

### 3.4 类型 D — 桩代码 / TODO / 死按钮

| 编号 | 优先级 | 缺口 | 位置 |
|------|--------|------|------|
| — | — | `markDocumentReview` 空桩，上传页「标记审核」无效 | `frontend_new/src/api/document.js:702` |
| ARC 相关 | P1 | `createPatientAndArchiveGroup` 空桩 | `document.js:795` |
| ARC 相关 | P0 | AIProcessing `handleFieldSave` / `handleChangePatient` 为 TODO | `AIProcessing/index.jsx:196-224` |
| UI-003 | P0 | 科研「高级筛选」无 `onClick` | `ResearchDataset/index.jsx` ~1441 |
| USR-004 | P1 | 前端传 `params.search`，后端 `list_projects` **无 search 参数**；前端 filter 也未用 keyword | `research/router.py` + `ResearchDataset/index.jsx` |

---

### 3.5 类型 E — 异步 / 文案 / 体验易误解

| 编号 | 优先级 | 缺口 | 建议 |
|------|--------|------|------|
| OCR-002 | P1 | 重新 OCR 为 **202 异步**，文案易误导为同步完成 | 统一「任务已提交」+ 轮询/SSE |
| OCR-003 | P2 | `ocr_status=failed` 有，各列表失败展示未统一验证 | 列表统一失败 Tag + `parse_error` |
| DSH-001 | P0 | 冲突分布「无冲突」**硬编码 value=0** | 修复 `dashboard_service._patient_conflict_distribution` |
| USR-003 | P1 | 铃铛 + localStorage，无 `/user/notifications` 路由 | 补通知页或改清单；可选后端通知表 |

---

### 3.6 类型 F — 业务逻辑有实现，但语义弱于用例

| 编号 | 优先级 | 缺口 | 说明 |
|------|--------|------|------|
| TGT-003 | P0 | `incremental` 按 **表单级** 跳过，非 **字段级** 空值补齐 | 改 `extraction_service._pending_plan_items_for_document` |
| TGT-001 | P1 | 自动绑定依赖元数据/OCR 质量 | 患者详情 `uploadAndArchiveAsync` 路径已有 |
| TGT-002 | P1 | 是否自动触发 `update-folder` 取决于前端流程 | 梳理上传后自动链路 |
| TGT-004 | P1 | 重新抽取与历史追溯 | 再次 `update-folder`；UI 实测 |
| CRF-005 | P1 | 抽取提示词 **无唯一性校验** | 若产品要求唯一，设计器保存时校验 |
| PRJ-005 | P0 | 文档→表单匹配靠 planner | 复杂多文档须实数据 |
| PRJ-011~017 | P0 | 历史/候选/切换/保存 API 有 | 时间轴、来源区分须 UI 实测 |
| PRJ-014 | P0 | 溯源组件齐全 | bbox 对齐依赖 OCR，须真档 |
| CRF-012 | P0 | 设计器配置完整 | 运行态必填须在填报页实测 |
| CRF-013 | P1 | 预览可渲染 file/url | 依赖样例值点击验证 |
| CRF-017 | P1 | 系统模板 `is_system` 仅展示 | 只读/复制策略须对权限 |
| CRF-020 | P0 | 模板应用到项目 | 须应用后逐项核对字段 |
| CRF-021 | P0 | 设计器 vs 项目页顺序 | 须对比 `schema_json` 分层顺序 |
| PAT-006 | P1 | 上传→OCR→元数据→绑定→抽取 | 代码路径有，依赖 Celery/OCR/LLM 联调 |

---

## 4. 分模块：仍属「部分完成」的完整清单

### 4.1 文档上传 DOC（4 条）

| 编号 | 标题 | P | 仍缺什么 | 升级到 ✅ 的条件 |
|------|------|---|----------|------------------|
| DOC-002 | 多文档一次选择上传 | P0 | 无统一批次语义；两入口并发策略不同 | 统一上传层 + 批次汇总 |
| DOC-003 | 文件夹上传 | P1 | 过滤后数量提示可能困惑 | 「选 N / 收 M / 拒 K」明确展示 |
| DOC-004 | 上传列表数量与所选一致 | P0 | 过滤/失败时计数易不一致 | 同上 + 后端约束 |
| DOC-005 | 单文件大小限制 | P0 | **50MB vs 清单 100MB** | 规格对齐 |

---

### 4.2 OCR（2 条）

| 编号 | 标题 | P | 仍缺什么 |
|------|------|---|----------|
| OCR-002 | 重新 OCR | P1 | 异步 202 vs 同步完成文案 |
| OCR-003 | OCR 失败或超时提示 | P2 | 各列表失败态一致性（须实测） |

---

### 4.3 元数据 META（2 条）

| 编号 | 标题 | P | 仍缺什么 |
|------|------|---|----------|
| META-003 | 重新抽取元数据 | P1 | `uploaded_by` 隔离 |
| META-004 | 元数据手工修改与保存 | P0 | PATCH 文档归属校验 |

---

### 4.4 归档 ARC（12 条，ARC-009 已为 ✅）

| 编号 | 标题 | P | 仍缺什么 |
|------|------|---|----------|
| ARC-001 | 无已归档：单文档新建 | P0 | 清单路由 vs FileList 主路径；processing 隐藏 |
| ARC-002 | 同患者多文档同一分组 | P0 | 能力在 FileList；清单路径/实测 |
| ARC-003 | 不同患者多文档不同分组 | P0 | 同上 |
| ARC-004 | 新建 vs 已有患者 | P0 | 同上 |
| ARC-005 | 多文档手动/选择新建 | P1 | UI 细节实测 |
| ARC-007 | 多文档自动推荐匹配 | P0 | 推荐准确度须实测 |
| ARC-008 | 手动选择绑定患者 | P0 | FileList 有；processing TODO |
| ARC-010 | 批量归档 | P0 | `batchArchiveDocuments` 有；E2E 确认 |
| ARC-011 | 批量选择文档与分组 | P1 | 多选/分组筛选实测 |
| ARC-012 | 批量删除 | P1 | 有确认 Modal；E2E 确认 |

**ARC 快速闭合（不改业务逻辑）**

1. 测试清单路由改为 `/document/file-list`
2. 实现或删除 `createPatientAndArchiveGroup`、`AIProcessing` TODO
3. 对 FileList 跑 ARC-001~012 验收

---

### 4.5 文件列表 FIL（1 条）

| 编号 | 标题 | P | 仍缺什么 |
|------|------|---|----------|
| FIL-001 | 当前用户文档列表 | P0 | 管理员是否在主列表见全库 — **产品设计**，非纯 bug |

---

### 4.6 患者 PAT（1 条）

| 编号 | 标题 | P | 仍缺什么 |
|------|------|---|----------|
| PAT-006 | 患者详情文档上传全链路 | P1 | 依赖 Celery/OCR/LLM 环境联调 |

---

### 4.7 CRF（6 条）

| 编号 | 标题 | P | 仍缺什么 |
|------|------|---|----------|
| CRF-005 | 提示词是否可重复 | P1 | 无唯一性校验（默认允许重复） |
| CRF-012 | 字段配置完整性与回显 | P0 | 运行态必填须填报页实测 |
| CRF-013 | 文件/URL 可点击下载 | P1 | 依赖样例值 |
| CRF-017 | 系统模板 | P1 | 只读/复制策略未闭环 |
| CRF-020 | 导入项目后字段齐全 | P0 | 应用模板后逐项核对 |
| CRF-021 | 导入项目后排序正确 | P0 | 设计器 vs 项目页对比 |

---

### 4.8 科研项目 PRJ（13 条）

| 编号 | 标题 | P | 仍缺什么 |
|------|------|---|----------|
| PRJ-002 | 项目流程状态流转 | P1 | 状态机/UI 实测 |
| PRJ-003 | 删除项目 | P1 | 软删语义 vs 清单「移除」 |
| PRJ-005 | 表单与文档匹配 | P0 | 多文档实数据验证 |
| PRJ-011 | 历史记录信息完整 | P0 | 时间轴实测 |
| PRJ-012 | 切换当前值为历史版本 | P0 | 保存策略实测 |
| PRJ-014 | 右下角溯源信息齐全 | P0 | bbox 对齐真档 |
| PRJ-015 | 多次抽取值切换 | P0 | SchemaForm 候选 UI |
| PRJ-016 | 切换后手动保存 | P0 | 选定版本持久化 |
| PRJ-017 | 历史展示多次抽取与手动 | P0 | 来源区分 |
| PRJ-018 | 导出 CSV | P0 | **仅 xlsx** |
| PRJ-019 | 导出字段完整性 | P1 | 打开导出文件核对 |

---

### 4.9 靶向抽取 TGT（4 条）

| 编号 | 标题 | P | 仍缺什么 |
|------|------|---|----------|
| TGT-001 | 上传后自动绑定患者 | P1 | 匹配质量依赖元数据/OCR |
| TGT-002 | 自动抽取指定表单 | P1 | 是否自动调 `update-folder` |
| TGT-003 | 未覆盖字段被新抽取覆盖 | P0 | **表单级** incremental，非字段级 |
| TGT-004 | 靶向重新抽取 | P1 | 历史追溯 UI 实测 |

---

### 4.10 仪表板 DSH（2 条）

| 编号 | 标题 | P | 仍缺什么 |
|------|------|---|----------|
| DSH-001 | 统计数量正确 | P0 | 「无冲突」分布 value 硬编码 0 |
| DSH-002 | 跳转文档上传 | P0 | 跳 file-list 非 `/document/upload` |

---

### 4.11 用户 USR（2 条）

| 编号 | 标题 | P | 仍缺什么 |
|------|------|---|----------|
| USR-003 | 消息通知 | P1 | 无 `/user/notifications`；仅本地铃铛 |
| USR-004 | 搜索 | P1 | **项目搜索前后端均未实现** |

---

### 4.12 管理员 ADM（2 条）

| 编号 | 标题 | P | 仍缺什么 |
|------|------|---|----------|
| ADM-001 | 管理员可见所有用户数据 | P0 | 主列表仍个人 scope；全库在 `/admin` |
| ADM-002 | 普通用户数据隔离 | P0 | **EHR API 缺 owner 校验** |

---

### 4.13 通用 UI（1 条）

| 编号 | 标题 | P | 仍缺什么 |
|------|------|---|----------|
| UI-003 | 无不实现裸按钮 | P0 | 高级筛选无交互；微信登录占位等 |

---

## 5. 修复优先级路线图

### 5.1 P0 — 安全 / 隔离（约 1～2 天）

```
META-003/004  → 文档元数据 uploaded_by 校验
ADM-002       → EHR get_active_by_id 加 owner_id
ADM-001/FIL-001 → 与产品确认管理员主列表可见范围
```

### 5.2 P0 — 验收口径（约 0.5～1 天）

```
DOC-005       → 50MB vs 100MB 定稿
PRJ-018/019   → CSV vs xlsx 定稿
DSH-002       → 跳转 URL 或改清单
```

### 5.3 P1 — 体验 / 一致性（约 2～3 天）

```
USR-004       → 项目 list API 加 keyword 或前端 filter
UI-003        → 高级筛选 / 死按钮
OCR-002       → 异步文案
DSH-001       → 冲突分布统计 bug
DOC-002/004   → 统一上传批次 UX
归档清单      → 路由改为 /document/file-list
markDocumentReview / AIProcessing TODO / createPatientAndArchiveGroup
```

### 5.4 P2 — 业务深化（按产品排期）

```
TGT-003       → 字段级 incremental
CRF-005       → 提示词唯一性（若需要）
PRJ-011~017   → 历史/候选 UI 打磨
PAT-006 / ARC / PRJ-005 等 → 联调与实数据验收
```

---

## 6. P0「部分完成」专项表（22 条）

便于测试与研发对焦：

| 编号 | 模块 | 主要阻塞原因 | 建议动作 |
|------|------|-------------|----------|
| DOC-002 | 上传 | 多入口不一致 | 统一上传组件 |
| DOC-004 | 上传 | 批次计数 | 批次汇总 UX |
| DOC-005 | 上传 | 50 vs 100MB | 定规格 |
| META-004 | 元数据 | PATCH 越权 | 加 uploaded_by |
| ARC-001 | 归档 | 清单路由错误 | 改清单 / 恢复菜单 |
| ARC-002 | 归档 | 同上 + E2E | FileList 实测 |
| ARC-003 | 归档 | 同上 | 同上 |
| ARC-004 | 归档 | 同上 | 同上 |
| ARC-007 | 归档 | 推荐质量 | 实数据 |
| ARC-008 | 归档 | processing TODO | FileList 为主 |
| ARC-010 | 归档 | E2E | 批量归档实测 |
| FIL-001 | 列表 | admin scope 设计 | 产品决策 |
| PRJ-005 | 科研 | 匹配质量 | 实数据 |
| PRJ-011 | 科研 | 历史 UI | 实测 |
| PRJ-012 | 科研 | 版本切换 | 实测 |
| PRJ-014 | 科研 | bbox | 真档 |
| PRJ-015 | 科研 | 候选切换 | 实测 |
| PRJ-016 | 科研 | 保存 | 实测 |
| PRJ-017 | 科研 | 历史来源 | 实测 |
| PRJ-018 | 科研 | CSV vs xlsx | 定规格 |
| TGT-003 | 靶向 | 表单级 incremental | 产品确认是否改 |
| DSH-001 | 仪表板 | 统计 bug | 修 dashboard_service |
| DSH-002 | 仪表板 | 跳转 URL | 改跳转或清单 |
| ADM-001 | 权限 | admin 主列表 | 产品决策 |
| ADM-002 | 权限 | EHR 越权 | 加 owner_id |
| UI-003 | UI | 死按钮 | 实现或隐藏 |

---

## 7. 与主审查报告的数值关系

| 报告原统计 | 说明 |
|-----------|------|
| 部分完成 47 | 初版静态审查 |
| 未实现 4 → 现 0（均已实现） | DOC-006/010、CRF-014、PAT-003 |
| 完成 31 → 现 ~38 | 加上上述 7 条 |
| 部分完成 47 → 现 **~40** | 减去已闭合 7 条 |

建议在下一轮全量审查时同步更新 `EACY_前端测试清单_代码审查报告.md` 第 1、4、5、8 节数值。

---

## 8. 关键代码索引（Remediation 相关）

| 问题域 | 前端 | 后端 |
|--------|------|------|
| 上传规格 | `constants/uploadLimits.js` | `document_upload_validation.py` |
| 元数据隔离 | `DocumentDetailModal.jsx` | `document_metadata_service.py` |
| 文档 PATCH | `api/document.js` | `document_service.update_document` |
| EHR 越权 | — | `ehr_service.py` |
| 项目搜索 | `ResearchDataset/index.jsx` | `research/router.py` list_projects |
| 仪表板统计 | `Dashboard/index.jsx` | `dashboard_service.py` |
| 归档主路径 | `FileList/index.jsx` | `document_service` archive/batch |
| 靶向 incremental | `PatientDetail` / 项目抽取入口 | `extraction_service.py` |
| 死按钮/桩 | `ResearchDataset`, `AIProcessing` | `document.js` stubs |

---

*本文档由代码静态分析生成；标注「须实测」「须联调」的条目需在有 Celery/OCR/LLM 的环境中验证。*
