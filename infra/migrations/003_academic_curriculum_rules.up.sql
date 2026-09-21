-- 003: Academic curriculum versions, declarative rules, ABC ledger, progression
SET search_path TO ricoz, public;

-- ---------------------------------------------------------------------------
-- Academic calendar
-- ---------------------------------------------------------------------------
CREATE TABLE academic_years (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  code            text NOT NULL,
  name            text NOT NULL,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  status          text NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','active','closed','archived')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT academic_years_dates_chk CHECK (end_date >= start_date),
  CONSTRAINT academic_years_tenant_inst_code_uq UNIQUE (tenant_id, institution_id, code)
);

CREATE TABLE academic_terms (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  institution_id    uuid NOT NULL REFERENCES institutions(id),
  academic_year_id  uuid NOT NULL REFERENCES academic_years(id),
  code              text NOT NULL,
  name              text NOT NULL,
  term_type         text NOT NULL DEFAULT 'semester'
                    CHECK (term_type IN ('semester','trimester','quarter','other')),
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  sequence_no       int NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,
  version           int NOT NULL DEFAULT 1,
  CONSTRAINT academic_terms_dates_chk CHECK (end_date >= start_date),
  CONSTRAINT academic_terms_year_code_uq UNIQUE (tenant_id, academic_year_id, code)
);

-- ---------------------------------------------------------------------------
-- Programme / curriculum / course versions
-- ---------------------------------------------------------------------------
CREATE TABLE programme_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  programme_id    uuid NOT NULL REFERENCES programmes(id),
  version_label   text NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published','superseded','retired')),
  effective_from  date,
  effective_to    date,
  published_at    timestamptz,
  published_by    uuid,
  rules_document  jsonb NOT NULL DEFAULT '{}'::jsonb,
  nep_config      jsonb,
  cbcs_config     jsonb,
  total_credits   numeric(8,2),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT programme_versions_label_uq UNIQUE (tenant_id, programme_id, version_label),
  CONSTRAINT programme_versions_dates_chk CHECK (
    effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from
  )
);

CREATE TABLE curriculum_versions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  programme_version_id  uuid NOT NULL REFERENCES programme_versions(id),
  version_label         text NOT NULL,
  status                text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','published','superseded')),
  effective_from        date,
  effective_to          date,
  published_at          timestamptz,
  document              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_by            uuid,
  version               int NOT NULL DEFAULT 1,
  CONSTRAINT curriculum_versions_label_uq UNIQUE (tenant_id, programme_version_id, version_label),
  CONSTRAINT curriculum_versions_dates_chk CHECK (
    effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from
  )
);

CREATE TABLE course_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  course_id       uuid NOT NULL REFERENCES courses(id),
  version_label   text NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published','superseded','retired')),
  effective_from  date,
  effective_to    date,
  credit_value    numeric(6,2) NOT NULL DEFAULT 0,
  course_category text NOT NULL DEFAULT 'core'
                  CHECK (course_category IN (
                    'core','elective','major','minor','multidisciplinary',
                    'ability_enhancement','skill_enhancement','value_added',
                    'internship','community_engagement','project','research','other'
                  )),
  syllabus_json   jsonb,
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT course_versions_label_uq UNIQUE (tenant_id, course_id, version_label)
);

CREATE TABLE course_groups (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  curriculum_version_id  uuid NOT NULL REFERENCES curriculum_versions(id),
  code                   text NOT NULL,
  name                   text NOT NULL,
  group_type             text NOT NULL DEFAULT 'elective_basket',
  min_credits            numeric(8,2),
  max_credits            numeric(8,2),
  min_courses            int,
  max_courses            int,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1,
  CONSTRAINT course_groups_code_uq UNIQUE (tenant_id, curriculum_version_id, code)
);

