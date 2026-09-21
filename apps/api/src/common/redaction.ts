const SENSITIVE_KEYS = new Set([
  'password',
  'adminpassword',
  'passwordhash',
  'refreshtoken',
  'token',
  'authorization',
  'secret',
  'accesstoken',
]);

export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[Truncated]';
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redactForLog(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase().replace(/[_-]/g, ''))) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactForLog(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export function redactString(input: string): string {
  return input
    .replace(/("password"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
}
