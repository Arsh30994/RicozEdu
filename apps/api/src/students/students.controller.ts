import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@ricozedu/shared-auth';
import {
  CreateStudentSchema,
  PatchStudentStatusSchema,
} from '@ricozedu/shared-types';
import { Request } from 'express';
import { rejectBodyTenantId } from '../common/api-error';
import { RequirePermissions } from '../iam/permission.guard';
import { StudentsService } from './students.service';

@ApiTags('students')
@ApiBearerAuth()
@Controller('v1/students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.STUDENT_MANAGE)
  async create(
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
    const parsed = CreateStudentSchema.parse(body);
    const idem =
      typeof req.headers['idempotency-key'] === 'string'
        ? req.headers['idempotency-key']
        : undefined;
    return this.students.create({
      tenantId: req.tenantId!,
      actorUserId: req.user!.userId,
      actorMembershipId: req.membershipId ?? null,
      correlationId: req.correlationId ?? '',
      idempotencyKey: idem,
      data: parsed,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.STUDENT_READ)
  async getOne(
    @Param('id') id: string,
    @Req() req: Request & { tenantId?: string; user?: { userId: string } },
  ) {
    return this.students.getById(req.tenantId!, req.user!.userId, id);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.STUDENT_MANAGE)
  async patchStatus(
    @Param('id') id: string,
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
    const parsed = PatchStudentStatusSchema.parse(body);
    return this.students.patchStatus({
      tenantId: req.tenantId!,
      actorUserId: req.user!.userId,
      actorMembershipId: req.membershipId ?? null,
      correlationId: req.correlationId ?? '',
      studentId: id,
      data: parsed,
    });
  }
}
