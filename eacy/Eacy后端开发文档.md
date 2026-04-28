# EACY 后端开发文档

> 返回 [[EACY架构总览]]

下面是 **Python 后端目录架构**。

```text
backend/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── documents/
│   │       ├── patients/
│   │       ├── ehr/
│   │       ├── research/
│   │       ├── crf/
│   │       ├── templates/
│   │       ├── extraction/
│   │       ├── admin/
│   │       └── auth/
│   │
│   ├── core/
│   ├── db/
│   ├── models/
│   ├── schemas/
│   ├── repositories/
│   ├── services/
│   ├── workers/
│   ├── integrations/
│   ├── storage/
│   └── utils/
│
├── migrations/
├── tests/
├── scripts/
├── docs/
└── config/
```

# 目录说明

## `app/`

后端主应用目录，所有业务代码都放在这里。

---

## `app/api/`

存放接口层代码，只负责接收请求、参数校验、调用 service、返回结果。

不在这里写复杂业务逻辑。

---

### `app/api/v1/documents/`

文档相关 API。

负责：

```text
文档上传
文档列表
文档详情
文档删除
文档 OCR 状态
文档元数据
文档归档
取消归档
文档分组
文档与患者匹配
```

### `app/api/v1/patients/`

患者数据池相关 API。

负责：

```text
患者列表
患者详情
创建患者
编辑患者基础信息
患者关联文档
患者统计信息
```

### `app/api/v1/ehr/`

患者电子病历夹 API。

负责：

```text
患者 EHR 目录
患者 EHR 表单
字段当前值
字段候选值
字段修改历史
字段溯源
人工选择最终值
人工编辑字段值
保存患者结构化病历
```

### `app/api/v1/research/`

科研项目 API。

负责：

```text
科研项目列表
创建科研项目
编辑科研项目
删除科研项目
项目详情
项目状态管理
项目患者入组
移除项目患者
项目数据概览
```

### `app/api/v1/crf/`

项目 CRF 数据 API。

负责：

```text
项目患者 CRF 页面
项目 CRF 字段值
项目 CRF 候选值
项目 CRF 修改历史
项目 CRF 字段审核
项目 CRF 完整度
项目 CRF 数据导出
```

### `app/api/v1/templates/`

模板和 schema API。

负责：

```text
EHR 模板管理
CRF 模板管理
模板列表
模板详情
模板创建
模板编辑
模板版本
模板发布
模板预览
模板字段配置
```

### `app/api/v1/extraction/`

抽取任务 API。

负责：

```text
创建抽取任务
查询任务状态
查询任务进度
查询任务结果
重新提交任务
取消任务
查看任务日志
查看失败原因
```

覆盖：

```text
OCR 任务
元数据抽取任务
患者 EHR 抽取任务
项目 CRF 抽取任务
靶向抽取任务
```

### `app/api/v1/admin/`

管理后台 API。

负责：

```text
用户管理
项目管理
模板管理
文档管理
任务管理
失败任务排查
系统运行状态
统计看板
LLM 调用记录
```

### `app/api/v1/auth/`

认证和用户登录 API。

负责：

```text
登录
注册
退出登录
刷新 token
当前用户信息
权限校验
角色管理
```

---

# 业务支撑目录

## `app/core/`

存放系统核心配置和通用基础能力。

包括：

```text
应用配置
环境变量读取
权限配置
日志配置
异常处理
统一响应格式
安全配置
```

## `app/db/`

存放数据库连接和事务管理相关内容。

包括：

```text
数据库连接
Session 管理
事务封装
数据库初始化
基础查询工具
```

## `app/models/`

存放数据库模型。

对应数据库表：

```text
患者表
文档表
模板表
字段值表
候选值表
抽取任务表
科研项目表
项目患者表
```

## `app/schemas/`

存放接口入参和出参结构。

主要用于：

```text
请求参数校验
响应数据格式
前后端字段约定
API 文档生成
```

## `app/repositories/`

存放数据库访问逻辑。

负责：

