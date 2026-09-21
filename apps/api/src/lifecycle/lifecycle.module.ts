import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { WorkflowService } from './workflow.service';
import { WorkflowMetrics } from './workflow-metrics';
import { LifecycleController } from './lifecycle.controller';

@Module({
  imports: [IamModule],
  controllers: [LifecycleController],
  providers: [WorkflowService, WorkflowMetrics],
  exports: [WorkflowService, WorkflowMetrics],
})
export class LifecycleModule {}
