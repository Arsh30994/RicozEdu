'use client';

import { FormEvent, useMemo, useState } from 'react';
import { api } from '../../../lib/api';

type Progress = {
  earnedCredits: number;
  remainingCredits: number;
  progression: { pass: boolean; explanation: string };
  exitEligibility: Array<{
    code: string;
    name: string;
    eligible: boolean;
    explanation: string;
  }>;
  requiredRemaining: Array<{ courseVersionId: string; category: string }>;
  ruleVersionRefs: Record<string, unknown>;
};

export default function StudentProgressPage() {
  const [studentMembershipId, setStudentMembershipId] = useState('');
  const [programmeEnrolmentId, setProgrammeEnrolmentId] = useState('');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pct = useMemo(() => {
    if (!progress) return 0;
    const total = progress.earnedCredits + progress.remainingCredits;
    if (total <= 0) return 0;
    return Math.min(100, Math.round((progress.earnedCredits / total) * 1000) / 10);
  }, [progress]);

  async function load(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const q = new URLSearchParams({
        studentMembershipId,
        programmeEnrolmentId,
      });
      const res = await api<Progress>(`/v1/academics/progress?${q.toString()}`);
      setProgress(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load progress');
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Degree progress</h1>
          <p>
            Progress uses the curriculum version pinned to the enrolment.
            Explanations are written for humans; published results are never
            silently recalculated.
          </p>
        </div>
      </div>

      <form className="card" onSubmit={load} style={{ marginBottom: '1rem' }}>
        <div className="grid grid-2">
          <div>
            <label htmlFor="sid">Student membership ID</label>
            <input
              id="sid"
              required
              value={studentMembershipId}
              onChange={(e) => setStudentMembershipId(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="eid">Programme enrolment ID</label>
            <input
              id="eid"
              required
              value={programmeEnrolmentId}
              onChange={(e) => setProgrammeEnrolmentId(e.target.value)}
            />
          </div>
        </div>
        <div className="actions" style={{ marginTop: '1.1rem' }}>
          <button type="submit">Show progress</button>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {progress ? (
        <div className="grid grid-2" role="status">
          <div className="card">
            <div className="stat-label">Credit completion</div>
            <div className="stat-value">{pct}%</div>
            <p className="muted" style={{ marginTop: 0 }}>
              Earned {progress.earnedCredits} · remaining{' '}
              {progress.remainingCredits}
            </p>
            <div className="progress-track" aria-hidden>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <p style={{ marginTop: '1rem' }}>{progress.progression.explanation}</p>
            <span
              className={`badge ${progress.progression.pass ? 'ok' : 'warn'}`}
            >
              {progress.progression.pass ? 'On track' : 'Needs attention'}
            </span>
          </div>

          <div className="card">
            <h2>Exit awards</h2>
            <ul className="list">
              {progress.exitEligibility.map((item) => (
                <li key={item.code}>
                  <strong>{item.name}</strong>{' '}
                  <span className={`badge ${item.eligible ? 'ok' : 'warn'}`}>
                    {item.eligible ? 'Eligible' : 'Not eligible'}
                  </span>
                  <div className="muted" style={{ marginTop: '0.35rem' }}>
                    {item.explanation}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <h2>Remaining required courses</h2>
            <ul className="list">
              {progress.requiredRemaining.map((r) => (
                <li key={r.courseVersionId}>
                  {r.courseVersionId}{' '}
                  <span className="badge warn">{r.category}</span>
                </li>
              ))}
            </ul>
            <details className="muted" style={{ marginTop: '0.75rem' }}>
              <summary>Rule version references</summary>
              <pre style={{ overflow: 'auto' }}>
                {JSON.stringify(progress.ruleVersionRefs, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      ) : null}
    </section>
  );
}
