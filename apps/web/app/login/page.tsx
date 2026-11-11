'use client';

import { FormEvent, useEffect, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { api, dashboardPathForRole, saveSession, type PortalRole } from '../../lib/api';

const REMEMBER_KEY = 'ricozedu.rememberEmail';

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void; renderButton: (element: HTMLElement, options: Record<string, unknown>) => void } } };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_KEY);
    if (saved) setEmail(saved);
  }, []);


  async function finishLogin(path: string, body: unknown, fallbackEmail: string) {
    const res = await api<{
      accessToken: string;
      refreshToken?: string;
      user?: { id?: string; email?: string; name?: string };
    }>(path, { method: 'POST', body: JSON.stringify(body), session: null });
    const session = {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      userId: res.user?.id,
      tenantId: '',
      email: res.user?.email ?? fallbackEmail,
      role: 'admin' as PortalRole,
    };
    const memberships = await api<Array<{ tenantId: string; status: string; role: string }>>('/v1/me/memberships', { session });
    const activeMembership = memberships.find((item) => item.status === 'active');
    if (!activeMembership) throw new Error('Your account is authenticated but has no active institution access. Contact your institution administrator.');
    session.tenantId = activeMembership.tenantId;
    if (!['owner', 'admin', 'faculty', 'finance', 'guardian', 'student'].includes(activeMembership.role)) {
      throw new Error('Your institution has assigned an unsupported role. Contact your administrator.');
    }
    session.role = activeMembership.role as PortalRole;
    saveSession(session);
    router.push(dashboardPathForRole(session.role));
  }

  function initializeGoogle() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        setGoogleLoading(true);
        setError(null);
        try {
          await finishLogin('/v1/auth/google', { credential }, '');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Google sign-in failed.');
        } finally {
          setGoogleLoading(false);
        }
      },
    });
    const button = document.getElementById('google-signin-button');
    if (button) window.google.accounts.id.renderButton(button, { theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width: 320 });
    setGoogleReady(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (remember) window.localStorage.setItem(REMEMBER_KEY, email.trim());
      else window.localStorage.removeItem(REMEMBER_KEY);
      await finishLogin('/v1/auth/login', { email, password }, email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  function continueToDemo() {
    router.push('/admin/dashboard');
  }

  return (
    <section className="console-login">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initializeGoogle} />
      <form className="console-login-card" onSubmit={onSubmit} aria-describedby={error ? 'login-error' : undefined}>
        <h1>
          Login to the <span>RicozEdu Console</span>
        </h1>
        <label htmlFor="email">Email Address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <label className="console-login-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          Remember me
        </label>
        <button className="btn-primary" type="submit">
          Login
        </button>
        <div className="console-login-google">
          <div id="google-signin-button" />
          {!googleReady && <p>{process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? 'Loading Google sign-in…' : 'Google sign-in will be available after the OAuth client ID is configured.'}</p>}
          {googleLoading && <p>Signing in with Google…</p>}
        </div>
        {error ? (
          <p id="login-error" className="error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="console-login-help">
          Trouble signing in?{' '}
          <button type="button" onClick={continueToDemo}>
            Continue to demo console
          </button>
        </p>
      </form>
    </section>
  );
}
