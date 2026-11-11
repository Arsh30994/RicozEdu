'use client';

import Link from 'next/link';
import { useConsoleUser, PageHeader, UserChip } from '../../../components/console-ui';

const learningAreas = [
  { icon: '▦', title: 'My courses', description: 'Your enrolled subjects, course materials, and class resources.', status: 'Course data will appear when published by your institution' },
  { icon: '◷', title: 'Timetable', description: 'Your daily classes, rooms, and upcoming academic sessions.', status: 'Timetable integration pending' },
  { icon: '✓', title: 'Assignments', description: 'Track assigned work, due dates, and submission status.', status: 'Assignment integration pending' },
  { icon: '▥', title: 'Attendance & results', description: 'Keep track of attendance, assessment marks, and academic progress.', status: 'Attendance and gradebook integration pending' },
];

export default function StudentDashboardPage() {
  const user = useConsoleUser();

  return (
    <section className="role-dashboard">
      <PageHeader title="My learning dashboard">
        <UserChip name={user.name} role="Student" initials={user.initials} />
      </PageHeader>

      <section className="role-welcome student-welcome">
        <div>
          <span className="role-eyebrow">STUDENT PORTAL</span>
          <h2>Keep learning, {user.name}</h2>
          <p>Your personal space for courses, class schedules, assignments, attendance, and academic progress.</p>
        </div>
        <span className="role-welcome-mark" aria-hidden="true">✦</span>
      </section>

      <div className="role-section-heading">
        <div><h2>Your learning</h2><p>Everything a student needs in one place.</p></div>
      </div>
      <div className="role-module-grid">
        {learningAreas.map((item) => (
          <article className="role-module-card" key={item.title}>
            <span className="role-module-icon" aria-hidden="true">{item.icon}</span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <span className="role-module-status">{item.status}</span>
          </article>
        ))}
      </div>

      <div className="role-action-grid">
        <Link className="role-action-card" href="/study">
          <span aria-hidden="true">▣</span><div><h3>Study companion</h3><p>Revise concepts and work with your learning materials.</p></div><b>→</b>
        </Link>
        <Link className="role-action-card" href="/assistant">
          <span aria-hidden="true">✧</span><div><h3>Ask Ricoz AI</h3><p>Get help understanding your academic material.</p></div><b>→</b>
        </Link>
      </div>
      <p className="role-dashboard-note">Your institution has not connected course, timetable, attendance, or gradebook data to this portal yet. Once those modules are enabled, your personal records will appear here.</p>
    </section>
  );
}
