import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@ricozedu/shared-auth';
import { RequirePermissions, SensitiveAuthz } from '../iam/permission.guard';
import {
  AuthUser,
  CorrelationId,
  CurrentUser,
  MembershipId,
  TenantId,
} from '../common/request-context';
import { WorkflowService } from './workflow.service';
import { WorkflowCode } from './workflow-catalog';
import { WorkflowMetrics } from './workflow-metrics';

@ApiTags('lifecycle')
@Controller('v1/lifecycle')
export class LifecycleController {
  constructor(
    private readonly workflows: WorkflowService,
    private readonly metrics: WorkflowMetrics,
  ) {}

  @Get('workflows')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  listWorkflows() {
    return this.workflows.listSpecs();
  }

  @Get('workflows/:code')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  getWorkflow(@Param('code') code: WorkflowCode) {
    return this.workflows.getSpec(code);
  }

  @Get('instances/:id')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  getInstance(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.workflows.getInstance(tenantId!, user.userId, id);
  }

  @Get('metrics')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  getMetrics() {
    return this.metrics.snapshot();
  }

  @Post('commands')
  @RequirePermissions(PERMISSIONS.STUDENT_MANAGE)
  @SensitiveAuthz()
  execute(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @MembershipId() membershipId: string,
    @CorrelationId() correlationId: string,
    @Body()
    body: {
      workflowCode: WorkflowCode;
      commandType: string;
      idempotencyKey: string;
      aggregateType: string;
      aggregateId: string;
      institutionId?: string;
      personId?: string;
      studentMembershipId?: string;
      payload?: Record<string, unknown>;
      reason?: string;
      expectedAuthorizationVersion?: number;
      delegationId?: string;
      revalidateJob?: boolean;
    },
  ) {
    return this.workflows.executeCommand({
      tenantId: tenantId!,
      userId: user.userId,
      membershipId: membershipId!,
      correlationId,
      ...body,
    });
  }
}
