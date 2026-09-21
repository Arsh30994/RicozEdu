-- 005: Assessment & examination management
SET search_path TO ricoz, public;

-- Rubrics
CREATE TABLE rubrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  code            text NOT NULL,
  name            text NOT NULL,
  criteria_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_score       numeric(8,2) NOT NULL CHECK (max_score > 0),
  version_label   text NOT NULL DEFAULT '1',
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published','retired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT rubrics_uq UNIQUE (tenant_id, code, version_label)
);

-- Question banks
CREATE TABLE question_banks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  course_id       uuid REFERENCES courses(id),
  code            text NOT NULL,
  name            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT question_banks_uq UNIQUE (tenant_id, code)
);

CREATE TABLE question_bank_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  question_bank_id  uuid NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  item_code         text NOT NULL,
  item_type         text NOT NULL CHECK (item_type IN (
                      'mcq','short','long','numerical','practical','viva','other'
                    )),
  stem              text NOT NULL,
  options_json      jsonb NOT NULL DEFAULT '[]'::jsonb,
  marks             numeric(8,2) NOT NULL CHECK (marks > 0),
  difficulty        text CHECK (difficulty IS NULL OR difficulty IN ('easy','medium','hard')),
  learning_outcome_id uuid REFERENCES learning_outcomes(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,
  version           int NOT NULL DEFAULT 1,
  archived_at       timestamptz,
  CONSTRAINT question_bank_items_uq UNIQUE (tenant_id, question_bank_id, item_code)
);

-- Assessment definitions (assignment, quiz, project, practical, viva, etc.)
CREATE TABLE assessment_instruments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  institution_id     uuid NOT NULL REFERENCES institutions(id),
  course_version_id  uuid NOT NULL REFERENCES course_versions(id),
  section_id         uuid REFERENCES sections(id),
  code               text NOT NULL,
  title              text NOT NULL,
  instrument_type    text NOT NULL CHECK (instrument_type IN (
                       'assignment','quiz','project','practical','viva',
                       'internal','external','other'
                     )),
  max_marks          numeric(8,2) NOT NULL CHECK (max_marks > 0),
  weight_percent     numeric(5,2) NOT NULL DEFAULT 0
                     CHECK (weight_percent >= 0 AND weight_percent <= 100),
  rubric_id          uuid REFERENCES rubrics(id),
  question_bank_id   uuid REFERENCES question_banks(id),
  opens_at           timestamptz,
  closes_at          timestamptz,
  formula_version_id uuid, -- FK added after grade_formula_versions
  status             text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','published','closed','archived')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  updated_by         uuid,
  version            int NOT NULL DEFAULT 1,
  CONSTRAINT assessment_instruments_uq UNIQUE (tenant_id, course_version_id, code)
);

-- Weighted grade formulas (versioned, immutable once published)
CREATE TABLE grade_formula_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  code            text NOT NULL,
  version_label   text NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published','superseded','retired')),
  -- { "components":[{"key":"internal","weight":0.4},{"key":"external","weight":0.6}],
  --   "scale":[{"min":90,"grade":"O","points":10},...], "passMark":40 }
  formula_json    jsonb NOT NULL,
  published_at    timestamptz,
  published_by    uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT grade_formula_versions_uq UNIQUE (tenant_id, code, version_label)
);

ALTER TABLE assessment_instruments
  ADD CONSTRAINT assessment_instruments_formula_fk
  FOREIGN KEY (formula_version_id) REFERENCES grade_formula_versions(id);

CREATE OR REPLACE FUNCTION ricoz.prevent_published_formula_mutate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' THEN
    IF NEW.formula_json IS DISTINCT FROM OLD.formula_json
       OR NEW.version_label IS DISTINCT FROM OLD.version_label THEN
      RAISE EXCEPTION 'published grade_formula_version % is immutable', OLD.id;
    END IF;
    IF NEW.status NOT IN ('published','superseded','retired') THEN
      RAISE EXCEPTION 'invalid formula status transition';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_grade_formula_immutable
  BEFORE UPDATE ON grade_formula_versions
  FOR EACH ROW EXECUTE FUNCTION ricoz.prevent_published_formula_mutate();

