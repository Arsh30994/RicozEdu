import { createHash, randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { AuditWriter } from '../common/audit-writer';
import { OutboxWriter } from '../common/outbox-writer';
import { ApiError } from '../common/api-error';
import { DelegationService } from '../iam/delegation.service';
import { PermissionService } from '../iam/permission.service';
import {
  WORKFLOW_SPECS,
  WorkflowCode,
  assertTransition,
  isTerminal,
} from './workflow-catalog';
import { WorkflowMetrics } from './workflow-metrics';

export interface WorkflowCommandInput {
  tenantId: string;
  userId: string;
  membershipId: string;
  correlationId: string;
  workflowCode: WorkflowCode;
  commandType: string;
  idempotencyKey: string;
  aggregateType: string;
  aggregateId: string;
  institutionId?: string | null;
  personId?: string | null;
  studentMembershipId?: string | null;
  payload?: Record<string, unknown>;
  reason?: string;
  /** For queued workers */
  expectedAuthorizationVersion?: number;
  delegationId?: string | null;
  revalidateJob?: boolean;
}

@Injectable()
export class WorkflowService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly delegation: DelegationService,
    private readonly permissions: PermissionService,
    private readonly metrics: WorkflowMetrics,
  ) {}

  getSpec(code: WorkflowCode) {
    return WORKFLOW_SPECS[code];
  }

  listSpecs() {
    return Object.values(WORKFLOW_SPECS);
  }

  async executeCommand(input: WorkflowCommandInput) {
    const spec = WORKFLOW_SPECS[input.workflowCode];
    if (!spec) {
      throw new ApiError('NOT_FOUND', 'Unknown workflow', HttpStatus.NOT_FOUND);
    }
    if (input.aggregateType !== spec.aggregateType) {
      throw new ApiError(
        'VALIDATION',
        `aggregateType must be ${spec.aggregateType}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          workflowCode: input.workflowCode,
          commandType: input.commandType,
          aggregateId: input.aggregateId,
          payload: input.payload ?? {},
        }),
      )
      .digest();

    return this.db.withTenantTx(input.tenantId, input.userId, async (client) => {
      const userAvEarly = await client.query<{ authorization_version: number }>(
        `SELECT authorization_version FROM users WHERE id = $1`,
        [input.userId],
      );
      const avEarly = userAvEarly.rows[0]?.authorization_version ?? 1;
      const granted = await this.permissions.getPermissions(
        input.userId,
        input.tenantId,
        avEarly,
      );
      if (!granted.has(spec.requiredPermission)) {
        await this.audit.write(client, {
          tenantId: input.tenantId,
          actorUserId: input.userId,
          actorMembershipId: input.membershipId,
          action: 'permission.denied',
          resourceType: 'workflow',
          resourceId: null,
          correlationId: input.correlationId,
          metadata: {
            workflowCode: input.workflowCode,
            required: spec.requiredPermission,
          },
        });
        throw new ApiError(
          'FORBIDDEN',
          `Missing permission ${spec.requiredPermission} for workflow ${spec.code}`,
          HttpStatus.FORBIDDEN,
        );
      }

      // Idempotency short-circuit
      const existing = await client.query<{
        id: string;
        status: string;
        response_body: unknown;
        request_hash: Buffer;
      }>(
        `SELECT id, status, response_body, request_hash FROM workflow_commands
         WHERE tenant_id = $1 AND idempotency_key = $2`,
        [input.tenantId, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (!existing.rows[0].request_hash.equals(requestHash)) {
          throw new ApiError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key reused with different payload',
            HttpStatus.CONFLICT,
          );
        }
        this.metrics.inc('workflow_idempotent_replay_total', input.workflowCode);
        return existing.rows[0].response_body;
      }

      if (input.revalidateJob && input.expectedAuthorizationVersion != null) {
        const check = await this.delegation.revalidateJobPrincipal({
          tenantId: input.tenantId,
          userId: input.userId,
          expectedAuthorizationVersion: input.expectedAuthorizationVersion,
          delegationId: input.delegationId,
        });
        if (!check.ok) {
          this.metrics.inc('workflow_authz_revalidate_fail_total', input.workflowCode);
          throw new ApiError(
            'AUTHZ_STALE',
            `Permission/delegation no longer valid: ${check.reason}`,
            HttpStatus.FORBIDDEN,
            { reason: check.reason },
          );
        }
      }

      const userAv = await client.query<{ authorization_version: number }>(
        `SELECT authorization_version FROM users WHERE id = $1`,
        [input.userId],
      );
      const av = userAv.rows[0]?.authorization_version ?? 1;

      let instance = await client.query<{
        id: string;
        state: string;
        version: number;
      }>(
        `SELECT id, state, version FROM workflow_instances
         WHERE tenant_id = $1 AND workflow_code = $2
           AND aggregate_type = $3 AND aggregate_id = $4`,
        [input.tenantId, input.workflowCode, input.aggregateType, input.aggregateId],
      );

      let instanceId: string;
      let fromState: string | null;

      if (!instance.rows[0]) {
        if (input.commandType !== spec.transitions[0]?.command &&
            !spec.transitions.some((t) => t.from === spec.initialState && t.command === input.commandType)) {
          // Allow starting only with a command from initial state
        }
        const startCmdOk = spec.transitions.some(
          (t) => t.from === spec.initialState && t.command === input.commandType,
        );
        if (!startCmdOk) {
          throw new ApiError(
            'INVALID_TRANSITION',
            `Cannot start workflow with command ${input.commandType}`,
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        const created = await client.query<{ id: string }>(
          `INSERT INTO workflow_instances (
             tenant_id, institution_id, workflow_code, aggregate_type, aggregate_id,
             person_id, student_membership_id, state, authorization_version_at_start,
             payload, created_by, updated_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$11)
           RETURNING id`,
          [
            input.tenantId,
            input.institutionId ?? null,
            input.workflowCode,
            input.aggregateType,
            input.aggregateId,
            input.personId ?? null,
            input.studentMembershipId ?? null,
            spec.initialState,
            av,
            JSON.stringify(input.payload ?? {}),
            input.userId,
          ],
        );
        instanceId = created.rows[0]!.id;
        fromState = spec.initialState;
      } else {
        instanceId = instance.rows[0].id;
        fromState = instance.rows[0].state;
        if (isTerminal(spec, fromState)) {
          throw new ApiError(
            'WORKFLOW_TERMINAL',
            `Workflow already terminal in state ${fromState}`,
            HttpStatus.CONFLICT,
          );
        }
      }

      let transition;
      try {
        transition = assertTransition(spec, fromState!, input.commandType);
      } catch {
        throw new ApiError(
          'INVALID_TRANSITION',
          `Command ${input.commandType} not allowed from state ${fromState}`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          { fromState, commandType: input.commandType },
        );
      }

      const commandId = randomUUID();
      await client.query(
        `INSERT INTO workflow_commands (
           id, tenant_id, workflow_code, command_type, idempotency_key, request_hash,
           status, workflow_instance_id
         ) VALUES ($1,$2,$3,$4,$5,$6,'accepted',$7)`,
        [
          commandId,
          input.tenantId,
          input.workflowCode,
          input.commandType,
          input.idempotencyKey,
          requestHash,
          instanceId,
        ],
      );

      // Domain side-effect hook (controlled, not raw updates elsewhere)
      await this.applyDomainSideEffect(client, input, transition.to);

      await client.query(
        `UPDATE workflow_instances
         SET state = $2, version = version + 1, updated_at = now(), updated_by = $3,
             payload = coalesce(payload, '{}'::jsonb) || $4::jsonb
         WHERE id = $1`,
        [
          instanceId,
          transition.to,
          input.userId,
          JSON.stringify(input.payload ?? {}),
        ],
      );

      await client.query(
        `INSERT INTO workflow_transitions (
           tenant_id, workflow_instance_id, from_state, to_state, command_type, command_id,
           actor_user_id, actor_membership_id, reason, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [
          input.tenantId,
          instanceId,
          fromState,
          transition.to,
          input.commandType,
          commandId,
          input.userId,
          input.membershipId,
          input.reason ?? null,
          JSON.stringify({ correlationId: input.correlationId }),
        ],
      );

      const eventType = `${input.workflowCode}.${input.commandType}`;
      await this.outbox.write(client, {
        tenantId: input.tenantId,
        aggregateType: 'workflow_instance',
        aggregateId: instanceId,
        eventType,
        payload: {
          workflowCode: input.workflowCode,
          fromState,
          toState: transition.to,
          commandType: input.commandType,
          aggregateId: input.aggregateId,
        },
        idempotencyKey: `wf-event:${input.idempotencyKey}`,
      });

      // Notification queue row (async send)
      for (const template of spec.notifications.slice(0, 1)) {
        await client.query(
          `INSERT INTO workflow_notifications (
             tenant_id, workflow_instance_id, channel, template_code, recipient_ref, payload
           ) VALUES ($1,$2,'in_app',$3,$4,$5::jsonb)`,
          [
            input.tenantId,
            instanceId,
            template,
            input.studentMembershipId ?? input.userId,
            JSON.stringify({ toState: transition.to }),
          ],
        );
      }

      await this.audit.write(client, {
        tenantId: input.tenantId,
        actorUserId: input.userId,
        actorMembershipId: input.membershipId,
        action: 'workflow.transitioned',
        resourceType: 'workflow_instance',
        resourceId: instanceId,
        correlationId: input.correlationId,
        metadata: {
          workflowCode: input.workflowCode,
          fromState,
          toState: transition.to,
          commandType: input.commandType,
        },
      });

      const response = {
        workflowInstanceId: instanceId,
        workflowCode: input.workflowCode,
        fromState,
        toState: transition.to,
        commandId,
        terminal: isTerminal(spec, transition.to),
      };

      await client.query(
        `UPDATE workflow_commands
         SET status = 'applied', response_body = $2::jsonb, updated_at = now()
         WHERE id = $1`,
        [commandId, JSON.stringify(response)],
      );

      this.metrics.inc('workflow_transition_total', input.workflowCode);
      if (isTerminal(spec, transition.to)) {
        this.metrics.inc('workflow_completed_total', input.workflowCode);
      }

      return response;
    });
  }

  /**
   * Controlled aggregate touches only ù never free-form SQL from callers.
   */
  private async applyDomainSideEffect(
    client: PoolClient,
    input: WorkflowCommandInput,
    toState: string,
  ): Promise<void> {
    switch (input.workflowCode) {
      case 'enquiry_to_applicant':
        if (input.commandType === 'ConvertToApplicant') {
          await client.query(
            `UPDATE enquiries SET updated_at = now(), updated_by = $2 WHERE id = $1`,
            [input.aggregateId, input.userId],
          );
        }
        break;
      case 'application_to_admission':
        if (input.commandType === 'ExtendOffer') {
          const offer = `OFF-${input.aggregateId.toString().slice(0, 8)}`;
          await client.query(
            `INSERT INTO admissions (
               tenant_id, institution_id, application_id, person_id, offer_code, created_by, updated_by
             )
             SELECT a.tenant_id, a.institution_id, a.id, a.person_id, $2, $3, $3
             FROM applications a WHERE a.id = $1
             ON CONFLICT DO NOTHING`,
            [input.aggregateId, offer, input.userId],
          );
        }
        break;
      case 'examination_to_result':
        if (input.commandType === 'PublishResults') {
          // Marker only ù actual published_results inserts happen in exams module;
          // workflow records intent/completion without silent grade overwrites.
          await client.query(
            `UPDATE examination_cycles SET updated_at = now(), updated_by = $2 WHERE id = $1`,
            [input.aggregateId, input.userId],
          );
        }
        break;
      case 'abc_nad_credit_publication':
        if (input.commandType === 'ConfirmPublication') {
          await client.query(
            `UPDATE abc_nad_publications
             SET external_reference = coalesce(external_reference, $3),
                 updated_at = now(), updated_by = $2
             WHERE id = $1`,
            [
              input.aggregateId,
              input.userId,
              (input.payload?.externalReference as string) ?? null,
            ],
          );
        }
        break;
      default:
        // State machine + audit/outbox are the source of truth for other workflows.
        break;
    }
    void toState;
  }

  async getInstance(tenantId: string, userId: string, instanceId: string) {
    return this.db.withTenantTx(tenantId, userId, async (client) => {
      const inst = await client.query(
        `SELECT * FROM workflow_instances WHERE id = $1`,
        [instanceId],
      );
      if (!inst.rows[0]) {
        throw new ApiError('NOT_FOUND', 'Workflow instance not found', HttpStatus.NOT_FOUND);
      }
      const transitions = await client.query(
        `SELECT from_state, to_state, command_type, created_at, reason
         FROM workflow_transitions
         WHERE workflow_instance_id = $1
         ORDER BY created_at`,
        [instanceId],
      );
      return { instance: inst.rows[0], transitions: transitions.rows };
    });
  }
}
