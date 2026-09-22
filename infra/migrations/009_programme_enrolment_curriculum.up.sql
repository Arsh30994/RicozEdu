-- 009: Pin curriculum version on programme enrolments (required for degree progress)
SET search_path TO ricoz, public;

ALTER TABLE programme_enrolments
  ADD COLUMN IF NOT EXISTS curriculum_version_id uuid
    REFERENCES curriculum_versions(id);

CREATE INDEX IF NOT EXISTS programme_enrolments_curriculum_idx
  ON programme_enrolments (tenant_id, curriculum_version_id)
  WHERE curriculum_version_id IS NOT NULL;

COMMENT ON COLUMN programme_enrolments.curriculum_version_id IS
  'Pinned curriculum at enrolment time; degree progress reads this, never live draft.';
