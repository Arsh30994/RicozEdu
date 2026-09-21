import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../database/redis.service';

const STREAM = 'ricoz.edu.events';
const POLL_MS = Number(process.env.OUTBOX_POLL_MS ?? 2000);
const BATCH = Number(process.env.OUTBOX_BATCH_SIZE ?? 50);

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    if (process.env.OUTBOX_RELAY_DISABLED === '1') return;
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.publishBatch();
    } catch (err) {
      this.log.warn(`outbox tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async publishBatch() {
    // Use migrator pool so platform/null-tenant outbox rows are visible without RLS tenant context
    const client = await this.db.migratorPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET search_path TO ricoz, public`);
      const rows = await client.query<{
        id: string;
        tenant_id: string | null;
        aggregate_type: string;
        aggregate_id: string;
        event_type: string;
        payload: unknown;
        idempotency_key: string;
      }>(
        `SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
         FROM outbox_events
         WHERE status = 'pending' AND next_attempt_at <= now()
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1`,
        [BATCH],
      );

      for (const row of rows.rows) {
        const id = await this.redis.xadd(STREAM, {
          id: row.id,
          tenantId: row.tenant_id ?? '',
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          eventType: row.event_type,
          idempotencyKey: row.idempotency_key,
          payload: JSON.stringify(row.payload),
        });

        if (id) {
          await client.query(
            `UPDATE outbox_events
             SET status = 'published', published_at = now(), attempts = attempts + 1
             WHERE id = $1`,
            [row.id],
          );
        } else {
          await client.query(
            `UPDATE outbox_events
             SET attempts = attempts + 1,
                 next_attempt_at = now() + interval '15 seconds',
                 status = CASE WHEN attempts + 1 >= 20 THEN 'failed' ELSE status END
             WHERE id = $1`,
            [row.id],
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
