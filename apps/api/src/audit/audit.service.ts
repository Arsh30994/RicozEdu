import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async list(tenantId: string, userId: string, limit: number) {
    return this.db.withTenantTx(tenantId, userId, async (client) => {
      const r = await client.query<{
        id: string;
        action: string;
        resource_type: string;
        resource_id: string | null;
        actor_user_id: string | null;
        correlation_id: string;
        created_at: Date;
        metadata: unknown;
      }>(
        `SELECT id, action, resource_type, resource_id, actor_user_id,
                correlation_id, created_at, metadata
         FROM audit_events
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [tenantId, limit],
      );
      return r.rows.map((row) => ({
        id: row.id,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        actorUserId: row.actor_user_id,
        correlationId: row.correlation_id,
        createdAt: row.created_at,
        metadata: row.metadata,
      }));
    });
  }
}
