import { redactForLog, redactString } from './redaction';

describe('redaction', () => {
  it('redacts sensitive object keys', () => {
    const out = redactForLog({
      email: 'a@b.com',
      password: 'supersecret',
      nested: { refreshToken: 'abc', ok: 1 },
    }) as Record<string, unknown>;
    expect(out.email).toBe('a@b.com');
    expect(out.password).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).refreshToken).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
  });

  it('redacts bearer tokens in strings', () => {
    expect(redactString('Authorization: Bearer abc.def.ghi')).toContain('[REDACTED]');
  });

  it('redacts ciphertext and vault refs', () => {
    const out = redactForLog({
      token_ciphertext: Buffer.from('x'),
      token_dek_wrapped: 'wrap',
      credential_ref: 'vault/path',
      oauth_token_ref: 'kms:1',
      ok: true,
    }) as Record<string, unknown>;
    expect(out.token_ciphertext).toBe('[REDACTED]');
    expect(out.token_dek_wrapped).toBe('[REDACTED]');
    expect(out.credential_ref).toBe('[REDACTED]');
    expect(out.oauth_token_ref).toBe('[REDACTED]');
    expect(out.ok).toBe(true);
  });
});