CREATE TABLE curriculum_course_requirements (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  curriculum_version_id  uuid NOT NULL REFERENCES curriculum_versions(id),
  course_version_id      uuid NOT NULL REFERENCES course_versions(id),
  course_group_id        uuid REFERENCES course_groups(id),
  is_required            boolean NOT NULL DEFAULT true,
  category               text NOT NULL DEFAULT 'core'
                         CHECK (category IN (
                           'core','elective','major','minor','multidisciplinary',
                           'ability_enhancement','skill_enhancement','value_added',
                           'internship','community_engagement','project','research','other'
                         )),
  term_index             int,
  credits_override       numeric(6,2),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1,
  CONSTRAINT curriculum_course_req_uq UNIQUE (tenant_id, curriculum_version_id, course_version_id)
);

-- ---------------------------------------------------------------------------
-- Grade schemes
-- ---------------------------------------------------------------------------
CREATE TABLE grade_schemes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  code            text NOT NULL,
  name            text NOT NULL,
  scale_json      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT grade_schemes_tenant_inst_code_uq UNIQUE (tenant_id, institution_id, code)
);

CREATE TABLE programme_version_grade_schemes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  programme_version_id  uuid NOT NULL REFERENCES programme_versions(id),
  grade_scheme_id       uuid NOT NULL REFERENCES grade_schemes(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pv_grade_schemes_uq UNIQUE (tenant_id, programme_version_id, grade_scheme_id)
);

-- ---------------------------------------------------------------------------
-- Prerequisites / corequisites / equivalencies / waivers / transfers
-- ---------------------------------------------------------------------------
CREATE TABLE prerequisite_groups (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  course_version_id  uuid NOT NULL REFERENCES course_versions(id),
  logic              text NOT NULL DEFAULT 'AND'
                     CHECK (logic IN ('AND','OR')),
  sort_order         int NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  updated_by         uuid,
  version            int NOT NULL DEFAULT 1
);

CREATE TABLE prerequisite_group_items (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenants(id),
  prerequisite_group_id      uuid NOT NULL REFERENCES prerequisite_groups(id) ON DELETE CASCADE,
  required_course_version_id uuid REFERENCES course_versions(id),
  required_course_id         uuid REFERENCES courses(id),
  min_grade                  text,
  department_id              uuid REFERENCES departments(id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prereq_item_target_chk CHECK (
    required_course_version_id IS NOT NULL
    OR required_course_id IS NOT NULL
    OR department_id IS NOT NULL
  )
);

CREATE TABLE corequisites (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenants(id),
  course_version_id          uuid NOT NULL REFERENCES course_versions(id),
  required_course_version_id uuid NOT NULL REFERENCES course_versions(id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  created_by                 uuid,
  CONSTRAINT corequisites_uq UNIQUE (tenant_id, course_version_id, required_course_version_id),
  CONSTRAINT corequisites_not_self CHECK (course_version_id <> required_course_version_id)
);

CREATE TABLE course_equivalencies (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  from_course_version_id uuid NOT NULL REFERENCES course_versions(id),
  to_course_version_id   uuid NOT NULL REFERENCES course_versions(id),
  bidirectional          boolean NOT NULL DEFAULT false,
  status                 text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','approved')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1,
  CONSTRAINT course_equivalencies_uq UNIQUE (tenant_id, from_course_version_id, to_course_version_id),
  CONSTRAINT course_equivalencies_not_self CHECK (from_course_version_id <> to_course_version_id)
);

CREATE TABLE course_waivers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  course_version_id      uuid NOT NULL REFERENCES course_versions(id),
  reason                 text NOT NULL,
  approved_by            uuid,
  approved_at            timestamptz,
  status                 text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','approved','rejected','revoked')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1
);

CREATE TABLE transfer_credits (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id),
  student_membership_id       uuid NOT NULL REFERENCES student_memberships(id),
  source_institution_name     text NOT NULL,
  external_course_code        text NOT NULL,
  credits                     numeric(6,2) NOT NULL,
  equivalent_course_version_id uuid REFERENCES course_versions(id),
  status                      text NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','approved','rejected')),
  decision_metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid,
  updated_by                  uuid,
  version                     int NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------------
-- Progression / exit / outcomes
-- ---------------------------------------------------------------------------
CREATE TABLE progression_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  programme_version_id  uuid NOT NULL REFERENCES programme_versions(id),
  rule_key              text NOT NULL,
  rule_document         jsonb NOT NULL,
  effective_from        date,
  effective_to          date,
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('draft','active','retired')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_by            uuid,
  version               int NOT NULL DEFAULT 1,
  CONSTRAINT progression_rules_key_uq UNIQUE (tenant_id, programme_version_id, rule_key)
);

