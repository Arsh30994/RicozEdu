import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

export interface OutboxInput {
  tenantId: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

@Injectable()
export class OutboxWriter {
  async write(client: PoolClient, input: OutboxInput): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO outbox_events (
         tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        input.tenantId,
        input.aggregateType,
        input.aggregateId,
        input.eventType,
        JSON.stringify(input.payload),
        input.idempotencyKey,
      ],
    );
    return r.rows[0]?.id ?? '';
  }
}