```text
查询数据库
新增数据
更新数据
删除数据
复杂 SQL 封装
```

这一层只处理数据读写，不处理业务规则。

## `app/services/`

存放核心业务逻辑。这是后端最重要的业务层。

负责：

```text
文档归档逻辑
患者匹配逻辑
EHR 字段保存逻辑
CRF 抽取落库逻辑
模板解析逻辑
字段候选值选择逻辑
任务状态流转逻辑
```

## `app/workers/`

存放后台异步任务逻辑。

Celery 实施细节见：[[EACY开发计划 6.3 Celery 后台任务实施路径]]

负责：

```text
OCR 后台任务
元数据抽取任务
EHR 抽取任务
CRF 抽取任务
任务重试
定时扫描待处理任务
```

## `app/integrations/`

存放外部服务对接。

包括：

```text
OCR 服务
LLM 服务
向量模型
reranker 服务
OSS 文件存储
短信服务
邮件服务
第三方登录
```

## `app/storage/`

存放文件存储相关逻辑。

负责：

```text
本地文件存储
OSS 文件上传
PDF 文件读取
临时文件管理
文件访问地址生成
```

## `app/utils/`

存放通用工具函数。

包括：

```text
时间处理
字符串处理
文件处理
JSON 处理
ID 生成
分页工具
字段标准化工具
```

---

# 项目级目录

## `migrations/`

数据库迁移目录。

负责：

```text
建表
改表
新增字段
数据库版本管理
```

## `tests/`

测试目录。

存放：

```text
接口测试
业务逻辑测试
数据库测试
抽取流程测试
```

## `scripts/`

脚本目录。

存放：

```text
初始化数据库脚本
导入测试数据脚本
批量处理脚本
数据修复脚本
开发调试脚本
```

## `docs/`

项目文档目录。

存放：

```text
接口文档
数据库设计文档
业务流程文档
部署文档
抽取流程说明
```

## `config/`

配置目录。

存放：

```text
开发环境配置
测试环境配置
生产环境配置
模型配置
OCR 配置
任务队列配置
```

# 简化理解

整个后端可以按这几层理解：

```text
api/             对外接口
services/        业务逻辑
repositories/    数据库读写
models/          数据库表结构
schemas/         请求和响应结构
workers/         后台任务
integrations/    外部服务
core/            系统基础配置
```

你的主要业务代码应该集中在：

```text
documents/
patients/
ehr/
research/
crf/
templates/
extraction/
```

这几个模块里。

## 文档上传真实 OSS 存储

文档上传统一走 `backend/app/storage/document_storage.py`：

```text
DocumentService.upload_document()
  -> build_document_storage()
  -> LocalDocumentStorage 或 AliyunOssDocumentStorage
  -> 返回 provider/path/url/size/sha256
  -> 写入 documents.storage_provider/storage_path/file_url/file_size/file_hash
```

环境变量：

```text
DOCUMENT_STORAGE_PROVIDER=local | oss
LOCAL_UPLOAD_ROOT=uploads
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_BUCKET_NAME=...
OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com
OSS_REGION=cn-shanghai
OSS_BASE_PREFIX=documents
OSS_PUBLIC_BASE_URL=
```

验收标准：

- [x] 默认 `local` 模式兼容原有上传流程。
- [x] `oss` 模式使用环境变量配置，不在代码中写死密钥。
- [x] OSS object key 写入 `documents.storage_path`。
- [x] OSS URL 写入 `documents.file_url`。
- [x] 后端测试覆盖 storage metadata 写入。
- [x] storage backend 真实上传后，OSS bucket 已出现验证 object。
- [ ] 联调环境继续通过 `/api/v1/documents` 验收数据库记录一致。

### 真实 OSS 验收补充（2026-04-28）

- [x] storage backend 已完成一次真实 OSS `PUT Object`。
- [x] 验收 object key：`documents/2026/04/de13add2-f7b3-4d12-8a84-d4fc1a7b93b0.txt`。
- [x] 上传结果包含 `provider=oss`、`path`、`url`、`size`、`sha256`。