CREATE TABLE exit_awards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  programme_version_id  uuid NOT NULL REFERENCES programme_versions(id),
  code                  text NOT NULL,
  name                  text NOT NULL,
  min_credits           numeric(8,2),
  rule_document         jsonb NOT NULL DEFAULT '{}'::jsonb,
  award_level           text NOT NULL DEFAULT 'degree'
                        CHECK (award_level IN ('certificate','diploma','degree','other')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_by            uuid,
  version               int NOT NULL DEFAULT 1,
  CONSTRAINT exit_awards_code_uq UNIQUE (tenant_id, programme_version_id, code)
);

CREATE TABLE learning_outcomes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  course_version_id     uuid REFERENCES course_versions(id),
  programme_version_id  uuid REFERENCES programme_versions(id),
  outcome_type          text NOT NULL CHECK (outcome_type IN ('CO','PO','PSO')),
  code                  text NOT NULL,
  statement             text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_by            uuid,
  version               int NOT NULL DEFAULT 1,
  CONSTRAINT learning_outcomes_owner_chk CHECK (
    course_version_id IS NOT NULL OR programme_version_id IS NOT NULL
  )
);

CREATE TABLE outcome_mappings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  co_id         uuid NOT NULL REFERENCES learning_outcomes(id),
  po_or_pso_id  uuid NOT NULL REFERENCES learning_outcomes(id),
  strength      text NOT NULL CHECK (strength IN ('high','medium','low')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outcome_mappings_uq UNIQUE (tenant_id, co_id, po_or_pso_id),
  CONSTRAINT outcome_mappings_not_self CHECK (co_id <> po_or_pso_id)
);

-- ---------------------------------------------------------------------------
-- Cohorts & enrolments (pin programme_version_id)
-- ---------------------------------------------------------------------------
CREATE TABLE cohorts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  institution_id        uuid NOT NULL REFERENCES institutions(id),
  programme_version_id  uuid NOT NULL REFERENCES programme_versions(id),
  code                  text NOT NULL,
  name                  text NOT NULL,
  intake_year           int,
  start_date            date,
  status                text NOT NULL DEFAULT 'planned'
                        CHECK (status IN ('planned','active','closed','archived')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_by            uuid,
  version               int NOT NULL DEFAULT 1,
  CONSTRAINT cohorts_tenant_inst_code_uq UNIQUE (tenant_id, institution_id, code)
);

CREATE TABLE programme_enrolments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  cohort_id              uuid NOT NULL REFERENCES cohorts(id),
  programme_version_id   uuid NOT NULL REFERENCES programme_versions(id),
  status                 text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','completed','withdrawn','suspended','proposed')),
  enrolled_at            timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1,
  CONSTRAINT programme_enrolments_student_cohort_uq UNIQUE (tenant_id, student_membership_id, cohort_id)
);

-- ---------------------------------------------------------------------------
-- ABC ledger (append-only) & course attempts
-- ---------------------------------------------------------------------------
CREATE TABLE abc_credit_ledger (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  programme_version_id   uuid REFERENCES programme_versions(id),
  entry_type             text NOT NULL
                         CHECK (entry_type IN ('earned','transferred','waived','reversed','abc_sync')),
  credit_amount          numeric(8,2) NOT NULL,
  source_ref             text,
  abc_reference          text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid
);

CREATE TABLE course_attempts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  course_version_id      uuid NOT NULL REFERENCES course_versions(id),
  attempt_number         int NOT NULL DEFAULT 1,
  status                 text NOT NULL DEFAULT 'in_progress'
                         CHECK (status IN ('in_progress','completed','failed','withdrawn','voided')),
  academic_term_id       uuid REFERENCES academic_terms(id),
  registration_id        uuid,
  started_at             timestamptz,
  completed_at           timestamptz,
  grade                  text,
  credits_earned         numeric(6,2),
  version                int NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  CONSTRAINT course_attempts_uq UNIQUE (tenant_id, student_membership_id, course_version_id, attempt_number)
);

