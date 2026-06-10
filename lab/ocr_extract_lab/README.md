# EACY OCR Extraction Lab

这个实验台是独立 FastAPI 服务，用来快速验证：

1. 从指定目录读取 PDF/图片文件。
2. 读取已经批量 OCR 保存的 TextIn 结果。
3. 先对每个 OCR 文件做文档类型/子类型识别并保存本地缓存。
4. 按文档类型匹配 `ehr_schema.json` 里的 `x-sources.primary`，只抽命中的表单字段。
5. 调用 Claude Code CLI 抽取。
6. 在页面上展示字段、证据文本和 OCR 页图红框。

## 启动

```bash
EACY_ENV_FILE=.env.prod ./scripts/run-ocr-extract-lab.sh
```

默认访问地址：

```text
http://127.0.0.1:8777/
```

macOS 后台启动：

```bash
EACY_ENV_FILE=.env.prod ./scripts/launch-ocr-extract-lab.sh
```

停止后台服务：

```bash
./scripts/stop-ocr-extract-lab.sh
```

默认文件目录是：

```text
lab/ocr_extract_lab/files
```

也可以启动时指定：

```bash
EACY_LAB_FILE_DIR=/path/to/case-files ./scripts/run-ocr-extract-lab.sh
```

## 常用配置

- `PORT`：服务端口，默认 `8777`。
- `HOST`：监听地址，默认 `127.0.0.1`。
- `EACY_ENV_FILE`：要加载的 env 文件，默认优先 `.env.prod`。
- `EACY_LAB_FILE_DIR`：页面默认读取的文件目录。
- `EACY_LAB_ALLOWED_ROOT`：限制页面只能读取此目录下的文件。
- `EACY_LAB_SCHEMA_PATH`：schema 路径，默认仓库根目录 `ehr_schema.json`。
- `EACY_LAB_OCR_BATCH_DIR`：已缓存 OCR 批次目录，默认 `lab/ocr_extract_lab/ocr_results/latest`。
- `EACY_LAB_FIELD_LIMIT`：默认抽取字段上限，默认 `160`，页面填 `0` 表示全部字段。
- `EACY_LAB_METADATA_STRATEGY`：文档类型识别方式，默认 `rule`；可设为 `llm` 走现有 metadata LLM agent。
- `EACY_LAB_RUN_ROOT`：运行结果目录，默认 `/tmp/eacy-ocr-extract-lab`。

## 注意

这是验证服务，不写数据库，也不走正式 Celery 任务。页面按钮不会重新 OCR，也不需要选择单个文件。点击后会创建一个病例级父任务，先确保整批 OCR 文件都有本地文档类型识别缓存，然后按 OCR 批次中的文件逐个抽取：每个文件单独创建 document run、单独调用 Claude Code、单独保存输入输出和日志；父任务负责汇总已完成文件的结果并让页面轮询显示。

每次抽取运行会保存到 `EACY_LAB_RUN_ROOT`（默认 `/tmp/eacy-ocr-extract-lab/<run_id>`），包括：

- `run.json`：页面轮询读取的任务状态和最终结果。
- `input/document_metadata_summary.json`：本次使用的文档类型识别缓存摘要。
- `input/schema.json`、`input/all_schema_fields.json`：本次抽取使用的 schema 和字段规格。
- `logs/events.jsonl`：阶段日志。
- `logs/llm_calls.json`：Claude Code CLI 调用记录。
- `output/fields.json`、`output/raw_output.json`、`output/result.json`：抽取结果与原始输出。
- `output/evaluation.json`：格式校验、计划字段数、已填字段数、唯一字段填充率和按表单填充率。

每个文件的子任务保存在：

```text
/tmp/eacy-ocr-extract-lab/<run_id>/documents/<index>_<source_name>/
```

子任务目录包含该文件自己的 `input/ocr_payload.json`、`input/ocr.md`、`input/document_metadata.json`、`input/schema_plan.json`、`logs/llm_calls.json`、`output/result.json`、`output/fields.json`。

## 批量 OCR

只做 TextIn OCR、保存 JSON 和 Markdown：

```bash
./scripts/batch-ocr-lab-files.sh --env-file .env.prod --input-dir lab/ocr_extract_lab/files
```

输出目录：

```text
lab/ocr_extract_lab/ocr_results/<batch_id>/
```

每个文件会生成：

- `textin_raw.json`
- `textin_normalized.json`
- `ocr.md`

批次目录还会生成 `summary.json` 和 `combined_ocr.md`。

## 批量文档类型识别

只对已缓存 OCR 结果做文档类型/子类型识别：

```bash
./scripts/batch-metadata-lab-ocr.sh --env-file .env.prod --batch-dir lab/ocr_extract_lab/ocr_results/latest
```

输出位置：

```text
lab/ocr_extract_lab/ocr_results/latest/document_metadata_summary.json
lab/ocr_extract_lab/ocr_results/latest/items/<item>/metadata.json
```

## 部分抽取测试与测评

用现有 OCR 缓存和电子病历夹 schema 跑一个小样本真实 Claude Code 抽取：

```bash
./scripts/run-lab-agent-extract-smoke.sh --env-file .env.prod --document-limit 1 --field-limit 12
```

参数说明：

- `--document-limit`：只抽前 N 个 OCR 文件，默认 `1`。
- `--field-limit`：每个文档最多传给 Claude Code 的字段数，默认 `12`。
- `--field-query`：可选字段关键词过滤。

脚本会打印 `run_dir`，最终测评在：

```text
<run_dir>/output/evaluation.json
```
