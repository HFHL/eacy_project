---
title: EACY开发计划 5.1 第一批前端真实接入实施路径
tags:
  - eacy
  - frontend
  - api
  - plan
status: todo
created: 2026-04-28
---

# EACY开发计划 5.1 第一批前端真实接入实施路径

> [!summary]
> 当前后端最小业务闭环已经基本成型，下一步优先处理前端仍然返回空数据的问题。目标不是一次性替换所有 mock，而是先打通“患者池真实数据 -> 患者详情 -> 文档上传/列表 -> EHR 查看”的最小前端闭环。

返回：[[EACY开发计划#阶段 5：第一批前端真实接入]]

## 当前判断

后端已经具备阶段 5 所需的核心接口：

```text
GET     /api/v1/auth/me
GET     /api/v1/patients
POST    /api/v1/patients
GET     /api/v1/patients/{patient_id}
PATCH   /api/v1/patients/{patient_id}
DELETE  /api/v1/patients/{patient_id}
GET     /api/v1/patients/{patient_id}/ehr

POST    /api/v1/documents
GET     /api/v1/documents
GET     /api/v1/documents/{document_id}
PATCH   /api/v1/documents/{document_id}
DELETE  /api/v1/documents/{document_id}
POST    /api/v1/documents/{document_id}/archive
POST    /api/v1/documents/{document_id}/unarchive
```

前端当前主要问题：

- `frontend_new/src/api/request.js` 仍然是空请求层，所有 method 都返回 `emptySuccess`。
- `frontend_new/src/api/auth.js` 已接入 `/auth/me` 读取当前用户。
- `frontend_new/src/api/patient.js` 仍然返回空患者列表、空详情、空 EHR。
- `frontend_new/src/api/document.js` 仍然返回空文档列表、空上传结果。

因此下一步应从前端 API 层开始，而不是继续扩后端能力。

## 目标闭环

```text
前端启动
  -> 调用 /api/v1/auth/me 获得 dev_admin
  -> 患者池读取真实 patients
  -> 新建患者写入数据库
  -> 刷新页面后患者仍然存在
  -> 打开患者详情读取真实患者信息和 EHR
  -> 上传文档写入 documents
  -> 文件列表读取真实 documents
  -> 文档可归档到患者
```

## 实施顺序

### 5.1.1 建立真实 request 层

任务：

- [x] 修改 `frontend_new/src/api/request.js`
- [x] 支持 `GET / POST / PUT / PATCH / DELETE`
- [x] 默认 base URL 指向 `/api/v1`
- [x] 支持 `VITE_API_BASE_URL` 覆盖后端地址
- [x] 支持 JSON request body
- [x] 支持 `FormData` 上传，不手动设置 multipart boundary
- [x] 统一解析 JSON 响应
- [x] 统一处理 `204 No Content`
- [x] 统一抛出后端错误信息，便于页面显示

建议行为：

```text
VITE_API_BASE_URL=http://localhost:8000/api/v1
未配置时默认 /api/v1
```

验收标准：

- [x] `request.get('/health')` 可以得到 `{ "status": "ok" }`
- [x] `request.get('/auth/me')` 可以得到 `dev_admin`
- [x] 后端返回 4xx/5xx 时，前端能进入 catch 分支
- [x] `FormData` 请求不会被错误设置为 `application/json`
- [x] 浏览器控制台没有 request 层语法错误

验收结果（2026-04-28）：

- [x] `npm.cmd run build` 通过。
- [x] 后端 `http://localhost:8000/api/v1/health` 返回 `{"status":"ok"}`。
- [x] 后端 `http://localhost:8000/api/v1/auth/me` 返回 `dev_admin`。
- [x] Vite 代理 `http://localhost:5173/api/v1/health` 返回 `{"status":"ok"}`。
- [x] Vite 代理 `http://localhost:5173/api/v1/auth/me` 返回 `dev_admin`。
- [x] 已启动后端 `http://localhost:8000` 和前端 `http://localhost:5173`。

验证命令：

```bash
cd frontend_new
npm run dev
```

手动验证：

```text
打开浏览器控制台
调用前端页面中会触发的 auth/me 或 patients 请求
确认 Network 面板请求真实后端，而不是返回 emptySuccess
```

### 5.1.2 接入 auth 当前用户

任务：

- [x] 修改 `frontend_new/src/api/auth.js`
- [x] `getCurrentUser()` 调用 `GET /auth/me`
- [x] 保留登录、注册、微信登录等后置能力为空实现或兼容实现
- [x] 不在本阶段引入真实登录流程

验收标准：

- [x] 前端启动后能读取当前用户
- [x] `ENABLE_AUTH=false` 时当前用户为后端注入的 `dev_admin`
- [x] 无 token 时页面仍可进入开发态
- [x] 不影响现有页面路由进入

验收记录：

- `getCurrentUser()` 已通过统一 `request.get('/auth/me')` 读取后端当前用户，并兼容映射 `username -> name`。
- `npm.cmd run build` 通过，Vite 生产构建成功。

### 5.1.3 接入患者池真实数据

任务：

- [x] 修改 `frontend_new/src/api/patient.js`
- [x] `getPatientList(params)` 调用 `GET /patients`
- [x] `createPatient(data)` 调用 `POST /patients`
- [x] `getPatientDetail(patientId)` 调用 `GET /patients/{patientId}`
- [x] `updatePatient(patientId, data)` 调用 `PATCH /patients/{patientId}`
- [x] `deletePatient(patientId)` 调用 `DELETE /patients/{patientId}`
- [x] 兼容前端现有字段命名，必要时在 API 层做轻量映射
- [x] 保持返回结构兼容现有页面，例如 `list/items/total/page/page_size`

字段映射建议：

| 前端字段 | 后端字段 | 说明 |
|---|---|---|
| `id` | `id` | 患者 ID |
| `name` | `name` | 姓名 |
| `gender` | `gender` | 性别 |
| `age` | `age` | 年龄 |
| `department` | `department` | 科室 |
| `diagnosis` | `main_diagnosis` | 如前端使用 diagnosis，需要映射 |
| `doctor` | `doctor_name` | 如前端使用 doctor，需要映射 |

验收标准：

- [x] `/patient/pool` 页面不再显示空列表，能读取数据库患者
- [x] 在患者池创建患者后，数据库新增记录
- [x] 创建患者后刷新页面，患者仍然存在
- [x] 患者列表分页参数能传到后端
- [x] 搜索关键词能传到后端 `keyword`
- [x] 更新患者后刷新页面仍显示新值
- [x] 删除患者后列表不再显示该患者
- [x] 浏览器 Network 中患者相关请求命中 `/api/v1/patients`

后端验证：

```bash
cd backend
python -m pytest tests/app/test_patient_api.py
```

验收记录：

- `frontend_new/src/api/patient.js` 已接入真实 `/api/v1/patients` CRUD，并在 API 层兼容 `diagnosis/main_diagnosis`、`doctor/doctor_name/attending_doctor_name`、`department/department_name/department_id` 等旧字段。
- 患者列表请求会把 `search` 映射为后端 `keyword`，并传递 `page/page_size` 分页参数；返回值同时兼容数组消费和 `items/list/total/page/page_size` 旧结构。
- 后端删除校验已允许删除仅初始化了空 EHR 上下文的新患者，避免新建患者因自动初始化 EHR 而无法完成删除验收。
- `python -m pytest tests/app/test_patient_api.py` 通过。
- `npm.cmd run build` 通过，Vite 生产构建成功。

前端手动验收路径：

```text
/patient/pool
新建患者
刷新页面
搜索患者
打开患者详情
编辑患者基础信息
删除测试患者
```

### 5.1.4 接入患者详情 EHR

任务：

- [x] `getPatientEhr(patientId)` 调用 `GET /patients/{patientId}/ehr`
- [x] `getPatientEhrSchemaData(patientId)` 可先复用 `getPatientEhr`
- [x] `updatePatientEhrSchemaData(patientId, data)` 暂时只接入单字段更新能力
- [x] `updatePatientEhr(patientId, data)` 根据页面实际调用决定是否保留兼容层
- [x] EHR 页面缺少字段时显示空态，不回退到 mock 患者数据

验收标准：

- [x] 患者详情页能打开真实患者
- [x] 患者 EHR tab 能调用 `/api/v1/patients/{patient_id}/ehr`
- [x] 没有 EHR 值时显示空态，而不是假数据
- [x] 手动编辑 EHR 字段后，后端产生 `manual_edit` 事件
- [x] 刷新页面后 EHR 当前值仍然存在
- [x] 字段历史、候选值、证据接口如暂未接入，需要明确保留空态，不伪造数据

验收记录：

- `frontend_new/src/api/patient.js` 已接入患者 EHR 真实读取，`current_values` 会还原为 Schema 表单可消费的嵌套 `data`。
- `getPatientEhrSchemaData(patientId)` 复用 `getPatientEhr(patientId)`，患者详情 EHR tab 进入时会请求 `/api/v1/patients/{patient_id}/ehr`。
- `updatePatientEhrSchemaData(patientId, data, { previousData })` 会对比上次已保存快照，只对变更字段调用 `PATCH /patients/{patient_id}/ehr/fields/{field_path}`，后端按 `manual_edit` 写入事件并更新当前值。
- `updatePatientEhr(patientId, data)` 保留为兼容层，委托到 Schema EHR 更新逻辑。
- `SchemaEhrTab` 已记录已保存快照；没有 EHR 值时使用空对象，独立演示页无 `patientId` 时才允许使用本地 mock。
- 字段历史已接入 `/events` 并标准化为前端历史结构；候选值接口当前明确返回空态，不伪造候选。
- `python -m pytest tests/app/test_patient_ehr_api.py` 通过。
- `npm.cmd run build` 通过。首次沙箱内构建因 `esbuild` 子进程 `spawn EPERM` 失败，已按权限流程在沙箱外重跑通过。

后端验证：

```bash
cd backend
python -m pytest tests/app/test_patient_ehr_api.py
```

前端手动验收路径：

```text
/patient/detail/:patientId
打开 EHR tab
查看空态或真实字段值
编辑一个字段
刷新页面
确认字段值仍存在
```

### 5.1.5 接入文档上传与文档列表

任务：

- [x] 修改 `frontend_new/src/api/document.js`
- [x] `uploadDocument(file, patientId?)` 调用 `POST /documents`
- [x] `getDocumentList(params)` 调用 `GET /documents`
- [x] `getDocumentDetail(documentId)` 调用 `GET /documents/{documentId}`
- [x] `updateDocumentMetadata(documentId, metadata)` 调用 `PATCH /documents/{documentId}`
- [x] `deleteDocument(documentId)` 调用 `DELETE /documents/{documentId}`
- [x] `archiveDocument(documentId, patientId)` 调用 `POST /documents/{documentId}/archive`
- [x] `unarchiveDocument(documentId)` 调用 `POST /documents/{documentId}/unarchive`
- [x] 未实现的复杂文档能力继续返回空态或明确提示暂未接入

上传请求约定：

```text
multipart/form-data
file: File
patient_id: optional string
```

验收标准：

- [x] `/document/upload` 可以上传一个真实文件
- [x] 上传后 `backend/uploads/` 出现对应文件
- [x] `documents` 表新增记录
- [x] `/document/file-list` 能显示真实文档
- [x] 文档详情能读取真实后端记录
- [x] 文档可以归档到患者
- [x] 归档后患者详情页能看到该患者相关文档
- [x] 删除文档后列表不再显示该文档，或按后端状态显示为已删除
- [x] 浏览器 Network 中文档相关请求命中 `/api/v1/documents`

后端验证：

```bash
cd backend
python -m pytest tests/app/test_document_api.py
```

前端手动验收路径：

```text
/document/upload
上传文件
/document/file-list
打开文档详情
归档到患者
/patient/detail/:patientId
查看患者文档
```

验收记录：

- issue fix：[[EACY开发计划 5.1.5 接入文档上传与文档列表 - issue fix + 文档上传 500 Internal Server Error]]
- `frontend_new/src/api/document.js` 已接入真实 `/documents` 上传、列表、详情、元数据更新、删除、归档、解归档接口，并在 API 层兼容旧页面依赖的 `file_name/task_status/patient_info/metadata` 字段。
- `frontend_new/src/api/patient.js` 的 `getPatientDocuments(patientId)` 已复用真实文档列表接口，患者详情文档 Tab 不再返回固定空列表。
- 归档接口响应序列化已修复：避免保存后在读写分离路由下 `refresh()` 读到旧值，同时通过显式设置 `updated_at` 避免 Pydantic 读取字段时触发 SQLAlchemy async lazy load。
- 2026-04-28 真实链路验收通过：经 `http://localhost:5173/api/v1/documents` 上传验收文件，确认落盘、列表、详情、归档到患者、患者文档可见、删除后默认列表隐藏均通过。
- 未接入的 OCR、AI 匹配、批量分组等复杂能力继续保留空态/任务空实现，避免扩大本阶段范围。
- `python -m pytest tests/app/test_document_api.py` 通过。
- `npm.cmd run build` 通过。沙箱内首次构建因 `esbuild` 子进程 `spawn EPERM` 失败，已按权限流程在沙箱外重跑通过。

### 5.1.6 最小端到端验收

任务：

- [ ] 启动后端
- [ ] 启动前端
- [ ] 创建患者
- [ ] 上传文档
- [ ] 文档归档到患者
- [ ] 打开患者详情
- [ ] 查看患者 EHR
- [ ] 刷新页面确认数据仍存在

验收标准：

- [ ] 前端页面没有明显白屏
- [ ] 浏览器控制台没有阻塞性错误
- [ ] 患者数据来自真实后端
- [ ] 文档数据来自真实后端
- [ ] 上传文件真实落盘
- [ ] 刷新页面后数据仍存在
- [ ] 所有已接入接口失败时有 error 状态，不静默返回假成功
- [ ] Obsidian 本计划中对应任务已勾选

建议验收顺序：

```text
1. /api/v1/health
2. /api/v1/auth/me
3. /patient/pool
4. 创建患者
5. /document/upload
6. /document/file-list
7. 文档归档到患者
8. /patient/detail/:patientId
9. EHR tab
```

## 暂不处理

本阶段不处理以下内容：

- [ ] 真实登录、注册、微信登录
- [ ] access token / refresh token 刷新机制
- [ ] CRF 模板设计器真实保存
- [ ] 科研项目真实接入
- [ ] Dashboard 统计真实接入
- [ ] WebSocket / SSE 任务进度
- [ ] 真实 OCR / LLM adapter
- [ ] 复杂文档分组、AI 自动匹配、批量归档

## 风险点

> [!warning]
> 前端页面历史上可能依赖旧字段名和旧响应结构。阶段 5.1 不建议大面积改页面组件，优先在 `src/api/*.js` 做兼容映射，等真实闭环跑通后再逐步清理页面层字段。

> [!warning]
> 不要把所有 mock 一次性删除。只替换当前验收路径需要的 API，其余能力继续保持空态或明确返回未接入，避免引入大范围页面回归。

## 完成定义

当以下条件全部满足时，5.1 可标记为完成：

- [ ] `request.js` 已接入真实 HTTP 请求
- [x] `auth.js` 已接入 `/auth/me`
- [x] `patient.js` 已接入患者 CRUD 和 EHR 读取
- [x] `document.js` 已接入上传、列表、详情、归档
- [ ] 患者池真实读写通过
- [ ] 文档上传真实读写通过
- [x] 患者详情真实 EHR 读取通过
- [ ] 刷新页面后数据仍存在
- [ ] 后端相关测试通过
- [ ] 前端手动验收路径通过
- [ ] [[EACY开发计划]] 阶段 5 对应验收项已更新

## 5.1.5.1 接入真实 OSS 文档存储

目标：文档上传不再只能落到 `backend/uploads/`，后端通过统一 storage backend 支持真实阿里云 OSS。开发和测试环境可继续使用 `local`，生产或联调环境通过环境变量切到 `oss`。

配置约定：

```text
DOCUMENT_STORAGE_PROVIDER=oss
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_BUCKET_NAME=cinocore-eacy
OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com
OSS_REGION=cn-shanghai
OSS_BASE_PREFIX=documents
OSS_PUBLIC_BASE_URL=
```

实现要求：

- [x] `core/config.py` 读取 OSS 和本地存储配置。
- [x] `backend/app/storage/document_storage.py` 封装 `LocalDocumentStorage` 和 `AliyunOssDocumentStorage`。
- [x] `DocumentService.upload_document()` 只依赖 storage backend，不直接写死 `uploads/`。
- [x] `DOCUMENT_STORAGE_PROVIDER=oss` 时，文件通过 OSS `PUT Object` 写入 bucket。
- [x] OSS 成功后 `documents.storage_provider = oss`。
- [x] OSS 成功后 `documents.storage_path` 保存 OSS object key，例如 `documents/2026/04/{uuid}.pdf`。
- [x] OSS 成功后 `documents.file_url` 保存可定位的 OSS URL 或自定义公开域名 URL。
- [x] 未配置 OSS 时默认继续使用 `local`，避免开发环境上传中断。
- [x] 不在代码中写死 AccessKey/Secret。

验收标准：

- [x] 后端单元测试覆盖 OSS storage metadata 写入：`storage_provider/storage_path/file_url/file_hash/file_size`。
- [x] `python -m pytest tests/app/test_document_api.py tests/services/test_document_service_storage.py` 通过。
- [x] `python -m compileall app core -q` 通过。
- [ ] 联调环境设置 `DOCUMENT_STORAGE_PROVIDER=oss` 后，通过 `/api/v1/documents` 上传真实文件。
- [x] OSS bucket 中出现 `documents/YYYY/MM/` 前缀下的新 object。
- [ ] 数据库 `documents` 新增记录，`storage_provider = oss`，`storage_path` 等于 OSS object key。
- [ ] 前端文档列表和详情仍能看到上传记录，不依赖本地 `backend/uploads/`。

验收记录（2026-04-28）：

- 已完成代码级验收：后端上传服务通过 storage backend 写入 OSS 元数据，测试用 fake OSS storage 验证记录写入契约。
- 当前会话已完成一次真实 OSS `PUT Object` 验收；完整 `/api/v1/documents` + 数据库记录联调仍需在后端服务运行环境继续验收。

### 真实 OSS 验收补充（2026-04-28）

- [x] 已在后端环境临时设置 `DOCUMENT_STORAGE_PROVIDER=oss`。
- [x] 已通过 storage backend 上传 `codex-oss-validation.txt`。
- [x] OSS 返回 object key：`documents/2026/04/de13add2-f7b3-4d12-8a84-d4fc1a7b93b0.txt`。
- [x] 返回 `storage_provider = oss`、`file_url` 和 SHA256。