-- ---------------------------------------------------------------------------
-- Rule evaluation decisions (append-only) & simulations
-- ---------------------------------------------------------------------------
CREATE TABLE rule_evaluation_decisions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  decision_type          text NOT NULL
                         CHECK (decision_type IN ('registration','progress','exit','prerequisite','simulation')),
  subject_ref            jsonb NOT NULL DEFAULT '{}'::jsonb,
  rule_version_refs      jsonb NOT NULL,
  result                 text NOT NULL CHECK (result IN ('pass','fail')),
  explanation            text NOT NULL,
  details                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid
);

CREATE TABLE curriculum_simulations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  programme_version_id   uuid NOT NULL REFERENCES programme_versions(id),
  curriculum_version_id  uuid NOT NULL REFERENCES curriculum_versions(id),
  status                 text NOT NULL DEFAULT 'running'
                         CHECK (status IN ('running','completed','failed')),
  requested_by           uuid,
  result_summary         jsonb,
  affected_students_count int,
  created_at             timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz
);

-- ---------------------------------------------------------------------------
-- Immutability triggers: published programme/curriculum versions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_published_version_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    -- Allow only status transition to superseded/retired and/or setting effective_to
    IF NEW.rules_document IS DISTINCT FROM OLD.rules_document
       OR (TG_TABLE_NAME = 'programme_versions' AND (
            NEW.nep_config IS DISTINCT FROM OLD.nep_config
            OR NEW.cbcs_config IS DISTINCT FROM OLD.cbcs_config
            OR NEW.total_credits IS DISTINCT FROM OLD.total_credits
            OR NEW.programme_id IS DISTINCT FROM OLD.programme_id
            OR NEW.version_label IS DISTINCT FROM OLD.version_label
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
          ))
       OR (TG_TABLE_NAME = 'curriculum_versions' AND (
            NEW.document IS DISTINCT FROM OLD.document
            OR NEW.programme_version_id IS DISTINCT FROM OLD.programme_version_id
            OR NEW.version_label IS DISTINCT FROM OLD.version_label
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
          ))
    THEN
      RAISE EXCEPTION 'Cannot mutate immutable fields of a published % (id=%)',
        TG_TABLE_NAME, OLD.id;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('superseded', 'retired')
       AND NOT (TG_TABLE_NAME = 'curriculum_versions' AND NEW.status = 'superseded')
    THEN
      RAISE EXCEPTION 'Published % may only transition to superseded/retired (id=%)',
        TG_TABLE_NAME, OLD.id;
    END IF;

    IF TG_TABLE_NAME = 'curriculum_versions'
       AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('superseded')
    THEN
      RAISE EXCEPTION 'Published curriculum_versions may only transition to superseded (id=%)',
        OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_programme_version_immutable
  BEFORE UPDATE ON programme_versions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_published_version_mutate();

CREATE TRIGGER trg_curriculum_version_immutable
  BEFORE UPDATE ON curriculum_versions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_published_version_mutate();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX academic_years_institution_idx ON academic_years (tenant_id, institution_id);
