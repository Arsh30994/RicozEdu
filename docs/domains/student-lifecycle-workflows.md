# Student lifecycle workflows

Command-driven lifecycle engine — **not** uncontrolled table updates.

## Runtime model

1. Client sends `POST /v1/lifecycle/commands` with `workflowCode`, `commandType`, `idempotencyKey`, aggregate ids.
2. Server verifies tenant membership (header), rejects body `tenantId`, checks **workflow-specific permission**, optionally revalidates AV/delegation for queued jobs.
3. Single DB transaction: idempotency row ? validate transition ? domain side-effect hook ? update `workflow_instances.state` ? append `workflow_transitions` ? audit ? outbox ? notification queue.
4. Illegal transitions are rejected; terminal states refuse further commands.

Schema: `infra/migrations/004_student_lifecycle_workflows.*.sql`  
Catalog: `apps/api/src/lifecycle/workflow-catalog.ts`

## Workflows (1–12)

Each entry below mirrors the in-code `WorkflowSpec` (trigger, preconditions, actors, transitions, TX boundary, side effects, events, notifications, idempotency, retry, compensation, audit, permissions, expired/delegated authz, tenant checks, failure recovery, manual repair, metrics).

### 1. Enquiry ? Applicant (`enquiry_to_applicant`)
- **Trigger:** CRM/web form or lead import  
- **States:** `enquiry_received` ? `under_review` ? `applicant_created` | `enquiry_closed`  
- **Permission:** `membership.manage`  
- **Idempotency:** `wf:enquiry_to_applicant:{tenantId}:{enquiryId}:{command}`

### 2. Application ? Admission (`application_to_admission`)
- **Trigger:** Application draft/submit  
- **States:** `application_draft` ? `submitted` ? `under_evaluation` ? `offer_extended` ? `admission_confirmed` (or rejected/withdrawn)  
- **Side effect:** `ExtendOffer` creates `admissions` row  
- **Permission:** `membership.manage`

### 3. Admission ? Onboarding (`admission_to_onboarding`)
- **Trigger:** Admission confirmed  
- **States:** `admission_ready` ? `student_provisioned` ? `onboarding_in_progress` ? `onboarding_complete`  
- **Permission:** `student.manage`  
- **Compensation:** Cancel does not hard-delete student; use status history

### 4. Term preparation (`term_preparation`)
- **Trigger:** Term registration window  
- **States:** `term_announced` ? `holds_checked` ? `plan_approved` ? `term_ready`  
- **Permission:** `academic.manage`

### 5. Course registration (`course_registration`)
- **Trigger:** Registration request  
- **States:** `registration_requested` ? `eligibility_checked` ? `registered` | `registration_denied`  
- **Integrates:** academics eligibility / human-language denial  
- **Permission:** `academic.manage`  
- **Queued jobs:** `revalidateJob` + `expectedAuthorizationVersion`

### 6. Attendance intervention (`attendance_intervention`)
- **Trigger:** Attendance risk threshold  
- **States:** `risk_detected` ? `advisor_notified` ? `student_contacted` ? `resolved` | `escalated_closed`  
- **Permission:** `student.manage`

### 7. Continuous assessment (`continuous_assessment`)
- **Trigger:** Assessment window open  
- **States:** `assessment_open` ? `marks_entered` ? `marks_verified` ? `marks_finalized`  
- **Rule:** Never silently overwrite published results; void before finalize or use corrections later  
- **Permission:** `grade.manage`

### 8. Examination ? Result (`examination_to_result`)
- **Trigger:** Exam cycle scheduled  
- **States:** `exam_scheduled` ? `exam_conducted` ? `marking_complete` ? `results_moderated` ? `results_published`  
- **Cannot** jump to publish without moderation  
- **Permission:** `result.publish`

### 9. Credit transfer (`credit_transfer`)
- **Trigger:** Transfer request  
- **States:** `transfer_requested` ? `documents_verified` ? `equivalency_mapped` ? `transfer_approved`  
- **Compensation:** reversing ledger entry (append-only)  
- **Permission:** `academic.manage`

### 10. Advising & student success (`advising_student_success`)
- **Trigger:** Risk/self-referral/advisor  
- **States:** `case_opened` ? `plan_created` ? `plan_in_progress` ? `case_closed`  
- **Permission:** `student.manage`  
- **Privacy:** counselling detail redacted from audit metadata

### 11. Graduation & alumni (`graduation_alumni`)
- **Trigger:** Graduation request  
- **States:** `graduation_requested` ? `requirements_checked` ? `graduation_approved` ? `alumni_activated`  
- **Stores:** `rule_evaluation_decisions` on check  
- **Permission:** `student.manage`

### 12. ABC/NAD credit publication (`abc_nad_credit_publication`)
- **Trigger:** Credits/credentials ready for national registry  
- **States:** `publication_requested` ? `payload_prepared` ? `submitted` ? `publication_accepted` | `publication_rejected`  
- **Retry:** outbox backoff; idempotent external submit  
- **No plaintext APAAR** — hash/vault refs only  
- **Permission:** `credential.manage`  
- **Worker:** must call with `revalidateJob: true`

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/v1/lifecycle/workflows` | Full specs (incl. operational metadata) |
| GET | `/v1/lifecycle/workflows/:code` | One spec |
| GET | `/v1/lifecycle/instances/:id` | Instance + transition history |
| GET | `/v1/lifecycle/metrics` | Counter snapshot |
| POST | `/v1/lifecycle/commands` | Execute command (SensitiveAuthz) |

## Tenant / authz rules

- Membership from `X-Tenant-Id` only; body `tenantId` ? 400  
- FORCE RLS on all workflow and aggregate tables  
- Cross-tenant aggregate ids ? empty/404  
- Stale AV / expired delegation ? `AUTHZ_STALE` before mutate  

## Manual repair

Use a new compensating command or documented `Repair*` command with reason + audit — never `UPDATE workflow_instances SET state=...` outside the engine.
