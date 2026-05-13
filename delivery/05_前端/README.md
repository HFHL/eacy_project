---
type: index
module: 前端
status: reviewed
audience: [tech-lead, integrator]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 前端
---

# 05 前端

> 本模块面向需要**修改前端 / 二次开发前端**的对接方。

## 计划覆盖

| 文档 | 内容 |
|---|---|
| **页面地图.md** | 路由 → 页面 → 主要调用 API 三栏对照 |
| **组件复用说明.md** | SchemaForm、CategoryTree、PDF 高亮等核心可复用组件 |
| **页面-PatientDetail.md** | 复杂页面单独成文（多 Tab、依赖大量异步状态） |
| **页面-CRFDesigner.md** | Schema 模板设计器（拖拽、嵌套分组） |
| **页面-ResearchDataset.md** | 科研项目数据集视图 |

## 不在范围内

- 单个简单 CRUD 页面的细节（看代码 + Ant Design 文档即可）
- React 通用知识、Redux 通用模式
- 样式细节（看 less / antd theme）

## 前端工程入口

| 入口 | 文件 |
|---|---|
| 应用入口 | `frontend_new/src/main.jsx` |
| 路由根 | `frontend_new/src/App.jsx` |
| API 客户端 | `frontend_new/src/api/request.js` + `frontend_new/src/api/*.js` |
| Redux store | `frontend_new/src/store/` |
| 公共布局 | `frontend_new/src/components/Layout/MainLayout.jsx` |
