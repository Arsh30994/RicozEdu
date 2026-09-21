import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@ricozedu/shared-auth';
import {
  CreateCampusSchema,
  CreateInstitutionSchema,
  CreateTenantSchema,
} from '@ricozedu/shared-types';
import { Request } from 'express';
import { ApiError, rejectBodyTenantId } from '../common/api-error';
import { Public } from '../iam/jwt-auth.guard';
import { SkipTenant } from '../iam/tenant-membership.guard';
import { RequirePermissions } from '../iam/permission.guard';
import { TenantsService } from './tenants.service';
import { InstitutionsService } from './institutions.service';

@ApiTags('tenancy')
@Controller('v1')
export class TenancyController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly institutions: InstitutionsService,
  ) {}

  @Public()
  @SkipTenant()
  @Post('tenants')
  @HttpCode(201)
  @ApiHeader({ name: 'X-Bootstrap-Token', required: true })
  async bootstrapTenant(
    @Body() body: unknown,
    @Headers('x-bootstrap-token') bootstrapToken: string | undefined,
    @Req()
    req: Request & {
      correlationId?: string;
      headers: Record<string, string | string[] | undefined>;
    },
  ) {
    const expected = process.env.BOOTSTRAP_ADMIN_TOKEN;
    if (!expected || bootstrapToken !== expected) {
      throw new ApiError(
        'BOOTSTRAP_FORBIDDEN',
        'Invalid bootstrap token',
        HttpStatus.UNAUTHORIZED,
      );
    }
    rejectBodyTenantId(body);
    const parsed = CreateTenantSchema.parse(body);
    const idem =
      typeof req.headers['idempotency-key'] === 'string'
        ? req.headers['idempotency-key']
        : undefined;
    return this.tenants.bootstrap(parsed, req.correlationId ?? '', idem);
  }

  @Get('tenants/current')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.TENANT_READ)
  async currentTenant(
    @Req() req: Request & { tenantId?: string; user?: { userId: string } },
  ) {
    return this.tenants.getCurrent(req.tenantId!, req.user!.userId);
  }

  @Post('institutions')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.INSTITUTION_MANAGE)
  async createInstitution(
    @Body() body: unknown,
    @Req()
    req: Request & {
      tenantId?: string;
      user?: { userId: string };
      membershipId?: string;
      correlationId?: string;
    },
  ) {
    rejectBodyTenantId(body);
    const parsed = CreateInstitutionSchema.parse(body);
    return this.institutions.create(
      req.tenantId!,
      req.user!.userId,
      req.membershipId ?? null,
      req.correlationId ?? '',
      parsed,
    );
  }

  @Get('institutions')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.INSTITUTION_READ)
  async listInstitutions(
    @Req() req: Request & { tenantId?: string; user?: { userId: string } },
  ) {
    return this.institutions.list(req.tenantId!, req.user!.userId);
  }

  @Post('campuses')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.INSTITUTION_MANAGE)
  async createCampus(
    @Body() body: unknown,
    @Req()
    req: Request & {
      tenantId?: string;
      user?: { userId: string };
      membershipId?: string;
      correlationId?: string;
    },
  ) {
    rejectBodyTenantId(body);
    const parsed = CreateCampusSchema.parse(body);
    return this.institutions.createCampus(
      req.tenantId!,
      req.user!.userId,
      req.membershipId ?? null,
      req.correlationId ?? '',
      parsed,
    );
  }
}
