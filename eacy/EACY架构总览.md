# EACY 项目架构总览

## 项目简介

EACY（曦栋智能 CRF 数据平台）是一个医疗信息化平台，用于医疗文档的智能处理、患者 EHR 管理、科研 CRF 数据集的构建与管理。

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | React 18 + Ant Design 5 + Redux Toolkit + React Router 6 |
| 构建工具 | Vite 4 |
| 后端 | Python (FastAPI) |
| 数据库 | 关系型数据库 (SQL) |
| AI 能力 | OCR 识别、LLM 抽取、向量检索 |

## 项目结构

```text
eacy_project/
├── frontend_new/         前端项目（React SPA）
├── backend/              后端项目（Python FastAPI）
├── eacy/                 Obsidian 开发文档库
├── node_modules/         前端依赖
├── package.json          根 package.json
└── .env                  环境变量
```

## 架构分层

```text
┌─────────────────────────────────────────┐
│                 前端 (frontend_new/)      │
│  pages/  →  components/  →  store/      │
│    ↕                                      │
│  api/  →  HTTP/WebSocket                 │
└──────────────────┬──────────────────────┘
                   │ HTTP / WebSocket
┌──────────────────┴──────────────────────┐
│               后端 (backend/)             │
│  api/  →  services/  →  repositories/   │
│    ↕                                      │
│  models/  ←  database                   │
│    ↕                                      │
│  workers/  →  integrations/ (AI/OCR)    │
└─────────────────────────────────────────┘
```

## 前后端模块对应

| 业务域 | 前端页面 | 后端 API |
|---|---|---|
| 仪表板 | `Dashboard` | 统计汇总各模块数据 |
| 文档管理 | `DocumentUpload` `FileList` | `api/v1/documents/` |
| 患者数据池 | `PatientPool` | `api/v1/patients/` |
| 患者 EHR | `PatientDetail/EhrTab` | `api/v1/ehr/` |
| 患者文档 | `PatientDetail/DocumentsTab` | `api/v1/documents/` |
| AI 摘要 | `PatientDetail/AiSummaryTab` | `api/v1/ehr/` |
| 科研项目 | `ResearchDataset` | `api/v1/research/` |
| CRF 数据 | `ResearchDataset/ProjectDatasetView` | `api/v1/crf/` |
| CRF 模板 | `CRFDesigner` `FormDesigner` | `api/v1/templates/` |
| 抽取任务 | `ExtractionDashboard` `ExtractionV2` | `api/v1/extraction/` |
| 管理后台 | `Admin` | `api/v1/admin/` |
| 用户认证 | `UserSystem/Login` | `api/v1/auth/` |

## 核心数据流

```text
用户上传文档 → OCR 识别 → AI 抽取病历字段 → 人工审核归档
                                            ↓
                              患者 EHR 数据 → 科研 CRF 数据集 → 数据导出
```

## 详细文档

- [[Eacy后端开发文档]] — 后端目录架构、API 模块、业务层设计
- [[Eacy前端开发文档]] — 前端目录架构、路由、状态管理、组件体系
