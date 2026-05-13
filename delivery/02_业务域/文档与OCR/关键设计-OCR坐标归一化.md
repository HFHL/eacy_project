---
type: reference
module: 文档与OCR
status: draft
audience: [tech-lead, integrator]
code_path:
  - backend/app/services/ocr_payload_normalizer.py
  - backend/app/api/v1/documents/router.py
related_tables: [document]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 关键设计-OCR坐标归一化

> [!info] 一句话说明
> `ocr_payload_normalizer.normalize_textin_ocr_payload` 把 TextIn 返回的、形态不稳定的 `pages / detail / cells` 数组，**重排成统一的 `pages / lines / blocks / tables` 四层结构**，让下游（前端版面预览、抽取阶段的证据归因）无需再处理供应商方言。

## 为什么需要这一层

TextIn 的原始响应有几个不便直接用：
1. 行级 OCR 与段落级版面分别在 `pages[*].raw_ocr` 和 `result.detail`，需要交叉关联。
2. 坐标空间无明确标识——上游可能给"像素 / 归一化 / 未知"，证据归因需要统一判断。
3. 表格嵌在 `detail[*].cells` 里，没有独立 `tables` 索引。
4. 全局文本流偏移没有，证据归因里"quote_text 在第几行"的对齐需要每行一个 `start_offset/end_offset`。

把这些都在**单一入口**（OCR 流水线最后一步）解决掉，是为了：
- 字段证据归因（`evidence_location_resolver`，见 [[AI抽取/证据归因机制]]）可以认一个稳定结构；
- 前端 PDF 预览可以直接渲染 `content_list`（`router.py::build_content_list`），无须再分供应商分支。

## 归一化产物结构

`document.parsed_data = document.ocr_payload_json =` 同一对象：

| Key | 含义 |
|---|---|
| `provider` / `provider_version` | 当前固定 `textin` / `eacy-textin-adapter-v1`，未来换供应商时改这两个字段 |
| `request` | `request_snapshot`：API URL、文档 ID、文件名、MIME，便于事后回放 |
| `response_summary` | TextIn 的 `code / message / total_page_number / valid_page_number / success_count` |
| `raw_response` | 原始 TextIn JSON（保留以便排障；下游不应依赖它） |
| `markdown` | 整文档的 Markdown 视图；用作 `document.ocr_text` 与 Metadata 输入 |
| `pages[]` | 每页元数据：`page_no / width / height / angle / dpi / textin_page_id …` |
| `lines[]` | 行级 OCR：`line_id / page_no / text / polygon / coord_space / start_offset / end_offset / score …` |
| `blocks[]` | 段落级版面：`block_id / page_no / type / sub_type / text / markdown / polygon / table_id …` |
| `tables[]` | 表格结构：`table_id / cells[{row, col, row_span, col_span, polygon, text}]` |
| `errors[]` | 归一化阶段记录的非致命问题（当前实现下为空） |

### 坐标空间 `coord_space`
对每行 / 每 block / 每 cell 都标注：
- `"pixel"`：当 `page.width` 与 `page.height` 都已知（多数情形）。
- `"unknown"`：缺一即记为未知，证据归因时按"不可缩放"处理。

### 全局文本偏移 `start_offset / end_offset`
每条 `line` 在归一化过程中累加偏移（行末额外 +1 模拟换行符）。下游 `evidence_location_resolver` 拿到 LLM 的 `quote_text` 时，可以先做子串匹配定位到 `line_id`，再去 `polygon` 取坐标。

### `block_id` 命名约定
- 段落级 block：`b<index>`（`index` 从 1 起）；
- 行 ID：`p<page>-l<line_index>`；
- 表格 ID：`t<index>`，cell key 形如 `t1-c3`。

这些 ID 是 EACY 自造的、稳定的字符串；不要把 TextIn 的 `paragraph_id` 当作主键暴露给下游。

## 前端如何消费

`router.py::build_content_list` 把 `blocks[]` 再压平成 `content_list[]`：

```text
{
  id: block_id,
  type: "text" | "table" | "image",
  page_idx: page_no - 1,
  text, bbox: polygon, table_body, text_level
}
```

前端 PDF 预览组件按 `content_list` 渲染高亮块；点击字段证据时取 `field_value_evidence.evidence_json.block_id` 即可定位。

## 易踩坑

> [!warning] `parsed_data` 与 `ocr_payload_json` 同源
> 两个字段写的是同一对象。历史上 `parsed_data` 是早期实现，新代码统一读 `ocr_payload_json`；不要在两边各自演化结构。

> [!warning] `coord_space=unknown` 不能直接缩放
> 当 `page.width/height` 缺失时，多边形坐标可能是模型原图坐标，不能用前端的 `pageWidth` 等比换算，否则证据高亮会错位。

> [!warning] `raw_response` 不要参与业务字段
> 它只用于排障，TextIn 字段可能随版本升级换名；新增字段务必加到归一化产物里，**不要在下游业务里直接读 `raw_response`**。

## 替换 OCR 供应商时要做什么

1. 新增一个 `normalize_xxx_ocr_payload` 函数，产出同结构。
2. `DocumentService.process_document_ocr` 内部换调用的 Client + Normalizer。
3. `provider` / `provider_version` 字段记下新身份。
4. `evidence_location_resolver` 与前端 `content_list` 渲染**完全不用动**——这正是本层存在的意义。

## 相关文档

- [[业务流程-OCR处理]]
- [[AI抽取/证据归因机制]]（待写）
- [[表-document]]
- [[TextIn-OCR]]
