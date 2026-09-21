-- 004: Student lifecycle workflows (command-driven, audited)
SET search_path TO ricoz, public;

CREATE TABLE workflow_definitions (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  description     text NOT NULL,
  initial_state   text NOT NULL,
  terminal_states text[] NOT NULL,
  allowed_transitions jsonb NOT NULL,
  required_permission text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflow_instances (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  institution_id         uuid REFERENCES institutions(id),
  workflow_code          text NOT NULL REFERENCES workflow_definitions(code),
  aggregate_type         text NOT NULL,
  aggregate_id           uuid NOT NULL,
  person_id              uuid REFERENCES persons(id),
  student_membership_id  uuid REFERENCES student_memberships(id),
  state                  text NOT NULL,
  authorization_version_at_start int,
  payload                jsonb NOT NULL DEFAULT '{}'::jsonb,
  version                int NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  archived_at            timestamptz,
  CONSTRAINT workflow_instances_aggregate_uq UNIQUE (tenant_id, workflow_code, aggregate_type, aggregate_id)
);

CREATE TABLE workflow_transitions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  workflow_instance_id uuid NOT NULL REFERENCES workflow_instances(id),
  from_state          text,
  to_state            text NOT NULL,
  command_type        text NOT NULL,
  command_id          uuid NOT NULL,
  actor_user_id       uuid,
  actor_membership_id uuid,
  reason              text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflow_commands (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  workflow_code       text NOT NULL,
  command_type        text NOT NULL,
  idempotency_key     text NOT NULL,
  request_hash        bytea NOT NULL,
  status              text NOT NULL DEFAULT 'accepted'
                      CHECK (status IN ('accepted','applied','failed','compensated')),
  workflow_instance_id uuid REFERENCES workflow_instances(id),
  error_code          text,
  response_body       jsonb,
  attempts            int NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_commands_idem_uq UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE workflow_notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  workflow_instance_id uuid NOT NULL REFERENCES workflow_instances(id),
  channel             text NOT NULL CHECK (channel IN ('email','sms','push','in_app')),
  template_code       text NOT NULL,
  recipient_ref       text NOT NULL,
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','sent','failed','cancelled')),
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz
);

-- Domain aggregates for lifecycle (thin; state owned by workflow_instances)
CREATE TABLE enquiries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  person_id       uuid REFERENCES persons(id),
  contact_email   text,
  contact_name    text NOT NULL,
  programme_interest text,
  source          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1
);

CREATE TABLE applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  enquiry_id      uuid REFERENCES enquiries(id),
  person_id       uuid NOT NULL REFERENCES persons(id),
  programme_id    uuid REFERENCES programmes(id),
  application_number text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT applications_number_uq UNIQUE (tenant_id, application_number)
);

CREATE TABLE admissions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  institution_id         uuid NOT NULL REFERENCES institutions(id),
  application_id         uuid NOT NULL REFERENCES applications(id),
  person_id              uuid NOT NULL REFERENCES persons(id),
  student_membership_id  uuid REFERENCES student_memberships(id),
  offer_code             text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1,
  CONSTRAINT admissions_offer_uq UNIQUE (tenant_id, offer_code)
);

CREATE TABLE onboarding_cases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  admission_id           uuid NOT NULL REFERENCES admissions(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  checklist              jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1
);

CREATE TABLE term_preparations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  academic_term_id       uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1,
  CONSTRAINT term_prep_uq UNIQUE (tenant_id, student_membership_id, academic_term_id)
);

CREATE TABLE course_registration_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  academic_term_id       uuid NOT NULL,
  course_version_id      uuid NOT NULL,
  section_id             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1
);

CREATE TABLE attendance_interventions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  section_id             uuid,
  trigger_reason         text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1
);

CREATE TABLE continuous_assessments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  course_version_id      uuid NOT NULL,
  assessment_code        text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1
);

CREATE TABLE examination_cycles (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  institution_id         uuid NOT NULL REFERENCES institutions(id),
  academic_term_id       uuid NOT NULL,
  code                   text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1,
  CONSTRAINT examination_cycles_uq UNIQUE (tenant_id, code)
);

CREATE TABLE advising_cases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  advisor_user_id        uuid,
  risk_flags             jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1
);

CREATE TABLE graduation_cases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  programme_enrolment_id uuid,
  exit_award_code        text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1
);

