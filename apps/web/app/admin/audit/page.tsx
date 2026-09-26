'use client';

import { useEffect, useState } from 'react';
import {
  dataConnector,
  AuditActivity,
  AppState,
} from '../../../lib/data-connector';

export default function AuditLogPage() {
  const [state, setState] = useState<AppState>(dataConnector.getState());
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [inspectEvent, setInspectEvent] = useState<AuditActivity | null>(null);

  useEffect(() => {
    const unsub = dataConnector.subscribe(() => {
      setState({ ...dataConnector.getState() });
    });
    return () => unsub();
  }, []);

  const filteredLogs = state.auditLogs.filter((log) => {
    if (filterStatus === 'ALL') return true;
    return log.status === filterStatus;
  });

  return (
    <section>
      {/* Top Header */}
      <div className="view-header">
        <h1>Audit log</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="pill-badge live">Live Ingestion Active</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="search-container">
        <select
          className="search-input-box"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ maxWidth: '240px' }}
        >
          <option value="ALL">All Event Types</option>
          <option value="Success">Success</option>
          <option value="Blocked">Blocked</option>
          <option value="Warning">Warning</option>
          <option value="Failed">Failed</option>
        </select>
        <span style={{ color: 'var(--ink-secondary)', fontSize: '0.9rem' }}>
          Showing {filteredLogs.length} audit entries
        </span>
      </div>

      {/* Audit Events Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Immutable Audit Trail</h2>
        </div>

        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Action / Event</th>
                <th style={{ width: '18%' }}>Status</th>
                <th style={{ width: '22%' }}>Actor</th>
                <th style={{ width: '20%', textAlign: 'right' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
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
                    <td style={{ color: '#ffffff', fontWeight: 400 }}>{log.action}</td>
                    <td>
                      <span className={`pill-badge ${badgeClass}`}>{log.status}</span>
                    </td>
                    <td style={{ color: 'var(--ink-primary)' }}>{log.actor}</td>
                    <td style={{ textAlign: 'right', color: 'var(--ink-secondary)' }}>
                      {log.timeAgo}
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
