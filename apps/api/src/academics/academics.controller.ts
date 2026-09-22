import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@ricozedu/shared-auth';
import { RuleDocument } from '@ricozedu/shared-types';
import { RequirePermissions, SensitiveAuthz } from '../iam/permission.guard';
import {
  CorrelationId,
  CurrentUser,
  MembershipId,
  TenantId,
  AuthUser,
} from '../common/request-context';
import { AcademicsService } from './academics.service';

@ApiTags('academics')
@Controller('v1/academics')
export class AcademicsController {
  constructor(private readonly academics: AcademicsService) {}

  @Post('programme-versions')
  @RequirePermissions(PERMISSIONS.ACADEMIC_MANAGE)
  createProgrammeVersion(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @MembershipId() membershipId: string,
    @CorrelationId() correlationId: string,
    @Body()
    body: {
      programmeId: string;
      versionLabel: string;
      effectiveFrom: string;
      totalCredits: number;
      rulesDocument?: RuleDocument;
      nepConfig?: Record<string, unknown>;
      cbcsConfig?: Record<string, unknown>;
    },
  ) {
    return this.academics.createProgrammeVersion({
      tenantId: tenantId!,
      userId: user.userId,
      membershipId: membershipId!,
      correlationId,
      ...body,
    });
  }

  @Post('programme-versions/:id/publish')
  @RequirePermissions(PERMISSIONS.ACADEMIC_MANAGE)
  @SensitiveAuthz()
  publishProgrammeVersion(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @MembershipId() membershipId: string,
    @CorrelationId() correlationId: string,
    @Param('id') id: string,
    @Body() body: { runSimulation?: boolean },
  ) {
    return this.academics.publishProgrammeVersion({
      tenantId: tenantId!,
      userId: user.userId,
      membershipId: membershipId!,
      correlationId,
      programmeVersionId: id,
      runSimulation: body?.runSimulation,
    });
  }

  @Post('curriculum-versions/:id/publish')
  @RequirePermissions(PERMISSIONS.ACADEMIC_MANAGE)
  @SensitiveAuthz()
  publishCurriculumVersion(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @MembershipId() membershipId: string,
    @CorrelationId() correlationId: string,
    @Param('id') id: string,
  ) {
    return this.academics.publishCurriculumVersion({
      tenantId: tenantId!,
      userId: user.userId,
      membershipId: membershipId!,
      correlationId,
      curriculumVersionId: id,
    });
  }

  @Post('registration/check')
  @RequirePermissions(PERMISSIONS.ACADEMIC_READ)
  checkRegistration(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @MembershipId() membershipId: string,
    @CorrelationId() correlationId: string,
    @Body()
    body: { studentMembershipId: string; courseVersionId: string },
  ) {
    return this.academics.checkRegistration({
      tenantId: tenantId!,
      userId: user.userId,
      membershipId: membershipId!,
      correlationId,
      ...body,
    });
  }

  @Get('progress')
  @RequirePermissions(PERMISSIONS.STUDENT_READ)
  getProgress(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Query('studentMembershipId') studentMembershipId: string,
    @Query('programmeEnrolmentId') programmeEnrolmentId: string,
  ) {
    return this.academics.getDegreeProgress({
      tenantId: tenantId!,
      userId: user.userId,
      studentMembershipId,
      programmeEnrolmentId,
    });
  }
}
