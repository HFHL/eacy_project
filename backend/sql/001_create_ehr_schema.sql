-- ============================================================
-- 患者电子病历夹 / Schema 驱动表单引擎 — PostgreSQL 建表脚本
-- Version: 1.0
-- Created: 2026-04-11
-- ============================================================

-- ============================================================
-- 0. 扩展 & 枚举类型
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- 文档处理状态
CREATE TYPE doc_status AS ENUM (
  'pending',        -- 刚上传
  'ocr_running',    -- OCR 处理中
  'ocr_done',       -- OCR 完成
  'extracting',     -- 元数据抽取中
  'ready',          -- 就绪
  'failed'          -- 失败
);

-- 表单实例状态
CREATE TYPE instance_status AS ENUM (
  'draft',          -- 草稿
  'in_progress',    -- 填写中
  'completed',      -- 完成
  'locked'          -- 锁定
);

-- 抽取任务模式
CREATE TYPE extraction_target_mode AS ENUM (
  'full_instance',  -- 全量抽取
  'target_section', -- 靶向 section
  'target_field'    -- 靶向字段
);

-- 抽取任务状态
CREATE TYPE extraction_status AS ENUM (
  'pending',
  'running',
  'succeeded',
  'failed'
);

-- 实例-文档关联类型
CREATE TYPE doc_relation_type AS ENUM (
  'source',         -- 来源文档（用于抽取）
  'attachment',     -- 附件
  'reference'       -- 参考文档
);


-- ============================================================
-- 1. patients — 患者主表（最小化，复杂数据走表单实例）
-- ============================================================

CREATE TABLE patients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE patients IS '患者主表，只存最基础身份信息，复杂病历内容通过 schema_instances 管理';


-- ============================================================
-- 2. schemas — JSON Schema 模板表
-- ============================================================

CREATE TABLE schemas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,                            -- 模板名称，如 "肿瘤患者标准病历夹"
  code         TEXT NOT NULL,                            -- 模板编码，如 "onco_ehr_v1"
  schema_type  TEXT NOT NULL DEFAULT 'ehr',              -- 类型：ehr / crf / custom（预留扩展）
  version      INT  NOT NULL DEFAULT 1,                  -- 版本号
  content_json JSONB NOT NULL DEFAULT '{}',              -- 完整 JSON Schema 定义
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_schemas_code_version UNIQUE (code, version)
);

COMMENT ON TABLE schemas IS '存 JSON Schema 模板，前端目录树和表单结构都由此驱动';


-- ============================================================
-- 3. schema_instances — 患者的一份实际表单实例
-- ============================================================

CREATE TABLE schema_instances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id      UUID NOT NULL REFERENCES schemas(id),
  patient_id     UUID NOT NULL REFERENCES patients(id),
  instance_type  TEXT NOT NULL DEFAULT 'patient_ehr',    -- patient_ehr / crf（预留扩展）
  name           TEXT,                                   -- 实例名称，如 "张三的电子病历夹"
  status         instance_status NOT NULL DEFAULT 'draft',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE schema_instances IS '一个患者的一份具体表单实例，连接 schema 模板与患者';

CREATE INDEX idx_schema_instances_patient  ON schema_instances(patient_id);
CREATE INDEX idx_schema_instances_schema   ON schema_instances(schema_id);
CREATE INDEX idx_schema_instances_type     ON schema_instances(instance_type);


-- ============================================================
-- 4. documents — 文档表（独立实体，可先不关联患者）
-- ============================================================

CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID REFERENCES patients(id),            -- 可空，归档后才关联
  batch_id      UUID,                                    -- 批次 ID（同一次上传的分组）
  file_name     TEXT NOT NULL,
  file_size     BIGINT,
  mime_type     TEXT,
  object_key    TEXT,                                    -- OSS / S3 存储路径
  status        doc_status NOT NULL DEFAULT 'pending',
  doc_type      TEXT,                                    -- 文档类型：入院记录 / 出院小结 / 检查报告…
  doc_title     TEXT,                                    -- 文档标题（OCR / AI 抽取得到）
  effective_at  TIMESTAMPTZ,                             -- 文档生效日期
  metadata      JSONB NOT NULL DEFAULT '{}',             -- 其他元数据
  raw_text      TEXT,                                    -- OCR 纯文本结果
  ocr_payload   JSONB,                                   -- OCR 完整结构化结果（含 block、坐标等）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE documents IS '文档独立实体，先 OCR 再元数据抽取，再用于填表';

CREATE INDEX idx_documents_patient   ON documents(patient_id);
CREATE INDEX idx_documents_batch     ON documents(batch_id);
CREATE INDEX idx_documents_status    ON documents(status);
CREATE INDEX idx_documents_doc_type  ON documents(doc_type);


-- ============================================================
-- 5. instance_documents — 表单实例与文档的关联表
-- ============================================================

