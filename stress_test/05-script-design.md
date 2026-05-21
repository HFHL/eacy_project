# 05 · 脚本设计

## 已锁定决策

| # | 决策 |
|---|---|
| 1 | 系统监控走 **SSH** 远程采样，不依赖 Prometheus / 后端 `/internal/metrics` 端点 |
| 2 | 首次跑 5 档全套（约 2 小时），后续回归只跑 `target` 档 |
| 3 | 触发紧急 abort 时**立即停掉所有阶梯**，不继续后续档 |
| 4 | 报告输出**纯 markdown**（表格 + 文本，不带 matplotlib 图表，不引入图表依赖） |
| 5 | Locust 全程 **headless** 运行，不开 Web UI |

## 目录结构

```
stress_test/
├── README.md
├── 01-scenario.md  ──── 02-api-flow.md  ──── 03-setup.md  ──── 04-metrics.md
├── 05-script-design.md     ← 本文件
│
├── run.sh                  ← 一键入口（bash wrapper）
├── requirements.txt        ← Python 依赖
│
├── config/
│   ├── base.env            ← 域名 / token / 模板 ID / SSH 配置（不入 git，从 base.env.example 复制）
│   ├── base.env.example    ← 模板，入 git
│   └── stages.yaml         ← 5 个负载档位定义
│
├── scripts/
│   ├── __init__.py
│   ├── locustfile.py       ← Locust 主入口
│   ├── workflow.py         ← 11 步业务流程
│   ├── api_client.py       ← HTTP 封装
│   ├── pollers.py          ← 异步任务轮询
│   ├── fixtures.py         ← 加载本地文档目录
│   ├── metrics.py          ← 业务层埋点
│   ├── monitor.py          ← SSH 远程系统监控
│   ├── abort_watcher.py    ← 监听 abort 触发条件
│   └── report.py           ← 生成 summary.md
│
├── fixtures/               ← 测试文档（gitignore）
│   └── patient_<NNN>/
│       └── *.pdf|*.jpg
│
├── results/                ← 测试输出（gitignore）
│   └── <run_id>/           ← YYYYMMDD_HHMM 格式
│       ├── locust_stats.csv
│       ├── locust_failures.csv
│       ├── business_steps.csv
│       ├── system_metrics.csv
│       ├── abort.log       ← 仅当触发 abort 时存在
│       └── summary.md
│
└── .gitignore
```

## 各文件职责

### `run.sh` · 一键入口

唯一对外接口。用户只跑这个，不直接调 locust。

```
./run.sh                       默认 = batch（全 5 档）
./run.sh smoke                 只跑 smoke
./run.sh baseline | small | target | stress
./run.sh batch                 等价于不带参数
./run.sh report <run_id>       仅重新生成报告（CSV 已存在时）
./run.sh --help
```

内部职责：
1. 校验 `config/base.env` 存在 + 关键字段非空
2. 校验 `fixtures/` 目录至少有 5 个 `patient_*/`
3. 生成 `run_id` = `date +%Y%m%d_%H%M`
4. 创建 `results/<run_id>/`
5. 后台启动 `monitor.py` 拉远端指标 → `system_metrics.csv`
6. 后台启动 `abort_watcher.py` 监听 abort 条件 → 触发后 `kill` locust
7. 前台跑 locust（参数从 `stages.yaml` 读）
8. locust 退出后（正常或被 abort）等 30 秒让 Celery 队列消化
9. 跑 `report.py <run_id>` 生成 `summary.md`
10. 把 monitor/abort_watcher 都 kill 掉
11. 输出 `summary.md` 路径

### `config/base.env`

```bash
# 公网域名
EACY_BASE_URL=https://api.eacy.example.com

# 预置模板（03-setup.md §6）
TEMPLATE_ID=tpl_xxx
TARGETED_FIELD_PATHS=baseline.demographics.gender,baseline.demographics.age,baseline.diagnosis.primary
TARGETED_FORM_KEY=baseline

# 测试文档目录
FIXTURES_DIR=/path/to/stress_test/fixtures

# SSH 到后端服务器（监控用）
MONITOR_SSH_HOST=root@eacy-prod-01
MONITOR_SSH_KEY=~/.ssh/id_rsa
MONITOR_INTERVAL_SECONDS=30

# 远程 PostgreSQL（监控查询用；示例用 psql）
MONITOR_PG_CMD=psql "$DATABASE_URL" -c

# Redis（Celery broker，看队列深度）
MONITOR_REDIS_CMD=redis-cli -n 1

# 业务层超时（秒）
STEP_TIMEOUT_OCR=300
STEP_TIMEOUT_METADATA=180
STEP_TIMEOUT_EHR=300
STEP_TIMEOUT_CRF=480
STEP_TIMEOUT_TARGETED=180
```

