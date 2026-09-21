import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateTenant } from '@ricozedu/shared-types';
import { SYSTEM_ROLES } from '@ricozedu/shared-auth';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../iam/auth.service';
import { AuditWriter } from '../common/audit-writer';
import { OutboxWriter } from '../common/outbox-writer';
import { IdempotencyService } from '../common/idempotency.service';
import { ApiError } from '../common/api-error';

@Injectable()
export class TenantsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly idem: IdempotencyService,
  ) {}

  async bootstrap(
    data: CreateTenant,
    correlationId: string,
    idempotencyKey?: string,
  ) {
    // Migrator pool bypasses RLS for initial tenant + admin insert
    return this.db.withMigratorTx(async (client) => {
      if (idempotencyKey) {
        // Bootstrap has no tenant yet; store under a platform sentinel after tenant create.
        // Pre-check not available; rely on slug uniqueness for retries.
      }

      const existing = await client.query(
        `SELECT id FROM tenants WHERE slug = $1`,
        [data.slug],
      );
      if (existing.rowCount) {
        throw new ApiError('TENANT_EXISTS', 'Tenant slug already exists', HttpStatus.CONFLICT);
      }

      const tenant = await client.query<{ id: string; slug: string; name: string }>(
        `INSERT INTO tenants (slug, name, status)
         VALUES ($1, $2, 'provisioning')
         RETURNING id, slug, name`,
        [data.slug, data.name],
      );
      const tenantId = tenant.rows[0]!.id;

      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

      if (idempotencyKey) {
        // After tenant exists we could use idempotency; skip for bootstrap platform path.
      }

      const passwordHash = await this.auth.hashPassword(data.adminPassword);
      const displayName = `${data.adminGivenName} ${data.adminFamilyName}`.trim();

      const person = await client.query<{ id: string }>(
        `INSERT INTO persons (given_name, family_name, display_name, primary_email)
         VALUES ($1,$2,$3,lower($4))
         RETURNING id`,
        [data.adminGivenName, data.adminFamilyName, displayName, data.adminEmail],
      );

      const user = await client.query<{ id: string }>(
        `INSERT INTO users (person_id, email, password_hash, status)
         VALUES ($1, lower($2), $3, 'active')
         RETURNING id`,
        [person.rows[0]!.id, data.adminEmail, passwordHash],
      );

      await client.query(`SELECT set_config('app.user_id', $1, true)`, [
        user.rows[0]!.id,
      ]);

      const membership = await client.query<{ id: string }>(
        `INSERT INTO user_memberships (tenant_id, user_id, status)
         VALUES ($1,$2,'active')
         RETURNING id`,
        [tenantId, user.rows[0]!.id],
      );

      // Copy TenantAdmin system role for this tenant
      const template = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM roles WHERE tenant_id IS NULL AND code = $1`,
        [SYSTEM_ROLES.TENANT_ADMIN],
      );
      if (!template.rows[0]) {
        throw new ApiError(
          'SYSTEM_ROLE_MISSING',
          'TenantAdmin system role not seeded',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const tenantRole = await client.query<{ id: string }>(
        `INSERT INTO roles (tenant_id, code, name, is_system)
         VALUES ($1, $2, $3, true)
         RETURNING id`,
        [tenantId, SYSTEM_ROLES.TENANT_ADMIN, template.rows[0].name],
      );

      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, permission_id FROM role_permissions WHERE role_id = $2`,
        [tenantRole.rows[0]!.id, template.rows[0].id],
      );

      const binding = await client.query<{ id: string }>(
        `INSERT INTO role_bindings (tenant_id, user_membership_id, role_id)
         VALUES ($1,$2,$3)
         RETURNING id`,
        [tenantId, membership.rows[0]!.id, tenantRole.rows[0]!.id],
      );

      await client.query(
        `UPDATE tenants SET status = 'active', updated_at = now() WHERE id = $1`,
        [tenantId],
      );

      const result = {
        id: tenantId,
        slug: tenant.rows[0]!.slug,
        name: tenant.rows[0]!.name,
        status: 'active',
        adminUserId: user.rows[0]!.id,
        adminMembershipId: membership.rows[0]!.id,
        adminRoleBindingId: binding.rows[0]!.id,
      };

      await this.audit.write(client, {
        tenantId,
        actorUserId: user.rows[0]!.id,
        actorMembershipId: membership.rows[0]!.id,
        action: 'tenant.bootstrap',
        resourceType: 'tenant',
        resourceId: tenantId,
        correlationId,
        metadata: { slug: data.slug },
      });
      await this.outbox.write(client, {
        tenantId,
        aggregateType: 'tenant',
        aggregateId: tenantId,
        eventType: 'tenant.created',
        payload: { id: tenantId, slug: data.slug, name: data.name },
        idempotencyKey: idempotencyKey
          ? `tenant.bootstrap:${idempotencyKey}`
          : `tenant.created:${tenantId}`,
      });

      return result;
    });
  }

  async getCurrent(tenantId: string, userId: string) {
    return this.db.withTenantTx(tenantId, userId, async (client) => {
      const r = await client.query<{
        id: string;
        slug: string;
        name: string;
        status: string;
      }>(`SELECT id, slug, name, status FROM tenants WHERE id = $1`, [tenantId]);
      if (!r.rows[0]) {
        throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', HttpStatus.NOT_FOUND);
      }
      return r.rows[0];
    });
  }
}
