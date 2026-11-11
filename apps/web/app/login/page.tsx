'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, saveSession } from '../../lib/api';

const REMEMBER_KEY = 'ricozedu.rememberEmail';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_KEY);
    if (saved) setEmail(saved);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const res = await api<{
        accessToken: string;
        refreshToken?: string;
        user?: { email?: string; name?: string };
      }>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        session: null,
      });
      if (remember) window.localStorage.setItem(REMEMBER_KEY, email);
      else window.localStorage.removeItem(REMEMBER_KEY);
      const session = {
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        tenantId: '',
        email: res.user?.email ?? email,
        role: 'teacher' as const,
      };
      const memberships = await api<Array<{ tenantId: string; status: string; role: string }>>('/v1/me/memberships', {
        session,
      });
      const activeMembership = memberships.find((item) => item.status === 'active');
      if (!activeMembership) {
        throw new Error('Your account is authenticated but has no active institution access. Contact your institution administrator.');
      }
      session.tenantId = activeMembership.tenantId;
      session.role = activeMembership.role === 'student' ? 'student' : 'teacher';
      saveSession(session);
      router.push('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
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
          minLength={8}
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
