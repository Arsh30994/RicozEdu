export type SessionDef = {
  page: number;
  slug: string;
  title: string;
  label: string;
  summary: string;
  body: string;
  cta?: { href: string; label: string; secondary?: boolean };
  extraCta?: { href: string; label: string; secondary?: boolean };
};

export const SESSIONS: SessionDef[] = [
  {
    page: 1,
    slug: 'welcome',
    title: 'Institution overview',
    label: 'Welcome',
    summary: 'Start here',
    body: 'Warm, calm workspace for curriculum, rules, and student progress. Use the page numbers to open each session on its own screen.',
    cta: { href: '/login', label: 'Sign in' },
    extraCta: {
      href: '/sessions/academics',
      label: 'Next session',
      secondary: true,
    },
  },
  {
    page: 2,
    slug: 'academics',
    title: 'Academics',
    label: 'Active surface',
    summary: 'Curriculum, rules, progress',
    body: 'This session covers live academic tools: publish programme versions, author rule documents, and review degree progress.',
    cta: { href: '/admin/curriculum', label: 'Open curriculum' },
    extraCta: { href: '/admin/rules', label: 'Open rules', secondary: true },
  },
  {
    page: 3,
    slug: 'tenancy',
    title: 'RLS forced',
    label: 'Tenancy',
    summary: 'Tenant context set per transaction',
    body: 'Every tenant-owned query runs with a transaction-local tenant setting. Missing context returns no rows. Tenants never share data by accident.',
    cta: { href: '/login', label: 'Choose a tenant' },
  },
  {
    page: 4,
    slug: 'publish',
    title: 'Immutable',
    label: 'Publish model',
    summary: 'Corrections via new versions only',
    body: 'Published curriculum and results are immutable. Fixes create a new version or a correction record - never a silent overwrite.',
    cta: { href: '/admin/curriculum', label: 'Publish workflow' },
  },
  {
    page: 5,
    slug: 'auth',
    title: 'Membership',
    label: 'Auth',
    summary: 'X-Tenant-Id verified server-side',
    body: 'Sign in as Teacher or Student. Access tokens are JWT-based; tenant membership is checked on the server before any academic action.',
    cta: { href: '/login', label: 'Sign in' },
  },
  {
    page: 6,
    slug: 'modules',
    title: 'Live modules',
    label: 'Workspace tools',
    summary: 'Open each function on its own route',
    body: 'Jump into the tools that are already wired. Finance, exams, and attendance stay listed as coming later until their APIs ship.',
  },
];

export function getSession(slug: string): SessionDef | undefined {
  return SESSIONS.find((s) => s.slug === slug);
}

export function sessionPath(slug: string): string {
  return `/sessions/${slug}`;
}
