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
  { items: [{ href: '/admin/dashboard', label: 'Dashboard' }] },
  { label: 'Organization', items: [{ href: '/admin/institutions', label: 'Institutions' }] },
  { label: 'People', items: [
    { href: '/admin/people', label: 'People' },
    { href: '/admin/students', label: 'Students' },
  ] },
  { label: 'Access & compliance', items: [
    { href: '/admin/users', label: 'Users & roles' },
    { href: '/admin/audit', label: 'Audit log' },
  ] },
  { label: 'Learning', items: [
    { href: '/assistant', label: 'Ricoz AI' },
    { href: '/study', label: 'Study companion' },
  ] },
];

const TEACHER_NAV: NavSection[] = [
  { items: [{ href: '/teacher/dashboard', label: 'Teaching dashboard' }] },
  { label: 'Teaching', items: [
    { href: '/teacher/classes', label: 'My classes' },
    { href: '/teacher/attendance', label: 'Attendance' },
    { href: '/teacher/assignments', label: 'Assignments' },
    { href: '/admin/students', label: 'Student directory' },
    { href: '/assistant', label: 'Ricoz AI' },
    { href: '/study', label: 'Teaching resources' },
  ] },
];

const GUARDIAN_NAV: NavSection[] = [
  { items: [{ href: '/guardian/dashboard', label: 'Family dashboard' }] },
  { label: 'Support', items: [
    { href: '/assistant', label: 'Ricoz AI' },
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
