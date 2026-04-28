[[返回结构说明]]

[[前端可视化，获取精准坐标]]

# EACY TextIn OCR 实施设计

> [!summary]
> TextIn OCR 在 EACY 中不是只为了得到纯文本，而是要形成可复用的文档结构层。OCR 结果必须同时满足三件事：文档内容展示、后续 metadata / EHR / CRF 抽取、字段级来源追踪与前端红框可视化。

## 目标

当前阶段实现真实文档上传后的 OCR 链路：

```text
documents 上传完成
  -> ocr queue
  -> process_document_ocr(document_id)
  -> 调用 TextIn 文档解析 API
  -> 保存 markdown / pages / detail / raw_ocr / elements
  -> 生成 EACY 标准化 OCR payload
  -> 写 documents.ocr_text / documents.ocr_payload_json
  -> 后续 metadata / extraction 使用同一份 OCR payload
```

非目标：

- 当前不拆 `document_pages` / `document_blocks` 表。
- 当前不在 OCR 阶段直接写 EHR / CRF 字段值。
- 当前不把 TextIn 返回图片 URL 当作永久资源使用；需要长期展示时必须自行持久化。

## TextIn 调用策略

第一版建议使用 TextIn 文档解析能力，并要求返回足够支持追踪的数据：

| 配置方向 | 目的 |
|---|---|
| 返回 `markdown` | 用于文档 OCR 内容展示、全文预览、metadata / extraction 的文本输入 |
| 返回 `detail` | 用于段落、表格、图片等结构块定位 |
| 返回 `pages` | 用于页级状态、尺寸、角度、raw OCR 行级定位 |
| 开启 `raw_ocr` | 用于字段级原文命中和行级红框 |
| 需要字符级追踪时开启 `char_details` | 用于后续把字段值精确到字符范围；第一版可不强制 |
| 获取页图或子图时开启 `get_image` | 用于图片预览和红框底图；TextIn URL 只有有效期，需要本地持久化策略 |

`parse_mode` 选择：

- 第一版优先使用能返回 `markdown/detail/pages` 的模式，便于兼容现有前端 OCR 内容展示。
- 如果使用 `lite` / `vlm` 并返回 `elements`，后端必须转换成 EACY 标准结构后再入库，不让前端直接依赖两套 TextIn 原始格式。

## TextIn 返回结构的使用原则

TextIn 返回中重点保留这些字段：

| TextIn 字段 | EACY 用途 |
|---|---|
| `result.markdown` | 写入 `documents.ocr_text`，也保存在 `ocr_payload_json.markdown` |
| `result.detail[]` | 标准化为文档块 `blocks[]`，支持段落、表格、图片结构展示 |
| `result.pages[]` | 标准化为 `pages[]`，保存页码、尺寸、角度、页图信息、raw OCR |
| `pages[].raw_ocr[]` | 标准化为 `lines[]`，支持字段级证据定位 |
| `detail[].position` / `origin_position` | 保存为 block polygon，用于结构块红框 |
| `raw_ocr[].position` | 保存为 line polygon，用于字段证据红框 |
| `detail[].cells[]` | 保存为 table cell 结构，用于表格字段、行、单元格追踪 |
| `elements[]` | 如使用 lite/vlm，转换为统一 `blocks[]` / `pages[]` 后保存 |
| `metrics` | 保存页级 dpi、尺寸、状态的补充信息 |

坐标规则：

- TextIn 的 `position` / `pos` 通常是 8 个数的四点 polygon，顺序为左上、右上、右下、左下。
- PDF 输入时，TextIn 坐标可能基于 72 dpi 或页图尺寸；图片输入时通常是原图像素坐标。
- `elements.metadata.coordinates` 是归一化坐标，保存时要明确 `coord_space = normalized`。
- 前端红框最稳定的数据结构只保存 TextIn 原始四点坐标：
  - `polygon`：原始 8 点坐标，作为唯一定位坐标
  - `coord_space`：`pixel` / `pdf_72dpi` / `normalized`
  - `page_width` / `page_height`
  - `textin_position` / `textin_origin_position`：保留 TextIn 原始字段，避免二次转换丢失语义

## EACY 标准 OCR Payload

TextIn 原始响应不直接作为前端和抽取层的长期契约。后端应保存一份 EACY 标准结构到 `documents.ocr_payload_json`。

推荐结构：

```text
ocr_payload_json
  provider: textin
  provider_version
  request
  response_summary
  raw_response
  markdown
  pages[]
  blocks[]
  tables[]
  lines[]
  assets
  errors[]
```

字段说明：

| 字段 | 内容 |
|---|---|
| `provider` | 固定为 `textin` |
| `provider_version` | TextIn 返回的版本或 EACY adapter 版本 |
| `request` | 本次 OCR 的参数快照，隐藏 appid/key |
| `response_summary` | `code/message/duration/total_page_number/valid_page_number/success_count` |
| `raw_response` | TextIn 完整 JSON；第一版可完整保存，后续大文件可改为对象存储路径 |
| `markdown` | `result.markdown` |
| `pages[]` | 页级标准结构 |
| `blocks[]` | 段落、标题、表格、图片等标准块 |
| `tables[]` | 表格和单元格结构 |
| `lines[]` | OCR 行级文本和坐标，用于字段命中 |
| `assets` | 页图、子图、下载后的本地路径或临时 URL 元信息 |
| `errors[]` | 页级或整体错误 |

