---
type: reference
module: 接口
status: draft
audience: [integrator]
code_path:
  - backend/app/server.py
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# OpenAPI 访问

> [!info] 单一事实源
> **参数表、字段类型、状态码、Schema 形状以 OpenAPI 为准**，本套文档不重抄。各业务分组的 md 只解释业务含义、调用注意事项与业务错误码。

## 一、在线访问

FastAPI 自带两套交互式文档，由 `app/server.py::create_app` 注册：

| 路径 | 说明 |
|---|---|
| `/docs` | Swagger UI，可在线试调 |
| `/redoc` | ReDoc，更适合阅读 |
| `/openapi.json` | 原始 OpenAPI v3 JSON |

仅当 `ENV != "production"` 时挂载（生产环境置 `None`）：

```python
docs_url=None if config.ENV == "production" else "/docs",
redoc_url=None if config.ENV == "production" else "/redoc",
```

### 本地默认地址

后端默认监听 `0.0.0.0:8000`：

- <http://localhost:8000/docs>
- <http://localhost:8000/redoc>
- <http://localhost:8000/openapi.json>

### 鉴权交互

`/docs` 右上角 "Authorize" 按钮可粘贴 `Bearer <token>`。开发环境 `ENABLE_AUTH=False` 时可省略（自动以 `dev_admin` 身份调用），见 [[接口约定#二、鉴权机制]]。

## 二、生产环境

生产环境（`ENV=production`）**关闭** `/docs` 与 `/redoc`，但 `/openapi.json` 是否暴露取决于反向代理配置——FastAPI 侧仅关掉 UI，schema 端点的可见性由部署方决定。如果需要给对接方留 schema，可：

- 在网关层只放行 `/openapi.json`，关闭 `/docs`、`/redoc`
- 或离线导出后分发（推荐）

## 三、离线导出 OpenAPI

适合给前端 / 第三方对接方"快照"。

### 方式 A：直接 curl

后端运行起来后：

```bash
curl http://localhost:8000/openapi.json > openapi.json
```

### 方式 B：脚本导出（不起 HTTP 服务）

```python
# scripts/dump_openapi.py
import json
from app.server import app
print(json.dumps(app.openapi(), ensure_ascii=False, indent=2))
```

```bash
cd backend && python scripts/dump_openapi.py > openapi.json
```

> [!todo] TBD
> 当前仓库尚未沉淀 `scripts/dump_openapi.py`，需要时按上面片段临时建。

## 四、与本套文档的分工

| 关心什么 | 看哪里 |
|---|---|
| 字段类型、必填、枚举值 | `/docs` 或 `openapi.json` |
| 这个接口业务上做什么、何时调、副作用 | `03_接口/业务API说明/<分组>.md` |
| 通用鉴权、错误格式、分页、ID 约定 | [[接口约定]] |
| 业务流程串起来怎么用 | `02_业务域/<域>/业务流程-*.md` |

> [!warning] 不要把 OpenAPI 的字段表复制到 md 里
> 字段一变文档必然漂移。要解释字段就只挑业务上有歧义/有约束的写在"关键字段语义"小节，其余交给 OpenAPI。
