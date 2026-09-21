import { Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { AuditWriter } from './audit-writer';
import { OutboxWriter } from './outbox-writer';

@Module({
  providers: [IdempotencyService, AuditWriter, OutboxWriter],
  exports: [IdempotencyService, AuditWriter, OutboxWriter],
})
export class CommonModule {}
