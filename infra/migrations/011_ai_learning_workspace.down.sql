SET search_path TO ricoz, public;

DROP TABLE IF EXISTS ai_study_artifacts;
DROP TABLE IF EXISTS ai_messages;
DROP TABLE IF EXISTS ai_conversations;
DROP TABLE IF EXISTS ai_document_chunks;
DROP TABLE IF EXISTS ai_documents;

DELETE FROM role_permissions
WHERE permission_id IN (SELECT id FROM permissions WHERE code IN ('ai.use','ai.document.manage','ai.study.use'));
DELETE FROM permissions WHERE code IN ('ai.use','ai.document.manage','ai.study.use');
