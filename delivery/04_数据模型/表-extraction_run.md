---
type: data-model
module: AI抽取
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/extraction_run.py
  - backend/app/repositories/extraction_job_repository.py
table_name: extraction_runs
related_tables: [extraction_job, field_value_event, record_instance, async_task]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-extraction_run

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
一次 [[表-extraction_job]] **内部的具体 LLM 调用**——保留 prompt 版本、模型名、原始输出、解析后输出、校验状态、错误信息。同一 job 多次重试/重跑会产生多条 run；通过 `(job_id, run_no)` 唯一。

> 与 job 的关系：job 是"逻辑作业"，run 是"物理执行"。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| job_id | 所属 job | 必填 |
| run_no | 在 job 内的序号 | 从 1 起，重试递增；`uk_job_run_no` 唯一约束 |
| status | 单次执行状态 | 同 job 状态机但作用于单次调用，常见 `running` / `succeeded` / `failed` |
| model_name | 使用的 LLM 模型名 | 例如 `gpt-4o`；用于事后审计与对比 |
| prompt_version | Prompt 模板版本 | 由 `ExtractionPlanner` 注入；用于 A/B 与回归 |
| input_snapshot_json | 调用时的入参快照 | 含文档片段、字段定义、上下文等 |
| raw_output_json | LLM 原始返回 | 未清洗，用于排查 |
| parsed_output_json | 解析后结构化结果 | 写入 [[表-field_value_event]] 的来源 |
| validation_status | 业务校验结果 | 取值集合 TBD（如 `passed` / `schema_invalid` 等） |
| error_message | 失败原因 | 仅 failed 状态有意义 |
| started_at / finished_at | 执行时间窗口 | — |

## 关键索引
| 索引 | 用途 |
|---|---|
| `uk_job_run_no` (unique) | 保证同一 job 下 run_no 单调 |

> 该表无显式辅助索引；查询多走 `job_id` 主路径（外键自带索引）。

## 生命周期
- 创建：Worker 进入处理 job 时新增一条 `status=running`、`run_no=max+1`。
- 更新：LLM 返回后写入 `raw_output_json` / `parsed_output_json` / `validation_status` 与终态时间。
- 删除：不删除——保留用于追溯。

## 与其他表的关系
- [[表-extraction_job]] — N:1。
- [[表-field_value_event]] — 1:N，通过 `field_value_events.extraction_run_id` 关联。
- [[表-record_instance]] — 弱关联：`record_instances.created_by_run_id` 记录"哪次 run 创建了这个嵌套实例"。
- [[表-async_task]] — `async_task_items.extraction_run_id` 镜像执行。

## 典型查询
```sql
-- 业务场景：列出某 job 的所有执行（按 run_no 升序）
SELECT id, run_no, status, model_name, started_at, finished_at, error_message
FROM extraction_runs
WHERE job_id = :job_id
ORDER BY run_no;
```

```sql
-- 业务场景：聚合"job 是否已合并到当前值"——任一 run 下有 accepted event 即视为已合并
SELECT r.job_id, MAX(e.created_at) AS merged_at
FROM extraction_runs r
JOIN field_value_events e ON e.extraction_run_id = r.id
WHERE r.job_id = ANY(:job_ids)
  AND e.review_status = 'accepted'
GROUP BY r.job_id;
```
