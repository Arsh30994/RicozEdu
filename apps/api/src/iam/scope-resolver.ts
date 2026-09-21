import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import {
  GrantedScope,
  PermissionGrant,
  ResourceRef,
  evaluatePermissionOnResource,
} from './permission-evaluator';

@Injectable()
export class ScopeResolver {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Load all permission grants for a user in a tenant (role bindings + active delegations).
   */
  async loadGrants(
    userId: string,
    tenantId: string,
    client?: PoolClient,
  ): Promise<PermissionGrant[]> {
    const run = async (c: PoolClient) => {
      const bindings = await c.query<{
        permission: string;
        binding_id: string;
        institution_id: string | null;
        campus_id: string | null;
        faculty_id: string | null;
        department_id: string | null;
        programme_id: string | null;
        course_id: string | null;
        section_id: string | null;
        rb_institution_id: string | null;
      }>(
        `SELECT p.code AS permission,
                rb.id AS binding_id,
                rb.institution_id AS rb_institution_id,
                rs.institution_id,
                rs.campus_id,
                rs.faculty_id,
                rs.department_id,
                rs.programme_id,
                rs.course_id,
                rs.section_id
         FROM user_memberships um
         JOIN role_bindings rb ON rb.user_membership_id = um.id AND rb.tenant_id = um.tenant_id
         JOIN roles r ON r.id = rb.role_id
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         LEFT JOIN resource_scopes rs ON rs.role_binding_id = rb.id AND rs.tenant_id = rb.tenant_id
         WHERE um.user_id = $1 AND um.tenant_id = $2 AND um.status = 'active'`,
        [userId, tenantId],
      );

      const grants: PermissionGrant[] = bindings.rows.map((row) => ({
        permission: row.permission,
        source: 'role_binding' as const,
        bindingId: row.binding_id,
        scope: {
          institutionId: row.institution_id ?? row.rb_institution_id,
          campusId: row.campus_id,
          facultyId: row.faculty_id,
          departmentId: row.department_id,
          programmeId: row.programme_id,
          courseId: row.course_id,
          sectionId: row.section_id,
        },
      }));

      const dels = await c.query<{
        permission: string;
        delegation_id: string;
        institution_id: string | null;
        campus_id: string | null;
        faculty_id: string | null;
        department_id: string | null;
        programme_id: string | null;
        course_id: string | null;
        section_id: string | null;
      }>(
        `SELECT p.code AS permission,
                d.id AS delegation_id,
                rs.institution_id,
                rs.campus_id,
                rs.faculty_id,
                rs.department_id,
                rs.programme_id,
                rs.course_id,
                rs.section_id
         FROM user_memberships um
         JOIN delegations d ON d.delegatee_membership_id = um.id AND d.tenant_id = um.tenant_id
         JOIN roles r ON r.id = d.role_id
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         LEFT JOIN resource_scopes rs ON rs.id = d.resource_scope_id
         WHERE um.user_id = $1 AND um.tenant_id = $2 AND um.status = 'active'
           AND d.status = 'active'
           AND d.effective_from <= now()
           AND d.effective_to > now()
           AND d.revoked_at IS NULL`,
        [userId, tenantId],
      );

      for (const row of dels.rows) {
        grants.push({
          permission: row.permission,
          source: 'delegation',
          delegationId: row.delegation_id,
          scope: {
            institutionId: row.institution_id,
            campusId: row.campus_id,
            facultyId: row.faculty_id,
            departmentId: row.department_id,
            programmeId: row.programme_id,
            courseId: row.course_id,
            sectionId: row.section_id,
          },
        });
      }

      return grants;
    };

    if (client) return run(client);
    return this.db.withTenantTx(tenantId, userId, run);
  }

  async authorize(
    userId: string,
    tenantId: string,
    required: string[],
    resource: ResourceRef,
    opts?: { revalidate?: boolean; client?: PoolClient },
  ): Promise<{ allowed: boolean; grants: PermissionGrant[] }> {
    // Sensitive ops should pass revalidate=true to bypass cache and reload grants
    const grants = await this.loadGrants(userId, tenantId, opts?.client);
    const { allowed, matched } = evaluatePermissionOnResource(
      grants,
      required,
      resource,
    );
    return { allowed, grants: matched };
  }

  /** Resolve section ancestry for resource checks. */
  async resolveSectionResource(
    tenantId: string,
    userId: string,
    sectionId: string,
  ): Promise<ResourceRef | null> {
    return this.db.withTenantTx(tenantId, userId, async (c) => {
      const r = await c.query<{
        id: string;
        institution_id: string;
        campus_id: string | null;
        course_id: string;
        programme_id: string | null;
        department_id: string | null;
        faculty_id: string | null;
      }>(
        `SELECT s.id, s.institution_id, s.campus_id, s.course_id,
                c.programme_id, c.department_id, d.faculty_id
         FROM sections s
         JOIN courses c ON c.id = s.course_id
         LEFT JOIN departments d ON d.id = c.department_id
         WHERE s.id = $1`,
        [sectionId],
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        tenantId,
        institutionId: row.institution_id,
        campusId: row.campus_id,
        facultyId: row.faculty_id,
        departmentId: row.department_id,
        programmeId: row.programme_id,
        courseId: row.course_id,
        sectionId: row.id,
      };
    });
  }

  mergeRequestScopeHeaders(
    tenantId: string,
    headers: Record<string, string | string[] | undefined>,
  ): Partial<GrantedScope> {
    const pick = (name: string) => {
      const v = headers[name];
      return typeof v === 'string' && v.length > 0 ? v : undefined;
    };
    // Headers are hints for *requested* acting scope; never trusted as tenant authority
    return {
      institutionId: pick('x-institution-id'),
      campusId: pick('x-campus-id'),
      facultyId: pick('x-faculty-id'),
      departmentId: pick('x-department-id'),
      programmeId: pick('x-programme-id'),
      courseId: pick('x-course-id'),
      sectionId: pick('x-section-id'),
    };
  }
}
