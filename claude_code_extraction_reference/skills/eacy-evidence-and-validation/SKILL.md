# EACY Evidence And Validation

Use this skill to attach reliable evidence and self-check the result.

Evidence rules:
- Prefer `input/reading_units.json` over free text because it provides source ids.
- Each evidence must include `source_type`, `source_id`, `quote_text`, and `page_no` when page is available.
- `source_id` must be copied exactly from a reading unit.
- `quote_text` must be a substring of that reading unit text or the OCR text.
- Do not paraphrase evidence.
- For table cells, preserve `source_type=table_cell` and the cell `source_id`.

Validation checklist before final answer:
- `fields` exists and is an array.
- Every field path exists in field_specs.
- Every field has confidence.
- Every non-empty value uses the correct value slot.
- Enum values are legal.
- Dates and datetimes are normalized.
- Missing, uncertain, or conflicting facts are recorded in their corresponding arrays.
- `output/result.json` contains the same JSON object as the final response.
