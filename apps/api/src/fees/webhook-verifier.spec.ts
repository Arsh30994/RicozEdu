import { createHmac } from 'crypto';
import {
  isCapturableEvent,
  normalizeProviderEvent,
  verifyWebhookSignature,
} from './webhook-verifier';

describe('verifyWebhookSignature', () => {
  const secret = 'whsec_test_secret';

  it('accepts valid razorpay body HMAC', () => {
    const body = '{"event":"payment.captured"}';
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(
      verifyWebhookSignature({
        providerCode: 'razorpay',
        rawBody: body,
        signatureHeader: sig,
        webhookSecret: secret,
      }),
    ).toEqual({ valid: true });
  });

  it('rejects missing signature', () => {
    expect(
      verifyWebhookSignature({
        providerCode: 'razorpay',
        rawBody: '{}',
        signatureHeader: undefined,
        webhookSecret: secret,
      }).reason,
    ).toBe('missing_signature');
  });

  it('verifies Stripe t.rawBody signed payload', () => {
    const body = '{"id":"evt_1"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = createHmac('sha256', secret)
      .update(`${ts}.${body}`)
      .digest('hex');
    expect(
      verifyWebhookSignature({
        providerCode: 'stripe',
        rawBody: body,
        signatureHeader: `t=${ts},v1=${v1}`,
        webhookSecret: secret,
      }),
    ).toEqual({ valid: true });
  });

  it('fail-closes PayU until dedicated verifier exists', () => {
    expect(
      verifyWebhookSignature({
        providerCode: 'payu',
        rawBody: '{}',
        signatureHeader: 'anything',
        webhookSecret: secret,
      }).reason,
    ).toBe('provider_verify_unimplemented');
  });

  it('rejects client/offline as webhook providers', () => {
    expect(
      verifyWebhookSignature({
        providerCode: 'offline',
        rawBody: '{}',
        signatureHeader: 'x',
        webhookSecret: secret,
      }).valid,
    ).toBe(false);
  });
});

describe('isCapturableEvent', () => {
  it('allows razorpay captured only', () => {
    const captured = normalizeProviderEvent('razorpay', {
      id: 'evt',
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', amount: 100, order_id: 'order_1' } } },
    });
    expect(isCapturableEvent('razorpay', captured)).toBe(true);

    const auth = normalizeProviderEvent('razorpay', {
      id: 'evt2',
      event: 'payment.authorized',
      payload: { payment: { entity: { id: 'pay_2', amount: 100 } } },
    });
    expect(isCapturableEvent('razorpay', auth)).toBe(false);
  });

  it('never captures unknown provider normalization', () => {
    const ev = normalizeProviderEvent('stripe', { id: 'x', amount: 1 });
    expect(ev.status).toBe('unknown');
    expect(isCapturableEvent('stripe', ev)).toBe(false);
  });
});
