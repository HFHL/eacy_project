CREATE TABLE ehr_schema (
  id TEXT PRIMARY KEY,
  schema_id TEXT NOT NULL UNIQUE,     -- 比如 "patient_ehr-V1"
  version TEXT NOT NULL,              -- 比如 "1.0.0"
  description TEXT,
  schema_json JSON NOT NULL,          -- 完整的 JSON Schema 内容
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 运行时 EHR/CRF 模板（后端 ehrData、抽取任务等依赖此表；可与 ehr_schema 并存）
CREATE TABLE schemas (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  code         TEXT NOT NULL,
  schema_type  TEXT NOT NULL DEFAULT 'ehr',
  version      INTEGER NOT NULL DEFAULT 1,
  content_json TEXT NOT NULL DEFAULT '{}',
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (code, version)
);
CREATE INDEX idx_schemas_code ON schemas(code);

CREATE TABLE patients (
    id TEXT PRIMARY KEY,
    name TEXT,
    pinyin TEXT NOT NULL DEFAULT '',
    identifier TEXT UNIQUE,
    date_of_birth TEXT NOT NULL DEFAULT '',
    gender TEXT,                          
    contact_number TEXT,
    address TEXT,
    emergency_contact_name TEXT,
    emergency_contact_relation TEXT,
    emergency_contact_phone TEXT,
    tags TEXT,                            
    avatar_url TEXT,                      
    status TEXT DEFAULT 'active',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_patients_identifier ON patients(identifier);
CREATE INDEX idx_patients_name ON patients(name);
CREATE INDEX idx_patients_pinyin ON patients(pinyin);
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT,
    document_type TEXT,                   
    document_sub_type TEXT,               
    oss_path TEXT DEFAULT '',
    oss_bucket TEXT DEFAULT '',
    status TEXT DEFAULT 'uploaded',

    mime_type TEXT,
    object_key TEXT,
    batch_id TEXT,
    doc_type TEXT,
    doc_title TEXT,
    effective_at TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    raw_text TEXT,
    error_message TEXT,
    meta_status TEXT DEFAULT 'pending',
    meta_error_message TEXT,
    meta_started_at TEXT,
    meta_completed_at TEXT,
    materialize_status TEXT DEFAULT 'pending',
    ocr_payload TEXT,
    
    ocr_status TEXT DEFAULT 'pending',
    ocr_task_id TEXT,                     
    ocr_result_json JSON,                 
    ocr_started_at DATETIME,
    ocr_completed_at DATETIME,
    ocr_error_message TEXT,
    
    extract_status TEXT DEFAULT 'pending',
    extract_task_id TEXT,
    extract_result_json JSON,
    extract_started_at DATETIME,
    extract_completed_at DATETIME,
    extract_error_message TEXT,
    
    uploaded_by TEXT,                     
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    process_started_at DATETIME,
    process_completed_at DATETIME,

    -- 与后端 API（documents 路由）一致的时间戳列
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    
    FOREIGN KEY(patient_id) REFERENCES patients(id)
);
CREATE INDEX idx_documents_patient_id ON documents(patient_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE TABLE test_table (
            id INTEGER PRIMARY KEY,
            name TEXT
        );
CREATE TABLE IF NOT EXISTS "alembic_version" (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);
-- 科研项目主表：CRF 模板 = 运行时 schemas 表中的一条模板（content_json 为表单定义）
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    description TEXT,
    principal_investigator_name TEXT,
    schema_id TEXT NOT NULL REFERENCES schemas(id),
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_projects_schema_id ON projects(schema_id);
CREATE INDEX idx_projects_status ON projects(status);

-- 受试者入组：多对多（患者可参与多个项目，项目内患者唯一）
CREATE TABLE project_patients (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    enrolled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    subject_label TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    UNIQUE (project_id, patient_id)
);
CREATE INDEX idx_project_patients_project ON project_patients(project_id);
CREATE INDEX idx_project_patients_patient ON project_patients(patient_id);

CREATE TABLE project_documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, extracting, completed, failed
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(document_id) REFERENCES documents(id)
);
CREATE INDEX idx_project_docs_project_id ON project_documents(project_id);
CREATE TABLE project_extractions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    field_path TEXT NOT NULL,
    value_json TEXT, -- array / string / object JSON
    confidence REAL,
    source_location TEXT, -- bbox json
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, document_id, field_path),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(document_id) REFERENCES documents(id)
);
CREATE TABLE document_archive_batches (
    id TEXT PRIMARY KEY,
    operator TEXT NOT NULL, -- 操作者名字
    patient_id TEXT,         -- 归档到的患者ID（如果为空则代表创建新患者但未提交）
    status TEXT NOT NULL DEFAULT 'draft', -- draft, committed, aborted
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE archive_batch_items (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    auto_matched_patient_id TEXT,      -- 后端AI匹配的患者ID
    confidence REAL,                   -- 匹配置信度 0~1
    selected_action TEXT NOT NULL DEFAULT 'auto', -- 'auto'|'manual_select'|'create_new'
    manual_patient_id TEXT,            -- 当selected_action='manual_select'时人工指定的ID
    new_patient_pinyin TEXT,           -- 当selected_action='create_new'时预存的拼音
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(batch_id) REFERENCES document_archive_batches(id) ON DELETE CASCADE,
    FOREIGN KEY(document_id) REFERENCES documents(id)
);
CREATE INDEX idx_archive_batch_items_batch ON archive_batch_items(batch_id);
CREATE TABLE schema_instances (
  id             TEXT PRIMARY KEY,
  patient_id     TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  schema_id      TEXT NOT NULL REFERENCES schemas(id) ON DELETE CASCADE,
  name           TEXT,
  instance_type  TEXT NOT NULL DEFAULT 'patient_ehr',
  status         TEXT NOT NULL DEFAULT 'draft',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_si_patient  ON schema_instances(patient_id);
CREATE INDEX idx_si_schema   ON schema_instances(schema_id);
CREATE INDEX idx_si_type     ON schema_instances(instance_type);
CREATE TABLE instance_documents (
  id             TEXT PRIMARY KEY,
  instance_id    TEXT NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relation_type  TEXT NOT NULL DEFAULT 'source',          -- source / attachment / reference
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  UNIQUE (instance_id, document_id, relation_type)
);
CREATE INDEX idx_idoc_instance ON instance_documents(instance_id);
CREATE INDEX idx_idoc_document ON instance_documents(document_id);
CREATE TABLE section_instances (
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
CREATE INDEX idx_sec_instance ON section_instances(instance_id);
CREATE INDEX idx_sec_path     ON section_instances(instance_id, section_path);
CREATE INDEX idx_sec_parent   ON section_instances(parent_section_id);
CREATE UNIQUE INDEX uq_sec_repeat_top
  ON section_instances(instance_id, section_path, repeat_index)
  WHERE parent_section_id IS NULL;
CREATE UNIQUE INDEX uq_sec_repeat_nested
  ON section_instances(instance_id, section_path, parent_section_id, repeat_index)
  WHERE parent_section_id IS NOT NULL;
CREATE TABLE row_instances (
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
CREATE INDEX idx_row_section   ON row_instances(section_instance_id);
CREATE INDEX idx_row_instance  ON row_instances(instance_id);
CREATE INDEX idx_row_group     ON row_instances(section_instance_id, group_path);
CREATE INDEX idx_row_parent    ON row_instances(parent_row_id);
CREATE UNIQUE INDEX uq_row_repeat_top
  ON row_instances(section_instance_id, group_path, repeat_index)
  WHERE parent_row_id IS NULL;
CREATE UNIQUE INDEX uq_row_repeat_nested
  ON row_instances(section_instance_id, group_path, parent_row_id, repeat_index)
  WHERE parent_row_id IS NOT NULL;
CREATE TABLE extraction_runs (
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
CREATE INDEX idx_er_instance ON extraction_runs(instance_id);
CREATE INDEX idx_er_document ON extraction_runs(document_id);
CREATE INDEX idx_er_status   ON extraction_runs(status);
CREATE TABLE field_value_candidates (
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
CREATE INDEX idx_fvc_instance       ON field_value_candidates(instance_id);
CREATE INDEX idx_fvc_section        ON field_value_candidates(section_instance_id);
CREATE INDEX idx_fvc_row            ON field_value_candidates(row_instance_id);
CREATE INDEX idx_fvc_field          ON field_value_candidates(instance_id, field_path);
CREATE INDEX idx_fvc_sec_field      ON field_value_candidates(section_instance_id, field_path);
CREATE INDEX idx_fvc_row_field      ON field_value_candidates(row_instance_id, field_path);
CREATE INDEX idx_fvc_run            ON field_value_candidates(extraction_run_id);
CREATE INDEX idx_fvc_source_doc     ON field_value_candidates(source_document_id);
CREATE TABLE field_value_selected (
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
CREATE UNIQUE INDEX uq_fvs_position
  ON field_value_selected(
    instance_id,
    COALESCE(section_instance_id, '__null__'),
    COALESCE(row_instance_id,     '__null__'),
    field_path
  );
CREATE INDEX idx_fvs_instance   ON field_value_selected(instance_id);
CREATE INDEX idx_fvs_section    ON field_value_selected(section_instance_id);
CREATE INDEX idx_fvs_row        ON field_value_selected(row_instance_id);
CREATE INDEX idx_fvs_field      ON field_value_selected(instance_id, field_path);
CREATE INDEX idx_fvs_candidate  ON field_value_selected(selected_candidate_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- EHR 抽取任务队列
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ehr_extraction_jobs (
  id                       TEXT PRIMARY KEY,
  document_id              TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  patient_id               TEXT REFERENCES patients(id) ON DELETE SET NULL,
  schema_id                TEXT NOT NULL,
  job_type                 TEXT NOT NULL DEFAULT 'extract',   -- 'extract' | 'materialize'
  status                   TEXT NOT NULL DEFAULT 'pending',   -- pending | running | completed | failed
  attempt_count            INTEGER NOT NULL DEFAULT 0,
  max_attempts             INTEGER NOT NULL DEFAULT 3,
  next_retry_at            TEXT,
  started_at               TEXT,
  completed_at             TEXT,
  last_error               TEXT,
  result_extraction_run_id TEXT,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_ehr_jobs_status   ON ehr_extraction_jobs(status, job_type);
CREATE INDEX idx_ehr_jobs_document ON ehr_extraction_jobs(document_id);
CREATE INDEX idx_ehr_jobs_patient  ON ehr_extraction_jobs(patient_id);
CREATE INDEX idx_ehr_jobs_retry    ON ehr_extraction_jobs(status, next_retry_at);

-- 部分唯一索引：防止同一文档+schema+类型的重复活跃任务
CREATE UNIQUE INDEX uq_ehr_jobs_active
  ON ehr_extraction_jobs(document_id, schema_id, job_type)
  WHERE status IN ('pending', 'running');
