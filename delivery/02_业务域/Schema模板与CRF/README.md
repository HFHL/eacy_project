---
type: index
module: Schema模板与CRF
status: draft
audience: [tech-lead, integrator, reviewer]
code_path:
  - backend/app/api/v1/templates/router.py
  - backend/app/services/schema_service.py
  - backend/app/services/schema_field_planner.py
  - backend/app/models/schema_template.py
  - backend/app/models/schema_template_version.py
  - backend/app/repositories/schema_template_repository.py
  - frontend_new/src/pages/CRFDesigner/index.jsx
  - frontend_new/src/components/SchemaForm/SchemaForm.jsx
  - frontend_new/src/components/SchemaForm/CategoryTree.jsx
related_tables: [schema_template, schema_template_version, project_template_binding, data_context]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: EACY 团队
---

# Schema 模板与 CRF

> Schema 模板是 EACY 的**字段字典**：定义"病例档案里有哪些字段、怎么分组、什么类型、AI 怎么抽取"。EHR 视图、CRF 视图、AI 抽取、科研导出全部围绕它展开。

## 在端到端链路中的位置

```text
[设计/发布模板] ──→ [病例绑定 ehr 域版本] ──→ [AI抽取 按 form_key 规划]
                                                       ↓
                                  [科研项目绑定指定版本] ──→ [数据集导出]
```

详细链路见 [[端到端数据流]]。

## 文档清单

| 文档 | 内容 |
|---|---|
| [[业务概述]] | Schema 是什么、解决什么问题、与 EHR/CRF 概念的关系 |
| [[关键设计-模板版本化]] | `SchemaTemplate` vs `SchemaTemplateVersion`；为什么绑定的是版本而非模板 |
| [[关键设计-Schema结构]] | 字段、分组、嵌套（用药记录类）、枚举、类型；与 `form_key` 的映射 |
| [[业务流程-模板设计与发布]] | CRFDesigner 使用流程 |
| [[业务流程-模板使用（绑定到项目）]] | 与 [[科研项目与数据集]] 的衔接 |
| [[验收要点]] | 5-8 条可执行用例 |

## 与其他业务域的关系

| 关系方向 | 对方域 | 关联点 |
|---|---|---|
| 下游 | [[病例管理/README]] | 新建病例自动绑定 `ehr` 类型当前发布版本（写入 `data_context.schema_version_id`） |
| 下游 | [[AI抽取/README]] | 抽取规划按 schema 的 `form_key` 决定本次抽哪些字段（见 [[关键设计-Schema结构]]） |
| 下游 | [[科研项目与数据集/README]] | 项目通过 `project_template_binding` 绑定指定模板版本，导出按版本结构聚合 |
| 平行 | [[管理后台/README]] | 模板的发布、归档、版本管理 |

## 关键代码锚点

- 路由：`backend/app/api/v1/templates/router.py`
- 服务：`backend/app/services/schema_service.py`
- 字段规划：`backend/app/services/schema_field_planner.py`
- 仓库：`backend/app/repositories/schema_template_repository.py`
- 模型：`schema_template.py` / `schema_template_version.py`（见 [[表-schema_template]] [[表-schema_template_version]]）
- 前端设计器：`frontend_new/src/pages/CRFDesigner/index.jsx`
- 前端表单运行时：`frontend_new/src/components/SchemaForm/SchemaForm.jsx` + `CategoryTree.jsx`
- 参考样例：项目根 `ehr_schema.json`
