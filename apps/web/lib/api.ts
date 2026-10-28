export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

export type PortalRole = 'teacher' | 'student';

export type Session = {
  accessToken: string;
  refreshToken?: string;
  tenantId: string;
  email: string;
  role: PortalRole;
};

const SESSION_KEY = 'ricozedu.session';
const ROLE_KEY = 'ricozedu.portalRole';

export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function loadPortalRole(): PortalRole {
  if (typeof window === 'undefined') return 'teacher';
  const fromSession = loadSession()?.role;
  if (fromSession === 'teacher' || fromSession === 'student') return fromSession;
  const raw = localStorage.getItem(ROLE_KEY);
  return raw === 'student' ? 'student' : 'teacher';
}

export function savePortalRole(role: PortalRole) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ROLE_KEY, role);
  const session = loadSession();
  if (session) {
    saveSession({ ...session, role });
  }
}

export function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.role) parsed.role = loadPortalRole();
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  localStorage.setItem(ROLE_KEY, s.role);
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function api<T>(
  path: string,
  opts: RequestInit & { session?: Session | null; idempotencyKey?: string } = {},
): Promise<T> {
  const session = opts.session === undefined ? loadSession() : opts.session;
  const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const method = (opts.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  if (!isFormData && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }
  if (session?.tenantId) {
    headers['X-Tenant-Id'] = session.tenantId;
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers['Idempotency-Key'] = opts.idempotencyKey ?? headers['Idempotency-Key'] ?? createIdempotencyKey();
  }
  const { idempotencyKey: _idempotencyKey, ...requestOptions } = opts;
  const res = await fetch(`${apiBase()}${path}`, { ...requestOptions, method, headers });
  if (res.status === 204) {
    return undefined as T;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export type StreamEvent = { event: string; data: unknown };

export async function* apiStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const session = loadSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'Idempotency-Key': createIdempotencyKey(),
  };
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  if (session?.tenantId) headers['X-Tenant-Id'] = session.tenantId;

  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const failure = await res.json().catch(() => ({}));
    throw new Error(failure?.message ?? `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let frame = /\r?\n\r?\n/.exec(buffer);
      while (frame) {
        const block = buffer.slice(0, frame.index);
        buffer = buffer.slice(frame.index + frame[0].length);
        let event = 'message';
        const dataLines: string[] = [];
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length) {
          let data: unknown;
          try {
            data = JSON.parse(dataLines.join('\n'));
          } catch {
            throw new Error('The assistant stream returned an invalid event.');
          }
          yield { event, data };
        }
        frame = /\r?\n\r?\n/.exec(buffer);
      }
    }
  } finally {
    if (signal?.aborted) void reader.cancel().catch(() => undefined);
  }
}
