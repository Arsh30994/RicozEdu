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
      <h1>Login</h1>
      <form className="panel" onSubmit={onSubmit} aria-describedby={error ? 'login-error' : undefined}>
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
        <p id="tenant-help" className="muted">
          Resolved server-side via membership. Do not put secrets in the URL.
        </p>
        <button type="submit">Sign in</button>
        {error ? (
          <p id="login-error" className="error" role="alert">
            {error}
          </p>
        ) : null}
        {ok ? <p role="status">Signed in. Continue to Admin or Student pages.</p> : null}
      </form>
    </section>
  );
}
