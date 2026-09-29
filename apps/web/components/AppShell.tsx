'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  api,
  clearSession,
  loadPortalRole,
  loadSession,
  PortalRole,
} from '../lib/api';
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

const PAGE_TITLES: Array<[string, string]> = [
  ['/admin/dashboard', 'Dashboard'],
  ['/admin/institutions', 'Institutions & structure'],
  ['/admin/people', 'People'],
  ['/admin/students', 'Student memberships'],
  ['/admin/users', 'Users & roles'],
  ['/admin/audit', 'Audit log'],
  ['/admin/curriculum', 'Curriculum'],
  ['/admin/rules', 'Rules engine'],
  ['/student/progress', 'Degree progress'],
  ['/sessions', 'Guided sessions'],
  ['/login', 'Sign in'],
  ['/create-account', 'Create an account'],
];

function getPageTitle(pathname: string): string {
  return PAGE_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Admin console';
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<PortalRole>('teacher');
  const [showTools, setShowTools] = useState(false);
  const [search, setSearch] = useState('');
  const [searchMessage, setSearchMessage] = useState('');
  const [portalTheme, setPortalTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const s = loadSession();
    setEmail(s?.email ?? null);
    setRole(s?.role ?? loadPortalRole());
  }, [pathname]);

  useEffect(() => {
    setPortalTheme(window.localStorage.getItem('ricozedu.adminTheme') === 'light' ? 'light' : 'dark');
  }, []);

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

  function togglePortalTheme() {
    setPortalTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem('ricozedu.adminTheme', next);
      return next;
    });
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim().toLocaleLowerCase();
    const item = [...NAV_SECTIONS.flatMap((section) => section.items), ...SECONDARY_NAV_ITEMS]
      .find((navItem) => navItem.label.toLocaleLowerCase().includes(query));
    if (!query) return;
    if (item) {
      setSearchMessage('');
      router.push(item.href);
    } else {
      setSearchMessage('No matching section');
    }
  }

  if (pathname === '/') return <>{children}</>;

  return (
    <div className="app-shell" data-theme={portalTheme}>
      <aside className="sidebar" aria-label="Main Navigation">
        <div className="sidebar-brand">
          <Link href="/admin/dashboard">
            <span className="sidebar-brand-mark">R</span>
            <span className="sidebar-brand-copy"><span className="sidebar-brand-title">RicozEdu</span><span className="sidebar-brand-subtitle">Admin console</span></span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section) => (
            <div className="sidebar-section" key={section.label ?? 'overview'}>
              {section.label && <div className="sidebar-section-label">{section.label}</div>}
              {section.items.map((item) => {
                const active = isItemActive(item);
                return <Link key={item.href} href={item.href} className={`sidebar-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}><span className="dot" aria-hidden /><span>{item.label}</span></Link>;
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
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-sublink ${active ? 'active' : ''}`}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
          </div>
        </nav>

        <div className="sidebar-footer">
          {email ? (
            <>
              <div className="sidebar-footer-label">Signed in as</div>
              <div className="sidebar-footer-user" title={email}>
                {email}
              </div>
              <div className="sidebar-footer-role">
                {role === 'teacher' ? 'Teacher' : 'Student'}
              </div>
              <button
                className="sidebar-auth-action"
                type="button"
                onClick={handleSignOut}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <div className="sidebar-footer-label">Account</div>
              <div className="sidebar-footer-user">Not signed in</div>
              <Link className="sidebar-auth-action" href="/login">
                Sign in
              </Link>
            </>
          )}
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="portal-topbar">
          <h1 className="portal-page-title">{getPageTitle(pathname)}</h1>
          <div className="portal-campus">{dataConnector.getState().selectedCampus}</div>
          <form className="portal-search" role="search" onSubmit={handleSearch}>
            <label className="visually-hidden" htmlFor="portal-search">Search sections</label>
            <input id="portal-search" value={search} onChange={(event) => { setSearch(event.target.value); setSearchMessage(''); }} placeholder="Search..." />
            <button type="submit" aria-label="Search sections">⌕</button>
            {searchMessage && <span className="portal-search-message" role="status">{searchMessage}</span>}
          </form>
          <button className="portal-theme-toggle" type="button" onClick={togglePortalTheme} aria-pressed={portalTheme === 'light'}>
            {portalTheme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <div className="portal-user">
            <span className="portal-user-avatar">{email ? email.slice(0, 2).toUpperCase() : 'PN'}</span>
            <span className="portal-user-copy"><strong>{email ? email.split('@')[0].replace(/[._-]/g, ' ') : 'Priya Nair'}</strong><small>{email ? role === 'teacher' ? 'Institution admin' : 'Student' : 'Institution admin'}</small></span>
          </div>
        </header>
        <div className="page-container">{children}</div>
      </div>
    </div>
  );
}
