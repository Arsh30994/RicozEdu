import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export type TenantTxFn<T> = (client: PoolClient) => Promise<T>;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;
  readonly migratorPool: Pool;

  constructor() {
    const appUrl = process.env.DATABASE_URL;
    const migrateUrl = process.env.DATABASE_MIGRATE_URL;
    if (!appUrl) throw new Error('DATABASE_URL is required');
    if (!migrateUrl) throw new Error('DATABASE_MIGRATE_URL is required');

    this.pool = new Pool({ connectionString: appUrl });
    this.migratorPool = new Pool({ connectionString: migrateUrl });

    this.pool.on('connect', (client) => {
      void client.query(`SET search_path TO ricoz, public`);
    });
    this.migratorPool.on('connect', (client) => {
      void client.query(`SET search_path TO ricoz, public`);
    });
  }

  async onModuleDestroy() {
    await Promise.all([this.pool.end(), this.migratorPool.end()]);
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async withTenantTx<T>(
    tenantId: string,
    userId: string | null,
    fn: TenantTxFn<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET search_path TO ricoz, public`);
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantId,
      ]);
      if (userId) {
        await client.query(`SELECT set_config('app.user_id', $1, true)`, [
          userId,
        ]);
      }
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async withMigratorTx<T>(fn: TenantTxFn<T>): Promise<T> {
    const client = await this.migratorPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET search_path TO ricoz, public`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