CREATE TABLE abc_nad_publications (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  channel                text NOT NULL CHECK (channel IN ('ABC','NAD')),
  external_reference     text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1
);

CREATE INDEX workflow_instances_tenant_state_idx
  ON workflow_instances (tenant_id, workflow_code, state);
CREATE INDEX workflow_transitions_instance_idx
  ON workflow_transitions (tenant_id, workflow_instance_id, created_at);
CREATE INDEX workflow_commands_status_idx
  ON workflow_commands (tenant_id, status, created_at);

-- Seed workflow definitions (transitions as JSON arrays of {from,to,command})
INSERT INTO workflow_definitions (code, name, description, initial_state, terminal_states, allowed_transitions, required_permission) VALUES
('enquiry_to_applicant', 'Enquiry to Applicant', 'Convert enquiry into an applicant/person application intent',
 'enquiry_received', ARRAY['applicant_created','enquiry_closed'],
 '[{"from":"enquiry_received","to":"under_review","command":"ReviewEnquiry"},{"from":"under_review","to":"applicant_created","command":"ConvertToApplicant"},{"from":"under_review","to":"enquiry_closed","command":"CloseEnquiry"},{"from":"enquiry_received","to":"enquiry_closed","command":"CloseEnquiry"}]'::jsonb,
 'membership.manage'),
('application_to_admission', 'Application to Admission', 'Process application through offer and acceptance',
 'application_draft', ARRAY['admission_confirmed','application_rejected','application_withdrawn'],
 '[{"from":"application_draft","to":"submitted","command":"SubmitApplication"},{"from":"submitted","to":"under_evaluation","command":"StartEvaluation"},{"from":"under_evaluation","to":"offer_extended","command":"ExtendOffer"},{"from":"under_evaluation","to":"application_rejected","command":"RejectApplication"},{"from":"offer_extended","to":"admission_confirmed","command":"AcceptOffer"},{"from":"offer_extended","to":"application_withdrawn","command":"WithdrawApplication"},{"from":"submitted","to":"application_withdrawn","command":"WithdrawApplication"}]'::jsonb,
 'membership.manage'),
('admission_to_onboarding', 'Admission to Onboarding', 'Create student record and complete onboarding checklist',
 'admission_ready', ARRAY['onboarding_complete','onboarding_cancelled'],
 '[{"from":"admission_ready","to":"student_provisioned","command":"ProvisionStudent"},{"from":"student_provisioned","to":"onboarding_in_progress","command":"StartOnboarding"},{"from":"onboarding_in_progress","to":"onboarding_complete","command":"CompleteOnboarding"},{"from":"admission_ready","to":"onboarding_cancelled","command":"CancelOnboarding"},{"from":"student_provisioned","to":"onboarding_cancelled","command":"CancelOnboarding"}]'::jsonb,
 'student.manage'),
('term_preparation', 'Term Preparation', 'Prepare student for an academic term',
 'term_announced', ARRAY['term_ready','term_prep_cancelled'],
 '[{"from":"term_announced","to":"holds_checked","command":"CheckHolds"},{"from":"holds_checked","to":"plan_approved","command":"ApproveTermPlan"},{"from":"plan_approved","to":"term_ready","command":"MarkTermReady"},{"from":"term_announced","to":"term_prep_cancelled","command":"CancelTermPrep"},{"from":"holds_checked","to":"term_prep_cancelled","command":"CancelTermPrep"}]'::jsonb,
 'academic.manage'),
('course_registration', 'Course Registration', 'Register student for a course/section with eligibility checks',
 'registration_requested', ARRAY['registered','registration_denied','registration_cancelled'],
 '[{"from":"registration_requested","to":"eligibility_checked","command":"CheckEligibility"},{"from":"eligibility_checked","to":"registered","command":"ConfirmRegistration"},{"from":"eligibility_checked","to":"registration_denied","command":"DenyRegistration"},{"from":"registration_requested","to":"registration_cancelled","command":"CancelRegistration"}]'::jsonb,
 'academic.manage'),
('attendance_intervention', 'Attendance Intervention', 'Intervene when attendance risk thresholds are crossed',
 'risk_detected', ARRAY['resolved','escalated_closed'],
 '[{"from":"risk_detected","to":"advisor_notified","command":"NotifyAdvisor"},{"from":"advisor_notified","to":"student_contacted","command":"ContactStudent"},{"from":"student_contacted","to":"resolved","command":"ResolveIntervention"},{"from":"advisor_notified","to":"escalated_closed","command":"EscalateIntervention"}]'::jsonb,
 'student.manage'),
