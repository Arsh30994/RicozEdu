'use client';

import Link from 'next/link';
import { useConsoleUser, PageHeader, UserChip } from '../../../components/console-ui';

export default function GuardianDashboardPage() {
  const user = useConsoleUser();
  return (
    <section className="role-dashboard">
      <PageHeader title="Family dashboard">
        <UserChip name={user.name} role="Guardian" initials={user.initials} />
      </PageHeader>
      <section className="role-welcome student-welcome">
        <div>
          <span className="role-eyebrow">FAMILY PORTAL</span>
          <h2>Welcome, {user.name}</h2>
          <p>A dedicated space to follow the learner information your institution shares with you.</p>
        </div>
        <span className="role-welcome-mark" aria-hidden="true">⌂</span>
      </section>
      <div className="role-module-grid">
        {[
          ['Learner progress', 'Review academic progress and teacher feedback.', 'Student progress sharing is not connected yet'],
          ['Attendance', 'Follow attendance records and notifications.', 'Guardian attendance access is pending'],
          ['Notices & communication', 'Read institution announcements and important updates.', 'Guardian notifications are not connected yet'],
          ['Fee information', 'Review fee notices and payment status.', 'Guardian fee access is pending'],
        ].map(([title, description, status]) => (
          <article className="role-module-card" key={title}>
            <span className="role-module-icon" aria-hidden="true">◇</span>
            <h3>{title}</h3><p>{description}</p><span className="role-module-status">{status}</span>
          </article>
        ))}
      </div>
      <div className="role-action-grid">
        <Link className="role-action-card" href="/assistant">
          <span aria-hidden="true">✧</span><div><h3>Ricoz AI</h3><p>Open the available AI support workspace.</p></div><b>→</b>
        </Link>
      </div>
      <p className="role-dashboard-note">Guardian access is separate from student access. Learner records will only appear when the institution links a learner to this verified guardian account and enables the relevant permissions.</p>
    </section>
  );
}
