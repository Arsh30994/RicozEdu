import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@ricozedu/shared-auth';
import { RequirePermissions } from '../iam/permission.guard';

/** Read-only stubs. No payment capture or webhook ingress. */
@ApiTags('fees')
@Controller('v1/fees')
export class FeesController {
  @Get('status')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  status() {
    return {
      module: 'fees',
      enabled: true,
      webhookIngress: false,
      note: 'Read stubs only. Public payment webhooks are not mounted.',
    };
  }
}
