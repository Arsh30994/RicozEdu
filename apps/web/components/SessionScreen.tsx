import Link from 'next/link';
import { SessionPager } from './SessionPager';
import { getSession, SESSIONS, sessionPath, type SessionDef } from '../lib/sessions';

const MODULES = [
  {
    href: '/admin/curriculum',
    code: 'CU',
    title: 'Curriculum publish',
    body: 'Simulate eligibility, validate prerequisites, then publish immutable programme versions.',
  },
  {
    href: '/admin/rules',
    code: 'RL',
    title: 'Rule documents',
    body: 'Author declarative progression and exit-award rules as versioned JSON.',
  },
  {
    href: '/student/progress',
    code: 'DG',
    title: 'Degree progress',
    body: 'Explain earned credits, remaining requirements, and exit eligibility in plain language.',
  },
  {
    href: '/login',
    code: 'AU',
    title: 'Sign in',
    body: 'Authenticate against the API; tenant context is verified server-side via membership.',
  },
];

export function SessionScreen({ slug }: { slug: string }) {
  const session = getSession(slug) as SessionDef;

  return (
    <section className="session-screen">
      <SessionPager currentPage={session.page} />

      <div className="page-head">
        <div>
          <p className="stat-label">
            Session {session.page} - {session.label}
          </p>
          <h1>{session.title}</h1>
          <p>{session.body}</p>
          <p className="muted" style={{ marginTop: '0.35rem' }}>
            {session.summary}
          </p>
        </div>
        {(session.cta || session.extraCta) && (
          <div className="actions">
            {session.extraCta ? (
              <Link
                className={
                  session.extraCta.secondary !== false ? 'btn secondary' : 'btn'
                }
                href={session.extraCta.href}
              >
                {session.extraCta.label}
              </Link>
            ) : null}
            {session.cta ? (
              <Link
                className={session.cta.secondary ? 'btn secondary' : 'btn'}
                href={session.cta.href}
              >
                {session.cta.label}
              </Link>
            ) : null}
          </div>
        )}
      </div>

      <article className="card session-hero-card">
        <div className="stat-label">{session.label}</div>
        <div className="stat-value" style={{ fontSize: '1.75rem' }}>
          {session.title}
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          {session.summary}
        </p>
      </article>

      {session.slug === 'modules' ? (
        <div className="grid grid-2" style={{ marginTop: '1rem' }}>
          {MODULES.map((m) => (
            <Link key={m.href} href={m.href} className="card module-tile">
              <div className="tile-icon" aria-hidden>
                {m.code}
              </div>
              <h2 style={{ margin: 0 }}>{m.title}</h2>
              <p>{m.body}</p>
            </Link>
          ))}
        </div>
      ) : null}

      {session.slug === 'welcome' ? (
        <div className="session-index" style={{ marginTop: '1.25rem' }}>
          <h2>All sessions</h2>
          <div className="nav-grid">
            {SESSIONS.map((s) => (
              <Link
                key={s.slug}
                href={sessionPath(s.slug)}
                className={
                  s.slug === session.slug ? 'nav-tile active' : 'nav-tile'
                }
              >
                <span className="nav-tile-code" aria-hidden>
                  {s.page}
                </span>
                <strong>{s.title}</strong>
                <small>{s.label}</small>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