### `config/stages.yaml`

```yaml
stages:
  - name: smoke
    users: 1
    spawn_rate: 1
    duration: 5m
    abort_on_failure: false   # smoke 失败也跑完，便于诊断

  - name: baseline
    users: 1
    spawn_rate: 1
    duration: 30m
    abort_on_failure: true

  - name: small
    users: 3
    spawn_rate: 1
    duration: 30m
    abort_on_failure: true

  - name: target
    users: 5
    spawn_rate: 1
    duration: 60m
    abort_on_failure: true

  - name: stress
    users: 10
    spawn_rate: 2
    duration: 30m
    abort_on_failure: false   # stress 档允许失败，目的是找瓶颈
```

`abort_on_failure=true` 表示该档失败立即停掉整个 batch。

### `scripts/locustfile.py` · Locust 主入口

```python
class StressUser(HttpUser):
    wait_time = constant(0)
    host = config.EACY_BASE_URL

    def on_start(self):
        # 注册 + 建 patient + 抽 fixture 目录
        self.vu_ctx = workflow.bootstrap(self.client, vu_id=self.vu_id)

    @task
    def full_pipeline(self):
        try:
            workflow.run_pipeline(self.client, self.vu_ctx)
        finally:
            # 跑完一次就让该 VU 退出，Locust 会拉新的（=新账户）
            self.environment.runner.greenlet.spawn_later(0, self._quit_self)

    def _quit_self(self):
        # 让单个 user 退出而不影响其他 user
        raise StopUser()
```

`LoadShape` 子类按 `stages.yaml` 控制 VU 数随时间变化，实现 batch 模式。

### `scripts/workflow.py` · 11 步业务流程

模块函数：

```python
def bootstrap(client, vu_id):
    # 1. 注册
    # 2. 建 patient
    # 3. 选 fixture 目录（5 份文档）
    # 返回 VUContext（含 token, patient_id, fixture_paths, run_id）
    ...

def run_pipeline(client, ctx):
    # 4. 上传 5 份（并发）
    # 5. 等 OCR
    # 6. 触发 + 等元数据
    # 7. 触发 + 等 EHR
    # 8. 建项目 + 绑模板
    # 9. patient 入组
    # 10. 触发 + 等 CRF
    # 11. 触发 + 等靶向
    ...
```

每个步骤包在 `with metrics.step(name, ctx)` 里——`metrics.py` 负责打点。

### `scripts/api_client.py` · HTTP 封装

包一层 `httpx.Client`（或直接用 Locust 的 `self.client`），统一处理：

- Header 注入：`Authorization: Bearer {token}`
- 超时：单请求 10 秒
- 重试：连接错误（非 HTTP 5xx）最多重试 2 次
- **不重试 5xx**——5xx 是业务故障，让 metrics 真实记录

### `scripts/pollers.py` · 异步任务轮询

四个函数对应四类异步任务：

```python
poll_document_statuses(client, doc_ids, want_field, want_values, timeout, interval)
  # want_field = "ocr_status" 或 "meta_status"
  # want_values = {"completed"} 或 {"completed", "skipped"}
  # 轮询 POST /documents/statuses 直到所有 doc 的 want_field ∈ want_values

poll_task_batch(client, batch_id, timeout, interval)
  # GET /task-batches/{id} 直到 status ∈ {succeeded, failed, cancelled}

poll_extraction_job(client, job_id, timeout, interval)
  # GET /extraction-jobs/{id} 直到 status 终止

# 通用轮询器（基础）
poll_until(fetch_fn, predicate, timeout, interval, backoff)
```

所有轮询都遵守 02-api-flow.md 末尾的"通用准则"。

### `scripts/fixtures.py` · 文档目录加载