CREATE INDEX academic_terms_year_idx ON academic_terms (tenant_id, academic_year_id);
CREATE INDEX programme_versions_programme_idx ON programme_versions (tenant_id, programme_id, status);
CREATE INDEX curriculum_versions_pv_idx ON curriculum_versions (tenant_id, programme_version_id, status);
CREATE INDEX course_versions_course_idx ON course_versions (tenant_id, course_id, status);
CREATE INDEX course_groups_cv_idx ON course_groups (tenant_id, curriculum_version_id);
CREATE INDEX curriculum_req_cv_idx ON curriculum_course_requirements (tenant_id, curriculum_version_id);
CREATE INDEX curriculum_req_course_idx ON curriculum_course_requirements (tenant_id, course_version_id);
CREATE INDEX prereq_groups_cv_idx ON prerequisite_groups (tenant_id, course_version_id);
CREATE INDEX prereq_items_group_idx ON prerequisite_group_items (tenant_id, prerequisite_group_id);
CREATE INDEX corequisites_cv_idx ON corequisites (tenant_id, course_version_id);
CREATE INDEX progression_rules_pv_idx ON progression_rules (tenant_id, programme_version_id, status);
CREATE INDEX exit_awards_pv_idx ON exit_awards (tenant_id, programme_version_id);
CREATE INDEX cohorts_pv_idx ON cohorts (tenant_id, programme_version_id);
CREATE INDEX programme_enrolments_student_idx ON programme_enrolments (tenant_id, student_membership_id);
CREATE INDEX programme_enrolments_cohort_idx ON programme_enrolments (tenant_id, cohort_id);
CREATE INDEX abc_ledger_student_idx ON abc_credit_ledger (tenant_id, student_membership_id, created_at);
CREATE INDEX course_attempts_student_idx ON course_attempts (tenant_id, student_membership_id, status);
CREATE INDEX course_attempts_cv_idx ON course_attempts (tenant_id, course_version_id);
CREATE INDEX rule_decisions_student_idx ON rule_evaluation_decisions (tenant_id, student_membership_id, created_at);
CREATE INDEX curriculum_simulations_pv_idx ON curriculum_simulations (tenant_id, programme_version_id);
CREATE INDEX transfer_credits_student_idx ON transfer_credits (tenant_id, student_membership_id, status);
CREATE INDEX course_waivers_student_idx ON course_waivers (tenant_id, student_membership_id, status);
CREATE INDEX learning_outcomes_cv_idx ON learning_outcomes (tenant_id, course_version_id);
CREATE INDEX learning_outcomes_pv_idx ON learning_outcomes (tenant_id, programme_version_id);

-- ---------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'ricoz_migrator') THEN
    FOREACH t IN ARRAY ARRAY[
      'academic_years','academic_terms','programme_versions','curriculum_versions',
      'course_versions','course_groups','curriculum_course_requirements',
      'grade_schemes','programme_version_grade_schemes',
      'prerequisite_groups','prerequisite_group_items','corequisites',
      'course_equivalencies','course_waivers','transfer_credits',
      'progression_rules','exit_awards','learning_outcomes','outcome_mappings',
      'cohorts','programme_enrolments','abc_credit_ledger','course_attempts',
      'rule_evaluation_decisions','curriculum_simulations'
    ]
    LOOP
      EXECUTE format('ALTER TABLE %I OWNER TO ricoz_migrator', t);
    END LOOP;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  academic_years, academic_terms, programme_versions, curriculum_versions,
  course_versions, course_groups, curriculum_course_requirements,
  grade_schemes, programme_version_grade_schemes,
  prerequisite_groups, prerequisite_group_items, corequisites,
  course_equivalencies, course_waivers, transfer_credits,
  progression_rules, exit_awards, learning_outcomes, outcome_mappings,
  cohorts, programme_enrolments, course_attempts, curriculum_simulations
TO ricoz_app;

GRANT INSERT, SELECT ON abc_credit_ledger, rule_evaluation_decisions TO ricoz_app;
REVOKE UPDATE, DELETE ON abc_credit_ledger, rule_evaluation_decisions FROM ricoz_app;

-- ---------------------------------------------------------------------------
-- RLS FORCE tenant_isolation
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_years','academic_terms','programme_versions','curriculum_versions',
    'course_versions','course_groups','curriculum_course_requirements',
    'grade_schemes','programme_version_grade_schemes',
    'prerequisite_groups','prerequisite_group_items','corequisites',
    'course_equivalencies','course_waivers','transfer_credits',
    'progression_rules','exit_awards','learning_outcomes','outcome_mappings',
    'cohorts','programme_enrolments','abc_credit_ledger','course_attempts',
    'rule_evaluation_decisions','curriculum_simulations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO ricoz_app
         USING (tenant_id = ricoz.tenant_id_from_setting())
         WITH CHECK (tenant_id = ricoz.tenant_id_from_setting())', t);
  END LOOP;
END $$;
