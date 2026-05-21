# 04 · 指标与终止条件

## 三层指标

压测产出三种粒度的数据，**任何一层缺失都不算合格的测试报告**。

### A. HTTP 层（Locust 自带）

每个端点采集：

| 指标 | 单位 | 谁会用 |
|---|---|---|
| RT p50 | ms | 平均体感 |
| RT p95 | ms | "卡顿"用户占比 |
| RT p99 | ms | 长尾报警 |
| 错误率 | % | 总体可用性 |
| RPS | 次/秒 | 吞吐 |

每个端点单独看，**不要看汇总**——汇总数据被轮询接口稀释，看不出"上传"和"触发抽取"的真实性能。

### B. 业务层（脚本自己埋点）

每个 VU 在每一步前后打点，写 CSV：

```
run_id, vu_id, step_name, started_at, ended_at, duration_ms, status, error_kind
```

`step_name` 取值：

- `register`, `create_patient`, `upload_doc` (×5), `wait_ocr`, `trigger_metadata` (×5),
  `wait_metadata`, `trigger_ehr`, `wait_ehr`, `create_project`, `bind_template`,
  `enroll_patient`, `trigger_crf`, `wait_crf`, `trigger_targeted`, `wait_targeted`

由此得到**单步耗时分布**和**端到端耗时分布**——这是判断压测好坏的核心，HTTP RT 看不出业务慢。

### C. 系统层（监控）

`03-setup.md §7` 列出的：CPU、内存、PostgreSQL 连接数、Redis 队列深度、Celery 利用率、慢查询。

按**每分钟**记录采样值。跑完之后能在时间轴上对齐"HTTP RT 飙升"和"PG 连接数飙到 X"两条线，才能定位瓶颈。

## 成功判定（三层）

### 单次 VU run 成功

01-scenario.md 末尾定义过，重复一遍：

- 任意 HTTP 调用不返回 5xx
- OCR 全部 `completed`
- 元数据全部 `completed` 或 `skipped`
- EHR / CRF / 靶向 batch/job 全部 `succeeded`
- 端到端 ≤ 10 分钟

### 单轮测试成功

5 VU 都跑完一次后整体判定：

| 指标 | 阈值 |
|---|---|
| VU run 成功率 | ≥ **95%**（5 个里允许失败 0 个；多轮跑时按总数算） |
| 端到端 p95 耗时 | ≤ **8 分钟** |
| 上传接口 RT p95 | ≤ **3 秒** |
| 触发接口（trigger_*）RT p95 | ≤ **1 秒** |
| 轮询接口 RT p95 | ≤ **500ms** |
| OCR `failed` 个数 | 0 |
| LLM 429 个数 | < 1% of LLM 调用 |

任何一项不满足 → **本轮失败**，需要分析原因后改进再重测。

### 整体压测项目成功

完成测试矩阵（01-scenario.md §测试矩阵）全部 5 个阶梯，且：

- 阶梯 1-4 全部通过单轮判定
- 阶梯 5（10 VU）允许部分指标退化，但能**清楚说明瓶颈在哪一层**（DB / Celery / TextIn / LLM / 网络）

## 紧急 abort 条件

下列任一出现，**立刻 Ctrl-C 停掉 Locust**，不要"再观察一下"：

1. **服务器侧 500 错误持续 ≥ 30 秒**——后端在崩，再压就是制造垃圾日志
2. **PostgreSQL 连接耗尽**（`too many connections` 错误日志）——继续跑会拖死所有正常服务
3. **PostgreSQL CPU > 90% 持续 1 分钟**——数据库要倒
4. **OOM 触发 swap**——所有 RT 指标作废，再多跑没意义
5. **TextIn / LLM 连续 429 超 1 分钟**——再调用就是浪费配额
6. **OSS 写失败率 > 5%**——上传链路坏了，后续步骤无意义
7. **任何服务发生 OOMKilled / 进程退出**——先恢复再说

abort 之后必做：

- 截图 Locust 当前统计
- 把当前 `stress_test/results/<run_id>/` 目录归档
- 在服务器侧 `journalctl -u eacy -S "5 min ago"` 抓日志
- 至少**等 5 分钟**让队列消化完再启动下一轮

## 报告产出

每次 run 结束后，`stress_test/results/<run_id>/` 应包含：

```
results/20260515_1430/
├── locust_stats.csv             # HTTP 层
├── locust_failures.csv
├── business_steps.csv            # 业务层埋点
├── system_metrics.json           # 系统层快照（CPU/MEM/PG/Redis 每分钟一行）
├── summary.md                    # 人肉写的结论（瓶颈在哪、改了什么、下一轮怎么调）
└── notes.md                      # 跑测试时的临时观察
```

`summary.md` 模板：

```markdown
# Run <run_id>

## 配置
- 并发 VU: N
- 持续时长: X 分钟
- 后端版本: <git short sha>
- 后端配置: DB_POOL_SIZE=20, ...

## 结果
- VU run 成功率: x/x
- 端到端 p95: x 分钟
- 阻塞瓶颈: <一句话>

## 详细指标
（贴 Locust 表 + 业务层关键百分位）

## 异常事件
- 12:43 LLM 429 飙升 30 秒
- 12:51 PostgreSQL 连接数到 280
- ...

## 下一步
- 调整 X
- 重测 Y
```

## 关于"5 ops/sec" 的最后说明

第一阶段不强求达到 25 QPS。**业务流程是串行 + 异步等待的**，QPS 这个数字会大幅低于 25。这是预期、不是问题。

判断压测好坏的核心是：

1. **每个 VU 端到端能跑完吗**（成功率）
2. **跑完要多久**（业务层 p95）
3. **后端有没有报错 / 资源爆掉**（系统层）

不是 QPS 数字。**如果你最后只交一份 "QPS=25 通过"，那是压测做错了**。
