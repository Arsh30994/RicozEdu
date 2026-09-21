import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../database/redis.service';
import { evaluatePermissionSet } from './permission-evaluator';

@Injectable()
export class PermissionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  cacheKey(userId: string, tenantId: string, av: number): string {
    return `perm:${userId}:${tenantId}:${av}`;
  }

  async getPermissions(
    userId: string,
    tenantId: string,
    av: number,
  ): Promise<Set<string>> {
    const key = this.cacheKey(userId, tenantId, av);
    const cached = await this.redis.get(key);
    if (cached) {
      try {
        return new Set(JSON.parse(cached) as string[]);
      } catch {
        /* fall through */
      }
    }

    const codes = await this.loadFromDb(userId, tenantId);
    const set = evaluatePermissionSet(codes);
    await this.redis.setex(key, 60, JSON.stringify([...set]));
    return set;
  }

  private async loadFromDb(userId: string, tenantId: string): Promise<string[]> {
    return this.db.withTenantTx(tenantId, userId, async (client) => {
      const r = await client.query<{ code: string }>(
        `SELECT DISTINCT p.code
         FROM user_memberships um
         JOIN role_bindings rb ON rb.user_membership_id = um.id AND rb.tenant_id = um.tenant_id
         JOIN roles r ON r.id = rb.role_id
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE um.user_id = $1 AND um.tenant_id = $2 AND um.status = 'active'`,
        [userId, tenantId],
      );
      return r.rows.map((row) => row.code);
    });
  }
}
