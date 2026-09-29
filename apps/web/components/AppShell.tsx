'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  api,
  clearSession,
  loadPortalRole,
  loadSession,
  PortalRole,
} from '../lib/api';

interface NavItem {
  href: string;
  label: string;
  matchPrefixes?: string[];
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  { items: [{ href: '/admin/dashboard', label: 'Dashboard', matchPrefixes: ['/admin/dashboard', '/dashboard'] }] },
  { label: 'Organization', items: [{ href: '/admin/institutions', label: 'Institutions', matchPrefixes: ['/admin/institutions', '/institutions'] }] },
  { label: 'People', items: [
    { href: '/admin/people', label: 'People', matchPrefixes: ['/admin/people', '/people'] },
    { href: '/admin/students', label: 'Students', matchPrefixes: ['/admin/students', '/students'] },
  ] },
  { label: 'Access', items: [{ href: '/admin/users', label: 'Users & roles', matchPrefixes: ['/admin/users', '/users'] }] },
  { label: 'Compliance', items: [{ href: '/admin/audit', label: 'Audit log', matchPrefixes: ['/admin/audit', '/audit'] }] },
];

const SECONDARY_NAV_ITEMS: NavItem[] = [
  { href: '/admin/curriculum', label: 'Curriculum' },
  { href: '/admin/rules', label: 'Rules Engine' },
  { href: '/student/progress', label: 'Degree Progress' },
  { href: '/sessions/welcome', label: 'Sessions (1-6)' },
];

function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<PortalRole>('teacher');
  const [showTools, setShowTools] = useState(false);

  useEffect(() => {
    const session = loadSession();
    setEmail(session?.email ?? null);
    setRole(session?.role ?? loadPortalRole());
  }, [pathname]);

  function isItemActive(item: NavItem): boolean {
    if (pathname === item.href) return true;
    if (item.matchPrefixes) {
      return item.matchPrefixes.some((prefix) => pathname.startsWith(prefix));
    }
    return pathname.startsWith(item.href);
  }

  function handleSignOut() {
    const session = loadSession();
    clearSession();
    setEmail(null);
    router.push('/login');
    if (session?.refreshToken) {
      void api<void>('/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: session.refreshToken }),
        session,
      }).catch(() => undefined);
    }
  }

  if (pathname === '/' || pathname === '/login') return <>{children}</>;

  const displayName = email ? nameFromEmail(email) : 'Priya Nair';
  const displayRole = email ? (role === 'teacher' ? 'Institution admin' : 'Student') : 'Institution admin';

  return (
    <div className="app-shell" data-theme="dark">
      <aside className="sidebar" aria-label="Main Navigation">
        <div className="sidebar-brand">
          <Link href="/admin/dashboard">
            <span className="sidebar-brand-mark">R</span>
            <span className="sidebar-brand-copy">
              <span className="sidebar-brand-title">RicozEdu</span>
              <span className="sidebar-brand-subtitle">Admin console</span>
            </span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section) => (
            <div className="sidebar-section" key={section.label ?? 'overview'}>
              {section.label && <div className="sidebar-section-label">{section.label}</div>}
              {section.items.map((item) => {
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
            </div>
          ))}

          <div className="sidebar-subnav">
            <button className="sidebar-subnav-toggle" type="button" aria-expanded={showTools} onClick={() => setShowTools(!showTools)}>
              <span>More tools</span>
              <span>{showTools ? '▲' : '▼'}</span>
            </button>
            {showTools &&
              SECONDARY_NAV_ITEMS.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} className={`sidebar-sublink ${active ? 'active' : ''}`}>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-user">{displayName}</div>
          <div className="sidebar-footer-role">{displayRole}</div>
          {email ? (
            <button className="sidebar-auth-action" type="button" onClick={handleSignOut}>
              Log out
            </button>
          ) : null}
        </div>
      </aside>

      <div className="main-wrapper">
        <div className="page-container">{children}</div>
      </div>
    </div>
  );
}
