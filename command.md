Let me check the project structure for all startup configurations:

Listed directory first-project
Searched for ""dev""
Searched for ""dev""
Viewed package.json:1-30
Viewed package.json:1-57
Viewed config.py:1-43
Listed directory pipeline-daemon
Viewed index.ts:1-15
Ran command: `ls /Users/apple/project/first-project/frontend/vite.config.*`
Viewed vite.config.js:1-88

所有信息已收集齐。以下是项目的完整启动命令：

---

## 项目启动命令汇总

你需要开 **4 个终端窗口**，按顺序启动：

### 1️⃣ 后端 API (Express + SQLite)
```bash
cd /Users/apple/project/first-project/backend
npm run dev
```
- 端口：`http://localhost:8000`
- 热重载：`tsx watch src/index.ts`

### 2️⃣ 前端 (Vite + React)
```bash
cd /Users/apple/project/first-project/frontend
npm run dev
```
- 端口：`http://localhost:5173`
- API 代理：自动转发 `/api` → `localhost:8000`

### 3️⃣ Pipeline Daemon（后台调度守护进程）
```bash
cd /Users/apple/project/first-project/pipeline-daemon
python3 daemon.py
```
- 每 5 秒轮询数据库，自动派发 OCR / Metadata / EHR 抽取 / 物化任务
- 日志输出到 `daemon.log`（也可以用 `tail -f daemon.log` 实时查看）
- 依赖 `.env` 文件中的环境变量

> **后台运行**（可选）：
> ```bash
> nohup python3 daemon.py > daemon.log 2>&1 &
> ```

### 4️⃣ Prefect Server（可选，仅当用 Prefect 管理 OCR 时需要）
```bash
prefect server start
```
- 端口：`http://127.0.0.1:4200`
- 如果 `.env` 中未设置 `PREFECT_OCR_DEPLOYMENT_ID`，daemon 会直接用 subprocess 执行 OCR，不需要 Prefect

---

### 环境依赖

| 组件 | Python 虚拟环境 |
|------|---------------|
| OCR Worker | `ocr-worker/.venv/bin/python` |
| Metadata + EHR Worker | `metadata-worker/.venv/bin/python` |
| Daemon 本身 | 系统 python3（或任意有 `dotenv` 的环境） |

### 可调配置（`.env` 或环境变量）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 8000 | 后端端口 |
| `DAEMON_POLL_INTERVAL` | 5 | 轮询间隔（秒） |
| `DAEMON_MAX_OCR` | 2 | OCR 并发 |
| `DAEMON_MAX_META` | 3 | Metadata 抽取并发 |
| `DAEMON_MAX_EHR` | 2 | EHR 抽取并发 |
| `DAEMON_MAX_MATERIALIZE` | 3 | 物化并发 |
| `DAEMON_MAX_RETRIES` | 2 | Job 最大重试次数 |