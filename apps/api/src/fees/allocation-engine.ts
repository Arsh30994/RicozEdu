/**
 * Deterministic fee allocation: partial payments, overpayments, no double-allocate.
 */

export interface OpenCharge {
  id: string;
  amountMinor: number;
  allocatedMinor: number;
  dueDate?: string | null;
  installmentSeq?: number | null;
}

export interface AllocationPlanItem {
  feeChargeId: string;
  amountMinor: number;
  allocationKey: string;
}

export interface AllocationPlan {
  items: AllocationPlanItem[];
  allocatedTotal: number;
  overpaymentMinor: number;
  remainingIntentMinor: number;
}

export function remainingOnCharge(c: OpenCharge): number {
  return Math.max(0, c.amountMinor - c.allocatedMinor);
}

/**
 * Allocate payment amount FIFO by due_date then installment_seq then id.
 * Idempotent keys: `${paymentIntentId}:${feeChargeId}`.
 */
export function planAllocation(input: {
  paymentIntentId: string;
  studentFeeAccountId: string;
  amountMinor: number;
  charges: Array<OpenCharge & { studentFeeAccountId: string }>;
}): AllocationPlan {
  if (input.amountMinor <= 0) {
    throw new Error('amountMinor must be > 0');
  }
  const owned = input.charges.filter(
    (c) => c.studentFeeAccountId === input.studentFeeAccountId,
  );
  if (owned.length !== input.charges.length) {
    throw new Error('ALLOCATION_ACCOUNT_MISMATCH');
  }
  const sorted = [...owned].sort((a, b) => {
    const da = a.dueDate ?? '9999-12-31';
    const db = b.dueDate ?? '9999-12-31';
    if (da !== db) return da.localeCompare(db);
    const sa = a.installmentSeq ?? 9999;
    const sb = b.installmentSeq ?? 9999;
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });

  let left = input.amountMinor;
  const items: AllocationPlanItem[] = [];
  for (const c of sorted) {
    if (left <= 0) break;
    const rem = remainingOnCharge(c);
    if (rem <= 0) continue;
    const take = Math.min(rem, left);
    items.push({
      feeChargeId: c.id,
      amountMinor: take,
      allocationKey: `${input.paymentIntentId}:${c.id}`,
    });
    left -= take;
  }

  const allocatedTotal = input.amountMinor - left;
  return {
    items,
    allocatedTotal,
    overpaymentMinor: left,
    remainingIntentMinor: left,
  };
}

export interface LateFeeRule {
  graceDays: number;
  type: 'flat' | 'percent_per_day';
  amountMinor?: number;
  percent?: number;
  maxMinor?: number;
}

export function computeLateFee(input: {
  principalMinor: number;
  dueDate: string;
  asOfDate: string;
  rule: LateFeeRule;
}): number {
  const due = Date.parse(input.dueDate);
  const asOf = Date.parse(input.asOfDate);
  if (Number.isNaN(due) || Number.isNaN(asOf) || asOf <= due) return 0;
  const daysLate = Math.floor((asOf - due) / 86_400_000);
  const chargeable = Math.max(0, daysLate - input.rule.graceDays);
  if (chargeable <= 0) return 0;

  let fee = 0;
  if (input.rule.type === 'flat') {
    fee = input.rule.amountMinor ?? 0;
  } else {
    const pct = input.rule.percent ?? 0;
    fee = Math.round(input.principalMinor * (pct / 100) * chargeable);
  }
  if (input.rule.maxMinor != null) fee = Math.min(fee, input.rule.maxMinor);
  return Math.max(0, fee);
}