### `pages[]`

每页保存：

```text
page_no
textin_page_id
status
width
height
angle
dpi
image_id
origin_image_id
page_image_url
local_page_image_path
duration_ms
```

说明：

- `page_no` 在 EACY 内部统一从 1 开始。
- `textin_page_id` 保留 TextIn 原始页标识。
- 如果 TextIn 返回页图 URL，需要尽快下载并保存到本地或 OSS，再写 `local_page_image_path`。
- 前端红框优先使用本地可控的页图，不依赖 TextIn 30 天临时 URL。

### `blocks[]`

每个 block 表示一个文档结构块：

```text
block_id
source: detail / pages.structured / elements
source_id
page_no
type: paragraph / title / table / image / header / footer / raw_line
sub_type
text
markdown
polygon
coord_space
page_width
page_height
line_ids[]
table_id
confidence
order_index
```

用途：

- 文档详情页 OCR 内容展示。
- 点击结构块时在右侧页图上画红框。
- metadata / extraction 可引用 `block_id` 作为粗粒度证据。

### `lines[]`

每个 line 对应 TextIn `pages[].raw_ocr[]` 或 `pages[].content[]` 中的文字行：

```text
line_id
page_no
text
polygon
coord_space
page_width
page_height
score
char_positions
char_scores
start_offset
end_offset
block_id
order_index
```

用途：

- 字段级证据优先引用 line。
- 如果字段值跨多行，`field_value_evidence` 保存多个 evidence 或一个 evidence 的 `locations[]`。
- `start_offset/end_offset` 是基于 `documents.ocr_text` 或标准化 page text 的字符偏移。

### `tables[]`

每个 table 保存：

```text
table_id
page_no
block_id
text
html
markdown
polygon
rows
cols
cells[]
```

每个 cell 保存：

```text
row
col
row_span
col_span
text
polygon
coord_space
row_key
cell_key
```

用途：

- 表格字段抽取时，能追踪到整行或单元格。
- `field_value_evidence.evidence_type` 可使用 `table_row` 或 `table_cell`。

## 数据库存储设计

当前阶段不新增 OCR 明细表，使用现有 `documents` 表：

| 字段 | 保存内容 |
|---|---|
| `documents.ocr_status` | `queued/running/completed/failed` |
| `documents.ocr_text` | TextIn markdown 或由标准结构拼出的纯文本；第一版建议保存 markdown |
| `documents.ocr_payload_json` | EACY 标准 OCR payload，包含 TextIn 原始响应和标准化结构 |
| `documents.updated_at` | OCR 状态或内容更新时刷新 |

大对象策略：

- 第一版可以直接把完整 TextIn JSON 放入 `ocr_payload_json.raw_response`。
- 如果后续遇到 JSON 过大，应改为：
  - `ocr_payload_json.raw_response_ref` 保存对象存储路径
  - `ocr_payload_json` 只保存标准化后的 pages/blocks/lines/tables 摘要
- 页图、子图不要长期依赖 TextIn URL，需下载到 `storage/ocr/...` 或 OSS。

## 字段级追踪设计

字段级追踪不在 OCR 阶段写入，而在 metadata / extraction 产出字段值时写入。

已有表：

- `field_value_events`：保存字段候选值。
- `field_value_evidence`：保存字段值对应的文档来源、页码、坐标、引用文本。

字段抽取时的写入规则：

```text
TextIn OCR payload
  -> metadata / extraction adapter 找到字段值
  -> 匹配 lines / blocks / table cells
  -> 创建 field_value_events
  -> 创建 field_value_evidence
```

`field_value_evidence` 映射：

| evidence 字段 | TextIn / EACY 来源 |
|---|---|
| `document_id` | 当前文档 ID |
| `page_no` | `line.page_no` / `block.page_no` / `cell.page_no` |
| `bbox_json` | 标准位置结构，见下方；字段名沿用历史命名，但内容只保存 polygon，不保存 bbox |
| `quote_text` | 命中的原文片段 |
| `evidence_type` | `field` / `table_row` / `table_cell` |
| `row_key` | 表格行字段时填写 |
| `cell_key` | 表格单元格字段时填写 |
| `start_offset` | 字段值在标准文本中的起始偏移 |
| `end_offset` | 字段值在标准文本中的结束偏移 |
| `evidence_score` | TextIn score 或 extraction 置信度 |

`bbox_json` 标准结构：

```text
{
  page_no,
  polygon,
  coord_space,
  page_width,
  page_height,
  source_type,
  source_id,
  textin_position,
  textin_origin_position,
  line_id,
  block_id,
  table_id,
  cell_key
}
```

说明：

