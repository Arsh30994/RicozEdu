import { HttpStatus, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ApiError } from '../common/api-error';
import { AuditWriter } from '../common/audit-writer';
import { OutboxWriter } from '../common/outbox-writer';
import { RevocationService } from './revocation.service';

@Injectable()
export class DelegationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly revocation: RevocationService,
  ) {}

  async expireDue(tenantId: string, actorUserId: string | null): Promise<number> {
    return this.db.withTenantTx(tenantId, actorUserId, async (client) => {
      const r = await client.query<{ id: string; delegatee_user_id: string }>(
        `UPDATE delegations d
         SET status = 'expired', updated_at = now()
         FROM user_memberships um
         WHERE d.delegatee_membership_id = um.id
           AND d.tenant_id = $1
           AND d.status = 'active'
           AND d.effective_to <= now()
         RETURNING d.id, um.user_id AS delegatee_user_id`,
        [tenantId],
      );
      for (const row of r.rows) {
        await this.revocation.bumpAuthorizationVersion(
          row.delegatee_user_id,
          'delegation_expired',
          {
            tenantId,
            actorUserId,
            correlationId: row.id,
            client,
          },
        );
      }
      return r.rowCount ?? 0;
    });
  }

  async create(input: {
    tenantId: string;
    actorUserId: string;
    actorMembershipId: string;
    delegateeMembershipId: string;
    roleId: string;
    resourceScopeId?: string | null;
    effectiveFrom: Date;
    effectiveTo: Date;
    correlationId: string;
  }) {
    if (input.effectiveTo <= input.effectiveFrom) {
      throw new ApiError(
        'VALIDATION',
        'effectiveTo must be after effectiveFrom',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return this.db.withTenantTx(
      input.tenantId,
      input.actorUserId,
      async (client) => {
        const r = await client.query<{ id: string }>(
          `INSERT INTO delegations (
             tenant_id, delegator_membership_id, delegatee_membership_id,
             role_id, resource_scope_id, status, effective_from, effective_to, created_by
           ) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8)
           RETURNING id`,
          [
            input.tenantId,
            input.actorMembershipId,
            input.delegateeMembershipId,
            input.roleId,
            input.resourceScopeId ?? null,
            input.effectiveFrom.toISOString(),
            input.effectiveTo.toISOString(),
            input.actorUserId,
          ],
        );
        const id = r.rows[0]!.id;
        await this.audit.write(client, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          actorMembershipId: input.actorMembershipId,
          action: 'delegation.created',
          resourceType: 'delegation',
          resourceId: id,
          correlationId: input.correlationId,
          metadata: {},
        });
        await this.outbox.write(client, {
          tenantId: input.tenantId,
          aggregateType: 'delegation',
          aggregateId: id,
          eventType: 'delegation.created',
          payload: { id },
          idempotencyKey: `delegation.created:${id}`,
        });
        return { id };
      },
    );
  }

  async activate(
    tenantId: string,
    delegationId: string,
    actorUserId: string,
    correlationId: string,
  ) {
    return this.db.withTenantTx(tenantId, actorUserId, async (client) => {
      const r = await client.query<{
        id: string;
        delegatee_user_id: string;
      }>(
        `UPDATE delegations d
         SET status = 'active', updated_at = now()
         FROM user_memberships um
         WHERE d.id = $1 AND d.delegatee_membership_id = um.id AND d.status = 'pending'
           AND d.effective_to > now()
         RETURNING d.id, um.user_id AS delegatee_user_id`,
        [delegationId],
      );
      const row = r.rows[0];
      if (!row) {
        throw new ApiError(
          'NOT_FOUND',
          'Delegation not found or not pending',
          HttpStatus.NOT_FOUND,
        );
      }
      await this.revocation.bumpAuthorizationVersion(
        row.delegatee_user_id,
        'delegation_activated',
        { tenantId, actorUserId, correlationId, client },
      );
      await this.audit.write(client, {
        tenantId,
        actorUserId,
        actorMembershipId: null,
        action: 'delegation.activated',
        resourceType: 'delegation',
        resourceId: delegationId,
        correlationId,
        metadata: {},
      });
      return { id: delegationId, status: 'active' as const };
    });
  }

  async revoke(
    tenantId: string,
    delegationId: string,
    actorUserId: string,
    correlationId: string,
    reason: string,
  ) {
    return this.db.withTenantTx(tenantId, actorUserId, async (client) => {
      const r = await client.query<{ id: string; delegatee_user_id: string }>(
        `UPDATE delegations d
         SET status = 'revoked', revoked_at = now(), revoked_by = $2,
             revocation_reason = $3, updated_at = now()
         FROM user_memberships um
         WHERE d.id = $1 AND d.delegatee_membership_id = um.id
           AND d.status IN ('pending','active')
         RETURNING d.id, um.user_id AS delegatee_user_id`,
        [delegationId, actorUserId, reason],
      );
      const row = r.rows[0];
      if (!row) {
        throw new ApiError('NOT_FOUND', 'Delegation not found', HttpStatus.NOT_FOUND);
      }
      await this.revocation.bumpAuthorizationVersion(
        row.delegatee_user_id,
        `delegation_revoked:${reason}`,
        { tenantId, actorUserId, correlationId, client },
      );
      await this.audit.write(client, {
        tenantId,
        actorUserId,
        actorMembershipId: null,
        action: 'delegation.revoked',
        resourceType: 'delegation',
        resourceId: delegationId,
        correlationId,
        metadata: { reason },
      });
      return { id: delegationId, status: 'revoked' as const };
    });
  }

  /**
   * Revalidate a queued job before execution.
   */
  async revalidateJobPrincipal(input: {
    tenantId: string;
    userId: string;
    expectedAuthorizationVersion: number;
    delegationId?: string | null;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    return this.db.withTenantTx(input.tenantId, input.userId, async (client) => {
      const u = await client.query<{
        authorization_version: number;
        status: string;
      }>(`SELECT authorization_version, status FROM users WHERE id = $1`, [
        input.userId,
      ]);
      const user = u.rows[0];
      if (!user || user.status !== 'active') {
        return { ok: false as const, reason: 'user_inactive' };
      }
      if (user.authorization_version !== input.expectedAuthorizationVersion) {
        return { ok: false as const, reason: 'authorization_version_stale' };
      }
      const m = await client.query(
        `SELECT id FROM user_memberships
         WHERE tenant_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1`,
        [input.tenantId, input.userId],
      );
      if (!m.rows[0]) {
        return { ok: false as const, reason: 'membership_revoked' };
      }
      if (input.delegationId) {
        const d = await client.query<{ status: string; effective_to: Date }>(
          `SELECT status, effective_to FROM delegations WHERE id = $1`,
          [input.delegationId],
        );
        const del = d.rows[0];
        if (
          !del ||
          del.status !== 'active' ||
          new Date(del.effective_to) <= new Date()
        ) {
          return { ok: false as const, reason: 'delegation_expired_or_revoked' };
        }
      }
      return { ok: true as const };
    });
  }
}
