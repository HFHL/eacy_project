# EACY 后端压测

本目录存放针对 EACY 后端的压力测试设计文档与（未来的）测试脚本。

**当前阶段：仅文档**。脚本未实现。先把场景、接口、前置条件、指标定义清楚，确认无误后再写 Locust / asyncio 脚本。

## 测试目标

模拟真实多用户并发使用：每个虚拟用户走完一条完整业务链路（注册 → 建患者 → 上传文档 → OCR → 元数据抽取 → EHR 观察 → 建科研项目 → 入组 → CRF 全量抽取 → 靶向抽取），所有外部依赖（TextIn、LLM、OSS）使用**真实账号**，不 stub。

第一阶段目标负载：

| 指标 | 值 |
|---|---|
| 并发账户 | 5 |
| 每账户操作频率 | 5 ops/sec |
| 总并发动作 | 25 |
| 单测试运行时长 | 待定 |
| 文档来源 | 本地目录（每账户上传 5 份） |
| 账户隔离 | 每次测试**新建**账户，不复用 |

## 文档阅读顺序

按编号读：

| 文档 | 内容 |
|---|---|
| [01-scenario.md](./01-scenario.md) | 一个虚拟用户在一次 run 里走完的业务流程 |
| [02-api-flow.md](./02-api-flow.md) | 每一步对应的 HTTP 接口、payload、返回值、轮询逻辑 |
| [03-setup.md](./03-setup.md) | 前置准备：后端调参、测试文档目录、压力发起方位置、WAF/nginx 限流处理 |
| [04-metrics.md](./04-metrics.md) | 采集指标、成功/失败判定、紧急 abort 条件 |

## 不在范围内

下列内容**本次不做**，将来需要再写另一套文档：

- Stub 模式压测（绕过 TextIn / LLM 测 app 极限并发）
- 单接口热点压测（如纯上传压 OSS、纯 LLM 压外部 API）
- 长时间稳定性测试（24h+ 跑泄漏）
- 数据回放 / 录制重放

## 目录最终形态（参考，目前未实现）

```
stress_test/
├── README.md                    ← 本文件
├── 01-scenario.md
├── 02-api-flow.md
├── 03-setup.md
├── 04-metrics.md
├── fixtures/                    ← 本地测试文档（病历 PDF / 图片）
│   └── README.md
├── scripts/                     ← Locust / asyncio 脚本（未来）
│   └── locustfile.py
├── results/                     ← 测试输出（CSV / 日志，gitignore）
└── .gitignore
```
