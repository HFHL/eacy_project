# 03 · 前置准备

压测开跑之前，**下列所有项都必须完成**。每一项左侧标了责任方（后端 / 运维 / 压测）。

## 1. 后端调参（责任：后端）

### 1.1 数据库连接池

修改 `backend/.env`（或部署对应环境的配置）：

```bash
DB_POOL_SIZE=20
DB_MAX_OVERFLOW=10
DB_POOL_TIMEOUT=10
DB_POOL_RECYCLE=1800
```

默认值（`backend/core/config.py:22-25`）`POOL_SIZE=1, OVERFLOW=1` **必须改掉**，否则第 2 个 VU 就开始等连接。

### 1.2 PostgreSQL 连接数上限

远程库（与 `DATABASE_URL` 一致）需预留足够连接，避免压测时 `too many connections`：

```sql
SHOW max_connections;
SELECT count(*) FROM pg_stat_activity;
```

在库侧或 `postgresql.conf` 将 `max_connections` 调到 ≥ 300（并评估 `(API workers + Celery 并发) × DB_POOL_SIZE`）。
生产 Docker 部署见根目录 `docker-compose.prod.yml` 的 `postgres` 服务环境变量。

### 1.3 Celery worker 数量

至少分别启动一个 OCR / metadata / extraction worker，建议每个 `--concurrency=4`：

```bash
celery -A app.workers.celery_app.celery_app worker -Q ocr        --concurrency=4
celery -A app.workers.celery_app.celery_app worker -Q metadata   --concurrency=4
celery -A app.workers.celery_app.celery_app worker -Q extraction --concurrency=4
```

并发不够时 OCR / 抽取会排队，端到端时延飙升，但**这不是后端 bug**——只是 worker 太少。压测前明确每个队列的 worker 数。

### 1.4 OSS / TextIn / LLM 配额

- **OSS**：检查测试桶有足够空间（5 VU × 5 份 × 2MB ≈ 50MB/run），且**没有跨域或带宽限速**
- **TextIn**：当前账号每月调用额度还剩多少？25 个文档/run × N runs 会消耗多少？**用真实账号压测前必须算账**，否则可能跑两轮就额度耗尽
- **LLM**：同上，且注意 RPM（每分钟请求数）限制——如果限制是 60 RPM，5 VU 并发就可能持续触发 429

## 2. 网络 / 安全（责任：运维）

### 2.1 WAF / 安全组

- 公网域名前面有阿里云盾 / Cloudflare / 自建 WAF 的话，**把压力发起方的 IP 加白名单**
- 否则 25 并发会被识别为攻击，全部 403 / 5xx，测试无意义

### 2.2 Nginx 限流

```bash
# 在服务器上检查
grep -r "limit_req\|limit_conn" /etc/nginx/conf.d/ /etc/nginx/nginx.conf
```

如果有：

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
```

这种规则会**死死卡住压测**（25 ops/sec 超 10r/s 直接拒）。压测期间临时调宽到 100r/s 或注释掉，**记得测完恢复**。

### 2.3 登录接口防爆破

注册接口 `POST /auth/register` 如果加了 per-IP rate limit，5 VU 同时注册会触发。

- 验证手段：先在本地 curl 试 6 次 register，看第几次返回 429
- 如果有，临时调宽或加白单 IP

## 3. 压力发起方（责任：压测）

### 3.1 位置

**不在本机笔记本，不在被测服务器**，用同区域云 VM。理由见早先讨论。

| 项 | 推荐 |
|---|---|
| 实例规格 | 2 vCPU / 4GB RAM（25 并发 Locust 足够） |
| 操作系统 | Ubuntu 22.04 |
| 位置 | 与被测服务器**同区域同 AZ** |
| 出网带宽 | ≥ 100 Mbps |
| Python | 3.11 |

### 3.2 待装工具

第一阶段先不写代码，但环境可以先建：

```bash
sudo apt update && sudo apt install -y python3.11 python3.11-venv
python3.11 -m venv .venv
source .venv/bin/activate
pip install locust httpx
```

## 4. 测试文档（责任：压测）

### 4.1 目录布局

```
stress_test/fixtures/
├── README.md                      ← 说明每个文档对应什么场景
├── patient_001/                   ← 一个"模拟病人"的全套文件
│   ├── 01_admission_note.pdf
│   ├── 02_lab_report.pdf
│   ├── 03_imaging_report.pdf
│   ├── 04_discharge_summary.pdf
│   └── 05_followup_note.pdf
├── patient_002/
│   └── ...
├── ...
└── patient_010/
    └── ...