CREATE TABLE instance_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id    UUID NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  document_id    UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relation_type  doc_relation_type NOT NULL DEFAULT 'source',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_instance_doc UNIQUE (instance_id, document_id, relation_type)
);

COMMENT ON TABLE instance_documents IS '表单实例关联了哪些文档，一个文档可被多个实例引用';

CREATE INDEX idx_instance_documents_instance ON instance_documents(instance_id);
CREATE INDEX idx_instance_documents_document ON instance_documents(document_id);


-- ============================================================
-- 6. section_instances — 表单块实例（支持块级重复）
--    表示 检查_1、检查_2、检查_3 等重复 section
-- ============================================================

CREATE TABLE section_instances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id       UUID NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  section_path      TEXT NOT NULL,                       -- schema 中的路径，如 "/检查"
  parent_section_id UUID REFERENCES section_instances(id) ON DELETE CASCADE,  -- 嵌套时指向父 section
  repeat_index      INT  NOT NULL DEFAULT 0,             -- 同一 section_path 下的序号
  anchor_key        JSONB,                               -- 锚点值，如 {"检查日期":"2024-03-01","检查类型":"CT"}
  anchor_display    TEXT,                                 -- 锚点显示文本，如 "2024-03-01 CT"
  is_repeatable     BOOLEAN NOT NULL DEFAULT FALSE,      -- 该 section 是否支持重复
  created_by        TEXT,                                 -- 创建者：user / ai / system
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE section_instances IS '表单块实例，支持 section 级重复（如 检查_1/检查_2/检查_3）';

CREATE INDEX idx_section_instances_instance ON section_instances(instance_id);
CREATE INDEX idx_section_instances_path     ON section_instances(instance_id, section_path);
CREATE INDEX idx_section_instances_parent   ON section_instances(parent_section_id);
-- 同一实例下同一 section_path 的 repeat_index 唯一
CREATE UNIQUE INDEX uq_section_instance_repeat
  ON section_instances(instance_id, section_path, repeat_index)
  WHERE parent_section_id IS NULL;
CREATE UNIQUE INDEX uq_section_instance_repeat_nested
  ON section_instances(instance_id, section_path, parent_section_id, repeat_index)
  WHERE parent_section_id IS NOT NULL;


-- ============================================================
-- 7. row_instances — section 内部的表格行实例（行级重复）
--    表示 手术史第1行、第2行、第3行
-- ============================================================

CREATE TABLE row_instances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id         UUID NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  section_instance_id UUID NOT NULL REFERENCES section_instances(id) ON DELETE CASCADE,
  group_path          TEXT NOT NULL,                     -- 表格组路径，如 "/检查/检查结果表"
  parent_row_id       UUID REFERENCES row_instances(id) ON DELETE CASCADE,  -- 嵌套表格
  repeat_index        INT  NOT NULL DEFAULT 0,
  anchor_key          JSONB,                             -- 行级锚点值
  anchor_display      TEXT,
  is_repeatable       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE row_instances IS 'section 内部表格/多行实例，支持行级重复和嵌套表格';

CREATE INDEX idx_row_instances_section   ON row_instances(section_instance_id);
CREATE INDEX idx_row_instances_instance  ON row_instances(instance_id);
CREATE INDEX idx_row_instances_group     ON row_instances(section_instance_id, group_path);
CREATE INDEX idx_row_instances_parent    ON row_instances(parent_row_id);
-- 同一 section_instance 下同一 group_path 的 repeat_index 唯一
CREATE UNIQUE INDEX uq_row_instance_repeat
  ON row_instances(section_instance_id, group_path, repeat_index)
  WHERE parent_row_id IS NULL;
CREATE UNIQUE INDEX uq_row_instance_repeat_nested
  ON row_instances(section_instance_id, group_path, parent_row_id, repeat_index)
  WHERE parent_row_id IS NOT NULL;


-- ============================================================
-- 8. field_value_candidates — 字段历史候选值（核心表）
--    每次 AI 抽取 / 用户输入都插入一条，永不覆盖
-- ============================================================

CREATE TABLE field_value_candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id         UUID NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  section_instance_id UUID REFERENCES section_instances(id) ON DELETE CASCADE,
  row_instance_id     UUID REFERENCES row_instances(id) ON DELETE CASCADE,
  field_path          TEXT NOT NULL,                      -- 字段路径，如 "/基本信息/人口学情况/患者姓名"

  -- 值
  value_json          JSONB NOT NULL,                     -- 候选值（任意类型）
  value_type          TEXT,                               -- string / number / date / boolean / array / object
  normalized_value_text TEXT,                             -- 归一化文本，用于比对去重

  -- 溯源信息
  source_document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  source_page         INT,
  source_block_id     TEXT,
  source_bbox_json    JSONB,                              -- {"x":..,"y":..,"w":..,"h":..}
  source_text         TEXT,                               -- 原始证据文本

  -- 抽取信息
  extraction_run_id   UUID,                               -- 关联 extraction_runs.id（下面建表后加外键）
  confidence          NUMERIC(5,4),                       -- 0.0000 ~ 1.0000

  created_by          TEXT NOT NULL DEFAULT 'ai',         -- ai / user / system
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE field_value_candidates IS '字段历史候选值，每次抽取/输入都追加，保留完整溯源链';

