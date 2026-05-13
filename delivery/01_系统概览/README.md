---
type: index
module: 系统概览
status: reviewed
audience: [tech-lead, integrator, ops, reviewer]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: EACY 团队
---

# 01 系统概览

> 本模块给出**项目的整体性认知**：是什么、解决什么、用什么技术、模块怎么拼起来、数据怎么流。

## 已就绪

- [[系统定位与价值]] — 项目定位、目标客户、价值主张、范围边界
- [[技术栈清单]] — 后端 / 前端 / 外部依赖的版本与选型理由
- [[端到端数据流]] — 一份病例从上传到导出的完整链路（含 Mermaid 时序图）
- **[[整体架构.canvas]]** — Canvas：前端 / 后端 / Worker / DB / 外部依赖的分层架构
- **[[模块全景图.canvas]]** — Canvas：7 个业务域之间的依赖关系

## 与其他模块的关系

- 本模块只给"地图"，**不展开细节**。具体业务域走 [[02_业务域/README]]，接口走 [[03_接口/README]]，部署走 [[07_部署与运维/README]]。