('continuous_assessment', 'Continuous Assessment', 'Capture and finalize continuous assessment marks',
 'assessment_open', ARRAY['marks_finalized','assessment_voided'],
 '[{"from":"assessment_open","to":"marks_entered","command":"EnterMarks"},{"from":"marks_entered","to":"marks_verified","command":"VerifyMarks"},{"from":"marks_verified","to":"marks_finalized","command":"FinalizeMarks"},{"from":"assessment_open","to":"assessment_voided","command":"VoidAssessment"},{"from":"marks_entered","to":"assessment_voided","command":"VoidAssessment"}]'::jsonb,
 'grade.manage'),
('examination_to_result', 'Examination to Result', 'Run exam cycle through to published results',
 'exam_scheduled', ARRAY['results_published','exam_cancelled'],
 '[{"from":"exam_scheduled","to":"exam_conducted","command":"ConductExam"},{"from":"exam_conducted","to":"marking_complete","command":"CompleteMarking"},{"from":"marking_complete","to":"results_moderated","command":"ModerateResults"},{"from":"results_moderated","to":"results_published","command":"PublishResults"},{"from":"exam_scheduled","to":"exam_cancelled","command":"CancelExam"}]'::jsonb,
 'result.publish'),
('credit_transfer', 'Credit Transfer', 'Evaluate and apply transfer credits',
 'transfer_requested', ARRAY['transfer_approved','transfer_rejected','transfer_cancelled'],
 '[{"from":"transfer_requested","to":"documents_verified","command":"VerifyTransferDocs"},{"from":"documents_verified","to":"equivalency_mapped","command":"MapEquivalency"},{"from":"equivalency_mapped","to":"transfer_approved","command":"ApproveTransfer"},{"from":"documents_verified","to":"transfer_rejected","command":"RejectTransfer"},{"from":"transfer_requested","to":"transfer_cancelled","command":"CancelTransfer"}]'::jsonb,
 'academic.manage'),
('advising_student_success', 'Advising and Student Success', 'Manage advising cases for at-risk or planning students',
 'case_opened', ARRAY['case_closed','case_dismissed'],
 '[{"from":"case_opened","to":"plan_created","command":"CreateSuccessPlan"},{"from":"plan_created","to":"plan_in_progress","command":"StartSuccessPlan"},{"from":"plan_in_progress","to":"case_closed","command":"CloseAdvisingCase"},{"from":"case_opened","to":"case_dismissed","command":"DismissAdvisingCase"}]'::jsonb,
 'student.manage'),
('graduation_alumni', 'Graduation and Alumni', 'Clear graduation and transition to alumni',
 'graduation_requested', ARRAY['alumni_activated','graduation_denied'],
 '[{"from":"graduation_requested","to":"requirements_checked","command":"CheckGraduationRequirements"},{"from":"requirements_checked","to":"graduation_approved","command":"ApproveGraduation"},{"from":"requirements_checked","to":"graduation_denied","command":"DenyGraduation"},{"from":"graduation_approved","to":"alumni_activated","command":"ActivateAlumni"}]'::jsonb,
 'student.manage'),
('abc_nad_credit_publication', 'ABC/NAD Credit Publication', 'Publish credits to ABC or NAD with idempotent retries',
 'publication_requested', ARRAY['publication_accepted','publication_rejected'],
 '[{"from":"publication_requested","to":"payload_prepared","command":"PreparePublicationPayload"},{"from":"payload_prepared","to":"submitted","command":"SubmitPublication"},{"from":"submitted","to":"publication_accepted","command":"ConfirmPublication"},{"from":"submitted","to":"publication_rejected","command":"RejectPublication"},{"from":"payload_prepared","to":"publication_rejected","command":"RejectPublication"}]'::jsonb,
 'credential.manage')
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workflow_instances','workflow_transitions','workflow_commands','workflow_notifications',
    'enquiries','applications','admissions','onboarding_cases','term_preparations',
    'course_registration_requests','attendance_interventions','continuous_assessments',
    'examination_cycles','advising_cases','graduation_cases','abc_nad_publications'
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

GRANT SELECT ON workflow_definitions TO ricoz_app;
REVOKE UPDATE, DELETE ON workflow_transitions FROM ricoz_app;
GRANT INSERT, SELECT ON workflow_transitions TO ricoz_app;
