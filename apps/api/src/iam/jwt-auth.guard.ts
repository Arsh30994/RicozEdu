import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DatabaseService } from '../database/database.service';
import { ApiError } from '../common/api-error';
import { AuthUser } from '../common/request-context';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly db: DatabaseService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthUser;
    }>();
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new ApiError('UNAUTHORIZED', 'Missing bearer token', HttpStatus.UNAUTHORIZED);
    }
    const token = header.slice('Bearer '.length);
    const claims = this.auth.verifyAccess(token);

    const users = await this.db.query<{
      id: string;
      authorization_version: number;
      status: string;
    }>(
      `SELECT id, authorization_version, status FROM users WHERE id = $1`,
      [claims.sub],
    );
    const user = users.rows[0];
    if (!user || user.status !== 'active') {
      throw new ApiError('UNAUTHORIZED', 'User not active', HttpStatus.UNAUTHORIZED);
    }
    if (user.authorization_version !== claims.av) {
      throw new ApiError(
        'TOKEN_REVOKED',
        'Access token authorization version mismatch',
        HttpStatus.UNAUTHORIZED,
      );
    }

    req.user = {
      userId: user.id,
      authorizationVersion: user.authorization_version,
      sessionId: claims.sid,
    };
    return true;
  }
}
