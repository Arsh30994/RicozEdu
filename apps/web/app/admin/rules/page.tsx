'use client';

import { FormEvent, useState } from 'react';

const SAMPLE = `{
  "version": "1",
  "all": [
    { "type": "credit_total", "min": 120 },
    { "type": "group_credits", "courseGroupId": "00000000-0000-0000-0000-000000000001", "minCredits": 12 }
  ]
}`;

export default function AdminRulesPage() {
  const [json, setJson] = useState(SAMPLE);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  function onValidate(e: FormEvent) {
    e.preventDefault();
    try {
      const parsed = JSON.parse(json);
      if (parsed.version !== '1') throw new Error('version must be "1"');
      setOk(true);
      setMessage(
        'Rule document JSON is well-formed. Persist via programme version APIs.',
      );
    } catch (err) {
      setOk(false);
      setMessage(err instanceof Error ? err.message : 'Invalid JSON');
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Rule documents</h1>
          <p>
            Declarative rule documents drive progression and exit awards. They
            are not hardcoded conditionals.
          </p>
        </div>
      </div>

      <form className="card" onSubmit={onValidate}>
        <label htmlFor="rules">Rule document</label>
        <textarea
          id="rules"
          rows={16}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          spellCheck={false}
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        />
        <div className="actions" style={{ marginTop: '1.1rem' }}>
          <button type="submit">Validate JSON</button>
        </div>
        {message ? (
          <p role="status" style={{ marginTop: '0.85rem' }}>
            {ok != null ? (
              <span className={`badge ${ok ? 'ok' : 'bad'}`}>
                {ok ? 'Valid' : 'Invalid'}
              </span>
            ) : null}{' '}
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
