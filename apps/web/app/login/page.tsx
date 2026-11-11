'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, apiBase, savePortalRole, saveSession } from '../../lib/api';

const REMEMBER_KEY = 'ricozedu.rememberEmail';

type AuthenticationResponse = {
  accessToken: string;
  refreshToken?: string;
  user?: { email?: string };
};

function readableAuthenticationError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Login failed.';
  return /failed to fetch|networkerror|load failed/i.test(message)
    ? 'The RicozEdu authentication service is unavailable. Start the API and MongoDB, then try again.'
    : message;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('priya.nair@gtbit.edu');
  const [password, setPassword] = useState('demo-access12');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const hasHandledGoogleCode = useRef(false);

  async function completeLogin(res: AuthenticationResponse, fallbackEmail: string) {
    if (remember) window.localStorage.setItem(REMEMBER_KEY, fallbackEmail);
    else window.localStorage.removeItem(REMEMBER_KEY);
    savePortalRole('teacher');
    const session = {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      tenantId: '',
      email: res.user?.email ?? fallbackEmail,
      role: 'teacher' as const,
    };
    const memberships = await api<Array<{ tenantId: string; status: string }>>('/v1/me/memberships', { session });
    const workspace = memberships.find((item) => item.status === 'active') ?? memberships[0];
    if (!workspace?.tenantId) {
      throw new Error('Your account is authenticated, but it is not assigned to an active workspace. Contact your institution administrator.');
    }
    session.tenantId = workspace.tenantId;
    saveSession(session);
    router.push('/admin/dashboard');
  }

  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_KEY);
    if (saved) setEmail(saved);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleError = params.get('auth_error');
    const googleCode = params.get('google_oauth_code');
    if (googleError) {
      setError(googleError);
      window.history.replaceState({}, '', '/login');
      return;
    }
    if (!googleCode || hasHandledGoogleCode.current) return;
    hasHandledGoogleCode.current = true;
    window.history.replaceState({}, '', '/login');
    setGoogleLoading(true);
    void api<AuthenticationResponse>('/v1/auth/google/exchange', {
      method: 'POST',
      body: JSON.stringify({ code: googleCode }),
      session: null,
    })
      .then((response) => completeLogin(response, email))
      .catch((exchangeError: unknown) => setError(readableAuthenticationError(exchangeError)))
      .finally(() => setGoogleLoading(false));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const res = await api<AuthenticationResponse>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        session: null,
      });
      await completeLogin(res, email);
    } catch (err) {
      setError(readableAuthenticationError(err));
    }
  }

  function continueWithGoogle() {
    window.location.assign(`${apiBase()}/v1/auth/google`);
  }

  function continueToDemo() {
    router.push('/admin/dashboard');
  }

  return (
    <section className="console-login">
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
          required
          minLength={8}
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
        <button className="btn-secondary google-login" type="button" onClick={continueWithGoogle} disabled={googleLoading}>
          {googleLoading ? 'Completing Google sign-in…' : 'Continue with Google'}
        </button>
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
