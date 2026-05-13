---
type: index
module: 集成与外部依赖
status: reviewed
audience: [integrator, ops]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 06 集成与外部依赖

> 本模块说明 EACY 依赖的**第三方服务**：接入方式、关键参数、配额、降级策略、对接注意事项。

## 外部依赖清单

| 依赖 | 用途 | 文档 | 关键代码 |
|---|---|---|---|
| **TextIn OCR** | PDF / 扫描件文字与坐标识别 | TextIn-OCR.md（待写） | `backend/app/integrations/textin_ocr.py` |
| **LLM Provider** | 字段抽取、metadata 生成 | LLM-Provider.md（待写） | `backend/app/workers/extraction_tasks.py`, `backend/app/workers/metadata_tasks.py` |
| **对象存储** | 原始文档存放 | 对象存储.md（待写） | （以实际部署形态为准：本地磁盘 / OSS / S3） |

## 写作约定

每个依赖一篇文档，统一包含：
- **用途与触发场景**
- **接入方式**（API endpoint、SDK、鉴权）
- **关键配置项**（与 [[环境变量清单]] 联动）
- **配额与限速**
- **降级 / 重试策略**
- **常见错误码与处理**
- **离线替代方案**（若有）

## 注意

API key 等敏感配置**不写在文档里**，只标注"对应环境变量名"，实际值由部署方在 `.env` 中维护。