- `polygon` 是唯一定位坐标，直接保存 TextIn 原始 8 点四边形。
- 不保存派生 `bbox`，避免后续误以为矩形框是原始证据。
- `coord_space` 必须写清楚，否则前端无法可靠换算。
- `source_id` 指向 `line_id`、`block_id` 或 `cell_key`。
- 如果一个字段来自多个位置，建议创建多条 `field_value_evidence`，而不是把多个框塞进一条记录。

## 前端红框可视化契约

现有前端能力：

- `DocumentBboxViewer` 可展示文档块列表和页图红框。
- `FieldSourceViewer` 可展示字段来源、原文片段、文档预览。
- `PdfPageWithHighlight` 应使用 polygon 绘制来源红框。

后端需要给前端的数据：

```text
document_id
file_name
file_type
page_no
page_image_url 或 pdf_url
ocr_payload_json.pages[].width / height / angle
evidence.bbox_json.polygon
evidence.bbox_json.coord_space
evidence.quote_text
```

前端展示逻辑：

1. 用户点击字段值或“来源”标签。
2. 前端读取字段对应的 evidence。
3. 根据 `document_id` 获取文档临时访问地址或页图地址。
4. 根据 `page_no` 打开对应页。
5. 根据 `bbox_json.polygon` 换算坐标。
6. 在图片/PDF canvas 上画红框。
7. 同时展示 `quote_text` 和字段值，方便人工校验。

坐标换算规则：

- `coord_space = pixel`：按 `page_width/page_height` 换算 polygon 到显示尺寸。
- `coord_space = pdf_72dpi`：PDF 按 PDF page points 换算 polygon。
- `coord_space = normalized`：`coordinates` 先乘以 `page_width/page_height` 后再绘制。
- 前端只依赖 8 点 polygon，不使用后端派生 bbox。

## 推荐 OCR 实施流程

### 1. 上传后入队

```text
POST /api/v1/documents
  -> 保存文件
  -> documents.ocr_status = queued
  -> process_document_ocr(document_id)
```

### 2. Worker 处理

```text
process_document_ocr(document_id)
  -> documents.ocr_status = running
  -> 读取 storage_path
  -> 调用 TextIn adapter
  -> 检查 TextIn code/message
  -> 标准化 TextIn result
  -> 保存 ocr_text / ocr_payload_json
  -> documents.ocr_status = completed
```

### 3. 标准化

```text
TextIn response
  -> markdown
  -> pages[]
  -> blocks[]
  -> lines[]
  -> tables[]
  -> assets
```

### 4. 后续抽取

```text
metadata worker / extraction worker
  -> 读取 documents.ocr_payload_json
  -> 抽取字段值
  -> 匹配 lines / blocks / cells
  -> 写 field_value_events
  -> 写 field_value_evidence
```

## 异常处理

| 场景 | 处理 |
|---|---|
| TextIn HTTP 请求失败 | `documents.ocr_status = failed`，错误写入 `ocr_payload_json.errors[]` |
| TextIn `code != 200` | 视为 OCR 失败，保留原始响应摘要 |
| 部分页失败 | 整体可为 `completed_with_errors` 或 `completed` + `errors[]`；第一版如无状态枚举则用 `completed` 并保存页级错误 |
| 返回无 markdown 但有 raw_ocr | 用 raw_ocr 拼接 `ocr_text` |
| 返回无坐标 | OCR 可完成，但该内容不可字段级红框追踪；标准结构中标记 `traceable=false` |
| 页图 URL 过期 | 不影响 OCR 文本，但前端红框底图不可用；需要后端持久化页图 |
| 坐标空间无法判断 | 保存原始坐标，`coord_space=unknown`，前端不强制画框 |

## 验收清单

- [ ] TextIn adapter 能接收本地文件路径并返回原始响应。
- [ ] OCR worker 能把 `ocr_status` 从 `queued` 改为 `running`。
- [ ] TextIn 成功时 `documents.ocr_status = completed`。
- [ ] TextIn 失败时 `documents.ocr_status = failed`。
- [ ] `documents.ocr_text` 有 markdown 或拼接文本。
- [ ] `documents.ocr_payload_json.provider = textin`。
- [ ] `ocr_payload_json.raw_response` 或 `raw_response_ref` 可追溯原始 TextIn 返回。
- [ ] `ocr_payload_json.pages[]` 保存页码、宽高、角度、页图信息。
- [ ] `ocr_payload_json.blocks[]` 保存段落/表格/图片块和坐标。
- [ ] `ocr_payload_json.lines[]` 保存 raw OCR 行文本和坐标。
- [ ] `ocr_payload_json.tables[]` 保存表格和 cell 坐标。
- [ ] 字段抽取时能从 OCR payload 找到 line/block/cell 来源。
- [ ] `field_value_evidence.bbox_json` 包含 `polygon/coord_space/page_width/page_height/source_id`，不包含派生 `bbox`。
- [ ] 前端点击字段来源能打开对应文档。
- [ ] 前端能根据 `page_no` 定位页。
- [ ] 前端能根据 `bbox_json.polygon` 画红框。
- [ ] 字段来源弹窗能显示 `quote_text`。
- [ ] TextIn 临时图片 URL 过期不影响已保存 OCR 文本。
