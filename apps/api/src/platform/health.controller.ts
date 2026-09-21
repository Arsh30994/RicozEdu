import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../database/redis.service';
import { Public } from '../iam/jwt-auth.guard';
import { SkipTenant } from '../iam/tenant-membership.guard';
import { ApiError } from '../common/api-error';
import { HttpStatus } from '@nestjs/common';

@ApiTags('platform')
@Controller()
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @SkipTenant()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Public()
  @SkipTenant()
  @Get('ready')
  async ready() {
    try {
      await this.db.query('SELECT 1');
    } catch {
      throw new ApiError('NOT_READY', 'Database unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }

    let redisOk = true;
    if (this.redis.client) {
      try {
        const pong = await this.redis.client.ping();
        redisOk = pong === 'PONG';
      } catch {
        redisOk = false;
      }
    }

    if (!redisOk) {
      throw new ApiError('NOT_READY', 'Redis unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }

    return { status: 'ready', database: true, redis: redisOk };
  }
}
