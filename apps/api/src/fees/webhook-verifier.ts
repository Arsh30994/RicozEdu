import { createHmac, timingSafeEqual } from 'crypto';
import { redactForLog } from '../common/redaction';

export type ProviderCode = 'razorpay' | 'payu' | 'cashfree' | 'stripe' | 'manual' | 'offline';

export interface WebhookVerifyInput {
  providerCode: ProviderCode;
  rawBody: string | Buffer;
  signatureHeader: string | undefined;
  webhookSecret: string;
  /** Optional timestamp header for skew checks */
  timestampHeader?: string;
  maxSkewSeconds?: number;
}

export interface WebhookVerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify signed provider webhooks. Never trust unsigned or browser callbacks.
 * Secrets must come from vault/env  never from request body.
 */
export function verifyWebhookSignature(input: WebhookVerifyInput): WebhookVerifyResult {
  if (!input.signatureHeader) {
    return { valid: false, reason: 'missing_signature' };
  }
  if (!input.webhookSecret) {
    return { valid: false, reason: 'missing_secret_config' };
  }

  const maxSkew = input.maxSkewSeconds ?? 300;
  if (input.timestampHeader) {
    const ts = Number(input.timestampHeader);
    if (!Number.isFinite(ts)) {
      return { valid: false, reason: 'invalid_timestamp' };
    }
    const skew = Math.abs(Date.now() / 1000 - ts);
    if (skew > maxSkew) {
      return { valid: false, reason: 'timestamp_skew' };
    }
  }

  const body =
    typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');

  switch (input.providerCode) {
    case 'razorpay': {
      const expected = createHmac('sha256', input.webhookSecret)
        .update(body)
        .digest('hex');
      const provided = normalizeSig(input.signatureHeader);
      if (!safeEqualHex(expected, provided)) {
        return { valid: false, reason: 'signature_mismatch' };
      }
      return { valid: true };
    }
    case 'stripe': {
      // Stripe-Signature: t=<ts>,v1=<hex> signed payload = `${t}.${rawBody}`
      const parts = Object.fromEntries(
        input.signatureHeader.split(',').map((p) => {
          const [k, ...rest] = p.trim().split('=');
          return [k, rest.join('=')];
        }),
      ) as Record<string, string>;
      const ts = parts.t;
      const v1List = input.signatureHeader
        .split(',')
        .filter((p) => p.trim().startsWith('v1='))
        .map((p) => p.trim().slice(3).toLowerCase());
      if (!ts || v1List.length === 0) {
        return { valid: false, reason: 'invalid_stripe_header' };
      }
      const skew = Math.abs(Date.now() / 1000 - Number(ts));
      if (!Number.isFinite(Number(ts)) || skew > (input.maxSkewSeconds ?? 300)) {
        return { valid: false, reason: 'timestamp_skew' };
      }
      const expected = createHmac('sha256', input.webhookSecret)
        .update(`${ts}.${body}`)
        .digest('hex');
      if (!v1List.some((sig) => safeEqualHex(expected, sig))) {
        return { valid: false, reason: 'signature_mismatch' };
      }
      return { valid: true };
    }
    case 'cashfree':
    case 'payu':
      // Vendor-specific schemes differ; fail closed until dedicated modules land.
      return { valid: false, reason: 'provider_verify_unimplemented' };
    case 'manual':
    case 'offline':
      return { valid: false, reason: 'offline_not_via_webhook' };
    default:
      return { valid: false, reason: 'unknown_provider' };
  }
}

function normalizeSig(header: string): string {
  // stripe-style: t=...,v1=hex  or raw hex
  const v1 = header.match(/v1=([a-f0-9]+)/i);
  if (v1) return v1[1]!.toLowerCase();
  return header.trim().toLowerCase().replace(/^sha256=/, '');
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function redactWebhookPayload(payload: unknown): Record<string, unknown> {
  return redactForLog(payload) as Record<string, unknown>;
}

export interface NormalizedProviderEvent {
  providerEventId: string;
  eventType: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  providerTransactionId?: string;
  amountMinor?: number;
  currency?: string;
  status: 'captured' | 'failed' | 'authorized' | 'refunded' | 'unknown';
  occurredAt?: string;
}

/** Capturable events only — never treat unknown/authorized as capture. */
export const CAPTURABLE_EVENTS: ReadonlySet<string> = new Set([
  'payment.captured',
  'payment.capture',
]);

export function isCapturableEvent(
  providerCode: ProviderCode,
  event: NormalizedProviderEvent,
): boolean {
  if (event.status !== 'captured') return false;
  if (providerCode === 'razorpay') {
    return CAPTURABLE_EVENTS.has(event.eventType) || event.eventType.includes('captured');
  }
  return false;
}

/** Best-effort normalize common provider shapes for tests & handler. */
export function normalizeProviderEvent(
  providerCode: ProviderCode,
  payload: Record<string, unknown>,
): NormalizedProviderEvent {
  if (providerCode === 'razorpay') {
    const event = String(payload.event ?? 'unknown');
    const entity =
      ((payload.payload as Record<string, unknown>)?.payment as Record<string, unknown>)
        ?.entity ?? payload;
    const e = entity as Record<string, unknown>;
    return {
      providerEventId: String(payload.id ?? e.id ?? ''),
      eventType: event,
      providerOrderId: e.order_id ? String(e.order_id) : undefined,
      providerPaymentId: e.id ? String(e.id) : undefined,
      providerTransactionId: String(e.id ?? payload.id ?? ''),
      amountMinor: typeof e.amount === 'number' ? e.amount : undefined,
      currency: e.currency ? String(e.currency) : 'INR',
      status: event.includes('captured')
        ? 'captured'
        : event.includes('failed')
          ? 'failed'
          : event.includes('authorized')
            ? 'authorized'
            : event.includes('refund')
              ? 'refunded'
              : 'unknown',
    };
  }

  // Fail closed: unknown provider shapes must not imply capture.
  return {
    providerEventId: String(payload.id ?? payload.event_id ?? ''),
    eventType: String(payload.event ?? payload.type ?? 'unknown'),
    providerTransactionId: String(payload.transaction_id ?? payload.id ?? ''),
    amountMinor: typeof payload.amount === 'number' ? payload.amount : undefined,
    currency: payload.currency ? String(payload.currency) : 'INR',
    status: 'unknown',
  };
}
