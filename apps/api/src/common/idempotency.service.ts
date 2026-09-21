import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ApiError } from './api-error';
import { HttpStatus } from '@nestjs/common';

@Injectable()
export class IdempotencyService {
  hashBody(body: unknown): Buffer {
    return createHash('sha256').update(JSON.stringify(body ?? null)).digest();
  }

  async begin(
    client: PoolClient,
    tenantId: string,
    userId: string,
    key: string,
    body: unknown,
  ): Promise<{ replay: true; status: number; body: unknown } | { replay: false }> {
    const requestHash = this.hashBody(body);
    const existing = await client.query<{
      request_hash: Buffer;
      response_code: number | null;
      response_body: unknown;
    }>(
      `SELECT request_hash, response_code, response_body
       FROM idempotency_keys
       WHERE tenant_id = $1 AND user_id = $2 AND key = $3
       FOR UPDATE`,
      [tenantId, userId, key],
    );

    if (existing.rowCount && existing.rows[0]) {
      const row = existing.rows[0];
      if (!row.request_hash.equals(requestHash)) {
        throw new ApiError(
          'IDEMPOTENCY_KEY_REUSED',
          'Idempotency-Key was already used with a different payload',
          HttpStatus.CONFLICT,
        );
      }
      if (row.response_code != null) {
        return { replay: true, status: row.response_code, body: row.response_body };
      }
      return { replay: false };
    }

    await client.query(
      `INSERT INTO idempotency_keys (tenant_id, user_id, key, request_hash)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, userId, key, requestHash],
    );
    return { replay: false };
  }

  async complete(
    client: PoolClient,
    tenantId: string,
    userId: string,
    key: string,
    status: number,
    body: unknown,
  ): Promise<void> {
    await client.query(
      `UPDATE idempotency_keys
       SET response_code = $4, response_body = $5::jsonb
       WHERE tenant_id = $1 AND user_id = $2 AND key = $3`,
      [tenantId, userId, key, status, JSON.stringify(body)],
    );
  }
}
