---
type: index
module: 病例管理
status: draft
audience: [tech-lead, integrator, reviewer]
code_path:
  - backend/app/api/v1/patients/router.py
  - backend/app/services/patient_service.py
  - backend/app/repositories/patient_repository.py
  - backend/app/models/patient.py
  - frontend_new/src/pages/PatientPool
  - frontend_new/src/pages/PatientDetail
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 病例管理

> 病例管理是 EACY 的**主数据域**：所有文档、抽取结果、科研数据集都挂在 `Patient` 上。本域负责病例的全生命周期（创建、查询、修改、软删除）及与下游域的关联入口。

## 在端到端链路中的位置

```text
[文档与OCR] ──归档──→ [病例管理] ←──纳入── [科研项目与数据集]
                       ↑   ↓
                       └─ [AI抽取] / [Schema模板与CRF]
```

详细链路见 [[端到端数据流]]。

## 文档清单

| 文档 | 内容 |
|---|---|
| [[业务概述]] | 一句话定位、核心概念、关键设计、与其他域的协作 |
| [[业务流程-新建病例]] | 创建 Patient 并初始化 EHR 上下文的完整时序 |
| [[业务流程-病例查询与档案查看]] | 病例池筛选 + PatientDetail 多 Tab 概览 |
| [[验收要点]] | 5~8 条可执行验收用例 |

## 与其他业务域的关系

| 关系方向 | 对方域 | 关联点 |
|---|---|---|
| 上游 | [[文档与OCR/README]] | 文档通过 `patient_id` 归档到病例；未归档进入"未归档池" |
| 平行 | [[AI抽取/README]] | 病例详情触发抽取（`/patients/{id}/ehr/update-folder`）；字段值落到病例的 EHR 上下文 |
| 平行 | [[Schema模板与CRF/README]] | 新建病例时自动绑定 `ehr` 域当前发布的 SchemaVersion |
| 下游 | [[科研项目与数据集/README]] | 通过 `project_patient` 多对多纳入研究项目 |

## 关键代码锚点

- 路由：`backend/app/api/v1/patients/router.py`
- 服务：`backend/app/services/patient_service.py`
- 仓库：`backend/app/repositories/patient_repository.py`
- 模型：`backend/app/models/patient.py`（见 [[表-patient]]）
- 前端列表：`frontend_new/src/pages/PatientPool/index.jsx`
- 前端详情：`frontend_new/src/pages/PatientDetail/index.jsx`
