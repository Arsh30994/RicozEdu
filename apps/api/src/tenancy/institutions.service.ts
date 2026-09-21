import { Injectable } from '@nestjs/common';
import {
  CreateCampusSchema,
  CreateInstitutionSchema,
} from '@ricozedu/shared-types';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { AuditWriter } from '../common/audit-writer';
import { OutboxWriter } from '../common/outbox-writer';

type CreateInstitution = z.infer<typeof CreateInstitutionSchema>;
type CreateCampus = z.infer<typeof CreateCampusSchema>;

@Injectable()
export class InstitutionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async create(
    tenantId: string,
    userId: string,
    membershipId: string | null,
    correlationId: string,
    data: CreateInstitution,
  ) {
    return this.db.withTenantTx(tenantId, userId, async (client) => {
      const r = await client.query<{ id: string; code: string; name: string }>(
        `INSERT INTO institutions (tenant_id, code, name, created_by)
         VALUES ($1,$2,$3,$4)
         RETURNING id, code, name`,
        [tenantId, data.code, data.name, userId],
      );
      const result = { ...r.rows[0]!, tenantId };
      await this.audit.write(client, {
        tenantId,
        actorUserId: userId,
        actorMembershipId: membershipId,
        action: 'institution.create',
        resourceType: 'institution',
        resourceId: result.id,
        correlationId,
      });
      await this.outbox.write(client, {
        tenantId,
        aggregateType: 'institution',
        aggregateId: result.id,
        eventType: 'institution.created',
        payload: result,
        idempotencyKey: `institution.created:${result.id}`,
      });
      return result;
    });
  }

  async list(tenantId: string, userId: string) {
    return this.db.withTenantTx(tenantId, userId, async (client) => {
      const r = await client.query<{
        id: string;
        code: string;
        name: string;
        status: string;
      }>(
        `SELECT id, code, name, status FROM institutions
         WHERE tenant_id = $1 AND archived_at IS NULL
         ORDER BY code`,
        [tenantId],
      );
      return r.rows;
    });
  }

  async createCampus(
    tenantId: string,
    userId: string,
    membershipId: string | null,
    correlationId: string,
    data: CreateCampus,
  ) {
    return this.db.withTenantTx(tenantId, userId, async (client) => {
      const r = await client.query<{ id: string; code: string; name: string }>(
        `INSERT INTO campuses (tenant_id, institution_id, code, name, created_by)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, code, name`,
        [tenantId, data.institutionId, data.code, data.name, userId],
      );
      const result = {
        ...r.rows[0]!,
        tenantId,
        institutionId: data.institutionId,
      };
      await this.audit.write(client, {
        tenantId,
        actorUserId: userId,
        actorMembershipId: membershipId,
        action: 'campus.create',
        resourceType: 'campus',
        resourceId: result.id,
        correlationId,
      });
      await this.outbox.write(client, {
        tenantId,
        aggregateType: 'campus',
        aggregateId: result.id,
        eventType: 'campus.created',
        payload: result,
        idempotencyKey: `campus.created:${result.id}`,
      });
      return result;
    });
  }
}
