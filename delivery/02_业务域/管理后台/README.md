---
type: index
module: 管理后台
status: draft
audience: [tech-lead, ops, reviewer]
code_path:
  - backend/app/api/v1/admin/router.py
  - backend/app/api/v1/tasks/router.py
  - backend/app/services/admin_task_service.py
  - backend/app/services/task_progress_service.py
  - backend/app/models/async_task.py
  - frontend_new/src/pages/Admin/index.jsx
  - frontend_new/src/api/admin.js
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 管理后台

> 管理后台是 EACY 的**统一观测面**：不参与业务主流程，只对全平台的**异步任务、用户、项目、模板、文档**做只读聚合，并为运维提供任务详情下钻、错误定位、停滞探测等能力。

## 在端到端链路中的位置

```text
[文档与OCR] ─┐
[AI抽取]    ├─→ async_task_batches / items / events ──→ [管理后台 · 任务监控]
[科研CRF]   ─┘                                          ↑
                                                       [前端 globalBackgroundTaskPoller]
```

任务侧的细节见 [[端到端数据流]] 的"异步任务统一观测"段落。

## 文档清单

| 文档 | 内容 |
|---|---|
| [[业务概述]] | 管理后台的覆盖范围、与业务模块的边界、只读定位 |
| [[业务流程-异步任务监控]] | async_task 表与 TaskProgressService 如何驱动前端 Admin 页面，含 Mermaid 时序 |
| [[关键设计-任务批次与子任务]] | `task_type` / `scope_type` 的语义、批次聚合规则、停滞判定 |
| [[验收要点]] | 4~6 条可执行验收用例 |

## 与其他业务域的关系

| 关系方向 | 对方域 | 关联点 |
|---|---|---|
| 观测 | [[AI抽取/README]] | `async_task_items.extraction_job_id` 串联 [[表-extraction_job]] 与 [[表-async_task]] |
| 观测 | [[文档与OCR/README]] | 文档列表只读聚合；OCR/metadata 任务接入待完成（见 [[关键设计-任务批次与子任务]] TBD） |
| 观测 | [[科研项目与数据集/README]] | project_crf 批次以 `project_id` / `project_patient_id` 为 scope |
| 配套 | [[用户系统与权限/README]] | 入口受 `require_admin_user` 守卫，详见该域 |

## 关键代码锚点

- 后端路由：`backend/app/api/v1/admin/router.py`（管理面只读 API）
- 后端路由：`backend/app/api/v1/tasks/router.py`（任务批次查询，前端全局轮询使用）
- 后端服务：`backend/app/services/admin_task_service.py`（聚合、状态归一、停滞判定）
- 后端服务：`backend/app/services/task_progress_service.py`（任务进度写入侧，被各 Worker 调用）
- 模型：`backend/app/models/async_task.py`（见 [[表-async_task]]）
- 前端页面：`frontend_new/src/pages/Admin/index.jsx`
- 前端 API：`frontend_new/src/api/admin.js`
