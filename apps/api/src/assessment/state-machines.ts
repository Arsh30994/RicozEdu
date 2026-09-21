/**
 * Assessment / examination state machines.
 * Transitions are the single source of truth for API + docs + tests.
 */

export type MarkEntryStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'locked'
  | 'voided';

export type CalculationStatus =
  | 'draft'
  | 'submitted'
  | 'moderated'
  | 'approved'
  | 'published'
  | 'superseded';

export type PublicationJobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RevaluationStatus =
  | 'requested'
  | 'under_review'
  | 'upheld'
  | 'revised'
  | 'rejected'
  | 'cancelled';

const MARK_TRANSITIONS: Record<MarkEntryStatus, MarkEntryStatus[]> = {
  draft: ['submitted', 'voided'],
  submitted: ['under_review', 'rejected', 'draft'],
  under_review: ['approved', 'rejected', 'submitted'],
  approved: ['locked'],
  rejected: ['draft'],
  locked: [], // unlock only via admin void ? new entry path
  voided: [],
};

const CALC_TRANSITIONS: Record<CalculationStatus, CalculationStatus[]> = {
  draft: ['submitted', 'superseded'],
  submitted: ['moderated', 'draft', 'superseded'],
  moderated: ['approved', 'submitted', 'superseded'],
  approved: ['published', 'superseded'],
  published: [],
  superseded: [],
};

const JOB_TRANSITIONS: Record<PublicationJobStatus, PublicationJobStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['paused', 'completed', 'failed'],
  paused: ['running', 'cancelled'],
  completed: [],
  failed: ['queued'], // retry ? re-queue
  cancelled: [],
};

const REVAL_TRANSITIONS: Record<RevaluationStatus, RevaluationStatus[]> = {
  requested: ['under_review', 'cancelled'],
  under_review: ['upheld', 'revised', 'rejected'],
  upheld: [],
  revised: [],
  rejected: [],
  cancelled: [],
};

export function assertMarkTransition(
  from: MarkEntryStatus,
  to: MarkEntryStatus,
): void {
  if (!MARK_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid mark_entry transition ${from} ? ${to}`);
  }
}

export function assertCalcTransition(
  from: CalculationStatus,
  to: CalculationStatus,
): void {
  if (!CALC_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid calculation transition ${from} ? ${to}`);
  }
}

export function assertJobTransition(
  from: PublicationJobStatus,
  to: PublicationJobStatus,
): void {
  if (!JOB_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid publication job transition ${from} ? ${to}`);
  }
}

export function assertRevalTransition(
  from: RevaluationStatus,
  to: RevaluationStatus,
): void {
  if (!REVAL_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid revaluation transition ${from} ? ${to}`);
  }
}

/** Who may edit raw scores at each status (rule 1–4). */
export function canEditDraftMarks(status: MarkEntryStatus): boolean {
  return status === 'draft' || status === 'rejected';
}

export function requiresReview(status: MarkEntryStatus): boolean {
  return status === 'submitted' || status === 'under_review';
}

export function requiresPublicationAuthority(
  status: CalculationStatus,
): boolean {
  return status === 'approved';
}

export function isPublishedImmutable(status: CalculationStatus): boolean {
  return status === 'published';
}

export const MARK_STATE_MACHINE = MARK_TRANSITIONS;
export const CALC_STATE_MACHINE = CALC_TRANSITIONS;
export const JOB_STATE_MACHINE = JOB_TRANSITIONS;
export const REVAL_STATE_MACHINE = REVAL_TRANSITIONS;
