'use client';

import Link from 'next/link';
import { useConsoleUser, PageHeader, UserChip } from '../../../components/console-ui';

const teachingModules = [
  { icon: '▤', title: 'My classes', description: 'View assigned sections, subjects, and class rosters.', status: 'Class allocation integration pending' },
  { icon: '◷', title: 'Attendance', description: 'Record daily attendance and review class-wise attendance trends.', status: 'Attendance workflow not connected yet' },
  { icon: '✓', title: 'Assignments', description: 'Create assignments, set due dates, and review student submissions.', status: 'Assignment workflow not connected yet' },
  { icon: '▥', title: 'Gradebook', description: 'Enter marks, manage assessments, and share student feedback.', status: 'Gradebook integration pending' },
];

export default function TeacherDashboardPage() {
  const user = useConsoleUser();

  return (
    <section className="role-dashboard">
      <PageHeader title="Teacher dashboard">
        <UserChip name={user.name} role="Teacher" initials={user.initials} />
      </PageHeader>

      <section className="role-welcome">
        <div>
          <span className="role-eyebrow">TEACHING WORKSPACE</span>
          <h2>Welcome back, {user.name}</h2>
          <p>Your teaching workspace brings classes, attendance, assignments, and student progress together.</p>
        </div>
        <span className="role-welcome-mark" aria-hidden="true">✦</span>
      </section>

      <div className="role-section-heading">
        <div><h2>Teaching tools</h2><p>Tools intended for faculty members.</p></div>
      </div>
      <div className="role-module-grid">
        {teachingModules.map((item) => (
          <article className="role-module-card" key={item.title}>
            <span className="role-module-icon" aria-hidden="true">{item.icon}</span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <span className="role-module-status">{item.status}</span>
          </article>
        ))}
      </div>

      <div className="role-action-grid">
        <Link className="role-action-card" href="/admin/students">
          <span aria-hidden="true">♙</span><div><h3>Student directory</h3><p>Open student records available to your institution role.</p></div><b>→</b>
        </Link>
        <Link className="role-action-card" href="/assistant">
          <span aria-hidden="true">✧</span><div><h3>Ricoz AI</h3><p>Use the AI workspace for teaching and academic support.</p></div><b>→</b>
        </Link>
        <Link className="role-action-card" href="/study">
          <span aria-hidden="true">▣</span><div><h3>Teaching resources</h3><p>Open the study workspace and learning materials.</p></div><b>→</b>
        </Link>
      </div>
      <p className="role-dashboard-note">Note: Class schedules, attendance, assignments, and gradebook data are not yet exposed by the active API. These cards intentionally show integration status instead of displaying invented records.</p>
    </section>
  );
}
