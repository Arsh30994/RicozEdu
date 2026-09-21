import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@ricozedu/shared-auth';
import { Request } from 'express';
import { RequirePermissions } from '../iam/permission.guard';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('v1/audit-events')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async list(
    @Req() req: Request & { tenantId?: string; user?: { userId: string } },
    @Query('limit') limit?: string,
  ) {
    const n = Math.min(Math.max(Number(limit ?? 50), 1), 200);
    return this.audit.list(req.tenantId!, req.user!.userId, n);
  }
}