-- Mark entries: draft ? submitted ? approved ? (used in) published calculation
-- status machine enforced in app; optimistic concurrency via version
CREATE TABLE mark_entries (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenants(id),
  assessment_instrument_id  uuid NOT NULL REFERENCES assessment_instruments(id),
  student_membership_id     uuid NOT NULL REFERENCES student_memberships(id),
  course_attempt_id         uuid REFERENCES course_attempts(id),
  raw_score                 numeric(8,2),
  max_marks                 numeric(8,2) NOT NULL,
  rubric_scores_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                    text NOT NULL DEFAULT 'draft'
                            CHECK (status IN (
                              'draft','submitted','under_review','approved',
                              'rejected','locked','voided'
                            )),
  entered_by                uuid,
  submitted_at              timestamptz,
  reviewed_by               uuid,
  reviewed_at               timestamptz,
  approved_by               uuid,
  approved_at               timestamptz,
  locked_at                 timestamptz,
  anomaly_flags             jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid,
  updated_by                uuid,
  version                   int NOT NULL DEFAULT 1,
  CONSTRAINT mark_entries_uq UNIQUE (tenant_id, assessment_instrument_id, student_membership_id),
  CONSTRAINT mark_entries_score_chk CHECK (
    raw_score IS NULL OR (raw_score >= 0 AND raw_score <= max_marks)
  )
);

CREATE TABLE mark_entry_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  mark_entry_id   uuid NOT NULL REFERENCES mark_entries(id),
  from_status     text,
  to_status       text NOT NULL,
  raw_score       numeric(8,2),
  actor_user_id   uuid,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Exam logistics
CREATE TABLE exam_sittings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  examination_cycle_id uuid NOT NULL REFERENCES examination_cycles(id),
  course_version_id   uuid NOT NULL REFERENCES course_versions(id),
  code                text NOT NULL,
  scheduled_at        timestamptz NOT NULL,
  duration_minutes    int NOT NULL CHECK (duration_minutes > 0),
  venue               text,
  status              text NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  updated_by          uuid,
  version             int NOT NULL DEFAULT 1,
  CONSTRAINT exam_sittings_uq UNIQUE (tenant_id, examination_cycle_id, code)
);

CREATE TABLE exam_eligibility (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  exam_sitting_id        uuid NOT NULL REFERENCES exam_sittings(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  eligible               boolean NOT NULL DEFAULT false,
  reasons_json           jsonb NOT NULL DEFAULT '[]'::jsonb,
  rule_version_refs      jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at           timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_eligibility_uq UNIQUE (tenant_id, exam_sitting_id, student_membership_id)
);

CREATE TABLE hall_tickets (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  exam_sitting_id        uuid NOT NULL REFERENCES exam_sittings(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  ticket_number          text NOT NULL,
  status                 text NOT NULL DEFAULT 'issued'
                         CHECK (status IN ('issued','revoked','used')),
  issued_at              timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  CONSTRAINT hall_tickets_uq UNIQUE (tenant_id, ticket_number),
  CONSTRAINT hall_tickets_student_uq UNIQUE (tenant_id, exam_sitting_id, student_membership_id)
);

CREATE TABLE seating_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  exam_sitting_id uuid NOT NULL REFERENCES exam_sittings(id),
  room_code       text NOT NULL,
  capacity        int NOT NULL CHECK (capacity > 0),
  layout_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT seating_plans_uq UNIQUE (tenant_id, exam_sitting_id, room_code)
);

CREATE TABLE seating_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  seating_plan_id        uuid NOT NULL REFERENCES seating_plans(id) ON DELETE CASCADE,
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  seat_label             text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seating_assignments_uq UNIQUE (tenant_id, seating_plan_id, seat_label),
  CONSTRAINT seating_assignments_student_uq UNIQUE (tenant_id, seating_plan_id, student_membership_id)
);

CREATE TABLE invigilation_duties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  exam_sitting_id uuid NOT NULL REFERENCES exam_sittings(id),
  seating_plan_id uuid REFERENCES seating_plans(id),
  invigilator_user_id uuid NOT NULL REFERENCES users(id),
  role            text NOT NULL DEFAULT 'invigilator'
                  CHECK (role IN ('chief','invigilator','reliever')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  CONSTRAINT invigilation_duties_uq UNIQUE (tenant_id, exam_sitting_id, invigilator_user_id)
);

-- Course result calculations (working ? approved ? published snapshot)
CREATE TABLE course_result_calculations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  course_attempt_id      uuid NOT NULL REFERENCES course_attempts(id),
  course_version_id      uuid NOT NULL REFERENCES course_versions(id),
  formula_version_id     uuid NOT NULL REFERENCES grade_formula_versions(id),
  status                 text NOT NULL DEFAULT 'draft'
                         CHECK (status IN (
                           'draft','submitted','moderated','approved','published','superseded'
                         )),
  internal_marks         numeric(8,2),
  external_marks         numeric(8,2),
  total_marks            numeric(8,2),
  letter_grade           text,
  grade_points           numeric(5,2),
  credits_earned         numeric(6,2) NOT NULL DEFAULT 0,
  passed                 boolean,
  input_snapshot_json    jsonb NOT NULL,
  calculation_detail_json jsonb NOT NULL,
  formula_version_label  text NOT NULL,
  evaluator_version      text NOT NULL,
  moderation_notes       text,
  approved_by            uuid,
  approved_at            timestamptz,
  published_result_id    uuid, -- set when published; FK optional to published_results if exists
  version                int NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid
);

