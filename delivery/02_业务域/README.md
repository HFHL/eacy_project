---
type: index
module: 业务域
status: reviewed
audience: [tech-lead, integrator, reviewer]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: EACY 团队
---

# 02 业务域

> 本模块按**业务域**而不是按代码目录组织。每个业务域是一个子目录，内部一文一职。

## 业务域清单

| 业务域 | 核心概念 | 主要代码位置 |
|---|---|---|
| [[病例管理/README]] | Patient、PatientPool | `backend/app/api/v1/patients/`, `frontend_new/src/pages/PatientPool` |
| [[文档与OCR/README]] | Document、TextIn OCR | `backend/app/api/v1/documents/`, `frontend_new/src/pages/DocumentUpload` |
| [[AI抽取/README]] | ExtractionJob、ExtractionRun、字段证据 | `backend/app/services/extraction_service.py`, `backend/app/workers/extraction_tasks.py` |
| [[Schema模板与CRF/README]] | SchemaTemplate、SchemaTemplateVersion、CRF | `backend/app/api/v1/templates/`, `frontend_new/src/pages/CRFDesigner` |
| [[科研项目与数据集/README]] | ResearchProject、ProjectPatient、ProjectTemplateBinding | `backend/app/api/v1/research/`, `frontend_new/src/pages/ResearchDataset` |
| [[管理后台/README]] | AsyncTask 监控、用户管理 | `backend/app/api/v1/admin/`, `frontend_new/src/pages/Admin` |
| [[用户系统与权限/README]] | User、JWT 鉴权 | `backend/app/api/v1/auth/`, `frontend_new/src/pages/UserSystem` |

## 每个业务域内部约定

```
xxx业务域/
├─ README.md              — 业务域定位与文档清单
├─ 业务概述.md            — 一句话定位 + 核心概念 + 关键设计
├─ 业务流程-xxx.md        — 一篇一个流程（用 T-业务流程 模板）
├─ 关键设计-xxx.md        — 复杂机制独立说明（如"证据归因"）
└─ 验收要点.md            — 本域的验收清单，会被 09_索引 聚合
```

## 待补

各业务域的子文档将在下一阶段按域逐个递进。本阶段先把骨架立住，由用户审阅风格后再批量产出。
