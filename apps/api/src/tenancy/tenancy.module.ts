import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { InstitutionsService } from './institutions.service';
import { TenancyController } from './tenancy.controller';
import { IamModule } from '../iam/iam.module';

@Module({
  imports: [IamModule],
  controllers: [TenancyController],
  providers: [TenantsService, InstitutionsService],
  exports: [TenantsService],
})
export class TenancyModule {}
