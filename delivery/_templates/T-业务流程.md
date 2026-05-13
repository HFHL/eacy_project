---
type: business-flow
module: 
status: draft
audience: [tech-lead, integrator]
code_path:
  - 
api_endpoints:
  - 
related_tables: []
related_pages: []
last_verified_commit: 
last_verified_date: 
owner: 
---

# {{title}}

> [!info] 一句话说明
> 这个流程做什么、什么时候触发、产出什么。

## 触发场景
- 

## 前置条件
- 

## 主流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant FE as 前端
    participant API as 后端 API
    participant W as Worker
    U->>FE: 操作
    FE->>API: 调用
    API->>W: 投递任务
    W-->>API: 写回结果
    API-->>FE: 状态更新
```

## 异常分支
| 场景 | 表现 | 处理 |
|---|---|---|
|  |  |  |

## 涉及资源
- **API**：[[API-xxx]]
- **数据表**：[[表-xxx]]
- **前端页面**：[[页面-xxx]]

## 验收要点
- [ ] 
