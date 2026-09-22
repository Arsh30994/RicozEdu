SET search_path TO ricoz, public;

DROP INDEX IF EXISTS programme_enrolments_curriculum_idx;
ALTER TABLE programme_enrolments DROP COLUMN IF EXISTS curriculum_version_id;
