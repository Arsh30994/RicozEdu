'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { loadSession } from '../lib/api';

type NavItem = { href: string; label: string; soon?: boolean };

const GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Institution Hub',
    items: [{ href: '/', label: 'Overview' }],
  },
  {
    label: 'Academics',
    items: [
      { href: '/admin/curriculum', label: 'Curriculum publish' },
      { href: '/admin/rules', label: 'Rule documents' },
    ],
  },
  {
    label: 'Student Workspace',
    items: [{ href: '/student/progress', label: 'Degree progress' }],
  },
  {
    label: 'Account',
    items: [{ href: '/login', label: 'Sign in' }],
  },
];

const SOON: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Coming later',
    items: [
      { href: '#', label: 'Finance and fees', soon: true },
      { href: '#', label: 'Examinations', soon: true },
      { href: '#', label: 'Attendance', soon: true },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    setEmail(s?.email ?? null);
    setTenantId(s?.tenantId ?? null);
  }, [pathname]);

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

        {[...GROUPS, ...SOON].map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map((item) => {
              const active =
                !item.soon &&
                (item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href));
              if (item.soon) {
                return (
                  <span className="nav-link soon" key={item.label}>
                    {item.label}
                  </span>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? 'nav-link active' : 'nav-link'}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="nav-foot nav-group">
          <span className="nav-link soon">System settings</span>
          <span className="nav-link soon">Compliance audit</span>
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
          <span className="chip term">Phase 0 - Academics</span>
          <div className="role-toggle" aria-hidden>
            <span className="on">Admin</span>
            <span>Student</span>
          </div>
          <div className="profile">
            <div className="avatar" aria-hidden>
              {initials || 'RE'}
            </div>
            <div className="profile-meta">
              <strong>{email ?? 'Guest'}</strong>
              <span>{email ? 'Signed in' : 'Not signed in'}</span>
            </div>
          </div>
        </header>
        <div className="page">{children}</div>
      </div>
    </div>
  );
}
