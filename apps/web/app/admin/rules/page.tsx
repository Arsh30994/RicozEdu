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

  function onValidate(e: FormEvent) {
    e.preventDefault();
    try {
      const parsed = JSON.parse(json);
      if (parsed.version !== '1') throw new Error('version must be "1"');
      setMessage('Rule document JSON is well-formed. Persist via programme version APIs.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Invalid JSON');
    }
  }

  return (
    <section>
      <h1>Admin rules</h1>
      <p className="muted">
        Declarative rule documents drive progression and exit awards. They are
        not hardcoded conditionals.
      </p>
      <form className="panel" onSubmit={onValidate}>
        <label htmlFor="rules">Rule document</label>
        <textarea
          id="rules"
          rows={16}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          spellCheck={false}
        />
        <button type="submit">Validate JSON</button>
        {message ? <p role="status">{message}</p> : null}
      </form>
    </section>
  );
}
