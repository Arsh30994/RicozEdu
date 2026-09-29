'use client';

import { useEffect, useState } from 'react';
import {
  dataConnector,
  AuditActivity,
  AppState,
} from '../../../lib/data-connector';

export default function AuditLogPage() {
  const [state, setState] = useState<AppState>(dataConnector.getState());
  const [inspectEvent, setInspectEvent] = useState<AuditActivity | null>(null);

  useEffect(() => {
    const unsub = dataConnector.subscribe(() => {
      setState({ ...dataConnector.getState() });
    });
    return () => unsub();
  }, []);

  return (
    <section>
      <div className="view-header">
        <h1>Audit log</h1>
        <span className="pill-badge readonly">Read-only</span>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '16%' }}>Time</th>
                <th style={{ width: '20%' }}>Actor</th>
                <th style={{ width: '24%' }}>Action</th>
                <th style={{ width: '22%' }}>Resource</th>
                <th style={{ width: '18%' }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {state.auditLogs.map((log) => {
                let badgeClass = 'success';
                if (log.status === 'Blocked' || log.status === 'Failed') badgeClass = 'blocked';
                else if (log.status === 'Warning') badgeClass = 'warning';

                return (
                  <tr
                    key={log.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setInspectEvent(log)}
                    title="Click to inspect metadata"
                  >
                    <td>{log.timeAgo}</td>
                    <td>{log.actor}</td>
                    <td>{log.action}</td>
                    <td>{log.resource}</td>
                    <td>
                      <span className={`pill-badge ${badgeClass}`}>{log.result ?? log.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Inspect Audit Event */}
      {inspectEvent && (
        <div className="modal-backdrop" onClick={() => setInspectEvent(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Audit Event Details</h2>
            <p>Cryptographically attested event record.</p>

            <div
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '1.25rem',
                marginBottom: '1.25rem',
                fontSize: '0.9rem',
                lineHeight: '1.6',
              }}
            >
              <div>
                <span style={{ color: 'var(--ink-secondary)' }}>Event ID: </span>
                <span style={{ color: '#ffffff' }}>{inspectEvent.id}</span>
              </div>
              <div>
                <span style={{ color: 'var(--ink-secondary)' }}>Action: </span>
                <span style={{ color: '#ffffff' }}>{inspectEvent.action}</span>
              </div>
              <div>
                <span style={{ color: 'var(--ink-secondary)' }}>Status: </span>
                <span style={{ color: '#ffffff' }}>{inspectEvent.status}</span>
              </div>
              <div>
                <span style={{ color: 'var(--ink-secondary)' }}>Actor: </span>
                <span style={{ color: '#ffffff' }}>{inspectEvent.actor}</span>
              </div>
              <div>
                <span style={{ color: 'var(--ink-secondary)' }}>Timestamp: </span>
                <span style={{ color: '#ffffff' }}>{inspectEvent.timestamp}</span>
              </div>
              {inspectEvent.resource && (
                <div>
                  <span style={{ color: 'var(--ink-secondary)' }}>Resource Target: </span>
                  <span style={{ color: '#ffffff' }}>{inspectEvent.resource}</span>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setInspectEvent(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
