# EACY 前端开发文档

> 返回 [[EACY架构总览]]

下面是 **前端模块** 的目录架构和说明。

```text
frontend_new/
├── index.html
├── package.json
├── vite.config.js
├── jsconfig.json
├── public/
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── api/
    │   ├── request.js          HTTP 请求封装
    │   ├── config.js           API 地址和全局配置
    │   ├── auth.js             认证（登录/注册/token）
    │   ├── patient.js          患者 CRUD
    │   ├── document.js         文档上传/列表/OCR
    │   ├── project.js          科研项目 CRUD
    │   ├── crfTemplate.js      CRF 模板增删改查
    │   ├── admin.js            管理后台
    │   ├── stats.js            统计数据
    │   └── websocket.js        实时推送
    ├── router/
    │   └── index.jsx           路由配置 + 菜单 + 权限
    ├── store/
    │   ├── index.js            Redux store 入口
    │   └── slices/             各模块状态切片
    ├── components/             可复用业务组件
    ├── pages/                  页面级组件
    ├── hooks/                  全局自定义 hooks
    ├── utils/                  工具函数
    ├── constants/              常量
    ├── data/                   静态数据 / mock
    ├── styles/                 全局样式
    └── res/                    静态资源
```

# 目录说明

## `src/api/`

存放所有后端 API 调用函数，每个文件对应一个业务域。

