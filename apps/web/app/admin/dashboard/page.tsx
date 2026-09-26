'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { dataConnector, AppState } from '../../../lib/data-connector';

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<AppState>(dataConnector.getState());
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [timezone, setTimezone] = useState('Asia/Kolkata (IST, UTC+05:30)');

  useEffect(() => {
    const unsub = dataConnector.subscribe(() => {
      setState({ ...dataConnector.getState() });
    });
    return () => unsub();
  }, []);

  const totalCampuses = state.institutions.reduce((acc, i) => acc + i.campusesCount, 0);
  const totalDepartments = state.departments.length;
  const totalStudentsFormatted = state.totalStudents.toLocaleString();

  function handleSetupClick(actionType: string) {
    if (actionType === 'assign_admin') {
      router.push('/admin/institutions');
    } else if (actionType === 'review_duplicate') {
      router.push('/admin/people');
    } else if (actionType === 'confirm_timezone') {
      setShowTimezoneModal(true);
    }
  }

  function handleConfirmTimezone() {
    dataConnector.completePendingSetup('set-3');
    dataConnector.addAudit(`Campus timezone confirmed: ${timezone}`, 'Success', 'Priya Nair');
    setShowTimezoneModal(false);
  }

  return (
    <section>
      {/* Top Page Header */}
      <div className="view-header">
        <h1>Dashboard</h1>
        <div className="campus-pill">
          <span>{state.selectedCampus}</span>
        </div>
      </div>

      {/* 2x2 Metric Cards Grid */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{state.institutions.length}</div>
          <div className="metric-label">Institutions</div>
        </div>

        <div className="metric-card">
          <div className="metric-value">{totalCampuses}</div>
          <div className="metric-label">Campuses</div>
        </div>

        <div className="metric-card">
          <div className="metric-value">{totalDepartments}</div>
          <div className="metric-label">Departments</div>
        </div>

        <div className="metric-card">
          <div className="metric-value">{totalStudentsFormatted}</div>
          <div className="metric-label">Students</div>
        </div>
      </div>

      {/* Recent Audit Activity */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Recent audit activity</h2>
          <span className="pill-badge live">Live</span>
        </div>

        <div className="table-wrapper">
          <table className="custom-table">
            <tbody>
              {state.auditLogs.slice(0, 5).map((log) => (
                <tr key={log.id}>
                  <td style={{ width: '55%', fontWeight: 400 }}>{log.action}</td>
                  <td style={{ width: '25%' }}>
                    <span
                      className={`pill-badge ${
                        log.status === 'Success'
                          ? 'success'
                          : log.status === 'Blocked' || log.status === 'Failed'
                          ? 'blocked'
                          : 'warning'
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td style={{ width: '20%', textAlign: 'right', color: 'var(--ink-secondary)' }}>
                    {log.timeAgo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Setup */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Pending setup</h2>
        </div>

        <div className="timeline-list">
          {state.pendingSetups.map((setup) => (
            <div
              key={setup.id}
              className="timeline-item"
              style={{ cursor: 'pointer' }}
              onClick={() => handleSetupClick(setup.actionType)}
              title="Click to resolve task"
            >
              <div className="bullet-dot" />
              <div className="timeline-content">
                <div className="timeline-title">{setup.title}</div>
                <div className="timeline-subtitle">{setup.subtitle}</div>
              </div>
            </div>
          ))}
          {state.pendingSetups.length === 0 && (
            <div style={{ color: 'var(--ink-secondary)', fontSize: '0.9rem', padding: '0.5rem 0' }}>
              ✓ All setup tasks have been completed.
            </div>
          )}
        </div>
      </div>

      {/* Timezone Confirmation Modal */}
      {showTimezoneModal && (
        <div className="modal-backdrop" onClick={() => setShowTimezoneModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm campus 2 timezone</h2>
            <p>Set and confirm the operational timezone for academic calendar and scheduled classes.</p>

            <div className="form-group">
              <label htmlFor="tz-select">Timezone</label>
              <select
                id="tz-select"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                <option value="Asia/Kolkata (IST, UTC+05:30)">Asia/Kolkata (IST, UTC+05:30)</option>
                <option value="UTC (UTC+00:00)">UTC (UTC+00:00)</option>
                <option value="America/New_York (EST, UTC-05:00)">America/New_York (EST, UTC-05:00)</option>
                <option value="Europe/London (GMT, UTC+00:00)">Europe/London (GMT, UTC+00:00)</option>
                <option value="Asia/Dubai (GST, UTC+04:00)">Asia/Dubai (GST, UTC+04:00)</option>
                <option value="Asia/Singapore (SGT, UTC+08:00)">Asia/Singapore (SGT, UTC+08:00)</option>
              </select>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowTimezoneModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmTimezone}
              >
                Confirm Timezone
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
