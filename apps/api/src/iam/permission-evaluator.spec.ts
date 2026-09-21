import {
  evaluatePermissionSet,
  hasAllPermissions,
  hasAnyPermission,
  scopeCoversResource,
  evaluatePermissionOnResource,
  PermissionGrant,
  ResourceRef,
} from './permission-evaluator';

describe('permission evaluator', () => {
  it('builds a set from codes and ignores empties', () => {
    const set = evaluatePermissionSet(['student.read', '', 'student.manage']);
    expect(set.has('student.read')).toBe(true);
    expect(set.has('student.manage')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('checks all / any', () => {
    const set = evaluatePermissionSet(['a', 'b']);
    expect(hasAllPermissions(set, ['a', 'b'])).toBe(true);
    expect(hasAllPermissions(set, ['a', 'c'])).toBe(false);
    expect(hasAnyPermission(set, ['c', 'b'])).toBe(true);
    expect(hasAnyPermission(set, ['c'])).toBe(false);
  });

  it('scope covers resource with wildcards and denies mismatches', () => {
    const grant = { institutionId: 'inst-1', campusId: null };
    const ok: ResourceRef = {
      tenantId: 't1',
      institutionId: 'inst-1',
      campusId: 'c1',
    };
    const bad: ResourceRef = { tenantId: 't1', institutionId: 'inst-2' };
    expect(scopeCoversResource(grant, ok)).toBe(true);
    expect(scopeCoversResource(grant, bad)).toBe(false);
    expect(
      scopeCoversResource({ sectionId: 's1' }, { tenantId: 't1' }),
    ).toBe(false);
  });

  it('evaluates permission on resource', () => {
    const grants: PermissionGrant[] = [
      {
        permission: 'student.read',
        source: 'role_binding',
        scope: { institutionId: 'inst-1' },
      },
    ];
    const allowed = evaluatePermissionOnResource(grants, ['student.read'], {
      tenantId: 't1',
      institutionId: 'inst-1',
    });
    const denied = evaluatePermissionOnResource(grants, ['student.read'], {
      tenantId: 't1',
      institutionId: 'inst-2',
    });
    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
  });
});