[同上后端 API 模块一一对应，详见 [[EACY架构总览#前后端模块对应]]]

## `src/router/`

前端路由配置，使用 React Router v6。

```text
/login                          登录页（独立布局）
/                               主布局（MainLayout）
  /dashboard                    仪表板
  /document/
    upload                      文档上传
    file-list                   文件列表
    extraction-v2               V2 抽取测试
  /patient/
    pool                        患者数据池
    detail/:patientId           患者详情
  /research/
    projects                    科研项目列表
    projects/:projectId         项目数据集
    projects/:projectId/template/edit    编辑项目 CRF 模板
    projects/:projectId/patients/:patientId  项目患者详情
    templates/create            创建 CRF 模板
    templates/:templateId/edit  编辑 CRF 模板
  /admin                        管理后台
  /user/
    profile                     个人中心
    settings                    系统设置
```

此外 router 还导出：主菜单配置、用户菜单、快捷操作、面包屑、页面权限配置。

## `src/store/`

Redux Toolkit 状态管理，按业务域拆分 slice：

| Slice | 管理状态 |
|---|---|
| `userSlice` | 用户认证、token、权限 |
| `patientSlice` | 患者列表、当前患者、筛选条件 |
| `documentSlice` | 文档列表、上传状态、处理进度 |
| `crfSlice` | CRF 模板数据、设计器状态 |
| `projectSlice` | 科研项目列表、当前项目 |
| `uiSlice` | 全局 UI（侧栏、loading、通知） |

## `src/components/`

存放可复用的业务组件。

### `Common/`

通用基础组件：

```text
ErrorBoundary       全局错误边界
SplitterHandle      可拖拽分隔条
StructuredDataView  结构化数据展示
```

### `Layout/`

布局组件：

```text
MainLayout          主布局（侧栏 + 顶栏 + 内容区）
NotificationBell    通知铃铛
```

### `SchemaForm/`

基于 JSON Schema 的动态表单渲染引擎。核心文件：

```text
SchemaForm          动态表单容器
FormPanel           表单面板
FieldRenderer       字段渲染器
RepeatableForm      可重复表单组
CategoryTree        分类树
schemaRenderKernel  渲染内核
```

### `FormDesigner/`

CRF 模板可视化设计器（拖拽式表单构建器），是前端最复杂的组件：

```text
core/               设计器核心逻辑
  DesignModel       设计数据模型
  SchemaGenerator   Schema 生成器
  SchemaParser      Schema 解析器
components/         设计器 UI 子组件
  LeftPanel         左侧面板（组件库 + 目录树）
  CenterPanel       中间画布（拖拽区域）
  RightPanel        右侧面板（属性配置）
  FieldModal        字段编辑弹窗
  PreviewModal      预览弹窗
  ResizablePanels   可拖拽三栏布局
hooks/              设计器专用 hooks
utils/              设计器工具函数
```

### 其他组件

| 组件 | 职责 |
|---|---|
| `DocumentBboxViewer` | PDF Bbox 坐标可视化 |
| `FieldSourceViewer` | 字段溯源查看器 |
| `PdfPageWithHighlight` | PDF 页面高亮标注 |
| `ParseProgress` | 抽取任务进度展示 |
| `Patient/` | 创建患者弹窗/抽屉 |
| `Research/` | 项目创建向导、模板元信息弹窗 |
| `UploadPanel/` | 文档上传悬浮面板 |

## `src/pages/`

存放页面级组件。

### `Dashboard/`

仪表板首页，展示数据概览 KPI、流程漏斗图、通知流、快速入口。

### 文档模块

| 页面 | 职责 |
|---|---|
| `DocumentUpload/` | 多文件拖拽上传、OCR/抽取触发 |
| `AIProcessing/` | AI 抽取结果审核、归档确认 |
| `FileList/` | 所有已上传文件表格视图 |
| `ExtractionV2/` | V2 抽取测试页面 |

### `PatientPool/`

患者数据池，全集患者列表管理和搜索筛选。

### `PatientDetail/`

患者详情页，功能最复杂的页面模块，按 Tab 组织：

| Tab | 职责 |
|---|---|
| `EhrTab/` | 三栏布局电子病历（分组树 + 字段列表 + 溯源面板） |
| `DocumentsTab/` | 关联文档时间线，支持字段冲突查看和人工修正 |
| `AiSummaryTab/` | AI 生成的患者摘要，支持编辑 |
| `SchemaEhrTab/` | Schema 驱动的动态 EHR 表单 |
| `TimelineTab/` | 患者诊疗时间线 |

### `ResearchDataset/`

科研数据集模块，最复杂的业务页面：

```text
index.jsx                   科研项目列表
ProjectDatasetView.jsx      项目数据集主视图
ProjectPatientDetail.jsx    项目患者详情
ProjectTemplateDesigner.jsx 项目 CRF 模板设计器
```

子目录：

```text
adapters/       数据适配层
components/     数据集专用组件（主键表、分组 Tab、嵌套抽屉）
config/         数据集协议定义
hooks/          数据集专用 hooks
parsers/        嵌套字段解析器
renderers/      CRF 渲染规则
```

### 其他页面

| 页面 | 职责 |
|---|---|
| `CRFDesigner/` | CRF 模板设计器（封装 FormDesigner） |
| `UserSystem/` | 登录、个人中心、系统设置 |
| `Admin/` | 管理后台，系统级数据管理 |
| `ExtractionDashboard/` | 抽取任务工作台（已隐藏） |
| `ExtractionDebugger/` | 抽取流程调试器（已隐藏） |
| `OcrViewer/` | OCR 坐标溯源（已隐藏） |

## `src/hooks/`

全局自定义 hooks：

| Hook | 职责 |
|---|---|
| `useExtractionProgressSSE` | SSE 推送抽取进度 |
| `useUploadManager` | 上传状态管理 |

## `src/utils/`

通用工具函数，包括：审计解析、日期格式化、通知桥接、模板设计器加载、CRF 性能指标等。

## `src/constants/` `src/data/` `src/styles/`

常量、静态/mock 数据、全局样式和主题 Token。

---

# 简化理解

整个前端按这几层理解：

```text
api/             后端接口调用
router/          页面路由和导航
pages/           页面级组件（业务视图）
components/      可复用组件（业务组件 + 通用组件）
store/           全局状态管理（Redux）
hooks/           自定义逻辑 hooks
utils/           纯工具函数
```

数据流方向：

```text
用户操作 → pages/ → store/ (dispatch action)
                      ↓
                  api/ (调用后端)
                      ↓
                  store/ (更新 state)
                      ↓
                 pages/ (重新渲染)
```

核心开发集中在：

```text
pages/Dashboard/           仪表板
pages/PatientPool/         患者数据池
pages/PatientDetail/       患者详情（EHR、文档、AI 摘要）
pages/ResearchDataset/     科研数据集
components/FormDesigner/   CRF 模板设计器
components/SchemaForm/     动态表单引擎
store/slices/              各模块状态
```
