const SENSITIVE_KEYS = new Set([
  'password',
  'adminpassword',
  'passwordhash',
  'refreshtoken',
  'token',
  'authorization',
  'secret',
  'accesstoken',
  'webhooksecret',
  'webhooksecretref',
  'apikey',
  'apikeyref',
  'cardnumber',
  'cvv',
  'upi',
  'upipin',
  'pan',
  'apaar',
  'apaarid',
  'devicetoken',
  'apnstoken',
  'fcmtoken',
  'pushtoken',
  'tokenciphertext',
  'tokendekwrapped',
  'credentialref',
  'oauthtokenref',
  'refreshtokenref',
]);

function isSensitiveKey(raw: string): boolean {
  const k = raw.toLowerCase().replace(/[_-]/g, '');
  if (SENSITIVE_KEYS.has(k)) return true;
  if (k.includes('ciphertext') || k.includes('dekwrapped') || k.endsWith('dek')) {
    return true;
  }
  if (k.endsWith('ref') && (k.includes('token') || k.includes('secret') || k.includes('credential') || k.includes('oauth'))) {
    return true;
  }
  if (k.includes('tokencipher') || k.includes('webhooksecret')) return true;
  return false;
}

export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[Truncated]';
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redactForLog(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
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
