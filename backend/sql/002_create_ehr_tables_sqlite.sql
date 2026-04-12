-- ============================================================
-- 患者电子病历夹 / Schema 驱动表单引擎 — SQLite 建表脚本
-- 基于已有的 patients / documents 表，新增 8 张表 + 补字段
-- ============================================================

-- --------------------------------------------------------
-- 0. 给已有 documents 表补加缺少的字段
-- --------------------------------------------------------
ALTER TABLE documents ADD COLUMN ocr_payload TEXT NULL;  -- JSON string, OCR 完整结构化结果

-- --------------------------------------------------------
-- 1. schemas — JSON Schema 模板表
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS schemas (
  id           TEXT PRIMARY KEY,                          -- UUID
  name         TEXT NOT NULL,                             -- 模板名称，如 "肿瘤患者标准病历夹"
  code         TEXT NOT NULL,                             -- 模板编码，如 "onco_ehr_v1"
  schema_type  TEXT NOT NULL DEFAULT 'ehr',               -- ehr / crf / custom
  version      INTEGER NOT NULL DEFAULT 1,
  content_json TEXT NOT NULL DEFAULT '{}',                -- 完整 JSON Schema 定义
  is_active    INTEGER NOT NULL DEFAULT 1,                -- 0/1 boolean
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  UNIQUE (code, version)
);

