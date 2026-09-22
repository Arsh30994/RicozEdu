'use client';

import Link from 'next/link';
import { SESSIONS, sessionPath } from '../lib/sessions';

export function SessionPager({ currentPage }: { currentPage: number }) {
  const total = SESSIONS.length;
  const current = SESSIONS.find((s) => s.page === currentPage) ?? SESSIONS[0]!;
  const prev = SESSIONS.find((s) => s.page === currentPage - 1);
  const next = SESSIONS.find((s) => s.page === currentPage + 1);

  return (
    <nav className="session-pager" aria-label="Session pages">
      <div className="session-pager-meta">
        Page <strong>{current.page}</strong> of <strong>{total}</strong>
        <span className="muted"> - {current.label}</span>
      </div>
      <ol className="session-dots">
        {SESSIONS.map((s) => (
          <li key={s.slug}>
            <Link
              href={sessionPath(s.slug)}
              className={s.page === currentPage ? 'session-dot on' : 'session-dot'}
              aria-current={s.page === currentPage ? 'page' : undefined}
              title={`Page ${s.page}: ${s.title}`}
            >
              {s.page}
            </Link>
          </li>
        ))}
      </ol>
      <div className="session-pager-actions">
        {prev ? (
          <Link className="btn secondary" href={sessionPath(prev.slug)}>
            Previous
          </Link>
        ) : (
          <span className="btn secondary" style={{ opacity: 0.4 }}>
            Previous
          </span>
        )}
        {next ? (
          <Link className="btn" href={sessionPath(next.slug)}>
            Next
          </Link>
        ) : (
          <Link className="btn" href="/login">
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
