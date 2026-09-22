'use client';

import { FormEvent, useState } from 'react';
import { api, saveSession } from '../../lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{
        accessToken: string;
        user?: { email?: string };
      }>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        session: null,
      });
      saveSession({
        accessToken: res.accessToken,
        tenantId,
        email: res.user?.email ?? email,
      });
      setOk(true);
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
            Use your API credentials. Tenant id is sent as a header and checked
            against membership — never trusted from the request body alone.
          </p>
        </div>
      </div>

      <form
        className="card"
        style={{ maxWidth: 480 }}
        onSubmit={onSubmit}
        aria-describedby={error ? 'login-error' : undefined}
      >
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
          <button type="submit">Sign in</button>
        </div>
        {error ? (
          <p id="login-error" className="error" role="alert">
            {error}
          </p>
        ) : null}
        {ok ? (
          <p role="status" style={{ marginTop: '0.85rem' }}>
            <span className="badge ok">Signed in</span>{' '}
            Continue to Curriculum or Degree progress.
          </p>
        ) : null}
      </form>
    </section>
  );
}
