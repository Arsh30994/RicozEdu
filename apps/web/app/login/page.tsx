'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  loadPortalRole,
  PortalRole,
  savePortalRole,
  saveSession,
} from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [role, setRole] = useState<PortalRole>('teacher');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setRole(loadPortalRole());
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{
        accessToken: string;
        refreshToken?: string;
        user?: { email?: string };
      }>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        session: null,
      });
      savePortalRole(role);
      saveSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        tenantId,
        email: res.user?.email ?? email,
        role,
      });
      setOk(true);
      router.push(role === 'student' ? '/student/progress' : '/admin/curriculum');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Sign in</h1>
          <p>
            Choose Teacher or Student, then sign in. Tenant id is verified
            server-side via membership.
          </p>
        </div>
      </div>

      <form
        className="card"
        style={{ maxWidth: 480 }}
        onSubmit={onSubmit}
        aria-describedby={error ? 'login-error' : undefined}
      >
        <fieldset className="role-fieldset">
          <legend>Sign in as</legend>
          <div className="role-toggle login-role" role="group" aria-label="Role">
            <button
              type="button"
              className={role === 'teacher' ? 'on' : undefined}
              aria-pressed={role === 'teacher'}
              onClick={() => setRole('teacher')}
            >
              Teacher
            </button>
            <button
              type="button"
              className={role === 'student' ? 'on' : undefined}
              aria-pressed={role === 'student'}
              onClick={() => setRole('student')}
            >
              Student
            </button>
          </div>
        </fieldset>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label htmlFor="tenantId">Tenant ID</label>
        <input
          id="tenantId"
          name="tenantId"
          required
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          aria-describedby="tenant-help"
        />
        <p id="tenant-help" className="muted" style={{ marginTop: '0.4rem' }}>
          Resolved server-side via membership. Do not put secrets in the URL.
        </p>
        <div className="actions" style={{ marginTop: '1.1rem' }}>
          <button type="submit">
            Sign in as {role === 'teacher' ? 'Teacher' : 'Student'}
          </button>
        </div>
        {error ? (
          <p id="login-error" className="error" role="alert">
            {error}
          </p>
        ) : null}
        {ok ? (
          <p role="status" style={{ marginTop: '0.85rem' }}>
            <span className="badge ok">Signed in</span> Opening your workspace...
          </p>
        ) : null}
      </form>
    </section>
  );
}
