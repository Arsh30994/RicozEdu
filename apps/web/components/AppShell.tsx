'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  clearSession,
  loadPortalRole,
  loadSession,
  PortalRole,
  savePortalRole,
} from '../lib/api';
import { dataConnector } from '../lib/data-connector';

interface NavItem {
  href: string;
  label: string;
  matchPrefixes?: string[];
}

const MAIN_NAV_ITEMS: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', matchPrefixes: ['/admin/dashboard', '/dashboard'] },
  { href: '/admin/institutions', label: 'Institutions', matchPrefixes: ['/admin/institutions', '/institutions'] },
  { href: '/admin/people', label: 'People', matchPrefixes: ['/admin/people', '/people'] },
  { href: '/admin/students', label: 'Students', matchPrefixes: ['/admin/students', '/students'] },
  { href: '/admin/users', label: 'Users & roles', matchPrefixes: ['/admin/users', '/users'] },
  { href: '/admin/audit', label: 'Audit log', matchPrefixes: ['/admin/audit', '/audit'] },
];

const SECONDARY_NAV_ITEMS: NavItem[] = [
  { href: '/admin/curriculum', label: 'Curriculum' },
  { href: '/admin/rules', label: 'Rules Engine' },
  { href: '/student/progress', label: 'Degree Progress' },
  { href: '/sessions/welcome', label: 'Sessions (1-6)' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<PortalRole>('teacher');
  const [showTools, setShowTools] = useState(false);

  useEffect(() => {
    const s = loadSession();
    setEmail(s?.email ?? 'priya.nair@gtbit.edu');
    setRole(s?.role ?? loadPortalRole());
  }, [pathname]);

  function isItemActive(item: NavItem): boolean {
    if (pathname === item.href) return true;
    if (item.matchPrefixes) {
      return item.matchPrefixes.some((prefix) => pathname.startsWith(prefix));
    }
    return pathname.startsWith(item.href);
  }

  function handleSignOut() {
    clearSession();
    setEmail(null);
    router.push('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main Navigation">
        <div className="sidebar-brand">
          <Link href="/admin/dashboard">
            <div className="sidebar-brand-title">RicozEdu</div>
            <div className="sidebar-brand-subtitle">Institution admin</div>
          </Link>
        </div>

        <nav className="sidebar-nav">
          {MAIN_NAV_ITEMS.map((item) => {
            const active = isItemActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span className="dot" aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div className="sidebar-subnav">
            <div
              className="sidebar-subnav-label"
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => setShowTools(!showTools)}
            >
              <span>More tools</span>
              <span>{showTools ? '▲' : '▼'}</span>
            </div>
            {showTools &&
              SECONDARY_NAV_ITEMS.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-sublink ${active ? 'active' : ''}`}
                    style={active ? { fontWeight: 700, color: '#091610' } : undefined}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-label">Signed in as</div>
          <div className="sidebar-footer-user" title={email ?? 'Priya Nair'}>
            Priya Nair · Institution admin
          </div>
        </div>
      </aside>

      <div className="main-wrapper">
        <div className="page-container">{children}</div>
      </div>
    </div>
  );
}