-- --------------------------------------------------------
-- 2. schema_instances — 患者的一份实际表单实例
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_instances (
  id             TEXT PRIMARY KEY,
  schema_id      TEXT NOT NULL REFERENCES schemas(id),
  patient_id     TEXT NOT NULL REFERENCES patients(id),
  instance_type  TEXT NOT NULL DEFAULT 'patient_ehr',     -- patient_ehr / crf
  name           TEXT,                                    -- 实例名称
  status         TEXT NOT NULL DEFAULT 'draft',           -- draft / in_progress / completed / locked
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_si_patient  ON schema_instances(patient_id);
CREATE INDEX IF NOT EXISTS idx_si_schema   ON schema_instances(schema_id);
CREATE INDEX IF NOT EXISTS idx_si_type     ON schema_instances(instance_type);

-- --------------------------------------------------------
-- 3. instance_documents — 表单实例与文档关联
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS instance_documents (
  id             TEXT PRIMARY KEY,
  instance_id    TEXT NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relation_type  TEXT NOT NULL DEFAULT 'source',          -- source / attachment / reference
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  UNIQUE (instance_id, document_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_idoc_instance ON instance_documents(instance_id);
CREATE INDEX IF NOT EXISTS idx_idoc_document ON instance_documents(document_id);

-- --------------------------------------------------------
-- 4. section_instances — 表单块实例（块级重复）
--    检查_1, 检查_2, 检查_3
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS section_instances (
  id                TEXT PRIMARY KEY,
  instance_id       TEXT NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  section_path      TEXT NOT NULL,                        -- 如 "/检查"
  parent_section_id TEXT REFERENCES section_instances(id) ON DELETE CASCADE,
  repeat_index      INTEGER NOT NULL DEFAULT 0,
  anchor_key        TEXT,                                 -- JSON: {"检查日期":"2024-03-01","检查类型":"CT"}
  anchor_display    TEXT,                                 -- 显示文本
  is_repeatable     INTEGER NOT NULL DEFAULT 0,           -- 0/1
  created_by        TEXT,                                 -- user / ai / system
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sec_instance ON section_instances(instance_id);
CREATE INDEX IF NOT EXISTS idx_sec_path     ON section_instances(instance_id, section_path);
CREATE INDEX IF NOT EXISTS idx_sec_parent   ON section_instances(parent_section_id);

-- 同实例同 path 下 repeat_index 唯一（顶层 section）
CREATE UNIQUE INDEX IF NOT EXISTS uq_sec_repeat_top
  ON section_instances(instance_id, section_path, repeat_index)
  WHERE parent_section_id IS NULL;

-- 嵌套 section
CREATE UNIQUE INDEX IF NOT EXISTS uq_sec_repeat_nested
  ON section_instances(instance_id, section_path, parent_section_id, repeat_index)
  WHERE parent_section_id IS NOT NULL;

-- --------------------------------------------------------
-- 5. row_instances — section 内部表格行（行级重复）
--    手术史第1行, 第2行, 第3行
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS row_instances (
  id                  TEXT PRIMARY KEY,
  instance_id         TEXT NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  section_instance_id TEXT NOT NULL REFERENCES section_instances(id) ON DELETE CASCADE,
  group_path          TEXT NOT NULL,                      -- 如 "/检查/检查结果表"
  parent_row_id       TEXT REFERENCES row_instances(id) ON DELETE CASCADE,
  repeat_index        INTEGER NOT NULL DEFAULT 0,
  anchor_key          TEXT,                               -- JSON
  anchor_display      TEXT,
  is_repeatable       INTEGER NOT NULL DEFAULT 1,         -- 0/1
  created_by          TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_row_section   ON row_instances(section_instance_id);
CREATE INDEX IF NOT EXISTS idx_row_instance  ON row_instances(instance_id);
CREATE INDEX IF NOT EXISTS idx_row_group     ON row_instances(section_instance_id, group_path);
CREATE INDEX IF NOT EXISTS idx_row_parent    ON row_instances(parent_row_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_row_repeat_top
  ON row_instances(section_instance_id, group_path, repeat_index)
  WHERE parent_row_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_row_repeat_nested
  ON row_instances(section_instance_id, group_path, parent_row_id, repeat_index)
  WHERE parent_row_id IS NOT NULL;

-- --------------------------------------------------------
-- 6. extraction_runs — 抽取任务表
--    （先建，因为 field_value_candidates 要引用它）
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS extraction_runs (
  id              TEXT PRIMARY KEY,
  instance_id     TEXT NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  document_id     TEXT REFERENCES documents(id) ON DELETE SET NULL,
  target_mode     TEXT NOT NULL DEFAULT 'full_instance',  -- full_instance / target_section / target_field
  target_path     TEXT,                                   -- 靶向路径
  status          TEXT NOT NULL DEFAULT 'pending',        -- pending / running / succeeded / failed
  model_name      TEXT,
  prompt_version  TEXT,
  started_at      TEXT,
  finished_at     TEXT,
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_er_instance ON extraction_runs(instance_id);
CREATE INDEX IF NOT EXISTS idx_er_document ON extraction_runs(document_id);
CREATE INDEX IF NOT EXISTS idx_er_status   ON extraction_runs(status);

-- --------------------------------------------------------
-- 7. field_value_candidates — 字段历史候选值（核心表）
--    每次抽取/输入追加一条，永不覆盖
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS field_value_candidates (
  id                  TEXT PRIMARY KEY,
  instance_id         TEXT NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  section_instance_id TEXT REFERENCES section_instances(id) ON DELETE CASCADE,
  row_instance_id     TEXT REFERENCES row_instances(id) ON DELETE CASCADE,
  field_path          TEXT NOT NULL,                       -- 如 "/基本信息/人口学情况/患者姓名"

  -- 值
  value_json          TEXT NOT NULL,                       -- JSON: 候选值
  value_type          TEXT,                                -- string / number / date / boolean / array / object
  normalized_value_text TEXT,                              -- 归一化文本

  -- 溯源
  source_document_id  TEXT REFERENCES documents(id) ON DELETE SET NULL,
  source_page         INTEGER,
  source_block_id     TEXT,
  source_bbox_json    TEXT,                                -- JSON: {"x":..,"y":..,"w":..,"h":..}
  source_text         TEXT,                                -- 原始证据文本

  -- 抽取
  extraction_run_id   TEXT REFERENCES extraction_runs(id) ON DELETE SET NULL,
  confidence          REAL,                                -- 0.0 ~ 1.0

  created_by          TEXT NOT NULL DEFAULT 'ai',          -- ai / user / system
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_fvc_instance       ON field_value_candidates(instance_id);
CREATE INDEX IF NOT EXISTS idx_fvc_section        ON field_value_candidates(section_instance_id);
CREATE INDEX IF NOT EXISTS idx_fvc_row            ON field_value_candidates(row_instance_id);
CREATE INDEX IF NOT EXISTS idx_fvc_field          ON field_value_candidates(instance_id, field_path);
CREATE INDEX IF NOT EXISTS idx_fvc_sec_field      ON field_value_candidates(section_instance_id, field_path);
CREATE INDEX IF NOT EXISTS idx_fvc_row_field      ON field_value_candidates(row_instance_id, field_path);
CREATE INDEX IF NOT EXISTS idx_fvc_run            ON field_value_candidates(extraction_run_id);
CREATE INDEX IF NOT EXISTS idx_fvc_source_doc     ON field_value_candidates(source_document_id);

-- --------------------------------------------------------
-- 8. field_value_selected — 当前选中的字段值
--    每个字段位置唯一一条
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS field_value_selected (
  id                     TEXT PRIMARY KEY,
  instance_id            TEXT NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  section_instance_id    TEXT REFERENCES section_instances(id) ON DELETE CASCADE,
  row_instance_id        TEXT REFERENCES row_instances(id) ON DELETE CASCADE,
  field_path             TEXT NOT NULL,

  selected_candidate_id  TEXT REFERENCES field_value_candidates(id) ON DELETE SET NULL,
  selected_value_json    TEXT NOT NULL,                    -- JSON: 当前最终值
  selected_by            TEXT NOT NULL DEFAULT 'ai',      -- ai / user
  selected_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 唯一约束：同一字段位置只有一条 selected
-- SQLite 用 COALESCE 处理 NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_fvs_position
  ON field_value_selected(
    instance_id,
    COALESCE(section_instance_id, '__null__'),
    COALESCE(row_instance_id,     '__null__'),
    field_path
  );

CREATE INDEX IF NOT EXISTS idx_fvs_instance   ON field_value_selected(instance_id);
CREATE INDEX IF NOT EXISTS idx_fvs_section    ON field_value_selected(section_instance_id);
CREATE INDEX IF NOT EXISTS idx_fvs_row        ON field_value_selected(row_instance_id);
CREATE INDEX IF NOT EXISTS idx_fvs_field      ON field_value_selected(instance_id, field_path);
CREATE INDEX IF NOT EXISTS idx_fvs_candidate  ON field_value_selected(selected_candidate_id);
