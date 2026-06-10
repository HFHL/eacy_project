# EACY Schema Output Contract

The final JSON object must match this shape:

```json
{
  "fields": [
    {
      "field_key": "字段名",
      "field_path": "完整点号路径",
      "field_title": "展示名",
      "record_form_key": "表单路径",
      "value_type": "text|number|date|datetime|json",
      "value_text": "文本值",
      "confidence": 0.9,
      "quote_text": "OCR原文片段",
      "evidences": [
        {
          "source_type": "line|block|table_cell",
          "source_id": "p1-l1",
          "quote_text": "OCR原文片段",
          "page_no": 1
        }
      ]
    }
  ],
  "missing_fields": [],
  "uncertain_fields": [],
  "conflict_fields": [],
  "validation_errors": []
}
```

Tool-assisted workflow:
- Headless extraction has limited turns. Do not call tools once per field.
- If MCP tools are available, read `input/field_specs.json` and `input/reading_units.json` directly first. Use `mcp__eacy_extraction__get_field_spec` or `mcp__eacy_extraction__search_ocr` only for genuinely ambiguous cases.
- Before finalizing, call `mcp__eacy_extraction__validate_candidate_fields` at most once on the candidate JSON and repair obvious returned errors.
- Save the final result with `mcp__eacy_extraction__save_result_json` only when there is enough turn budget. A valid final JSON response is also acceptable.
- These tools are scoped to the current workspace only. Do not request other patient data or external resources.

Value slot rules:
- `text` uses `value_text`.
- `number` uses `value_number`.
- `date` uses `value_date` as `YYYY-MM-DD`.
- `datetime` uses `value_datetime` as ISO datetime.
- `json` uses `value_json`.
- Use exactly one value slot per field.
- There is no `value_boolean` slot in EACY. Boolean, array, object, table-row, matrix, and complex component values use `value_json` with `value_type: "json"` unless `input/field_specs.json` explicitly says another `value_type`.

CRF/FormDesigner component output rules:
- The authoritative field list is `input/field_specs.json`; `input/schema.json` contains component metadata such as `x-display`, `type`, `format`, `enum`, `items.enum`, `allOf`, `x-row-constraint`, and `x-table-config`.
- Always prefer the `value_type` from `field_specs`. If schema/component metadata clearly shows a complex JSON value but `field_specs` is missing detail, use the mapping below.
- `text`: output `value_type: "text"` and `value_text` as a string.
- `textarea`: output `value_type: "text"` and `value_text` as a string; preserve clinically relevant line breaks only when they are meaningful, otherwise use concise text.
- `number`: output `value_type: "number"` and `value_number` as a JSON number, not a string. Remove units from the value and put the unit in `unit` only if the field/schema provides one.
- `slider`: output `value_type: "number"` and `value_number` if the schema represents it as a numeric score.
- `date`: output `value_type: "date"` and `value_date` in `YYYY-MM-DD`. If OCR only gives month or year, do not invent a day; mark the field uncertain/missing unless the field prompt explicitly allows approximation.
- `datetime`: output `value_type: "datetime"` and `value_datetime` as ISO datetime, for example `2026-05-31T14:30:00`.
- `radio` and `select`: output a single option with `value_type: "text"` and `value_text`; the value must exactly match one option from `options`, `enum`, or `$defs`.
- `checkbox` with options and `multiselect`: output multiple selections with `value_type: "json"` and `value_json` as an array of option strings, for example `["腹痛", "黄疸"]`. Every item must exactly match an allowed option.
- `checkbox` without options / boolean schema: output `value_type: "json"` and `value_json` as `true` or `false`. Only output it when OCR evidence supports the boolean; otherwise mark it uncertain/missing.
- `file`: output `value_type: "text"` and `value_text` only for explicit file identifiers/names/URLs found in OCR. Do not invent upload paths.
- `cascader`: if the schema stores one final selected label, use `value_text`; if it stores a path or object, use `value_json` as an ordered array or object following the schema. Do not collapse hierarchy if the schema needs the path.
- `multi_text`: use `value_json` as an array/object matching configured blanks when the schema exposes it as a complex value.
- `matrix_radio`: use `value_json` as an object mapping each row/question to one selected option, or output individual leaf fields if `field_specs` lists the matrix cells separately.
- `matrix_checkbox`: use `value_json` as an object mapping each row/question to an array of selected options, or output individual leaf fields if `field_specs` lists the matrix cells separately.
- `paragraph` and `divider` are display-only components. Do not output them unless they appear as explicit extractable fields in `field_specs`.
- `randomization` is not normally OCR-derived. Output only when the randomization group is explicitly present in OCR and the field is listed in `field_specs`.

Table rules:
- `x-display: "table"` is a container unless `field_specs` lists the table path itself as a leaf with `value_type: "json"`.
- For normal table children, output one `fields[]` item per table cell/leaf field, not one JSON blob for the visual table.
- For repeated/multi-row tables, `field_path` still must exactly match one allowed path from `input/field_specs.json`.
- Do not insert row indexes into `field_path` unless that exact indexed path already appears in `input/field_specs.json`.
- If the same leaf field appears in multiple rows, output multiple `fields[]` items with the same canonical `field_path` and add `repeat_index` as a 0-based row number, for example `{"field_path":"治疗记录.化疗.方案名称","repeat_index":0,...}` and `{"field_path":"治疗记录.化疗.方案名称","repeat_index":1,...}`.
- The same row must use the same `repeat_index` across sibling fields. For single-row tables, omit `repeat_index` unless it is needed to distinguish repeated rows.
- If a whole table is represented as a JSON leaf in `field_specs`, output `value_type: "json"` and `value_json` as an array of row objects for multi-row tables, or an object/one-element array for single-row tables according to the schema.
- Keep row evidence coherent: cells from the same row should cite the same line/block/table evidence when appropriate, but each field still needs its own `evidences`.

Schema rules:
- Every `field_path` must come from `input/field_specs.json`.
- `field_path` is not a place for instance numbers; use `repeat_index` for repeated rows/records.
- Enum/options fields must use one of the listed options.
- Multi-select enum fields must use a JSON array where every item is one of the listed options.
- Do not output fields that are absent from OCR.
- Do not output null, empty string, or placeholder values in `fields`.
