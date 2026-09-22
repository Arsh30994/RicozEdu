'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  clearSession,
  loadPortalRole,
  loadSession,
  PortalRole,
  savePortalRole,
} from '../lib/api';

type NavItem = {
  href: string;
  label: string;
  blurb: string;
  code: string;
  soon?: boolean;
  roles: PortalRole[];
};

const GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Institution Hub',
    items: [
      {
        href: '/sessions/welcome',
        label: '1 Welcome',
        blurb: 'Start overview',
        code: '1',
        roles: ['teacher', 'student'],
      },
      {
        href: '/sessions/academics',
        label: '2 Academics',
        blurb: 'Live academic tools',
        code: '2',
        roles: ['teacher', 'student'],
      },
      {
        href: '/sessions/tenancy',
        label: '3 Tenancy',
        blurb: 'RLS isolation',
        code: '3',
        roles: ['teacher', 'student'],
      },
      {
        href: '/sessions/publish',
        label: '4 Publish',
        blurb: 'Immutable versions',
        code: '4',
        roles: ['teacher', 'student'],
      },
      {
        href: '/sessions/auth',
        label: '5 Auth',
        blurb: 'Membership checks',
        code: '5',
        roles: ['teacher', 'student'],
      },
      {
        href: '/sessions/modules',
        label: '6 Modules',
        blurb: 'Open live tools',
        code: '6',
        roles: ['teacher', 'student'],
      },
    ],
  },
  {
    label: 'Teacher tools',
    items: [
      {
        href: '/admin/curriculum',
        label: 'Curriculum',
        blurb: 'Simulate and publish',
        code: 'CU',
        roles: ['teacher'],
      },
      {
        href: '/admin/rules',
        label: 'Rules',
        blurb: 'Progression JSON docs',
        code: 'RL',
        roles: ['teacher'],
      },
    ],
  },
  {
    label: 'Student workspace',
    items: [
      {
        href: '/student/progress',
        label: 'Progress',
        blurb: 'Credits and exit awards',
        code: 'DG',
        roles: ['student', 'teacher'],
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        href: '/login',
        label: 'Sign in',
        blurb: 'Teacher or student access',
        code: 'IN',
        roles: ['teacher', 'student'],
      },
    ],
  },
];

const SOON: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Coming later',
    items: [
      {
        href: '#',
        label: 'Finance',
        blurb: 'Fees and billing',
        code: 'FE',
        soon: true,
        roles: ['teacher', 'student'],
      },
      {
        href: '#',
        label: 'Exams',
        blurb: 'Schedules and marks',
        code: 'EX',
        soon: true,
        roles: ['teacher', 'student'],
      },
      {
        href: '#',
        label: 'Attendance',
        blurb: 'Daily registry',
        code: 'AT',
        soon: true,
        roles: ['teacher', 'student'],
      },
    ],
  },
];

function homeForRole(role: PortalRole): string {
  return role === 'student' ? '/student/progress' : '/admin/curriculum';
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [role, setRole] = useState<PortalRole>('teacher');

  useEffect(() => {
    const s = loadSession();
    setEmail(s?.email ?? null);
    setTenantId(s?.tenantId ?? null);
    setRole(s?.role ?? loadPortalRole());
  }, [pathname]);

  function switchRole(next: PortalRole) {
    if (next === role) return;
    savePortalRole(next);
    setRole(next);
    const onTeacherPage = pathname.startsWith('/admin');
    const onStudentPage = pathname.startsWith('/student');
    if (next === 'student' && onTeacherPage) {
      router.push('/student/progress');
    } else if (next === 'teacher' && onStudentPage) {
      router.push('/admin/curriculum');
    } else if (pathname === '/login' || pathname === '/') {
      router.push(homeForRole(next));
    }
  }

  function signOut() {
    clearSession();
    setEmail(null);
    setTenantId(null);
    router.push('/login');
  }

  const visibleGroups = useMemo(
    () =>
      [...GROUPS, ...SOON]
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.roles.includes(role)),
        }))
        .filter((group) => group.items.length > 0),
    [role],
  );

  const initials = (email ?? 'RE')
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            R
          </div>
          <div className="brand-text">
            <strong>RicozEdu</strong>
            <span>Multi-tenant EMS</span>
          </div>
        </div>

        {visibleGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            <div className="nav-grid">
              {group.items.map((item) => {
              const active =
                !item.soon &&
                (item.href === '/sessions/welcome'
                  ? pathname === '/' || pathname.startsWith('/sessions/welcome')
                  : pathname === item.href || pathname.startsWith(`${item.href}/`));
                if (item.soon) {
                  return (
                    <span className="nav-tile soon" key={item.label}>
                      <span className="nav-tile-code" aria-hidden>
                        {item.code}
                      </span>
                      <strong>{item.label}</strong>
                      <small>{item.blurb}</small>
                    </span>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={active ? 'nav-tile active' : 'nav-tile'}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="nav-tile-code" aria-hidden>
                      {item.code}
                    </span>
                    <strong>{item.label}</strong>
                    <small>{item.blurb}</small>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        <div className="nav-foot">
          {email ? (
            <button type="button" className="nav-tile nav-button" onClick={signOut}>
              <span className="nav-tile-code" aria-hidden>
                OUT
              </span>
              <strong>Sign out</strong>
              <small>End this session</small>
            </button>
          ) : null}
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="chip" title={tenantId ?? 'No tenant selected'}>
            {tenantId ? `Tenant ${tenantId.slice(0, 8)}...` : 'No tenant'}
          </div>
          <div className="search">
            <label className="sr-only" htmlFor="global-search">
              Search
            </label>
            <input
              id="global-search"
              type="search"
              placeholder="Search programmes, rules, students..."
              disabled
              aria-disabled="true"
            />
          </div>
          <span className="chip term">
            {role === 'teacher' ? 'Teacher view' : 'Student view'}
          </span>
          <div
            className="role-toggle"
            role="group"
            aria-label="Switch between teacher and student"
          >
            <button
              type="button"
              className={role === 'teacher' ? 'on' : undefined}
              aria-pressed={role === 'teacher'}
              onClick={() => switchRole('teacher')}
            >
              Teacher
            </button>
            <button
              type="button"
              className={role === 'student' ? 'on' : undefined}
              aria-pressed={role === 'student'}
              onClick={() => switchRole('student')}
            >
              Student
            </button>
          </div>
          <div className="profile">
            <div className="avatar" aria-hidden>
              {initials || 'RE'}
            </div>
            <div className="profile-meta">
              <strong>{email ?? 'Guest'}</strong>
              <span>
                {email
                  ? role === 'teacher'
                    ? 'Signed in as teacher'
                    : 'Signed in as student'
                  : 'Not signed in'}
              </span>
            </div>
          </div>
        </header>
        <div className="page">{children}</div>
      </div>
    </div>
  );
}
