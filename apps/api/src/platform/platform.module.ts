import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  controllers: [HealthController],
  providers: [OutboxRelayService],
})
export class PlatformModule {}
