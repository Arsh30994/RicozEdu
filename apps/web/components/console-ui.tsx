'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { loadPortalRole, loadSession, type PortalRole } from '../lib/api';

export type ConsoleTheme = 'dark' | 'light';

const ThemeContext = createContext<{
  theme: ConsoleTheme;
  setTheme: (next: ConsoleTheme) => void;
} | null>(null);

export function ThemeProvider({
  theme,
  setTheme,
  children,
}: {
  theme: ConsoleTheme;
  setTheme: (next: ConsoleTheme) => void;
  children: ReactNode;
}) {
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

function ThemeSwitch({
  theme,
  onChange,
}: {
  theme: ConsoleTheme;
  onChange: (next: ConsoleTheme) => void;
}) {
  return (
    <div className="theme-switch" data-active={theme} role="group" aria-label="Color theme">
      <span className="theme-switch-knob" aria-hidden />
      <button type="button" aria-pressed={theme === 'light'} onClick={() => onChange('light')}>
        Light
      </button>
      <button type="button" aria-pressed={theme === 'dark'} onClick={() => onChange('dark')}>
        Dark
      </button>
    </div>
  );
}

export function SettingsMenu() {
  const theme = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  if (!theme) return null;

  return (
    <div className="settings-menu" ref={rootRef}>
      <button
        type="button"
        className="settings-gear"
        aria-label="Settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-tooltip="Settings"
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.64.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96c.24.1.51 0 .64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"
          />
        </svg>
      </button>
      {open ? (
        <div className="settings-popover" role="dialog" aria-label="Settings">
          <p className="settings-heading">Appearance</p>
          <ThemeSwitch theme={theme.theme} onChange={theme.setTheme} />
        </div>
      ) : null}
    </div>
  );
}

const sessionListeners = new Set<() => void>();

export function notifySessionChange() {
  sessionListeners.forEach((listener) => listener());
}

function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function displayRole(role: string): string {
  if (!role) return role;
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function useConsoleUser() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<PortalRole>('teacher');
  const [sessionVersion, setSessionVersion] = useState(0);

  useEffect(() => {
    const bump = () => setSessionVersion((version) => version + 1);
    sessionListeners.add(bump);
    return () => {
      sessionListeners.delete(bump);
    };
  }, []);

  useEffect(() => {
    const session = loadSession();
    setEmail(session?.email ?? null);
    setRole(session?.role ?? loadPortalRole());
  }, [pathname, sessionVersion]);

  const name = email ? nameFromEmail(email) : 'Priya Nair';
  const roleLabel = email ? (role === 'teacher' ? 'Institution admin' : 'Student') : 'Institution admin';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return { email, role, name, roleLabel, initials };
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="view-header">
      <h1>{title}</h1>
      {children ? <div className="view-header-actions">{children}</div> : null}
    </header>
  );
}

export function UserChip({ name, role, initials }: { name: string; role: string; initials: string }) {
  return (
    <div className="user-chip">
      <span className="user-chip-avatar" aria-hidden>
        {initials}
      </span>
      <span className="user-chip-copy">
        <span className="user-chip-name">{name}</span>
        <span className="user-chip-role">{role}</span>
      </span>
    </div>
  );
}

const PILL_TONE: Record<string, string> = {
  success: 'success',
  active: 'success',
  blocked: 'blocked',
  failed: 'blocked',
  danger: 'blocked',
  suspended: 'blocked',
  warning: 'warning',
  invited: 'warning',
  withdrawn: 'neutral',
  inactive: 'neutral',
  disabled: 'neutral',
  archived: 'neutral',
  neutral: 'neutral',
  readonly: 'readonly',
  flagged: 'flagged',
};

export function StatusPill({
  value,
  label,
  tone,
}: {
  value?: string;
  label?: string;
  tone?: string;
}) {
  const key = (tone ?? value ?? 'neutral').toLowerCase();
  const klass = PILL_TONE[key] ?? 'neutral';
  return <span className={`pill-badge ${klass}`}>{label ?? value}</span>;
}