CREATE INDEX idx_fvc_instance          ON field_value_candidates(instance_id);
CREATE INDEX idx_fvc_section           ON field_value_candidates(section_instance_id);
CREATE INDEX idx_fvc_row               ON field_value_candidates(row_instance_id);
CREATE INDEX idx_fvc_field_path        ON field_value_candidates(instance_id, field_path);
CREATE INDEX idx_fvc_section_field     ON field_value_candidates(section_instance_id, field_path);
CREATE INDEX idx_fvc_row_field         ON field_value_candidates(row_instance_id, field_path);
CREATE INDEX idx_fvc_extraction_run    ON field_value_candidates(extraction_run_id);
CREATE INDEX idx_fvc_source_doc        ON field_value_candidates(source_document_id);


-- ============================================================
-- 9. field_value_selected — 当前选中的字段值
--    每个字段位置只保留一条"当前值"
-- ============================================================

CREATE TABLE field_value_selected (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id            UUID NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  section_instance_id    UUID REFERENCES section_instances(id) ON DELETE CASCADE,
  row_instance_id        UUID REFERENCES row_instances(id) ON DELETE CASCADE,
  field_path             TEXT NOT NULL,

  selected_candidate_id  UUID REFERENCES field_value_candidates(id) ON DELETE SET NULL,  -- 可空：用户手动改值时无对应 candidate
  selected_value_json    JSONB NOT NULL,                  -- 当前最终值
  selected_by            TEXT NOT NULL DEFAULT 'ai',      -- ai / user
  selected_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE field_value_selected IS '每个字段位置的当前选中值，用户可从候选值中选取或手工修改';

-- 唯一约束：同一字段位置只能有一条 selected 记录
-- 因为 section_instance_id 和 row_instance_id 可以为 NULL，用 COALESCE 处理
CREATE UNIQUE INDEX uq_field_value_selected_position
  ON field_value_selected(
    instance_id,
    COALESCE(section_instance_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(row_instance_id,     '00000000-0000-0000-0000-000000000000'::UUID),
    field_path
  );

CREATE INDEX idx_fvs_instance       ON field_value_selected(instance_id);
CREATE INDEX idx_fvs_section        ON field_value_selected(section_instance_id);
CREATE INDEX idx_fvs_row            ON field_value_selected(row_instance_id);
CREATE INDEX idx_fvs_field_path     ON field_value_selected(instance_id, field_path);
CREATE INDEX idx_fvs_candidate      ON field_value_selected(selected_candidate_id);


-- ============================================================
-- 10. extraction_runs — 抽取任务表
-- ============================================================

CREATE TABLE extraction_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id     UUID NOT NULL REFERENCES schema_instances(id) ON DELETE CASCADE,
  document_id     UUID REFERENCES documents(id) ON DELETE SET NULL,  -- 靶向抽取时关联的文档
  target_mode     extraction_target_mode NOT NULL DEFAULT 'full_instance',
  target_path     TEXT,                                  -- 靶向 section / field 路径
  status          extraction_status NOT NULL DEFAULT 'pending',
  model_name      TEXT,                                  -- 使用的模型，如 "gpt-4o"
  prompt_version  TEXT,                                  -- prompt 版本号
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE extraction_runs IS '每次 AI 抽取任务的记录，支持全量/靶向 section/靶向字段三种模式';

CREATE INDEX idx_extraction_runs_instance  ON extraction_runs(instance_id);
CREATE INDEX idx_extraction_runs_document  ON extraction_runs(document_id);
CREATE INDEX idx_extraction_runs_status    ON extraction_runs(status);


-- ============================================================
-- 补充外键：field_value_candidates.extraction_run_id → extraction_runs.id
-- （因 extraction_runs 在 field_value_candidates 之后建表，这里补加）
-- ============================================================

ALTER TABLE field_value_candidates
  ADD CONSTRAINT fk_fvc_extraction_run
  FOREIGN KEY (extraction_run_id) REFERENCES extraction_runs(id) ON DELETE SET NULL;


-- ============================================================
-- 通用 updated_at 自动更新触发器
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为所有含 updated_at 的表添加触发器
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'patients',
      'schemas',
      'schema_instances',
      'documents',
      'section_instances',
      'row_instances',
      'field_value_selected'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
      tbl, tbl
    );
  END LOOP;
END;
$$;
