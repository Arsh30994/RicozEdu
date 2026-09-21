import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
} from '@ricozedu/shared-types';
import { AuthService } from './auth.service';
import { Public } from './jwt-auth.guard';
import { SkipTenant } from './tenant-membership.guard';
import { Request } from 'express';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @SkipTenant()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: Request & { correlationId?: string },
  ) {
    const parsed = LoginRequestSchema.parse(body);
    return this.auth.login(parsed.email, parsed.password, req.correlationId ?? '');
  }

  @Public()
  @SkipTenant()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() body: unknown,
    @Req() req: Request & { correlationId?: string },
  ) {
    const parsed = RefreshRequestSchema.parse(body);
    return this.auth.refresh(parsed.refreshToken, req.correlationId ?? '');
  }

  @Public()
  @SkipTenant()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() body: unknown,
    @Req() req: Request & { correlationId?: string },
  ) {
    const parsed = RefreshRequestSchema.parse(body);
    await this.auth.logout(parsed.refreshToken, req.correlationId ?? '');
  }
}
