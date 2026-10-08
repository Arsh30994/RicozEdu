'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { api, clearSession, loadSession } from '../lib/api';
import { notifySessionChange, SettingsMenu, ThemeProvider, useConsoleUser, type ConsoleTheme } from './console-ui';

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

const THEME_KEY = 'ricozedu.consoleTheme';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { email, name, roleLabel } = useConsoleUser();
  const [showTools, setShowTools] = useState(false);
  const [theme, setTheme] = useState<ConsoleTheme>('dark');

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved);
      return;
    }
    if (window.matchMedia('(prefers-color-scheme: light)').matches) setTheme('light');
  }, []);

  function applyTheme(next: ConsoleTheme) {
    setTheme(next);
    window.localStorage.setItem(THEME_KEY, next);
  }

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
    notifySessionChange();
    router.push('/login');
    if (session?.refreshToken) {
      void api<void>('/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: session.refreshToken }),
        session,
      }).catch(() => undefined);
    }
  }

  if (pathname === '/') return <>{children}</>;

  if (pathname === '/login') {
    return (
      <ThemeProvider theme={theme} setTheme={applyTheme}>
        <div className="console console-root" data-theme={theme}>
          <div className="settings-anchor">
            <SettingsMenu />
          </div>
          {children}
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme} setTheme={applyTheme}>
    <div className="console app-shell" data-theme={theme}>
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
            <button className="sidebar-subnav-toggle" type="button" aria-expanded={showTools} data-tooltip="More tools" onClick={() => setShowTools(!showTools)}>
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
          <div className="sidebar-footer-user">{name}</div>
          <div className="sidebar-footer-role">{roleLabel}</div>
          {email ? (
            <button className="sidebar-auth-action" type="button" onClick={handleSignOut}>
              Log out
            </button>
          ) : null}
        </div>
      </aside>

      <div className="main-wrapper">
        <div className="settings-anchor">
          <SettingsMenu />
        </div>
        <div className="page-container">{children}</div>
      </div>
    </div>
    </ThemeProvider>
  );
}
