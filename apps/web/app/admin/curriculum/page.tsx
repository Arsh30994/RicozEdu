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
      <div className="page-head">
        <div>
          <h1>Curriculum publish</h1>
          <p>
            Publish a draft programme version. The API validates prerequisite
            cycles and runs an eligibility simulation. Published versions are
            immutable.
          </p>
        </div>
      </div>

      <div className="grid grid-2">
        <form className="card" onSubmit={publish}>
          <h2>Simulate and publish</h2>
          <label htmlFor="pv">Programme version ID</label>
          <input
            id="pv"
            required
            value={programmeVersionId}
            onChange={(e) => setProgrammeVersionId(e.target.value)}
          />
          <div className="actions" style={{ marginTop: '1.1rem' }}>
            <button type="submit">Simulate and publish</button>
          </div>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <div className="card flat">
          <h2>Guardrails</h2>
          <ul className="list">
            <li>Prerequisite graph must be acyclic before publish.</li>
            <li>Simulation samples affected students with human explanations.</li>
            <li>Published curriculum fields cannot be silently overwritten.</li>
          </ul>
        </div>
      </div>

      {result ? (
        <div className="card" style={{ marginTop: '1rem' }} role="status">
          <div className="page-head" style={{ marginBottom: '0.5rem' }}>
            <h2 style={{ margin: 0 }}>Publish result</h2>
            <span className={`badge ${result.status === 'published' ? 'ok' : 'warn'}`}>
              {result.status}
            </span>
          </div>
          <p className="muted">{result.prerequisiteValidation?.explanation}</p>
          <p>{result.simulation?.explanation}</p>
          <p>
            Affected students:{' '}
            <strong>{result.simulation?.affectedCount ?? 0}</strong>
          </p>
          <ul className="list">
            {(result.simulation?.sample ?? []).map((s) => (
              <li key={s.displayLabel}>
                <strong>{s.displayLabel}</strong>
                {' — '}
                {s.summary}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
