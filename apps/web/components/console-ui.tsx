'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { loadPortalRole, loadSession, type PortalRole } from '../lib/api';

const sessionListeners = new Set<() => void>();

export function notifySessionChange() {
  sessionListeners.forEach((listener) => listener());
}

export function nameFromEmail(email: string): string {
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

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="view-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="view-header-actions">{children}</div> : null}
    </header>
  );
}

export function UserChip({ name, role, initials }: { name: string; role: string; initials: string }) {
  return (
    <div className="user-chip">
      <span className="user-chip-avatar" aria-hidden>
        {initials || 'PN'}
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
