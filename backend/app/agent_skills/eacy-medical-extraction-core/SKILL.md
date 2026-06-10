# EACY Medical Extraction Core

Use this skill for structured extraction from Chinese medical OCR text.

Rules:
- Only extract facts supported by the current workspace OCR text or reading_units.
- Treat `input/field_specs.json` as the allowed field list. Never invent field_path values.
- Prefer precise values over long paragraphs. Keep original clinical wording when normalization is unsafe.
- Do not output empty strings, null values, "unknown", "not mentioned", or guessed values in `fields`.
- Put missing fields in `missing_fields`; put low-evidence fields in `uncertain_fields`.
- For each extracted field, include confidence from 0 to 1.
- For dates, output `YYYY-MM-DD`. For datetimes, output ISO datetime.
- For numbers, output numeric JSON values, not strings with units.
- For JSON/object/table fields, use `value_json`.

Recommended workflow:
1. Read `input/job_meta.json` and `input/document_meta.json`.
2. Read `input/field_specs.json` and understand field meanings, types, enum options, and prompts.
3. Read `input/reading_units.json`; use `input/ocr_text.md` only as fallback context.
4. Extract only fields with evidence.
5. Validate against the output contract before writing `output/result.json`.
