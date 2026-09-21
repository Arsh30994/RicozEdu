import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateUserSchema } from '@ricozedu/shared-types';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { AuthService } from './auth.service';
import { AuditWriter } from '../common/audit-writer';
import { OutboxWriter } from '../common/outbox-writer';
import { IdempotencyService } from '../common/idempotency.service';
import { ApiError } from '../common/api-error';

type CreateUser = z.infer<typeof CreateUserSchema>;

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
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
    data: CreateUser;
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

      const passwordHash = await this.auth.hashPassword(input.data.password);
      const displayName = `${input.data.givenName} ${input.data.familyName}`.trim();

      const person = await client.query<{ id: string }>(
        `INSERT INTO persons (given_name, family_name, display_name, primary_email, created_by)
         VALUES ($1,$2,$3,lower($4),$5)
         RETURNING id`,
        [
          input.data.givenName,
          input.data.familyName,
          displayName,
          input.data.email,
          input.actorUserId,
        ],
      );

      let user;
      try {
        user = await client.query<{ id: string; email: string }>(
          `INSERT INTO users (person_id, email, password_hash, created_by)
           VALUES ($1, lower($2), $3, $4)
           RETURNING id, email`,
          [person.rows[0]!.id, input.data.email, passwordHash, input.actorUserId],
        );
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === '23505') {
          throw new ApiError('EMAIL_EXISTS', 'Email already registered', HttpStatus.CONFLICT);
        }
        throw err;
      }

      const membership = await client.query<{ id: string }>(
        `INSERT INTO user_memberships (tenant_id, user_id, institution_id, created_by)
         VALUES ($1,$2,$3,$4)
         RETURNING id`,
        [
          input.tenantId,
          user.rows[0]!.id,
          input.data.institutionId ?? null,
          input.actorUserId,
        ],
      );

      const result = {
        id: user.rows[0]!.id,
        email: user.rows[0]!.email,
        personId: person.rows[0]!.id,
        membershipId: membership.rows[0]!.id,
      };

      await this.audit.write(client, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorMembershipId: input.actorMembershipId,
        action: 'user.create',
        resourceType: 'user',
        resourceId: result.id,
        correlationId: input.correlationId,
      });
      await this.outbox.write(client, {
        tenantId: input.tenantId,
        aggregateType: 'user',
        aggregateId: result.id,
        eventType: 'user.created',
        payload: result,
        idempotencyKey: `user.created:${result.id}`,
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
}