```python
load_patient_fixtures(fixtures_dir) -> list[PatientFixture]
  # 扫描 fixtures_dir/patient_*/，每个目录取 5 份文档
  # 校验：必须恰好 5 份；缺/多则报错并退出

pick_fixture(vu_id, all_fixtures) -> PatientFixture
  # 按 hash(vu_id) % len 分配，确保同一 VU 在多次 run 里相对稳定
```

### `scripts/metrics.py` · 业务埋点

```python
class StepRecorder:
    def __init__(self, run_id):
        self.csv_path = f"results/{run_id}/business_steps.csv"
        # CSV header: run_id, vu_id, step, started_at, duration_ms, status, error

    @contextmanager
    def step(self, name, ctx):
        t0 = time.time()
        err = None
        try:
            yield
            status = "ok"
        except Exception as e:
            status = "fail"
            err = repr(e)
            raise
        finally:
            duration_ms = (time.time() - t0) * 1000
            self._append(ctx.run_id, ctx.vu_id, name, t0, duration_ms, status, err)
```

单例由 `locustfile.py` 初始化，挂在 `Environment.stats` 上供 workflow.py 调用。

### `scripts/monitor.py` · SSH 系统监控

```python
def start_monitor(ssh_host, ssh_key, interval, output_csv):
    # 子进程，每 interval 秒：
    #   ssh ssh_host "bash -s" << 'EOF'
    #     echo "{timestamp},{load1},{pg_connections},{pg_active},
    #          {redis_ocr_qlen},{redis_meta_qlen},{redis_extract_qlen}"
    #   EOF
    #   → 追加到 output_csv
```

服务器侧执行的脚本（嵌入在 monitor.py 里，通过 SSH stdin 传过去）：

```bash
ts=$(date +%s)
load=$(awk '{print $1}' /proc/loadavg)
threads_conn=$(psql "$DATABASE_URL" -Atc "SELECT count(*) FROM pg_stat_activity")
threads_run=$(psql "$DATABASE_URL" -Atc "SELECT count(*) FROM pg_stat_activity WHERE state = 'active'")
qlen_ocr=$(redis-cli -n 1 llen ocr)
qlen_meta=$(redis-cli -n 1 llen metadata)
qlen_ext=$(redis-cli -n 1 llen extraction)
echo "$ts,$load,$threads_conn,$threads_run,$qlen_ocr,$qlen_meta,$qlen_ext"
```

### `scripts/abort_watcher.py` · 紧急 abort

后台子进程，每 5 秒检查 04-metrics.md §"紧急 abort 条件"7 条规则。任何一条命中：

1. 把命中规则写入 `results/<run_id>/abort.log`（包含时间戳 + 现场数据）
2. 给 locust 主进程发 `SIGTERM`
3. 不重试，等 run.sh 收尾

数据来源：
- 5xx 比例 → 读 locust 实时统计（locust 启动时挂事件钩子，把统计写到一个 IPC pipe / shared file）
- PostgreSQL 连接耗尽 / CPU 高 → 读 `system_metrics.csv` 最新行
- TextIn / LLM 429 → 暂时**没有直接信号**——靠业务层 HTTP 5xx 间接发现
- OOM / 进程退出 → 远端 ssh 跑 `systemctl is-active eacy` 等

**简化版**实现先只看：
- locust 5xx 比例 ≥ 30% 持续 30 秒
- system_metrics.csv 里 `threads_connected ≥ 280`

其他规则在 v1 不实现，留作 TODO。

### `scripts/report.py` · 报告生成

```python
generate_report(run_id):
    # 读 results/<run_id>/ 下的 4 个 CSV
    # 按 stage（time window）切片
    # 计算每 stage 的：
    #   - HTTP 各端点 RT p50/p95/p99（从 locust_stats.csv）
    #   - 业务各 step p50/p95/p99（从 business_steps.csv）
    #   - 系统指标 max/avg/peak time（从 system_metrics.csv）
    # 生成 summary.md，模板见 04-metrics.md
```

**不使用 matplotlib**。所有数据用 markdown 表格呈现：

