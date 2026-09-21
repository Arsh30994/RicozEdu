export type WorkflowCode =
  | 'enquiry_to_applicant'
  | 'application_to_admission'
  | 'admission_to_onboarding'
  | 'term_preparation'
  | 'course_registration'
  | 'attendance_intervention'
  | 'continuous_assessment'
  | 'examination_to_result'
  | 'credit_transfer'
  | 'advising_student_success'
  | 'graduation_alumni'
  | 'abc_nad_credit_publication';

export interface TransitionDef {
  from: string;
  to: string;
  command: string;
}

export interface WorkflowSpec {
  code: WorkflowCode;
  name: string;
  trigger: string;
  preconditions: string[];
  actors: string[];
  initialState: string;
  terminalStates: string[];
  transitions: TransitionDef[];
  transactionBoundary: string;
  sideEffects: string[];
  domainEvents: string[];
  notifications: string[];
  idempotencyKeyPattern: string;
  retryBehavior: string;
  compensationBehavior: string;
  auditActions: string[];
  requiredPermission: string;
  expiredDelegatedPermissionBehavior: string;
  tenantScopeChecks: string[];
  failureRecovery: string;
  manualRepairPath: string;
  metrics: string[];
  aggregateType: string;
}

export const WORKFLOW_SPECS: Record<WorkflowCode, WorkflowSpec> = {
  enquiry_to_applicant: {
    code: 'enquiry_to_applicant',
    name: 'Enquiry to Applicant',
    trigger: 'CRM/web form creates enquiry or staff imports lead',
    preconditions: ['Tenant active', 'Institution exists', 'Contact identity captured'],
    actors: ['AdmissionsOfficer', 'CRMOperator', 'System'],
    initialState: 'enquiry_received',
    terminalStates: ['applicant_created', 'enquiry_closed'],
    transitions: [
      { from: 'enquiry_received', to: 'under_review', command: 'ReviewEnquiry' },
      { from: 'under_review', to: 'applicant_created', command: 'ConvertToApplicant' },
      { from: 'under_review', to: 'enquiry_closed', command: 'CloseEnquiry' },
      { from: 'enquiry_received', to: 'enquiry_closed', command: 'CloseEnquiry' },
    ],
    transactionBoundary:
      'Single DB TX: update enquiry aggregate + workflow_instance + transition + audit + outbox (+ person create on convert)',
    sideEffects: ['May create/link person', 'Queue welcome notification'],
    domainEvents: ['enquiry.reviewed', 'enquiry.converted', 'enquiry.closed'],
    notifications: ['enquiry.acknowledged', 'applicant.created'],
    idempotencyKeyPattern: 'wf:enquiry_to_applicant:{tenantId}:{enquiryId}:{command}',
    retryBehavior: 'Safe retry with same idempotency key returns prior result; outbox relay retries notifications',
    compensationBehavior: 'CloseEnquiry compensates open review; ConvertToApplicant is not auto-reversedmanual unlink via repair',
    auditActions: ['workflow.command.accepted', 'workflow.transitioned', 'enquiry.converted'],
    requiredPermission: 'membership.manage',
    expiredDelegatedPermissionBehavior:
      'Reject command if authorization_version stale or delegation expired; do not apply transition',
    tenantScopeChecks: ['X-Tenant-Id membership', 'RLS on enquiries/workflow_instances', 'Reject body tenantId'],
    failureRecovery: 'Failed command marked failed; instance unchanged; retry allowed if still valid transition',
    manualRepairPath: 'Admin RepairWorkflow with reason + dual control audit; never silent state rewrite',
    metrics: [
      'workflow_enquiry_started_total',
      'workflow_enquiry_converted_total',
      'workflow_enquiry_failed_total',
      'workflow_enquiry_duration_seconds',
    ],
    aggregateType: 'enquiry',
  },
  application_to_admission: {
    code: 'application_to_admission',
    name: 'Application to Admission',
    trigger: 'Applicant submits application or staff creates draft application',
    preconditions: ['Person exists', 'Programme exists', 'Enquiry optional link'],
    actors: ['Applicant', 'AdmissionsCommittee', 'Registrar'],
    initialState: 'application_draft',
    terminalStates: ['admission_confirmed', 'application_rejected', 'application_withdrawn'],
    transitions: [
      { from: 'application_draft', to: 'submitted', command: 'SubmitApplication' },
      { from: 'submitted', to: 'under_evaluation', command: 'StartEvaluation' },
      { from: 'under_evaluation', to: 'offer_extended', command: 'ExtendOffer' },
      { from: 'under_evaluation', to: 'application_rejected', command: 'RejectApplication' },
      { from: 'offer_extended', to: 'admission_confirmed', command: 'AcceptOffer' },
      { from: 'offer_extended', to: 'application_withdrawn', command: 'WithdrawApplication' },
      { from: 'submitted', to: 'application_withdrawn', command: 'WithdrawApplication' },
    ],
    transactionBoundary:
      'TX per command: applications/admissions row + workflow transition + audit + outbox',
    sideEffects: ['Create admission offer on ExtendOffer', 'Link student membership on AcceptOffer (later step)'],
    domainEvents: [
      'application.submitted',
      'application.offer_extended',
      'admission.confirmed',
      'application.rejected',
    ],
    notifications: ['application.received', 'offer.extended', 'admission.confirmed'],
    idempotencyKeyPattern: 'wf:application_to_admission:{tenantId}:{applicationId}:{command}',
    retryBehavior: 'Idempotent command replay; offer codes unique to prevent double offers',
    compensationBehavior: 'WithdrawApplication / RejectApplication terminal; AcceptOffer compensation via admissions revoke workflow',
    auditActions: ['application.submitted', 'offer.extended', 'admission.confirmed'],
    requiredPermission: 'membership.manage',
    expiredDelegatedPermissionBehavior: 'Fail closed before mutate; bump AV does not roll back prior applied commands',
    tenantScopeChecks: ['Application.tenant_id via RLS', 'Institution membership scope if binding narrowed'],
    failureRecovery: 'Re-queue evaluation; extend offer only from under_evaluation',
    manualRepairPath: 'Registrar repair to move stuck under_evaluation with documented reason',
    metrics: [
      'workflow_application_submitted_total',
      'workflow_offer_extended_total',
      'workflow_admission_confirmed_total',
    ],
    aggregateType: 'application',
  },
  admission_to_onboarding: {
    code: 'admission_to_onboarding',
    name: 'Admission to Onboarding',
    trigger: 'Admission confirmed',
    preconditions: ['admission_confirmed', 'Offer accepted'],
    actors: ['Registrar', 'Student', 'OnboardingCoordinator'],
    initialState: 'admission_ready',
    terminalStates: ['onboarding_complete', 'onboarding_cancelled'],
    transitions: [
      { from: 'admission_ready', to: 'student_provisioned', command: 'ProvisionStudent' },
      { from: 'student_provisioned', to: 'onboarding_in_progress', command: 'StartOnboarding' },
      { from: 'onboarding_in_progress', to: 'onboarding_complete', command: 'CompleteOnboarding' },
      { from: 'admission_ready', to: 'onboarding_cancelled', command: 'CancelOnboarding' },
      { from: 'student_provisioned', to: 'onboarding_cancelled', command: 'CancelOnboarding' },
    ],
    transactionBoundary:
      'ProvisionStudent TX creates student_membership + onboarding_case + transition; checklist updates separate TX',
    sideEffects: ['Create student_membership', 'Seed onboarding checklist', 'Notify student portal'],
    domainEvents: ['student.provisioned', 'onboarding.started', 'onboarding.completed'],
    notifications: ['onboarding.welcome', 'onboarding.complete'],
    idempotencyKeyPattern: 'wf:admission_to_onboarding:{tenantId}:{admissionId}:{command}',
    retryBehavior: 'ProvisionStudent idempotent on admission_id unique onboarding_case',
    compensationBehavior: 'CancelOnboarding marks case cancelled; does not delete student_membershipstatus history withdraw',
    auditActions: ['student.provisioned', 'onboarding.completed', 'onboarding.cancelled'],
    requiredPermission: 'student.manage',
    expiredDelegatedPermissionBehavior: 'Reject Start/Complete if AV stale',
    tenantScopeChecks: ['Admission and student_membership same tenant'],
    failureRecovery: 'Resume checklist; re-run CompleteOnboarding when all items done',
    manualRepairPath: 'Force-complete checklist item with audit reason',
    metrics: ['workflow_student_provisioned_total', 'workflow_onboarding_complete_total'],
    aggregateType: 'admission',
  },
  term_preparation: {
    code: 'term_preparation',
    name: 'Term Preparation',
    trigger: 'Academic term open for registration window',
    preconditions: ['Active student_membership', 'Term exists', 'No blocking financial/academic holds (checked in command)'],
    actors: ['Student', 'Advisor', 'Registrar'],
    initialState: 'term_announced',
    terminalStates: ['term_ready', 'term_prep_cancelled'],
    transitions: [
      { from: 'term_announced', to: 'holds_checked', command: 'CheckHolds' },
      { from: 'holds_checked', to: 'plan_approved', command: 'ApproveTermPlan' },
      { from: 'plan_approved', to: 'term_ready', command: 'MarkTermReady' },
      { from: 'term_announced', to: 'term_prep_cancelled', command: 'CancelTermPrep' },
      { from: 'holds_checked', to: 'term_prep_cancelled', command: 'CancelTermPrep' },
    ],
    transactionBoundary: 'Each command TX updates term_preparations + workflow',
    sideEffects: ['Hold flags in payload', 'Enable registration when term_ready'],
    domainEvents: ['term.holds_checked', 'term.plan_approved', 'term.ready'],
    notifications: ['term.prep_required', 'term.ready'],
    idempotencyKeyPattern: 'wf:term_preparation:{tenantId}:{studentId}:{termId}:{command}',
    retryBehavior: 'CheckHolds re-evaluates holds on each accepted new key; same key returns cached',
    compensationBehavior: 'CancelTermPrep from early states; after term_ready use registration cancel paths',
    auditActions: ['term.holds_checked', 'term.ready'],
    requiredPermission: 'academic.manage',
    expiredDelegatedPermissionBehavior: 'Fail closed',
    tenantScopeChecks: ['Student membership tenant', 'Term institution scope'],
    failureRecovery: 'Clear holds externally then re-issue CheckHolds with new idempotency key',
    manualRepairPath: 'Registrar override hold with documented waiver command',
    metrics: ['workflow_term_ready_total', 'workflow_term_hold_block_total'],
    aggregateType: 'term_preparation',
  },
  course_registration: {
    code: 'course_registration',
    name: 'Course Registration',
    trigger: 'Student or registrar requests course/section seat',
    preconditions: ['term_ready', 'Course version published', 'Eligibility rules available'],
    actors: ['Student', 'Registrar', 'RulesEngine'],
    initialState: 'registration_requested',
    terminalStates: ['registered', 'registration_denied', 'registration_cancelled'],
    transitions: [
      { from: 'registration_requested', to: 'eligibility_checked', command: 'CheckEligibility' },
      { from: 'eligibility_checked', to: 'registered', command: 'ConfirmRegistration' },
      { from: 'eligibility_checked', to: 'registration_denied', command: 'DenyRegistration' },
      { from: 'registration_requested', to: 'registration_cancelled', command: 'CancelRegistration' },
    ],
    transactionBoundary:
      'CheckEligibility TX writes rule_evaluation_decisions; ConfirmRegistration TX creates attempt/registration + transition',
    sideEffects: ['Human-language denial explanation', 'Seat allocation stub', 'Outbox registration.confirmed'],
    domainEvents: ['registration.eligibility_checked', 'registration.confirmed', 'registration.denied'],
    notifications: ['registration.confirmed', 'registration.denied'],
    idempotencyKeyPattern: 'wf:course_registration:{tenantId}:{studentId}:{courseVersionId}:{termId}:{command}',
    retryBehavior: 'ConfirmRegistration unique on active registration; retries return existing',
    compensationBehavior: 'Drop course via separate withdraw command (not silent delete)',
    auditActions: ['registration.checked', 'registration.confirmed', 'registration.denied'],
    requiredPermission: 'academic.manage',
    expiredDelegatedPermissionBehavior: 'Revalidate job principal before ConfirmRegistration if queued',
    tenantScopeChecks: ['RLS + section/course tenant', 'Wrong section ? deny'],
    failureRecovery: 'Re-check eligibility after curriculum change',
    manualRepairPath: 'Force register with waiver reference + audit',
    metrics: ['workflow_registration_confirmed_total', 'workflow_registration_denied_total'],
    aggregateType: 'course_registration_request',
  },
  attendance_intervention: {
    code: 'attendance_intervention',
    name: 'Attendance Intervention',
    trigger: 'Attendance below threshold event from attendance domain',
    preconditions: ['Active enrolment in section', 'Threshold policy configured'],
    actors: ['System', 'Advisor', 'Faculty'],
    initialState: 'risk_detected',
    terminalStates: ['resolved', 'escalated_closed'],
    transitions: [
      { from: 'risk_detected', to: 'advisor_notified', command: 'NotifyAdvisor' },
      { from: 'advisor_notified', to: 'student_contacted', command: 'ContactStudent' },
      { from: 'student_contacted', to: 'resolved', command: 'ResolveIntervention' },
      { from: 'advisor_notified', to: 'escalated_closed', command: 'EscalateIntervention' },
    ],
    transactionBoundary: 'TX per step; notifications via outbox after commit',
    sideEffects: ['Open advising_case optionally', 'Notify advisor/student'],
    domainEvents: ['attendance.risk_detected', 'attendance.intervention_resolved'],
    notifications: ['advisor.attendance_risk', 'student.attendance_warning'],
    idempotencyKeyPattern: 'wf:attendance_intervention:{tenantId}:{studentId}:{sectionId}:{command}',
    retryBehavior: 'NotifyAdvisor idempotent per intervention id',
    compensationBehavior: 'Resolve closes case; no undo of notifications',
    auditActions: ['attendance.intervention_started', 'attendance.intervention_resolved'],
    requiredPermission: 'student.manage',
    expiredDelegatedPermissionBehavior: 'Fail closed on advisor actions',
    tenantScopeChecks: ['Student/section tenant match'],
    failureRecovery: 'Re-notify advisor with new command key if notification failed after transition',
    manualRepairPath: 'Close stuck intervention with reason',
    metrics: ['workflow_attendance_intervention_total', 'workflow_attendance_resolved_total'],
    aggregateType: 'attendance_intervention',
  },
  continuous_assessment: {
    code: 'continuous_assessment',
    name: 'Continuous Assessment',
    trigger: 'Assessment window opens for course offering',
    preconditions: ['Course attempt in progress', 'Assessment definition exists'],
    actors: ['Instructor', 'Moderator'],
    initialState: 'assessment_open',
    terminalStates: ['marks_finalized', 'assessment_voided'],
    transitions: [
      { from: 'assessment_open', to: 'marks_entered', command: 'EnterMarks' },
      { from: 'marks_entered', to: 'marks_verified', command: 'VerifyMarks' },
      { from: 'marks_verified', to: 'marks_finalized', command: 'FinalizeMarks' },
      { from: 'assessment_open', to: 'assessment_voided', command: 'VoidAssessment' },
      { from: 'marks_entered', to: 'assessment_voided', command: 'VoidAssessment' },
    ],
    transactionBoundary: 'Marks write + transition in one TX; finalized marks immutable thereafter (corrections separate)',
    sideEffects: ['Write working grade entries', 'Never mutate published_results here'],
    domainEvents: ['assessment.marks_entered', 'assessment.marks_finalized', 'assessment.voided'],
    notifications: ['student.marks_available'],
    idempotencyKeyPattern: 'wf:continuous_assessment:{tenantId}:{assessmentId}:{command}',
    retryBehavior: 'EnterMarks upserts working marks by attempt id',
    compensationBehavior: 'VoidAssessment before finalize; after finalize use result correction workflow',
    auditActions: ['assessment.marks_entered', 'assessment.finalized'],
    requiredPermission: 'grade.manage',
    expiredDelegatedPermissionBehavior: 'Fail closed; sensitive finalize revalidates grants',
    tenantScopeChecks: ['Course/student tenant'],
    failureRecovery: 'Re-enter marks while not finalized',
    manualRepairPath: 'Moderator void + reopen draft assessment',
    metrics: ['workflow_ca_finalized_total', 'workflow_ca_voided_total'],
    aggregateType: 'continuous_assessment',
  },
  examination_to_result: {
    code: 'examination_to_result',
    name: 'Examination to Result',
    trigger: 'Exam cycle scheduled for term',
    preconditions: ['Exam roster frozen', 'Moderation policy present'],
    actors: ['ControllerOfExaminations', 'Moderator', 'Registrar'],
    initialState: 'exam_scheduled',
    terminalStates: ['results_published', 'exam_cancelled'],
    transitions: [
      { from: 'exam_scheduled', to: 'exam_conducted', command: 'ConductExam' },
      { from: 'exam_conducted', to: 'marking_complete', command: 'CompleteMarking' },
      { from: 'marking_complete', to: 'results_moderated', command: 'ModerateResults' },
      { from: 'results_moderated', to: 'results_published', command: 'PublishResults' },
      { from: 'exam_scheduled', to: 'exam_cancelled', command: 'CancelExam' },
    ],
    transactionBoundary:
      'PublishResults TX inserts published_results (immutable) + transitions + outbox; no in-place grade overwrite',
    sideEffects: ['Publish official results', 'ABC ledger append earned credits', 'Notify students'],
    domainEvents: ['exam.conducted', 'results.moderated', 'results.published'],
    notifications: ['results.published'],
    idempotencyKeyPattern: 'wf:examination_to_result:{tenantId}:{examCycleId}:{command}',
    retryBehavior: 'PublishResults idempotent per course_attempt unique published_results',
    compensationBehavior: 'Cancel only before conduct; after publish use result_corrections',
    auditActions: ['exam.conducted', 'results.published'],
    requiredPermission: 'result.publish',
    expiredDelegatedPermissionBehavior: 'SensitiveAuthz revalidate on PublishResults',
    tenantScopeChecks: ['Exam cycle tenant', 'Student rows RLS'],
    failureRecovery: 'Resume marking; republish blocked if already published',
    manualRepairPath: 'Correction event workflow, never silent recalculation',
    metrics: ['workflow_results_published_total', 'workflow_exam_cancelled_total'],
    aggregateType: 'examination_cycle',
  },
  credit_transfer: {
    code: 'credit_transfer',
    name: 'Credit Transfer',
    trigger: 'Student requests inbound/outbound credit transfer',
    preconditions: ['Active student', 'Supporting documents refs in object storage'],
    actors: ['Student', 'TransferEvaluator', 'Registrar'],
    initialState: 'transfer_requested',
    terminalStates: ['transfer_approved', 'transfer_rejected', 'transfer_cancelled'],
    transitions: [
      { from: 'transfer_requested', to: 'documents_verified', command: 'VerifyTransferDocs' },
      { from: 'documents_verified', to: 'equivalency_mapped', command: 'MapEquivalency' },
      { from: 'equivalency_mapped', to: 'transfer_approved', command: 'ApproveTransfer' },
      { from: 'documents_verified', to: 'transfer_rejected', command: 'RejectTransfer' },
      { from: 'transfer_requested', to: 'transfer_cancelled', command: 'CancelTransfer' },
    ],
    transactionBoundary:
      'ApproveTransfer TX updates transfer_credits + abc_credit_ledger append + transition',
    sideEffects: ['Ledger append transferred credits', 'Equivalency link'],
    domainEvents: ['transfer.verified', 'transfer.approved', 'transfer.rejected'],
    notifications: ['transfer.decision'],
    idempotencyKeyPattern: 'wf:credit_transfer:{tenantId}:{transferId}:{command}',
    retryBehavior: 'ApproveTransfer once; ledger idempotency via outbox key',
    compensationBehavior: 'Append reversing ledger entry; do not delete approval history',
    auditActions: ['transfer.approved', 'transfer.rejected'],
    requiredPermission: 'academic.manage',
    expiredDelegatedPermissionBehavior: 'Fail closed on ApproveTransfer',
    tenantScopeChecks: ['Student/transfer tenant'],
    failureRecovery: 'Re-map equivalency then approve',
    manualRepairPath: 'Registrar reverse ledger with reason',
    metrics: ['workflow_transfer_approved_total', 'workflow_transfer_rejected_total'],
    aggregateType: 'transfer_credit',
  },
  advising_student_success: {
    code: 'advising_student_success',
    name: 'Advising and Student Success',
    trigger: 'Risk flag, self-referral, or advisor opens case',
    preconditions: ['Active student_membership'],
    actors: ['Advisor', 'StudentSuccessCoach', 'Student'],
    initialState: 'case_opened',
    terminalStates: ['case_closed', 'case_dismissed'],
    transitions: [
      { from: 'case_opened', to: 'plan_created', command: 'CreateSuccessPlan' },
      { from: 'plan_created', to: 'plan_in_progress', command: 'StartSuccessPlan' },
      { from: 'plan_in_progress', to: 'case_closed', command: 'CloseAdvisingCase' },
      { from: 'case_opened', to: 'case_dismissed', command: 'DismissAdvisingCase' },
    ],
    transactionBoundary: 'Case/plan JSON updates + transition in TX; counselling notes redacted in audit metadata',
    sideEffects: ['Optional attendance intervention link', 'Notifications to student'],
    domainEvents: ['advising.case_opened', 'advising.plan_started', 'advising.case_closed'],
    notifications: ['advising.plan_assigned', 'advising.case_closed'],
    idempotencyKeyPattern: 'wf:advising_student_success:{tenantId}:{caseId}:{command}',
    retryBehavior: 'CreateSuccessPlan idempotent per case',
    compensationBehavior: 'Dismiss/close only; plans retained for audit',
    auditActions: ['advising.case_opened', 'advising.case_closed'],
    requiredPermission: 'student.manage',
    expiredDelegatedPermissionBehavior: 'Fail closed',
    tenantScopeChecks: ['Case tenant + advisor membership'],
    failureRecovery: 'Re-open via new case if closed incorrectly (no reopen silent edit)',
    manualRepairPath: 'Supervisor close with reason',
    metrics: ['workflow_advising_open_total', 'workflow_advising_closed_total'],
    aggregateType: 'advising_case',
  },
  graduation_alumni: {
    code: 'graduation_alumni',
    name: 'Graduation and Alumni',
    trigger: 'Student or registrar requests graduation clearance',
    preconditions: ['Programme enrolment', 'Degree progress evaluable'],
    actors: ['Registrar', 'Student', 'AlumniOffice'],
    initialState: 'graduation_requested',
    terminalStates: ['alumni_activated', 'graduation_denied'],
    transitions: [
      { from: 'graduation_requested', to: 'requirements_checked', command: 'CheckGraduationRequirements' },
      { from: 'requirements_checked', to: 'graduation_approved', command: 'ApproveGraduation' },
      { from: 'requirements_checked', to: 'graduation_denied', command: 'DenyGraduation' },
      { from: 'graduation_approved', to: 'alumni_activated', command: 'ActivateAlumni' },
    ],
    transactionBoundary:
      'Check stores rule_evaluation_decisions; ActivateAlumni updates student status history + graduation_case',
    sideEffects: ['Student status ? graduated', 'Alumni role binding stub', 'Credential issue outbox'],
    domainEvents: ['graduation.checked', 'graduation.approved', 'alumni.activated'],
    notifications: ['graduation.approved', 'alumni.welcome'],
    idempotencyKeyPattern: 'wf:graduation_alumni:{tenantId}:{graduationCaseId}:{command}',
    retryBehavior: 'ActivateAlumni idempotent on student status',
    compensationBehavior: 'Deny path terminal; revoke alumni via separate command with audit',
    auditActions: ['graduation.checked', 'graduation.approved', 'alumni.activated'],
    requiredPermission: 'student.manage',
    expiredDelegatedPermissionBehavior: 'Fail closed on Approve/Activate',
    tenantScopeChecks: ['Enrolment/student tenant'],
    failureRecovery: 'Re-run CheckGraduationRequirements after curriculum completion',
    manualRepairPath: 'Board override approval with documented minutes ref',
    metrics: ['workflow_graduation_approved_total', 'workflow_alumni_activated_total'],
    aggregateType: 'graduation_case',
  },
  abc_nad_credit_publication: {
    code: 'abc_nad_credit_publication',
    name: 'ABC/NAD Credit Publication',
    trigger: 'Credits finalized or credential issued requiring national registry sync',
    preconditions: ['Student external identifier hash present', 'Credits in abc_credit_ledger'],
    actors: ['System', 'Registrar', 'IntegrationWorker'],
    initialState: 'publication_requested',
    terminalStates: ['publication_accepted', 'publication_rejected'],
    transitions: [
      { from: 'publication_requested', to: 'payload_prepared', command: 'PreparePublicationPayload' },
      { from: 'payload_prepared', to: 'submitted', command: 'SubmitPublication' },
      { from: 'submitted', to: 'publication_accepted', command: 'ConfirmPublication' },
      { from: 'submitted', to: 'publication_rejected', command: 'RejectPublication' },
      { from: 'payload_prepared', to: 'publication_rejected', command: 'RejectPublication' },
    ],
    transactionBoundary:
      'Submit enqueues outbox; Confirm updates abc_nad_publications + transition after webhook/reconcile',
    sideEffects: ['External ABC/NAD API call async', 'Store external_reference only (no plaintext APAAR)'],
    domainEvents: ['abc.payload_prepared', 'abc.submitted', 'abc.accepted', 'abc.rejected'],
    notifications: ['registrar.abc_failed', 'student.abc_accepted'],
    idempotencyKeyPattern: 'wf:abc_nad_credit_publication:{tenantId}:{publicationId}:{command}',
    retryBehavior: 'SubmitPublication retries via outbox backoff; same idempotency key prevents duplicate external posts',
    compensationBehavior: 'RejectPublication; reversing national entries requires manual registry process + audit',
    auditActions: ['abc.submitted', 'abc.accepted', 'abc.rejected'],
    requiredPermission: 'credential.manage',
    expiredDelegatedPermissionBehavior: 'Worker revalidateJobPrincipal before Submit/Confirm',
    tenantScopeChecks: ['Publication tenant', 'Ledger rows RLS'],
    failureRecovery: 'Reconcile job replays Confirm/Reject from external status',
    manualRepairPath: 'Registrar mark accepted/rejected with external ticket id',
    metrics: [
      'workflow_abc_submitted_total',
      'workflow_abc_accepted_total',
      'workflow_abc_rejected_total',
      'workflow_abc_retry_total',
    ],
    aggregateType: 'abc_nad_publication',
  },
};

export function assertTransition(
  spec: WorkflowSpec,
  fromState: string,
  command: string,
): TransitionDef {
  const t = spec.transitions.find((x) => x.from === fromState && x.command === command);
  if (!t) {
    throw new Error(
      `Invalid transition: workflow=${spec.code} state=${fromState} command=${command}`,
    );
  }
  return t;
}

export function isTerminal(spec: WorkflowSpec, state: string): boolean {
  return spec.terminalStates.includes(state);
}