```

**每个子目录恰好 5 份文档**。每次 VU 启动时随机选一个子目录，把这 5 份作为该 VU 要上传的文档。这样：

- 不同 VU 不会上传完全相同的文件（OSS dedup 可能扰乱）
- 文档类型多样（出院 / 入院 / 化验 / 影像 / 随访），能覆盖不同抽取链路

### 4.2 内容要求

- **必须是真实的（或拟真的）临床 PDF / 图片**——OCR / LLM 对纯白页或乱码会 skip / 返回空，测不出真实耗时
- **不能含真实患者隐私数据**——脱敏 / 合成
- 大小覆盖：3 份 < 1MB、1 份 2-5MB、1 份 > 10MB（测大文件路径）
- 类型覆盖：至少 1 份图片格式（jpg/png）+ 4 份 PDF

### 4.3 体积管理

`stress_test/fixtures/` **不入 git**。在 `stress_test/.gitignore` 里 ignore 整个 fixtures 目录，仅保留 `fixtures/README.md` 说明结构。文档本身放：

- 团队内部对象存储 / 网盘，跑测试前 `aws s3 sync` 或 `wget` 下来
- 或者放专门的私有 git LFS 仓库

每个跑压测的人本地必须有这份数据，**不依赖网盘临时下载**，否则首次跑数据传输时间会扭曲首批结果。

## 5. 账户隔离策略（责任：压测）

每次测试 run 用全新账户。下面是命名规则：

```python
run_id = "20260515_1430"             # 测试发起时间戳
vu_id  = "vu01"                       # VU 编号

email    = f"stress_{run_id}_{vu_id}@stress.test"
password = "Stress@123456"
patient  = f"压测患者_{run_id}_{vu_id}"
project  = f"STRESS_{run_id}_{vu_id}"  # project_code
```

**好处**：

- 同一 run 内不同 VU 不冲突
- 不同 run 之间不冲突（哪怕某次没清数据）
- 出问题时通过 `run_id` 在数据库里能精准定位测试痕迹

**清理**：

- run 结束**不删数据**——保留方便排查
- 每天 / 每周由专门脚本（SQL `DELETE WHERE email LIKE 'stress_%'`）清理一批
- **生产 DB 上不要跑**这个清理脚本

## 6. 预置数据（责任：后端 + 压测）

Step 8 的"项目模板"和 Step 11 的"靶向字段"都需要**事先存在**于数据库：

| 数据 | 来源 |
|---|---|
| 字段模板（template_id） | 由后端预先 import 一套官方 CRF 模板（如新冠 / 肿瘤随访），把 ID 记在 `stress_test/fixtures/template_id.txt` |
| 模板里的 field_paths | 同上，记 3-5 个**确定存在**的字段路径供靶向用 |
| 项目模板的 form_keys | 同上 |

**为什么不让脚本动态创建模板**：模板创建涉及 schema 解析、版本控制，链路本身复杂，会引入噪声。模板视为"环境的一部分"。

后端需要做的：

1. 在测试环境 import 一份固定模板，记录 `template_id`
2. 把可用的 `field_paths`、`form_keys` 列出来交给压测

## 7. 监控（责任：运维）

压测期间至少要能实时看到：

- **服务器 CPU / 内存 / load / 磁盘 IO**：`htop` + `iotop` 或 Prometheus node_exporter
- **PostgreSQL** `pg_stat_activity` / 慢查询日志：连接数、长事务
- **Redis（Celery broker）队列深度**：`redis-cli -n 1 llen ocr`、`metadata`、`extraction`
- **Celery worker 利用率**：`celery -A ... inspect active`、`stats`
- **应用日志**：5xx、worker 异常

最好预先开个 Grafana 看板，否则 5xx 飙起来时连查都来不及。

## 检查清单（开跑前 5 分钟过一遍）

- [ ] `.env` 里 `DB_POOL_SIZE>=20`，已重启服务
- [ ] PostgreSQL `max_connections` 足够，`pg_stat_activity` 可观测
- [ ] OCR / metadata / extraction 各 1 个 Celery worker 在跑（`celery inspect ping`）
- [ ] TextIn / LLM / OSS 配额本月还有余量
- [ ] 压力发起 VM 已起，能 curl 到公网域名
- [ ] WAF / 安全组 / nginx limit_req 已处理
- [ ] `fixtures/` 目录有 ≥ 5 个 `patient_XXX/`，每个 5 份文档
- [ ] 模板 ID + field_paths 拿到了
- [ ] Grafana / 监控开着
- [ ] **数据库不是生产库**

任何一项未完成，**不要开跑**。
