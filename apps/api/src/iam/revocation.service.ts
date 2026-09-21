import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../database/redis.service';
import { AuditWriter } from '../common/audit-writer';

/**
 * Bumps authorization_version, revokes sessions, invalidates tenant-aware caches.
 */
@Injectable()
export class RevocationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly audit: AuditWriter,
  ) {}

  async bumpAuthorizationVersion(
    userId: string,
    reason: string,
    opts: {
      tenantId?: string | null;
      actorUserId?: string | null;
      correlationId: string;
      client?: PoolClient;
    },
  ): Promise<number> {
    const exec = async (client: PoolClient) => {
      const cur = await client.query<{ authorization_version: number }>(
        `SELECT authorization_version FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      );
      const from = cur.rows[0]?.authorization_version;
      if (from == null) throw new Error('User not found');
      const to = from + 1;
      await client.query(
        `UPDATE users SET authorization_version = $2, updated_at = now() WHERE id = $1`,
        [userId, to],
      );
      await client.query(
        `INSERT INTO authorization_version_events
           (user_id, tenant_id, from_version, to_version, reason, actor_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          opts.tenantId ?? null,
          from,
          to,
          reason,
          opts.actorUserId ?? null,
        ],
      );
      await client.query(
        `UPDATE sessions SET revoked_at = now(), revoke_reason = $2
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId, reason],
      );
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
      await this.audit.write(client, {
        tenantId: opts.tenantId ?? null,
        actorUserId: opts.actorUserId ?? null,
        actorMembershipId: null,
        action: 'authz.version_bumped',
        resourceType: 'user',
        resourceId: userId,
        correlationId: opts.correlationId,
        metadata: { reason, authorizationVersion: to },
      });
      return to;
    };

    const newAv = opts.client
      ? await exec(opts.client)
      : await this.db.withMigratorTx(exec);

    await this.invalidatePermissionCaches(userId, opts.tenantId ?? undefined);
    return newAv;
  }

  async revokeMembership(
    tenantId: string,
    membershipId: string,
    actorUserId: string,
    correlationId: string,
    reason: string,
  ): Promise<void> {
    await this.db.withTenantTx(tenantId, actorUserId, async (client) => {
      const m = await client.query<{ user_id: string }>(
        `UPDATE user_memberships
         SET status = 'revoked', updated_at = now()
         WHERE id = $1
         RETURNING user_id`,
        [membershipId],
      );
      const userId = m.rows[0]?.user_id;
      if (!userId) return;

      await this.audit.write(client, {
        tenantId,
        actorUserId,
        actorMembershipId: null,
        action: 'membership.revoked',
        resourceType: 'user_membership',
        resourceId: membershipId,
        correlationId,
        metadata: { reason },
      });

      await this.bumpAuthorizationVersion(userId, `membership_revoked:${reason}`, {
        tenantId,
        actorUserId,
        correlationId,
        client,
      });
    });
  }

  async invalidatePermissionCaches(
    userId: string,
    tenantId?: string,
  ): Promise<void> {
    if (tenantId) {
      for (let av = 1; av <= 100; av++) {
        await this.redis.del(`perm:${userId}:${tenantId}:${av}`);
        await this.redis.del(`grants:${userId}:${tenantId}:${av}`);
      }
      await this.redis.del(`search:tenant:${tenantId}:user:${userId}`);
      await this.redis.del(`analytics:tenant:${tenantId}:user:${userId}`);
      await this.redis.del(`ai:tenant:${tenantId}:user:${userId}`);
    }
  }
}
