import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantMembershipGuard } from './tenant-membership.guard';
import { PermissionGuard } from './permission.guard';
import { PermissionService } from './permission.service';
import { UsersService } from './users.service';
import { MembershipsService } from './memberships.service';
import { RolesService } from './roles.service';
import { IamController } from './iam.controller';
import { MeController } from './me.controller';
import { ScopeResolver } from './scope-resolver';
import { RevocationService } from './revocation.service';
import { DelegationService } from './delegation.service';

@Module({
  controllers: [AuthController, IamController, MeController],
  providers: [
    AuthService,
    PermissionService,
    ScopeResolver,
    RevocationService,
    DelegationService,
    UsersService,
    MembershipsService,
    RolesService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantMembershipGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [
    AuthService,
    PermissionService,
    ScopeResolver,
    RevocationService,
    DelegationService,
  ],
})
export class IamModule {}
