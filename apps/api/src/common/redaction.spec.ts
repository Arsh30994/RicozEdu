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
});
