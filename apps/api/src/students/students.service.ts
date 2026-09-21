import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CreateStudentSchema,
  PatchStudentStatusSchema,
} from '@ricozedu/shared-types';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { AuditWriter } from '../common/audit-writer';
import { OutboxWriter } from '../common/outbox-writer';
import { IdempotencyService } from '../common/idempotency.service';
import { ApiError } from '../common/api-error';
import { assertTransition, StudentStatus } from './status-transitions';

type CreateStudent = z.infer<typeof CreateStudentSchema>;
type PatchStudentStatus = z.infer<typeof PatchStudentStatusSchema>;

@Injectable()
export class StudentsService {
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
    data: CreateStudent;
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

      let personId = input.data.personId;
      if (!personId && input.data.person) {
        const p = input.data.person;
        const displayName = `${p.givenName} ${p.familyName}`.trim();
        const created = await client.query<{ id: string }>(
          `INSERT INTO persons (given_name, family_name, display_name, primary_email, date_of_birth, created_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [
            p.givenName,
            p.familyName,
            displayName,
            p.primaryEmail ? p.primaryEmail.toLowerCase() : null,
            p.dateOfBirth ?? null,
            input.actorUserId,
          ],
        );
        personId = created.rows[0]!.id;
      }
      if (!personId) {
        throw new ApiError(
          'PERSON_REQUIRED',
          'personId or person is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const status = (input.data.status ?? 'prospective') as StudentStatus;
      const r = await client.query<{
        id: string;
        student_number: string;
        status: string;
        version: number;
      }>(
        `INSERT INTO student_memberships (
           tenant_id, institution_id, campus_id, person_id, student_number,
           status, effective_from, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::date, CURRENT_DATE),$8)
         RETURNING id, student_number, status, version`,
        [
          input.tenantId,
          input.data.institutionId,
          input.data.campusId ?? null,
          personId,
          input.data.studentNumber,
          status,
          input.data.effectiveFrom ?? null,
          input.actorUserId,
        ],
      );

      await client.query(
        `INSERT INTO student_status_history (
           tenant_id, student_membership_id, from_status, to_status, reason, changed_by_user_id
         ) VALUES ($1,$2,NULL,$3,'initial',$4)`,
        [input.tenantId, r.rows[0]!.id, status, input.actorUserId],
      );

      const result = {
        id: r.rows[0]!.id,
        personId,
        institutionId: input.data.institutionId,
        campusId: input.data.campusId ?? null,
        studentNumber: r.rows[0]!.student_number,
        status: r.rows[0]!.status,
        version: r.rows[0]!.version,
      };

      await this.audit.write(client, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorMembershipId: input.actorMembershipId,
        action: 'student.create',
        resourceType: 'student_membership',
        resourceId: result.id,
        correlationId: input.correlationId,
      });
      await this.outbox.write(client, {
        tenantId: input.tenantId,
        aggregateType: 'student_membership',
        aggregateId: result.id,
        eventType: 'student.created',
        payload: result,
        idempotencyKey: `student.created:${result.id}`,
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

  async getById(tenantId: string, userId: string, id: string) {
    return this.db.withTenantTx(tenantId, userId, async (client) => {
      const r = await client.query<{
        id: string;
        person_id: string;
        institution_id: string;
        campus_id: string | null;
        student_number: string;
        status: string;
        version: number;
        effective_from: string;
        effective_to: string | null;
      }>(
        `SELECT id, person_id, institution_id, campus_id, student_number,
                status, version, effective_from::text, effective_to::text
         FROM student_memberships
         WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      // Cross-tenant or missing ? 404 (RLS also hides other tenants)
      if (!r.rows[0]) {
        throw new ApiError('STUDENT_NOT_FOUND', 'Student not found', HttpStatus.NOT_FOUND);
      }
      const row = r.rows[0];
      return {
        id: row.id,
        personId: row.person_id,
        institutionId: row.institution_id,
        campusId: row.campus_id,
        studentNumber: row.student_number,
        status: row.status,
        version: row.version,
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
      };
    });
  }

  async patchStatus(input: {
    tenantId: string;
    actorUserId: string;
    actorMembershipId: string | null;
    correlationId: string;
    studentId: string;
    data: PatchStudentStatus;
  }) {
    return this.db.withTenantTx(input.tenantId, input.actorUserId, async (client) => {
      const current = await client.query<{
        id: string;
        status: StudentStatus;
        version: number;
      }>(
        `SELECT id, status, version FROM student_memberships
         WHERE id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [input.studentId, input.tenantId],
      );
      if (!current.rows[0]) {
        throw new ApiError('STUDENT_NOT_FOUND', 'Student not found', HttpStatus.NOT_FOUND);
      }
      const row = current.rows[0];
      if (row.version !== input.data.version) {
        throw new ApiError(
          'VERSION_CONFLICT',
          'Student version mismatch',
          HttpStatus.CONFLICT,
          { expected: input.data.version, actual: row.version },
        );
      }

      try {
        assertTransition(row.status, input.data.toStatus as StudentStatus);
      } catch {
        throw new ApiError(
          'INVALID_STATUS_TRANSITION',
          `Cannot transition from ${row.status} to ${input.data.toStatus}`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const updated = await client.query<{
        id: string;
        status: string;
        version: number;
      }>(
        `UPDATE student_memberships
         SET status = $3, updated_at = now(), updated_by = $4, version = version + 1
         WHERE id = $1 AND tenant_id = $2 AND version = $5
         RETURNING id, status, version`,
        [
          input.studentId,
          input.tenantId,
          input.data.toStatus,
          input.actorUserId,
          input.data.version,
        ],
      );
      if (!updated.rows[0]) {
        throw new ApiError('VERSION_CONFLICT', 'Student version mismatch', HttpStatus.CONFLICT);
      }

      await client.query(
        `INSERT INTO student_status_history (
           tenant_id, student_membership_id, from_status, to_status, reason, changed_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          input.tenantId,
          input.studentId,
          row.status,
          input.data.toStatus,
          input.data.reason,
          input.actorUserId,
        ],
      );

      const result = {
        id: updated.rows[0].id,
        status: updated.rows[0].status,
        version: updated.rows[0].version,
        fromStatus: row.status,
      };

      await this.audit.write(client, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorMembershipId: input.actorMembershipId,
        action: 'student.status_change',
        resourceType: 'student_membership',
        resourceId: input.studentId,
        correlationId: input.correlationId,
        metadata: result,
      });
      await this.outbox.write(client, {
        tenantId: input.tenantId,
        aggregateType: 'student_membership',
        aggregateId: input.studentId,
        eventType: 'student.status_changed',
        payload: result,
        idempotencyKey: `student.status:${input.studentId}:${updated.rows[0].version}`,
      });

      return result;
    });
  }
}
