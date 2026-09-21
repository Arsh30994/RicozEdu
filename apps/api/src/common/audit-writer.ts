import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

export interface AuditInput {
  tenantId: string | null;
  actorUserId: string | null;
  actorMembershipId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  correlationId: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditWriter {
  async write(client: PoolClient, input: AuditInput): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO audit_events (
         tenant_id, actor_user_id, actor_membership_id, action,
         resource_type, resource_id, correlation_id, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING id`,
      [
        input.tenantId,
        input.actorUserId,
        input.actorMembershipId,
        input.action,
        input.resourceType,
        input.resourceId,
        input.correlationId,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return r.rows[0]!.id;
  }
}
