'use client';

import Link from 'next/link';
import { useConsoleUser, PageHeader, UserChip } from '../../../components/console-ui';

const teachingModules = [
  { icon: '▤', title: 'My classes', description: 'View assigned sections, subjects, and class rosters.', status: 'Open class management', href: '/teacher/classes' },
  { icon: '◷', title: 'Attendance', description: 'Record daily attendance and review class-wise attendance trends.', status: 'Open attendance register', href: '/teacher/attendance' },
  { icon: '✓', title: 'Assignments', description: 'Create assignments, set due dates, and review student submissions.', status: 'Create and grade assignments', href: '/teacher/assignments' },
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
          <Link href={item.href ?? '/teacher/assignments'} className="role-module-card" key={item.title}>
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
      <p className="role-dashboard-note">Class creation, attendance recording, assignment publishing, submissions and grading are connected to the institution API. Timetable scheduling is available through the class management workflow and will be expanded into a dedicated editor.</p>
    </section>
  );
}
