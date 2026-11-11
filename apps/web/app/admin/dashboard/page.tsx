'use client';

import { useEffect, useState } from 'react';
import { PageHeader, UserChip, useConsoleUser } from '../../../components/console-ui';
import { dataConnector, AppState } from '../../../lib/data-connector';
import { api, loadSession } from '../../../lib/api';

type DashboardSummary = {
  students?: { total?: number };
  institutions?: { total?: number };
  campuses?: { total?: number };
  departments?: { total?: number };
  faculty?: { total?: number };
  administrators?: { total?: number };
  pendingReviews?: { total?: number };
};

export default function DashboardPage() {
  const [state, setState] = useState<AppState>(dataConnector.getState());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(true);
  const user = useConsoleUser();

  useEffect(() => {
    const unsub = dataConnector.subscribe(() => setState({ ...dataConnector.getState() }));
    const session = loadSession();
    setDemoMode(!session?.accessToken || !session.tenantId);

    if (!session?.accessToken || !session.tenantId) {
      setLoading(false);
      return () => unsub();
    }

    let active = true;
    void api<DashboardSummary>('/v1/dashboard/summary', { session })
      .then((result) => {
        if (active) {
          setSummary(result);
          setApiError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSummary(null);
          setApiError(error instanceof Error ? error.message : 'Unable to load live dashboard data.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  const sampleCampuses = state.institutions.reduce((total, institution) => total + institution.campusesCount, 0);
  const sampleDepartments = state.institutions[0]?.departmentsCount ?? state.departments.length;
  const unassignedDepartments = state.departments.filter((department) => {
    const admin = department.admin?.trim();
    return !admin || /^(unassigned|—|-|–)$/i.test(admin);
  }).length;

  function metric(value: number | undefined): string {
    return loading ? '…' : value === undefined ? '—' : value.toLocaleString();
  }

  return (
    <section className="dashboard-page">
      <PageHeader title="Dashboard">
        <UserChip name={user.name} role={user.roleLabel} initials={user.initials} />
      </PageHeader>

      {demoMode ? (
        <div className="notice notice-warning" role="status">
          Demo environment — all figures and activity below are sample data. Changes are local to this browser and are not saved to an institution.
        </div>
      ) : null}

      {apiError ? (
        <div className="error" role="alert">
          Live dashboard data could not be loaded: {apiError}. Sample data is deliberately not substituted.
        </div>
      ) : null}

      <div className="metrics-grid">
        <article className="metric-card">
          <span className="metric-icon" aria-hidden="true">◆</span>
          <div className="metric-value">{demoMode ? state.institutions.length : metric(summary?.institutions?.total)}</div>
          <div className="metric-label">Institutions</div>
          {demoMode ? <div className="metric-status warning">Sample data</div> : null}
        </article>

        <article className="metric-card">
          <span className="metric-icon" aria-hidden="true">▦</span>
          <div className="metric-value">{demoMode ? sampleCampuses : metric(summary?.campuses?.total)}</div>
          <div className="metric-label">Campuses</div>
          {demoMode ? <div className="metric-status warning">Sample data</div> : null}
        </article>

        <article className="metric-card">
          <span className="metric-icon" aria-hidden="true">▤</span>
          <div className="metric-value">{demoMode ? sampleDepartments : metric(summary?.departments?.total)}</div>
          <div className="metric-label">Departments</div>
          {demoMode ? <div className="metric-status warning">{unassignedDepartments} unassigned · sample</div> : null}
        </article>

        <article className="metric-card">
          <span className="metric-icon" aria-hidden="true">◎</span>
          <div className="metric-value">{demoMode ? state.totalStudents.toLocaleString() : metric(summary?.students?.total)}</div>
          <div className="metric-label">Students</div>
          {demoMode ? <div className="metric-status warning">Sample data</div> : null}
        </article>
      </div>

      <div className="dashboard-panels">
        <section className="card people-role-card">
          <div className="card-header"><h2 className="card-title">People by role</h2></div>
          <div className="role-metrics">
            <div className="role-tile students"><strong>{demoMode ? state.totalStudents.toLocaleString() : metric(summary?.students?.total)}</strong><span>Students</span></div>
            <div className="role-tile faculty"><strong>{demoMode ? 'Sample' : metric(summary?.faculty?.total)}</strong><span>Faculty</span></div>
            <div className="role-tile admins"><strong>{demoMode ? 'Sample' : metric(summary?.administrators?.total)}</strong><span>Admins</span></div>
            <div className="role-tile review"><strong>{demoMode ? 'Sample' : metric(summary?.pendingReviews?.total)}</strong><span>Pending review</span></div>
          </div>
          {!demoMode ? <p className="muted">A dash means the API does not currently provide that metric. No estimated or hardcoded counts are shown.</p> : null}
        </section>

        <section className="card audit-card">
          <div className="card-header">
            <h2 className="card-title">{demoMode ? 'Sample audit activity' : 'Recent audit activity'}</h2>
          </div>
          {demoMode ? (
            <ul className="audit-activity">
              {state.auditLogs.slice(0, 4).map((log) => (
                <li key={log.id}>
                  <span>{log.label}</span>
                  <span className={`audit-result ${log.status === 'Success' ? 'ok' : log.status === 'Blocked' || log.status === 'Failed' ? 'bad' : 'warn'}`}>{log.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Live audit activity is not connected to this dashboard yet. Open Audit log for the available institutional records.</p>
          )}
        </section>
      </div>

      {demoMode ? (
        <div className="card">
          <div className="card-header"><h2 className="card-title">Demo setup checklist</h2></div>
          <p className="muted">These example tasks are illustrative only. They do not represent outstanding work at a real institution.</p>
          <ul className="audit-activity">
            {state.pendingSetups.map((setup) => <li key={setup.id}><span>{setup.title}</span><span className="audit-result warn">Example</span></li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
