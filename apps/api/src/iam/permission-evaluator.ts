export type ScopeLevel =
  | 'tenant'
  | 'institution'
  | 'campus'
  | 'faculty'
  | 'department'
  | 'programme'
  | 'course'
  | 'section';

/** Resource the caller wants to act on. All ids optional; null = not constrained. */
export interface ResourceRef {
  tenantId: string;
  institutionId?: string | null;
  campusId?: string | null;
  facultyId?: string | null;
  departmentId?: string | null;
  programmeId?: string | null;
  courseId?: string | null;
  sectionId?: string | null;
}

/** Scope granted by a role binding or delegation. Null field = unrestricted at that level. */
export interface GrantedScope {
  institutionId?: string | null;
  campusId?: string | null;
  facultyId?: string | null;
  departmentId?: string | null;
  programmeId?: string | null;
  courseId?: string | null;
  sectionId?: string | null;
}

export interface PermissionGrant {
  permission: string;
  scope: GrantedScope;
  source: 'role_binding' | 'delegation';
  bindingId?: string;
  delegationId?: string;
}

/**
 * A grant covers a resource when every non-null grant dimension equals the resource
 * (or the resource omits that dimension). Null grant dimension = wildcard.
 */
export function scopeCoversResource(
  grant: GrantedScope,
  resource: ResourceRef,
): boolean {
  const checks: Array<[keyof GrantedScope, keyof ResourceRef]> = [
    ['institutionId', 'institutionId'],
    ['campusId', 'campusId'],
    ['facultyId', 'facultyId'],
    ['departmentId', 'departmentId'],
    ['programmeId', 'programmeId'],
    ['courseId', 'courseId'],
    ['sectionId', 'sectionId'],
  ];

  for (const [gKey, rKey] of checks) {
    const gVal = grant[gKey];
    if (gVal == null || gVal === undefined) continue;
    const rVal = resource[rKey];
    if (rVal == null || rVal === undefined) {
      // Grant is narrowed but resource has no id at this level ? deny (fail closed)
      return false;
    }
    if (String(rVal) !== String(gVal)) return false;
  }
  return true;
}

export function evaluatePermissionOnResource(
  grants: PermissionGrant[],
  required: string[],
  resource: ResourceRef,
): { allowed: boolean; matched: PermissionGrant[] } {
  const matched = grants.filter(
    (g) =>
      required.includes(g.permission) && scopeCoversResource(g.scope, resource),
  );
  const have = new Set(matched.map((m) => m.permission));
  const allowed = required.every((p) => have.has(p));
  return { allowed, matched };
}

export function evaluatePermissionSet(codes: string[]): Set<string> {
  return new Set(codes.filter((c) => typeof c === 'string' && c.length > 0));
}

export function hasAllPermissions(
  granted: Set<string>,
  required: string[],
): boolean {
  return required.every((p) => granted.has(p));
}

export function hasAnyPermission(
  granted: Set<string>,
  required: string[],
): boolean {
  return required.some((p) => granted.has(p));
}
