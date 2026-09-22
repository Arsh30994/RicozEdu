import { DynamicModule, Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { FeesController } from './fees.controller';

export function isFeesModuleEnabled(): boolean {
  const v = (process.env.MODULES_FEES_ENABLED ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Student fees domain. Default OFF — schema/engines may exist without HTTP surface.
 * Never mounts payment webhooks until MODULES_FEES_WEBHOOKS_ENABLED is introduced separately.
 */
@Module({})
export class FeesModule {
  static register(): DynamicModule {
    if (!isFeesModuleEnabled()) {
      return {
        module: FeesModule,
      };
    }
    return {
      module: FeesModule,
      imports: [IamModule],
      controllers: [FeesController],
    };
  }
}
