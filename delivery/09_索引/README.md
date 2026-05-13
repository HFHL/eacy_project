---
type: index
module: 索引
status: reviewed
audience: [tech-lead, integrator, ops, reviewer]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: EACY 团队
---

# 索引视图

> 本目录下全部是 **Obsidian Bases 视图**（`.base` 文件），通过 frontmatter 自动聚合各文档，**无需人工维护汇总表**。

## 视图列表

| 视图 | 聚合规则 | 用途 |
|---|---|---|
| [[API清单.base]] | `type == "api"` 的所有文档 | 对接开发查找业务 API 说明 |
| [[数据表清单.base]] | `type == "data-model"` 的所有文档 | 查找数据表业务含义 |
| [[文档健康度.base]] | 全部业务文档 + `stale_days` 公式 | 月度 review 找过期文档 |

## 后续将补充

- **业务流程清单.base** — `type == "business-flow"`，按业务域分组
- **部署任务清单.base** — `type == "deploy"`
- **故障手册清单.base** — `type == "troubleshooting"`
- **验收用例清单.base** — `type == "acceptance"`

## 维护说明

新增任意文档时，frontmatter 写对 `type` / `module` / `last_verified_date` / `owner` 等字段，对应视图会自动出现该条目。**不要手工维护汇总表格**。

> [!warning] 注意
> `.base` 视图需要 Obsidian 1.10+ 打开。在 GitHub 网页或其他 Markdown 工具中无法渲染。
