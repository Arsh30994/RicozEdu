'use client';

import { FormEvent, useState } from 'react';
import { api } from '../../../lib/api';

type PublishResult = {
  id: string;
  status: string;
  simulation?: {
    affectedCount?: number;
    explanation?: string;
    sample?: Array<{ displayLabel: string; summary: string }>;
  };
  prerequisiteValidation?: { ok: boolean; explanation: string };
};

export default function AdminCurriculumPage() {
  const [programmeVersionId, setProgrammeVersionId] = useState('');
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function publish(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      const res = await api<PublishResult>(
        `/v1/academics/programme-versions/${programmeVersionId}/publish`,
        {
          method: 'POST',
          body: JSON.stringify({ runSimulation: true }),
        },
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    }
  }

  return (
    <section>
      <h1>Admin curriculum</h1>
      <p className="muted">
        Publish a draft programme version. The API validates prerequisite cycles
        and runs an eligibility simulation. Published versions are immutable.
      </p>
      <form className="panel" onSubmit={publish}>
        <label htmlFor="pv">Programme version ID</label>
        <input
          id="pv"
          required
          value={programmeVersionId}
          onChange={(e) => setProgrammeVersionId(e.target.value)}
        />
        <button type="submit">Simulate & publish</button>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      {result ? (
        <div className="panel" role="status">
          <h2>Publish result</h2>
          <p>Status: {result.status}</p>
          <p>{result.prerequisiteValidation?.explanation}</p>
          <p>{result.simulation?.explanation}</p>
          <p>Affected students: {result.simulation?.affectedCount ?? 0}</p>
          <ul className="list">
            {(result.simulation?.sample ?? []).map((s) => (
              <li key={s.displayLabel}>
                <strong>{s.displayLabel}</strong> — {s.summary}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
