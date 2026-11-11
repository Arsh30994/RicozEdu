'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { api, clearSession, dashboardPathForRole, loadSession } from '../lib/api';
import { notifySessionChange, ThemeProvider, ThemeSwitch, useConsoleUser, type ConsoleTheme } from './console-ui';
import { CommandPalette } from './CommandPalette';
import { dataConnector } from '../lib/data-connector';

interface NavItem {
  href: string;
  label: string;
  matchPrefixes?: string[];
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const ADMIN_NAV: NavSection[] = [
  { items: [{ href: '/admin/dashboard', label: 'Dashboard', matchPrefixes: ['/admin/dashboard', '/dashboard'] }] },
  { label: 'Organization', items: [{ href: '/admin/institutions', label: 'Institutions', matchPrefixes: ['/admin/institutions', '/institutions'] }] },
  { label: 'People', items: [
    { href: '/admin/people', label: 'People', matchPrefixes: ['/admin/people', '/people'] },
    { href: '/admin/students', label: 'Students', matchPrefixes: ['/admin/students', '/students'] },
  ] },
  { label: 'Access & compliance', items: [
    { href: '/admin/users', label: 'Users & roles', matchPrefixes: ['/admin/users', '/users'] },
    { href: '/admin/audit', label: 'Audit log', matchPrefixes: ['/admin/audit', '/audit'] },
  ] },
  { label: 'Learning', items: [
    { href: '/assistant', label: 'Ricoz AI', matchPrefixes: ['/assistant'] },
    { href: '/study', label: 'Study companion', matchPrefixes: ['/study'] },
  ] },
];
const TEACHER_NAV: NavSection[] = [
  { items: [{ href: '/teacher/dashboard', label: 'Teaching dashboard' }] },
  { label: 'Teaching', items: [
    { href: '/teacher/classes', label: 'My classes' },
    { href: '/teacher/attendance', label: 'Attendance' },
    { href: '/teacher/assignments', label: 'Assignments' },
    { href: '/teacher/students', label: 'Student directory' },
    { href: '/assistant', label: 'Ricoz AI' },
    { href: '/study', label: 'Teaching resources' },
  ] },
];
const STUDENT_NAV: NavSection[] = [
  { items: [{ href: '/student/dashboard', label: 'My dashboard' }] },
  { label: 'Learning', items: [
    { href: '/student/timetable', label: 'Timetable' },
    { href: '/student/attendance', label: 'Attendance' },
    { href: '/student/assignments', label: 'Assignments' },
    { href: '/study', label: 'Study companion' },
    { href: '/assistant', label: 'Ricoz AI' },
  ] },
];
const GUARDIAN_NAV: NavSection[] = [
  { items: [{ href: '/guardian/dashboard', label: 'Family dashboard' }] },
  { label: 'Support', items: [{ href: '/assistant', label: 'Ricoz AI' }] },
];
const FINANCE_NAV: NavSection[] = [
  { items: [{ href: '/admin/dashboard', label: 'Dashboard' }, { href: '/admin/students', label: 'Student directory' }, { href: '/admin/audit', label: 'Audit log' }] },
];

const THEME_KEY = 'ricozedu.consoleTheme';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { email, name, roleLabel, role } = useConsoleUser();
  const [theme, setTheme] = useState<ConsoleTheme>('dark');
  const [syncError, setSyncError] = useState<string | null>(null);
  const finishRouteTransition = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (pathname === '/' || pathname === '/login') return;
    const session = loadSession();
    if (!session?.accessToken || !session.tenantId) {
      router.replace('/login');
      return;
    }
    const currentRole = session.role;
    const isAdminRoute = pathname.startsWith('/admin');
    const isTeacherRoute = pathname.startsWith('/teacher');
    const isStudentRoute = pathname.startsWith('/student');
    const isGuardianRoute = pathname.startsWith('/guardian');
    const allowed = isAdminRoute
      ? ['owner', 'admin', 'finance'].includes(currentRole)
      : isTeacherRoute
        ? ['faculty', 'teacher'].includes(currentRole)
        : isStudentRoute
          ? currentRole === 'student'
          : isGuardianRoute
            ? currentRole === 'guardian'
            : true;
    if (!allowed) router.replace(dashboardPathForRole(currentRole));
  }, [pathname, router]);

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  useEffect(() => {
    finishRouteTransition.current?.();
    finishRouteTransition.current = null;
  }, [pathname]);

  useEffect(() => {
    const updateSyncError = () => setSyncError(dataConnector.getSyncError());
    const unsubscribe = dataConnector.subscribe(updateSyncError);
    updateSyncError();
    return unsubscribe;
  }, []);

  useEffect(() => {
    function onNavigate(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a');
      if (
        !anchor ||
        anchor.target ||
        anchor.hasAttribute('download') ||
        anchor.origin !== window.location.origin ||
        anchor.pathname === pathname
      ) {
        return;
      }

      const transitionDocument = document as Document & {
        startViewTransition?: (callback: () => void | Promise<void>) => { finished: Promise<void> };
      };
      const startViewTransition = transitionDocument.startViewTransition;
      if (!startViewTransition) return;

      event.preventDefault();
      const destination = `${anchor.pathname}${anchor.search}${anchor.hash}`;
      let timeoutId = 0;
      const routeChanged = new Promise<void>((resolve) => {
        const finish = () => {
          window.clearTimeout(timeoutId);
          if (finishRouteTransition.current === finish) finishRouteTransition.current = null;
          resolve();
        };
        finishRouteTransition.current = finish;
        timeoutId = window.setTimeout(finish, 1200);
      });

      try {
        startViewTransition.call(transitionDocument, async () => {
          router.push(destination);
          await routeChanged;
        });
      } catch {
        finishRouteTransition.current?.();
        router.push(destination);
      }
    }

    document.addEventListener('click', onNavigate, true);
    return () => document.removeEventListener('click', onNavigate, true);
  }, [pathname, router]);

  function applyTheme(next: ConsoleTheme) {
    setTheme(next);
    window.localStorage.setItem(THEME_KEY, next);
  }

  const NAV_SECTIONS = role === 'student' ? STUDENT_NAV : role === 'guardian' ? GUARDIAN_NAV : role === 'faculty' || role === 'teacher' ? TEACHER_NAV : role === 'finance' ? FINANCE_NAV : ADMIN_NAV;

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

  if (pathname === '/' || pathname === '/login') {
    return (
      <ThemeProvider theme={theme} setTheme={applyTheme}>
        <div className="console console-root" data-theme={theme}>
          {children}
          <div className="theme-corner">
            <ThemeSwitch theme={theme} onChange={applyTheme} />
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme} setTheme={applyTheme}>
    <div className="console app-shell" data-theme={theme}>
      <aside className="sidebar" aria-label="Main Navigation">
        <div className="sidebar-brand">
          <Link href={dashboardPathForRole(role)}>
            <span className="sidebar-brand-mark">R</span>
            <span className="sidebar-brand-copy">
              <span className="sidebar-brand-title">RicozEdu</span>
              <span className="sidebar-brand-subtitle">{roleLabel}</span>
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
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-user">{name}</div>
          <div className="sidebar-footer-role">{roleLabel}</div>
          <CommandPalette theme={theme} onThemeChange={applyTheme} />
          {email ? (
            <button className="sidebar-auth-action" type="button" onClick={handleSignOut}>
              Log out
            </button>
          ) : null}
          <div className="theme-corner">
            <ThemeSwitch theme={theme} onChange={applyTheme} />
          </div>
        </div>
      </aside>

      <div className="main-wrapper">
        <div className="page-container">{children}</div>
      </div>
      {syncError ? (
        <div className="sync-error-toast" role="alert">
          <span>{syncError}</span>
          <button type="button" onClick={() => dataConnector.clearSyncError()}>
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
    </ThemeProvider>
  );
}