```markdown
## 业务步骤耗时（target 档）

| 步骤 | 样本数 | p50 | p95 | p99 | max | 失败 |
|---|---|---|---|---|---|---|
| upload_doc | 320 | 1.2s | 2.8s | 4.5s | 6.1s | 0 |
| wait_ocr | 64 | 45s | 78s | 92s | 120s | 0 |
| wait_crf | 64 | 102s | 165s | 198s | 240s | 1 |
...
```

阶段切片靠时间戳——`stages.yaml` 定义了每档的起止偏移，`run.sh` 启动时写一个 `stages_timeline.json` 到 `results/<run_id>/`，report.py 读它做切片。

## 数据流

```
                                    ┌────────────────────────────┐
                                    │  run.sh (orchestrator)     │
                                    │                            │
                                    │  生成 run_id + 创建目录       │
                                    │  写 stages_timeline.json     │
                                    └─────────────┬──────────────┘
                                                  │ fork 3 个子进程
                            ┌─────────────────────┼─────────────────────┐
                            ▼                     ▼                     ▼
                    ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
                    │ monitor.py    │    │ abort_watcher │    │ locust         │
                    │              │     │ .py            │    │                │
                    │ SSH 远端采样  │    │ 监听 5xx+ DB   │    │ HttpUser       │
                    │ 每 30s       │     │ 每 5s          │    │ LoadShape      │
                    └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
                           │                    │                    │
                           │                    │ kill if abort      │
                           │                    └─────► locust       │
                           ▼                                         │
                   system_metrics.csv         business_steps.csv  ←──┤
                                              locust_stats.csv    ←──┤
                                              locust_failures.csv ←──┘
                                                              │
                                                              ▼
                                                       report.py
                                                              │
                                                              ▼
                                                       summary.md
```

## 依赖清单（`requirements.txt`）

```
locust>=2.20
httpx>=0.27
pyyaml>=6.0
python-dotenv>=1.0
```

**故意不引入**：
- `matplotlib` / `seaborn` / `plotly`——不画图，纯 markdown 表
- `pandas`——report.py 用 stdlib `csv` + `statistics` 算分位数就够
- `pydantic`——配置 dict 就行，没必要 schema 校验
- `paramiko`——SSH 走 subprocess 调系统 `ssh`，不要把 key 管理塞进 Python

## 装机与首次跑（云 VM 上）

```bash
git clone <repo> && cd eacy_project/stress_test
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp config/base.env.example config/base.env
vim config/base.env                          # 填域名 / 模板 ID / SSH

# 拷文档进 fixtures/
rsync -avz user@datastore:/path/fixtures/ ./fixtures/

# 验证 SSH 通
ssh -i $MONITOR_SSH_KEY $MONITOR_SSH_HOST 'echo ok'

# 验证 fixtures 完整
ls fixtures/ | wc -l                         # 应该 >=5

# 跑冒烟
./run.sh smoke

# 看报告
cat results/$(ls -t results | head -1)/summary.md

# 没问题再批量
./run.sh batch
```

## 实现优先级

按 v1 → v2 划分，确保最小可用就开始跑：

**v1（必须，约 1 天工作量）**

- [ ] `run.sh` 基本骨架（单档运行能跑）
- [ ] `config/base.env` + `base.env.example`
- [ ] `stages.yaml`（用 yaml 而不是 hardcode 进 Python）
- [ ] `api_client.py`（HTTP + token）
- [ ] `pollers.py`（4 个轮询器）
- [ ] `fixtures.py`（加载本地目录）
- [ ] `workflow.py`（11 步）
- [ ] `metrics.py`（业务埋点 CSV）
- [ ] `locustfile.py`（HttpUser + LoadShape）
- [ ] `report.py`（最简版，HTTP + 业务表格）

**v2（先不做，跑通 v1 后再加）**

- [ ] `monitor.py`（SSH 远程采样）—— 没它先用 `htop` 人工看
- [ ] `abort_watcher.py`（v1 时让人工 Ctrl-C，v2 自动化）
- [ ] `report.py` 增加系统指标部分
- [ ] 阶梯间自动等队列消化
- [ ] 批量 `run.sh batch` 跑多档

**为什么这么分**：v1 跑通"单档完整流程"是最高优先——只有这个跑通了，后面 monitor / abort / batch 才有意义。先把 5 个 VU × 单档跑 5 分钟能不能成功跑下来证明出来，再加自动化层。
