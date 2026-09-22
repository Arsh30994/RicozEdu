import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/request-context';
import { SkipTenant } from './tenant-membership.guard';
import { MembershipsService } from './memberships.service';
import { DatabaseService } from '../database/database.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('v1/me')
export class MeController {
  constructor(
    private readonly memberships: MembershipsService,
    private readonly db: DatabaseService,
  ) {}

  @Get()
  @SkipTenant()
  async profile(@CurrentUser() user: AuthUser) {
    const r = await this.db.query<{ id: string; email: string; status: string }>(
      `SELECT id, email, status FROM users WHERE id = $1`,
      [user.userId],
    );
    const row = r.rows[0];
    return {
      id: row?.id ?? user.userId,
      email: row?.email ?? null,
      status: row?.status ?? 'unknown',
    };
  }

  @Get('memberships')
  @SkipTenant()
  listMemberships(@CurrentUser() user: AuthUser) {
    return this.memberships.listForUser(user.userId);
  }
}