-- At most one mutable calculation per attempt (draft?approved)
CREATE UNIQUE INDEX course_result_calc_one_mutable
  ON course_result_calculations (tenant_id, course_attempt_id)
  WHERE status IN ('draft','submitted','moderated','approved');

-- Immutable published course results (official) + corrections
CREATE TABLE IF NOT EXISTS published_course_results (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  course_attempt_id      uuid NOT NULL REFERENCES course_attempts(id),
  course_version_id      uuid NOT NULL REFERENCES course_versions(id),
  calculation_id         uuid NOT NULL REFERENCES course_result_calculations(id),
  formula_version_id     uuid NOT NULL REFERENCES grade_formula_versions(id),
  letter_grade           text NOT NULL,
  grade_points           numeric(5,2) NOT NULL,
  total_marks            numeric(8,2),
  credits_earned         numeric(6,2) NOT NULL,
  result_status          text NOT NULL CHECK (result_status IN ('pass','fail','incomplete','withdrawn')),
  content_hash           bytea NOT NULL,
  formula_version_label  text NOT NULL,
  evaluator_version      text NOT NULL,
  published_at           timestamptz NOT NULL DEFAULT now(),
  published_by           uuid,
  publication_batch_id   uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS published_course_results_one_per_attempt
  ON published_course_results (tenant_id, course_attempt_id);

CREATE TABLE result_correction_versions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenants(id),
  published_course_result_id uuid NOT NULL REFERENCES published_course_results(id),
  correction_seq             int NOT NULL CHECK (correction_seq >= 1),
  reason                     text NOT NULL,
  prior_payload              jsonb NOT NULL,
  new_letter_grade           text,
  new_grade_points           numeric(5,2),
  new_total_marks            numeric(8,2),
  new_credits_earned         numeric(6,2),
  new_result_status          text CHECK (new_result_status IN ('pass','fail','incomplete','withdrawn')),
  formula_version_id         uuid REFERENCES grade_formula_versions(id),
  formula_version_label      text,
  evaluator_version          text,
  content_hash               bytea NOT NULL,
  corrected_at               timestamptz NOT NULL DEFAULT now(),
  corrected_by               uuid,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT result_correction_versions_uq UNIQUE (tenant_id, published_course_result_id, correction_seq)
);

CREATE TABLE revaluation_requests (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenants(id),
  published_course_result_id uuid NOT NULL REFERENCES published_course_results(id),
  student_membership_id      uuid NOT NULL REFERENCES student_memberships(id),
  status                     text NOT NULL DEFAULT 'requested'
                             CHECK (status IN (
                               'requested','under_review','upheld','revised','rejected','cancelled'
                             )),
  original_letter_grade      text NOT NULL,
  revised_calculation_id     uuid REFERENCES course_result_calculations(id),
  correction_id              uuid REFERENCES result_correction_versions(id),
  reason                     text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  created_by                 uuid,
  updated_by                 uuid,
  version                    int NOT NULL DEFAULT 1
);

-- Prevent IDOR: student on request must own the published result
CREATE OR REPLACE FUNCTION ricoz.enforce_revaluation_student_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner uuid;
  v_tenant uuid;
BEGIN
  SELECT student_membership_id, tenant_id
    INTO v_owner, v_tenant
    FROM published_course_results
   WHERE id = NEW.published_course_result_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'revaluation_unknown_published_result';
  END IF;
  IF NEW.student_membership_id IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'revaluation_student_mismatch';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'revaluation_tenant_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_revaluation_student_match
  BEFORE INSERT OR UPDATE OF published_course_result_id, student_membership_id, tenant_id
  ON revaluation_requests
  FOR EACH ROW EXECUTE FUNCTION ricoz.enforce_revaluation_student_match();

CREATE TABLE supplementary_attempts (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenants(id),
  original_course_attempt_id uuid NOT NULL REFERENCES course_attempts(id),
  new_course_attempt_id      uuid NOT NULL REFERENCES course_attempts(id),
  exam_sitting_id            uuid REFERENCES exam_sittings(id),
  status                     text NOT NULL DEFAULT 'scheduled'
                             CHECK (status IN ('scheduled','completed','cancelled')),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  created_by                 uuid,
  CONSTRAINT supplementary_attempts_uq UNIQUE (tenant_id, new_course_attempt_id)
);

