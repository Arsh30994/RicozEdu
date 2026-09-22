import Link from 'next/link';

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

export default function HomePage() {
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Institution overview</h1>
          <p>
            Warm, calm workspace for curriculum, rules, and student progress.
            Live modules below; finance, exams, and attendance appear when those
            APIs ship.
          </p>
        </div>
        <div className="actions">
          <Link className="btn secondary" href="/admin/curriculum">
            Open curriculum
          </Link>
          <Link className="btn" href="/login">
            Sign in
          </Link>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <div className="stat-label">Active surface</div>
          <div className="stat-value" style={{ fontSize: '1.35rem' }}>
            Academics
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            Curriculum · rules · progress
          </p>
        </div>
        <div className="card">
          <div className="stat-label">Tenancy</div>
          <div className="stat-value" style={{ fontSize: '1.35rem' }}>
            RLS forced
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            Tenant context set per transaction
          </p>
        </div>
        <div className="card">
          <div className="stat-label">Publish model</div>
          <div className="stat-value" style={{ fontSize: '1.35rem' }}>
            Immutable
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            Corrections via new versions only
          </p>
        </div>
        <div className="card">
          <div className="stat-label">Auth</div>
          <div className="stat-value" style={{ fontSize: '1.35rem' }}>
            Membership
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            X-Tenant-Id verified server-side
          </p>
        </div>
      </div>

      <div className="grid grid-2">
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
    </section>
  );
}
