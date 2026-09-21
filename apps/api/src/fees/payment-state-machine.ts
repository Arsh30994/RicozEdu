/**
 * Payment intent & related state machines (student fees domain).
 * Browser success is never a terminal capture transition ù only verified
 * provider webhook / reconciliation may move ? captured.
 */

export type PaymentIntentStatus =
  | 'created'
  | 'pending_provider'
  | 'requires_action'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type RefundStatus =
  | 'requested'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type FeeAdjustmentStatus =
  | 'requested'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'cancelled';

export type WebhookInboxStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'ignored'
  | 'failed';

const PAYMENT_TRANSITIONS: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
  created: ['pending_provider', 'cancelled', 'expired'],
  pending_provider: ['requires_action', 'authorized', 'captured', 'failed', 'expired', 'cancelled'],
  requires_action: ['authorized', 'captured', 'failed', 'expired', 'cancelled'],
  authorized: ['captured', 'failed', 'cancelled'],
  captured: [], // refunds are separate aggregate
  failed: [],
  expired: [],
  cancelled: [],
};

const REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  requested: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['processing', 'cancelled'],
  rejected: [],
  processing: ['succeeded', 'failed'],
  succeeded: [],
  failed: ['processing'], // retry after human review
  cancelled: [],
};

const ADJUSTMENT_TRANSITIONS: Record<FeeAdjustmentStatus, FeeAdjustmentStatus[]> = {
  requested: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['applied', 'cancelled'],
  rejected: [],
  applied: [],
  cancelled: [],
};

export function assertPaymentTransition(
  from: PaymentIntentStatus,
  to: PaymentIntentStatus,
): void {
  if (!PAYMENT_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid payment_intent transition ${from} ? ${to}`);
  }
}

export function assertRefundTransition(from: RefundStatus, to: RefundStatus): void {
  if (!REFUND_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid refund transition ${from} ? ${to}`);
  }
}

export function assertAdjustmentTransition(
  from: FeeAdjustmentStatus,
  to: FeeAdjustmentStatus,
): void {
  if (!ADJUSTMENT_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid fee_adjustment transition ${from} ? ${to}`);
  }
}

/** Capture may only come from verified provider signal ù not client callback. */
export function isTrustedCaptureSource(
  source: 'client_callback' | 'webhook' | 'reconciliation' | 'manual_offline',
): boolean {
  return source === 'webhook' || source === 'reconciliation' || source === 'manual_offline';
}

/**
 * Approval gate helpers ó NOT a substitute for permission guards.
 * Callers MUST:
 * - Derive `actorIsHuman` from server auth context (never client body).
 * - Enforce FINANCE_REFUND_APPROVE / FINANCE_CONCESSION_APPROVE via @RequirePermissions.
 * - Use @SensitiveAuthz() on approve routes.
 * AI drafts (`suggestionSource === 'ai_draft'`) require a second human approver.
 */
export function canApproveAdjustment(input: {
  actorIsHuman: boolean;
  suggestionSource?: string | null;
  hasConcessionApprovePermission: boolean;
  secondHumanApprover?: boolean;
}): boolean {
  if (!input.actorIsHuman || !input.hasConcessionApprovePermission) return false;
  if (input.suggestionSource === 'ai_draft' && !input.secondHumanApprover) {
    return false;
  }
  return true;
}

export function canApproveRefund(input: {
  actorIsHuman: boolean;
  hasRefundApprovePermission: boolean;
  suggestionSource?: string | null;
  secondHumanApprover?: boolean;
}): boolean {
  if (!input.actorIsHuman || !input.hasRefundApprovePermission) return false;
  if (input.suggestionSource === 'ai_draft' && !input.secondHumanApprover) {
    return false;
  }
  return true;
}

export const PAYMENT_STATE_MACHINE = PAYMENT_TRANSITIONS;
export const REFUND_STATE_MACHINE = REFUND_TRANSITIONS;
export const ADJUSTMENT_STATE_MACHINE = ADJUSTMENT_TRANSITIONS;
