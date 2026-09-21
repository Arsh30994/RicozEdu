import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@ricozedu/shared-auth';
import {
  CreateMembershipSchema,
  CreateRoleBindingSchema,
  CreateUserSchema,
} from '@ricozedu/shared-types';
import { Request } from 'express';
import { rejectBodyTenantId } from '../common/api-error';
import { RequirePermissions } from './permission.guard';
import { UsersService } from './users.service';
import { MembershipsService } from './memberships.service';
import { RolesService } from './roles.service';

@ApiTags('iam')
@ApiBearerAuth()
@Controller('v1')
export class IamController {
  constructor(
    private readonly users: UsersService,
    private readonly memberships: MembershipsService,
    private readonly roles: RolesService,
  ) {}

  @Post('users')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_MANAGE)
  async createUser(
    @Body() body: unknown,
    @Req()
    req: Request & {
      user?: { userId: string };
      tenantId?: string;
      membershipId?: string;
      correlationId?: string;
      headers: Record<string, string | string[] | undefined>;
    },
  ) {
    rejectBodyTenantId(body);
    const parsed = CreateUserSchema.parse(body);
    const idem =
      typeof req.headers['idempotency-key'] === 'string'
        ? req.headers['idempotency-key']
        : undefined;
    return this.users.create({
      tenantId: req.tenantId!,
      actorUserId: req.user!.userId,
      actorMembershipId: req.membershipId ?? null,
      correlationId: req.correlationId ?? '',
      idempotencyKey: idem,
      data: parsed,
    });
  }

  @Post('memberships')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_MANAGE)
  async createMembership(
    @Body() body: unknown,
    @Req()
    req: Request & {
      user?: { userId: string };
      tenantId?: string;
      membershipId?: string;
      correlationId?: string;
      headers: Record<string, string | string[] | undefined>;
    },
  ) {
    rejectBodyTenantId(body);
    const parsed = CreateMembershipSchema.parse(body);
    const idem =
      typeof req.headers['idempotency-key'] === 'string'
        ? req.headers['idempotency-key']
        : undefined;
    return this.memberships.create({
      tenantId: req.tenantId!,
      actorUserId: req.user!.userId,
      actorMembershipId: req.membershipId ?? null,
      correlationId: req.correlationId ?? '',
      idempotencyKey: idem,
      data: parsed,
    });
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  async listRoles(
    @Req() req: Request & { tenantId?: string; user?: { userId: string } },
  ) {
    return this.roles.list(req.tenantId!, req.user!.userId);
  }

  @Post('roles/:id/bindings')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  async bindRole(
    @Param('id') roleId: string,
    @Body() body: unknown,
    @Req()
    req: Request & {
      user?: { userId: string };
      tenantId?: string;
      membershipId?: string;
      correlationId?: string;
    },
  ) {
    rejectBodyTenantId(body);
    const parsed = CreateRoleBindingSchema.parse(body);
    return this.roles.bind({
      tenantId: req.tenantId!,
      actorUserId: req.user!.userId,
      actorMembershipId: req.membershipId ?? null,
      correlationId: req.correlationId ?? '',
      roleId,
      data: parsed,
    });
  }
}
