'use client';

import { FormEvent, useState } from 'react';
import { api } from '../../../lib/api';

type Progress = {
  earnedCredits: number;
  remainingCredits: number;
  progression: { pass: boolean; explanation: string };
  exitEligibility: Array<{ code: string; name: string; eligible: boolean; explanation: string }>;
  requiredRemaining: Array<{ courseVersionId: string; category: string }>;
  ruleVersionRefs: Record<string, unknown>;
};

export default function StudentProgressPage() {
  const [studentMembershipId, setStudentMembershipId] = useState('');
  const [programmeEnrolmentId, setProgrammeEnrolmentId] = useState('');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <h1>Student progress</h1>
      <p className="muted">
        Degree progress uses the curriculum version pinned to your enrolment.
        Explanations are written for humans; published results are never silently
        recalculated.
      </p>
      <form className="panel" onSubmit={load}>
        <label htmlFor="sid">Student membership ID</label>
        <input
          id="sid"
          required
          value={studentMembershipId}
          onChange={(e) => setStudentMembershipId(e.target.value)}
        />
        <label htmlFor="eid">Programme enrolment ID</label>
        <input
          id="eid"
          required
          value={programmeEnrolmentId}
          onChange={(e) => setProgrammeEnrolmentId(e.target.value)}
        />
        <button type="submit">Show progress</button>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      {progress ? (
        <div className="panel" role="status">
          <h2>Results</h2>
          <p>
            Earned {progress.earnedCredits} credits; {progress.remainingCredits}{' '}
            remaining toward programme total.
          </p>
          <p>{progress.progression.explanation}</p>
          <h3>Exit awards</h3>
          <ul className="list">
            {progress.exitEligibility.map((e) => (
              <li key={e.code}>
                <strong>{e.name}</strong> — {e.eligible ? 'Eligible' : 'Not eligible'}.{' '}
                {e.explanation}
              </li>
            ))}
          </ul>
          <h3>Remaining required courses</h3>
          <ul className="list">
            {progress.requiredRemaining.map((r) => (
              <li key={r.courseVersionId}>
                {r.courseVersionId} ({r.category})
              </li>
            ))}
          </ul>
          <p className="muted">
            Rule refs: {JSON.stringify(progress.ruleVersionRefs)}
          </p>
        </div>
      ) : null}
    </section>
  );
}
