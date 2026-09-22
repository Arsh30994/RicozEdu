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
  opts: RequestInit & { session?: Session | null } = {},
): Promise<T> {
  const session = opts.session === undefined ? loadSession() : opts.session;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }
  if (session?.tenantId) {
    headers['X-Tenant-Id'] = session.tenantId;
  }
  const res = await fetch(`${apiBase()}${path}`, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}
