---
type: index
module: 部署运维
status: reviewed
audience: [ops]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 运维
---

# 07 部署与运维

> 本模块面向**运维 / SRE**，覆盖从首次部署到日常运维的全周期。

## 计划覆盖

| 文档 | 内容 | 模板 |
|---|---|---|
| **部署架构.canvas** | 部署拓扑图：API / Worker / DB / Redis / OCR / LLM | Canvas |
| **环境变量清单.md** | 全量 env 表：变量 / 必填 / 默认 / 说明 | reference |
| **首次部署手册.md** | 从零到可用的全步骤 | T-部署任务 |
| **升级流程.md** | 版本升级标准步骤 | T-部署任务 |
| **备份与恢复.md** | DB / 文件备份策略 | T-部署任务 |
| **监控与告警.md** | 监控指标、告警通道 | reference |
| **Celery任务运维.md** | Worker 启动、并发、重试、限流 | T-部署任务 |
| **常见故障排查.md** | 一文一现象，挂在 09_索引 | T-故障排查 |

## 已有素材（来自项目根）

- `DEPLOYMENT_RUNBOOK.md` — 现有部署 runbook，下一阶段拆分迁入
- `SERVER_DEPLOYMENT_NOTES.md` — 服务器部署笔记
- `start-all.bat` / `start-all.ps1` — 启动脚本
- `deploy/` — 部署相关文件

## 写作约定

- 故障排查每条独立文档，**不写成一篇大杂烩**
- 涉及命令的部分用三个反引号 + 语言标签，便于复制
- 涉及风险操作用 `> [!warning]` 标注
- 与 [[环境变量清单]] 单向引用：变量值变更只改一处
