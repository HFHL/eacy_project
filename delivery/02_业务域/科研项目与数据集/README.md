---
type: index
module: 科研项目与数据集
status: draft
audience: [tech-lead, integrator, reviewer]
code_path:
  - backend/app/api/v1/research/router.py
  - backend/app/services/research_project_service.py
  - backend/app/services/research_project_export_service.py
  - backend/app/repositories/research_project_repository.py
  - backend/app/models/research_project.py
  - backend/app/models/project_patient.py
  - backend/app/models/project_template_binding.py
  - frontend_new/src/pages/ResearchDataset
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 科研项目与数据集

> 科研项目是 EACY 端到端链路的**最后两个阶段** [8][9]：把已经抽取/审核完的病例**纳入项目**、按项目绑定的 **Schema 模板版本**生成结构化数据集、最终导出为 Excel 供研究者分析。

## 在端到端链路中的位置

```text
[病例管理] ──纳入──→ [科研项目] ──按模板版本聚合──→ [数据集导出]
                          ↑                       ↓
                  绑定 Schema 模板版本           Excel/CSV
```

完整链路见 [[端到端数据流]] 的 [8][9] 阶段。

## 三个核心模型

| 模型 | 表 | 职责 |
|---|---|---|
| 项目 | [[表-research_project]] | 课题元信息（编号、名称、负责人、起止日期） |
| 病例纳入 | [[表-project_patient]] | 病例与项目的**多对多**关系，含入组编号、入组/撤回状态 |
| 模板绑定 | [[表-project_template_binding]] | 项目使用哪个 **Schema 模板的哪个版本**作为 CRF（病例报告表） |

> [!info] 为什么版本号是核心
> 项目绑定的是 **schema_version_id**（不是 template_id），模板演进不会破坏老数据：一旦项目纳入病例并产出 CRF 字段值，绑定版本就锁定了这套字段的口径。

## 文档清单

| 文档 | 内容 |
|---|---|
| [[业务概述]] | 一句话定位、与病例池/Schema 的关系、模板版本绑定的语义 |
| [[业务流程-创建项目与绑定模板]] | 新建项目 → 选 Schema 模板版本 → 创建 primary_crf 绑定 |
| [[业务流程-病例纳入]] | 从病例池纳入病例、项目 CRF 上下文自动创建、字段值如何关联 |
| [[业务流程-数据集查看与编辑]] | ProjectDatasetView 数据集视图、ProjectPatientDetail 项目上下文下编辑 |
| [[业务流程-数据导出]] | 多 Sheet xlsx 导出，范围/口径说明 |
| [[验收要点]] | 5~8 条可执行验收用例 |

## 与其他业务域的关系

| 关系方向 | 对方域 | 关联点 |
|---|---|---|
| 上游 | [[病例管理/README]] | 通过 `project_patient` 从病例池纳入 |
| 上游 | [[Schema模板与CRF/README]] | `project_template_binding` 锁定使用的 schema_version |
| 平行 | [[AI抽取/README]] | 项目页可触发"更新电子病历夹"批量抽取，结果写入项目 CRF 上下文 |
| 数据 | [[文档与OCR/README]] | 字段证据回溯到原文档（页码、坐标） |

## 关键代码锚点

- 路由：`backend/app/api/v1/research/router.py`
- 主服务：`backend/app/services/research_project_service.py`
- 导出服务：`backend/app/services/research_project_export_service.py`
- 仓库：`backend/app/repositories/research_project_repository.py`
- 前端入口：`frontend_new/src/pages/ResearchDataset/index.jsx`
- 数据集视图：`frontend_new/src/pages/ResearchDataset/ProjectDatasetView.jsx`
- 项目内病例详情：`frontend_new/src/pages/ResearchDataset/ProjectPatientDetail.jsx`
- 项目内模板设计器：`frontend_new/src/pages/ResearchDataset/ProjectTemplateDesigner.jsx`
