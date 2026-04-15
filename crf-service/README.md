# CRF 抽取服务

独立的 CRF / EHR 结构化抽取微服务，基于 **LangGraph + Celery + FastAPI** 架构。

## 架构

```
FastAPI (:8100)          Celery Worker              LangGraph
┌────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ REST API   │──────│  Redis Broker   │──────│ load_schema     │
│ SSE 进度流  │      │  Task Queue     │      │ filter_units    │
└────────────┘      └─────────────────┘      │ extract_units   │
                                              │ materialize     │
                                              └─────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
cd crf-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. 启动 Redis

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

### 3. 启动 FastAPI 服务

```bash
cd crf-service
uvicorn app.main:app --port 8100 --reload
```

### 4. 启动 Celery Worker

```bash
cd crf-service
celery -A app.celery_app worker -l info -c 2
```

## API 接口

| 方法 | 路径 | 描述 |
|------|------|------|
| `POST` | `/api/extract` | 提交抽取任务 |
| `POST` | `/api/extract/batch` | 批量提交（归档触发） |
| `GET` | `/api/extract/{job_id}` | 查询任务状态 |
| `GET` | `/api/extract/{job_id}/progress` | SSE 实时进度 |
| `GET` | `/health` | 健康检查 |
| `GET` | `/docs` | Swagger UI |

### 提交抽取示例

```bash
curl -X POST http://localhost:8100/api/extract \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "847298b6-a4c8-49ea-aa07-8989cf036cf3",
    "schema_id": "patient_ehr_v2",
    "instance_type": "patient_ehr"
  }'
```

### SSE 进度监听

```javascript
const es = new EventSource('http://localhost:8100/api/extract/{job_id}/progress')
es.onmessage = (e) => {
  const progress = JSON.parse(e.data)
  console.log(progress)
  // { node: "extract_units", status: "done", completed: 3, total: 5 }
}
```

## 两种触发场景

### 电子病历夹（自动触发）

归档 commit 时，Backend 调用 `POST /api/extract/batch`，传入归档文档列表。

### 科研项目（手动触发）

前端点击"开始抽取"按钮，调用 `POST /api/extract`，传入项目的 CRF schema_id。
