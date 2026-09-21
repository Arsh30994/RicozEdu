import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@ricozedu/shared-auth';
import { CreatePersonSchema } from '@ricozedu/shared-types';
import { Request } from 'express';
import { rejectBodyTenantId } from '../common/api-error';
import { RequirePermissions } from '../iam/permission.guard';
import { PersonsService } from './persons.service';

@ApiTags('people')
@ApiBearerAuth()
@Controller('v1/persons')
export class PeopleController {
  constructor(private readonly persons: PersonsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.PERSON_MANAGE)
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
    const parsed = CreatePersonSchema.parse(body);
    const idem =
      typeof req.headers['idempotency-key'] === 'string'
        ? req.headers['idempotency-key']
        : undefined;
    return this.persons.create({
      tenantId: req.tenantId!,
      actorUserId: req.user!.userId,
      actorMembershipId: req.membershipId ?? null,
      correlationId: req.correlationId ?? '',
      idempotencyKey: idem,
      data: parsed,
    });
  }
}