-- Outcome mapping for instruments
CREATE TABLE assessment_outcome_mappings (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenants(id),
  assessment_instrument_id  uuid NOT NULL REFERENCES assessment_instruments(id),
  learning_outcome_id       uuid NOT NULL REFERENCES learning_outcomes(id),
  weight                    numeric(5,2) DEFAULT 1 CHECK (weight > 0),
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid,
  CONSTRAINT assessment_outcome_mappings_uq UNIQUE (tenant_id, assessment_instrument_id, learning_outcome_id)
);

-- GPA / transcripts / certificates
CREATE TABLE gpa_snapshots (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  academic_term_id       uuid,
  snapshot_type          text NOT NULL CHECK (snapshot_type IN ('SGPA','CGPA')),
  value                  numeric(6,3) NOT NULL,
  credits_considered     numeric(8,2) NOT NULL,
  formula_version_id     uuid REFERENCES grade_formula_versions(id),
  formula_version_label  text NOT NULL,
  evaluator_version      text NOT NULL,
  input_snapshot_json    jsonb NOT NULL,
  publication_batch_id   uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid
);

CREATE TABLE transcripts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  programme_enrolment_id uuid,
  status                 text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','issued','revoked','superseded')),
  content_hash           bytea NOT NULL,
  document_object_id     uuid,
  issued_at              timestamptz,
  issued_by              uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE certificates (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  certificate_type       text NOT NULL CHECK (certificate_type IN (
                           'degree','diploma','certificate','provisional','other'
                         )),
  title                  text NOT NULL,
  status                 text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','issued','revoked','superseded')),
  content_hash           bytea NOT NULL,
  document_object_id     uuid,
  issued_at              timestamptz,
  issued_by              uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Async bulk result publication jobs (resumable)
CREATE TABLE result_publication_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  examination_cycle_id uuid REFERENCES examination_cycles(id),
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN (
                        'queued','running','paused','completed','failed','cancelled'
                      )),
  total_items         int NOT NULL DEFAULT 0,
  processed_items     int NOT NULL DEFAULT 0,
  success_items       int NOT NULL DEFAULT 0,
  failed_items        int NOT NULL DEFAULT 0,
  cursor_after_id     uuid,
  last_error          text,
  notify_after_commit boolean NOT NULL DEFAULT true,
  notifications_enqueued boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  completed_at        timestamptz,
  created_by          uuid,
  version             int NOT NULL DEFAULT 1
);

CREATE TABLE result_publication_job_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  job_id              uuid NOT NULL REFERENCES result_publication_jobs(id) ON DELETE CASCADE,
  calculation_id      uuid NOT NULL REFERENCES course_result_calculations(id),
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','published','failed','skipped')),
  error_code          text,
  published_result_id uuid REFERENCES published_course_results(id),
  processed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT result_publication_job_items_uq UNIQUE (tenant_id, job_id, calculation_id)
);

CREATE INDEX mark_entries_status_idx ON mark_entries (tenant_id, status, updated_at);
CREATE INDEX course_result_calc_status_idx ON course_result_calculations (tenant_id, status);
CREATE INDEX result_pub_jobs_status_idx ON result_publication_jobs (tenant_id, status, updated_at);
CREATE INDEX result_pub_items_job_idx ON result_publication_job_items (tenant_id, job_id, status);
CREATE INDEX gpa_snapshots_student_idx ON gpa_snapshots (tenant_id, student_membership_id, created_at DESC);
CREATE INDEX published_course_results_student_idx ON published_course_results (tenant_id, student_membership_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rubrics','question_banks','question_bank_items','assessment_instruments',
    'grade_formula_versions','mark_entries','mark_entry_history',
    'exam_sittings','exam_eligibility','hall_tickets','seating_plans',
    'seating_assignments','invigilation_duties','course_result_calculations',
    'published_course_results','result_correction_versions','revaluation_requests',
    'supplementary_attempts','assessment_outcome_mappings','gpa_snapshots',
    'transcripts','certificates','result_publication_jobs','result_publication_job_items'
  ]
  LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'ricoz_migrator') THEN
      EXECUTE format('ALTER TABLE %I OWNER TO ricoz_migrator', t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO ricoz_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO ricoz_app
         USING (tenant_id = ricoz.tenant_id_from_setting())
         WITH CHECK (tenant_id = ricoz.tenant_id_from_setting())', t);
  END LOOP;
END $$;

REVOKE UPDATE, DELETE ON mark_entry_history, published_course_results,
  result_correction_versions, gpa_snapshots FROM ricoz_app;
GRANT INSERT, SELECT ON mark_entry_history, published_course_results,
  result_correction_versions, gpa_snapshots TO ricoz_app;
