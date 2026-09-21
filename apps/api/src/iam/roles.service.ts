import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateRoleBindingSchema } from '@ricozedu/shared-types';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { AuditWriter } from '../common/audit-writer';
import { OutboxWriter } from '../common/outbox-writer';
import { ApiError } from '../common/api-error';

type CreateRoleBinding = z.infer<typeof CreateRoleBindingSchema>;

@Injectable()
export class RolesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async list(tenantId: string, userId: string) {
    return this.db.withTenantTx(tenantId, userId, async (client) => {
      const r = await client.query<{
        id: string;
        code: string;
        name: string;
        is_system: boolean;
        tenant_id: string | null;
      }>(
        `SELECT id, code, name, is_system, tenant_id
         FROM roles
         WHERE tenant_id = $1 OR tenant_id IS NULL
         ORDER BY code`,
        [tenantId],
      );
      return r.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        isSystem: row.is_system,
        tenantId: row.tenant_id,
      }));
    });
  }

  async bind(input: {
    tenantId: string;
    actorUserId: string;
    actorMembershipId: string | null;
    correlationId: string;
    roleId: string;
    data: CreateRoleBinding;
  }) {
    return this.db.withTenantTx(input.tenantId, input.actorUserId, async (client) => {
      const role = await client.query<{ id: string }>(
        `SELECT id FROM roles WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)`,
        [input.roleId, input.tenantId],
      );
      if (!role.rows[0]) {
        throw new ApiError('ROLE_NOT_FOUND', 'Role not found', HttpStatus.NOT_FOUND);
      }

      const r = await client.query<{ id: string }>(
        `INSERT INTO role_bindings (tenant_id, user_membership_id, role_id, institution_id, created_by)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [
          input.tenantId,
          input.data.userMembershipId,
          input.roleId,
          input.data.institutionId ?? null,
          input.actorUserId,
        ],
      );

      // bump av for bound user
      await client.query(
        `UPDATE users SET authorization_version = authorization_version + 1, updated_at = now()
         WHERE id = (SELECT user_id FROM user_memberships WHERE id = $1)`,
        [input.data.userMembershipId],
      );

      const result = {
        id: r.rows[0]!.id,
        roleId: input.roleId,
        userMembershipId: input.data.userMembershipId,
        institutionId: input.data.institutionId ?? null,
      };

      await this.audit.write(client, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorMembershipId: input.actorMembershipId,
        action: 'role.bind',
        resourceType: 'role_binding',
        resourceId: result.id,
        correlationId: input.correlationId,
      });
      await this.outbox.write(client, {
        tenantId: input.tenantId,
        aggregateType: 'role_binding',
        aggregateId: result.id,
        eventType: 'role.bound',
        payload: result,
        idempotencyKey: `role.bound:${result.id}`,
      });

      return result;
    });
  }
}
