import { Injectable } from '@nestjs/common';
import { CreateMembershipSchema } from '@ricozedu/shared-types';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { AuditWriter } from '../common/audit-writer';
import { OutboxWriter } from '../common/outbox-writer';
import { IdempotencyService } from '../common/idempotency.service';

type CreateMembership = z.infer<typeof CreateMembershipSchema>;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly idem: IdempotencyService,
  ) {}

  async create(input: {
    tenantId: string;
    actorUserId: string;
    actorMembershipId: string | null;
    correlationId: string;
    idempotencyKey?: string;
    data: CreateMembership;
  }) {
    return this.db.withTenantTx(input.tenantId, input.actorUserId, async (client) => {
      if (input.idempotencyKey) {
        const gate = await this.idem.begin(
          client,
          input.tenantId,
          input.actorUserId,
          input.idempotencyKey,
          input.data,
        );
        if (gate.replay) return gate.body;
      }

      const r = await client.query<{ id: string }>(
        `INSERT INTO user_memberships (tenant_id, user_id, institution_id, created_by)
         VALUES ($1,$2,$3,$4)
         RETURNING id`,
        [
          input.tenantId,
          input.data.userId,
          input.data.institutionId ?? null,
          input.actorUserId,
        ],
      );

      const result = {
        id: r.rows[0]!.id,
        userId: input.data.userId,
        tenantId: input.tenantId,
        institutionId: input.data.institutionId ?? null,
      };

      await this.audit.write(client, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorMembershipId: input.actorMembershipId,
        action: 'membership.create',
        resourceType: 'user_membership',
        resourceId: result.id,
        correlationId: input.correlationId,
      });
      await this.outbox.write(client, {
        tenantId: input.tenantId,
        aggregateType: 'user_membership',
        aggregateId: result.id,
        eventType: 'membership.created',
        payload: result,
        idempotencyKey: `membership.created:${result.id}`,
      });

      if (input.idempotencyKey) {
        await this.idem.complete(
          client,
          input.tenantId,
          input.actorUserId,
          input.idempotencyKey,
          201,
          result,
        );
      }
      return result;
    });
  }

  /**
   * Cross-tenant membership discovery for the signed-in user.
   * Uses migrator connection (BYPASSRLS) but always filters by JWT user id.
   */
  async listForUser(userId: string) {
    return this.db.withMigratorTx(async (client) => {
      const r = await client.query<{
        id: string;
        tenant_id: string;
        tenant_slug: string;
        tenant_name: string;
        institution_id: string | null;
        status: string;
      }>(
        `SELECT um.id, um.tenant_id, t.slug AS tenant_slug, t.name AS tenant_name,
                um.institution_id, um.status
         FROM ricoz.user_memberships um
         JOIN ricoz.tenants t ON t.id = um.tenant_id
         WHERE um.user_id = $1 AND um.status = 'active' AND t.status = 'active'
         ORDER BY t.name`,
        [userId],
      );
      return r.rows.map((row) => ({
        membershipId: row.id,
        tenantId: row.tenant_id,
        tenantSlug: row.tenant_slug,
        tenantName: row.tenant_name,
        institutionId: row.institution_id,
        status: row.status,
      }));
    });
  }
}
