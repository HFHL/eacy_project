-- 清空所有上传文档（documents 及其必须先删的外键子表）
-- 不删除：patients、projects、schemas、schema_instances 等
-- 注意：OSS/本地 uploads 上的文件需自行清理，本脚本只动 SQLite

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

DELETE FROM project_extractions;
DELETE FROM project_documents;
DELETE FROM archive_batch_items;
DELETE FROM document_archive_batches;
DELETE FROM documents;

COMMIT;
