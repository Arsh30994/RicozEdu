import { Injectable } from '@nestjs/common';
import { CreatePersonSchema } from '@ricozedu/shared-types';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { AuditWriter } from '../common/audit-writer';
import { OutboxWriter } from '../common/outbox-writer';
import { IdempotencyService } from '../common/idempotency.service';

type CreatePerson = z.infer<typeof CreatePersonSchema>;

@Injectable()
export class PersonsService {
  constructor(
    private readonly db: DatabaseService,
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
    data: CreatePerson;
  }) {
    // Persons are global; still run under tenant tx for audit/idempotency RLS
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

      const displayName = `${input.data.givenName} ${input.data.familyName}`.trim();
      const r = await client.query<{ id: string }>(
        `INSERT INTO persons (given_name, family_name, display_name, primary_email, date_of_birth, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [
          input.data.givenName,
          input.data.familyName,
          displayName,
          input.data.primaryEmail ? input.data.primaryEmail.toLowerCase() : null,
          input.data.dateOfBirth ?? null,
          input.actorUserId,
        ],
      );

      const result = {
        id: r.rows[0]!.id,
        givenName: input.data.givenName,
        familyName: input.data.familyName,
        displayName,
        primaryEmail: input.data.primaryEmail ?? null,
      };

      await this.audit.write(client, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorMembershipId: input.actorMembershipId,
        action: 'person.create',
        resourceType: 'person',
        resourceId: result.id,
        correlationId: input.correlationId,
      });
      await this.outbox.write(client, {
        tenantId: input.tenantId,
        aggregateType: 'person',
        aggregateId: result.id,
        eventType: 'person.created',
        payload: result,
        idempotencyKey: `person.created:${result.id}`,
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
