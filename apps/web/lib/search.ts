import type { AppState } from './data-connector';

export type SearchHit = {
  id: string;
  kind: 'Person' | 'Student' | 'Institution' | 'Department' | 'User' | 'Audit';
  title: string;
  detail: string;
  href: string;
};

function includes(query: string, ...fields: Array<string | undefined | null>) {
  return fields.some((field) => (field ?? '').toLowerCase().includes(query));
}

export function searchConsole(state: AppState, rawQuery: string): SearchHit[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  const encoded = encodeURIComponent(rawQuery.trim());
  const hits: SearchHit[] = [];

  for (const person of state.people) {
    if (includes(query, person.name, person.email, person.phone, person.relation)) {
      hits.push({
        id: person.id,
        kind: 'Person',
        title: person.name,
        detail: `${person.relation} · ${person.email}`,
        href: `/admin/people?q=${encoded}`,
      });
    }
  }

  for (const student of state.students) {
    if (includes(query, student.name, student.email, student.studentNo, student.status, student.campus, student.department)) {
      hits.push({
        id: student.id,
        kind: 'Student',
        title: student.name,
        detail: `${student.studentNo} · ${student.status}`,
        href: `/admin/students?q=${encoded}`,
      });
    }
  }

  for (const institution of state.institutions) {
    if (includes(query, institution.name, institution.code, institution.status)) {
      hits.push({
        id: institution.id,
        kind: 'Institution',
        title: institution.name,
        detail: `${institution.code} · ${institution.status}`,
        href: `/admin/institutions?q=${encoded}`,
      });
    }
  }

  for (const department of state.departments) {
    if (includes(query, department.name, department.code, department.campus, department.admin)) {
      hits.push({
        id: department.id,
        kind: 'Department',
        title: department.name,
        detail: `${department.campus} · ${department.admin}`,
        href: `/admin/institutions?q=${encoded}`,
      });
    }
  }

  for (const user of state.userRoles) {
    if (includes(query, user.name, user.email, user.role, user.scope, user.status)) {
      hits.push({
        id: user.id,
        kind: 'User',
        title: user.name,
        detail: `${user.role} · ${user.scope ?? user.status}`,
        href: `/admin/users?q=${encoded}`,
      });
    }
  }

  for (const event of state.auditLogs) {
    if (includes(query, event.action, event.label, event.actor, event.resource, event.status, event.result)) {
      hits.push({
        id: event.id,
        kind: 'Audit',
        title: event.label || event.action,
        detail: `${event.actor} · ${event.status}`,
        href: `/admin/audit?q=${encoded}`,
      });
    }
  }

  return hits.slice(0, 8);
}

export function matchesQuery(rawQuery: string, ...fields: Array<string | undefined | null>) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return includes(query, ...fields);
}
