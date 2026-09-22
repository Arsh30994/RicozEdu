import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { PlatformModule } from './platform/platform.module';
import { IamModule } from './iam/iam.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { PeopleModule } from './people/people.module';
import { StudentsModule } from './students/students.module';
import { AuditModule } from './audit/audit.module';
import { AcademicsModule } from './academics/academics.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { FeesModule } from './fees/fees.module';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    PlatformModule,
    IamModule,
    TenancyModule,
    PeopleModule,
    StudentsModule,
    AuditModule,
    AcademicsModule,
    LifecycleModule,
    FeesModule.register(),
  ],
})
export class AppModule {}
