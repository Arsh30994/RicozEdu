'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, StatusPill, UserChip, displayRole, useConsoleUser } from '../../../components/console-ui';
import { dataConnector, AppState, AuditActivity } from '../../../lib/data-connector';

function activityLine(log: AuditActivity, state: AppState): string {
  if (log.action === 'role.assign') {
    const handle = log.resource?.replace(/^user:/, '');
    const user = handle
      ? state.userRoles.find((item) => item.email.split('@')[0] === handle)
      : undefined;
    return user ? `Role assigned — ${displayRole(user.role)}` : 'Role assigned';
  }
  if (log.action === 'student.status_change') {
    const studentNo = log.resource?.replace(/^student:/, '');
    const student = state.students.find((item) => item.studentNo === studentNo);
    return student ? `Student status → ${student.status}` : 'Student status change';
  }
  if (log.action === 'tenant.read') return 'Cross-tenant read attempt';
  if (log.action === 'department.create') {
    const code = log.resource?.replace(/^dept:/, '');
    return code ? `Department created — ${code.toUpperCase()}` : 'Department created';
  }
  return log.action;
}

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<AppState>(dataConnector.getState());
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [timezone, setTimezone] = useState('Asia/Kolkata (IST, UTC+05:30)');
  const [search, setSearch] = useState('');
  const user = useConsoleUser();

  useEffect(() => {
    const unsub = dataConnector.subscribe(() => {
      setState({ ...dataConnector.getState() });
    });
    return () => unsub();
  }, []);

  const totalCampuses = state.institutions.reduce((acc, i) => acc + i.campusesCount, 0);
  const totalDepartments = state.institutions.reduce((acc, inst) => acc + inst.departmentsCount, 0);
  const institutionName = state.institutions[0]?.name ?? 'GTBIT Delhi';
  const totalStudentsFormatted = state.totalStudents.toLocaleString();
  const facultyCount = state.people.filter((person) => person.relation === 'Faculty').length;
  const adminCount = state.userRoles.filter((user) => user.role.toLocaleLowerCase().includes('admin')).length;
  const pendingReviewCount = state.duplicates.filter((duplicate) => duplicate.status === 'flagged').length;
  const activeStudents = state.students.filter((student) => student.status === 'Active').length;
  const unassignedDepartments = state.departments.filter((department) => {
    const admin = department.admin?.trim();
    return !admin || /^(unassigned|—|-|–)$/i.test(admin);
  }).length;

  function handleSetupClick(actionType: string) {
    if (actionType === 'assign_admin') {
      router.push('/admin/institutions');
    } else if (actionType === 'review_duplicate') {
      router.push('/admin/people');
    } else if (actionType === 'confirm_timezone') {
      setShowTimezoneModal(true);
    }
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    router.push(`/admin/people?q=${encodeURIComponent(query)}`);
  }

  function handleConfirmTimezone() {
    dataConnector.completePendingSetup('set-3');
    dataConnector.addAudit(`Campus timezone confirmed: ${timezone}`, 'Success', 'Priya Nair');
    setShowTimezoneModal(false);
  }

  return (
    <section className="dashboard-page">
      <PageHeader title="Dashboard">
        <span className="institution-badge">{institutionName}</span>
        <form className="topbar-search" onSubmit={handleSearch}>
          <input
            type="search"
            aria-label="Search"
            placeholder="Search..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </form>
        <UserChip name={user.name} role={user.roleLabel} initials={user.initials} />
      </PageHeader>

      <div className="metrics-grid">
        <article className="metric-card">
          <span className="metric-icon" aria-hidden="true">◆</span>
          <div className="metric-value">{state.institutions.length}</div>
          <div className="metric-label">Institutions</div>
        </article>

        <article className="metric-card">
          <span className="metric-icon" aria-hidden="true">▦</span>
          <div className="metric-value">{totalCampuses}</div>
          <div className="metric-label">Campuses</div>
          <div className="metric-status positive">All active</div>
        </article>

        <article className="metric-card">
          <span className="metric-icon" aria-hidden="true">▤</span>
          <div className="metric-value">{totalDepartments}</div>
          <div className="metric-label">Departments</div>
          <div className="metric-status warning">{unassignedDepartments} unassigned</div>
        </article>

        <article className="metric-card">
          <span className="metric-icon" aria-hidden="true">◎</span>
          <div className="metric-value">{totalStudentsFormatted}</div>
          <div className="metric-label">Students</div>
          <div className="metric-status positive">
            {activeStudents} active {activeStudents === 1 ? 'record' : 'records'}
          </div>
        </article>
      </div>

      <div className="dashboard-panels">
        <section className="card people-role-card">
          <div className="card-header"><h2 className="card-title">People by role</h2></div>
          <div className="role-metrics">
            <div className="role-tile students"><strong>{totalStudentsFormatted}</strong><span>Students</span></div>
            <div className="role-tile faculty"><strong>{facultyCount}</strong><span>Faculty</span></div>
            <div className="role-tile admins"><strong>{adminCount}</strong><span>Admins</span></div>
            <div className="role-tile review"><strong>{pendingReviewCount}</strong><span>Pending review</span></div>
          </div>
        </section>

        <section className="card audit-card">
          <div className="card-header">
            <h2 className="card-title">Recent audit activity</h2>
          </div>
          <ul className="audit-activity">
            {state.auditLogs.slice(0, 4).map((log) => (
              <li key={log.id}>
                <span>{activityLine(log, state)}</span>
                <StatusPill value={log.status} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Pending Setup */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Pending setup</h2>
        </div>

        <div className="timeline-list setup">
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
