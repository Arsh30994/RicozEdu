import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ApiError } from '../common/api-error';
import { AuthUser } from '../common/request-context';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';

export const SKIP_TENANT_KEY = 'skipTenant';
export const SkipTenant = () => SetMetadata(SKIP_TENANT_KEY, true);

/**
 * Resolves tenant membership server-side from X-Tenant-Id.
 * Never trusts tenant_id from body/query/route as authority.
 */
@Injectable()
export class TenantMembershipGuard implements CanActivate {
  constructor(
    private readonly db: DatabaseService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || skipTenant) return true;

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      body?: Record<string, unknown>;
      user?: AuthUser;
      tenantId?: string;
      membershipId?: string;
      actingInstitutionId?: string;
    }>();

    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'tenantId')) {
      throw new ApiError(
        'VALIDATION',
        'tenantId must not be supplied in the request body',
        HttpStatus.BAD_REQUEST,
      );
    }

    const raw = req.headers['x-tenant-id'];
    const tenantId = typeof raw === 'string' ? raw : undefined;
    if (!tenantId) {
      throw new ApiError(
        'TENANT_REQUIRED',
        'X-Tenant-Id header is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!req.user) {
      throw new ApiError('UNAUTHORIZED', 'Not authenticated', HttpStatus.UNAUTHORIZED);
    }

    const instHeader = req.headers['x-institution-id'];
    const institutionId =
      typeof instHeader === 'string' && instHeader.length > 0
        ? instHeader
        : undefined;

    const verified = await this.db.withTenantTx(
      tenantId,
      req.user.userId,
      async (client) => {
        // Prefer institution-scoped membership when header present; else any active membership
        if (institutionId) {
          const scoped = await client.query<{ id: string }>(
            `SELECT id FROM user_memberships
             WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
               AND (institution_id IS NULL OR institution_id = $3)
             ORDER BY institution_id NULLS LAST
             LIMIT 1`,
            [tenantId, req.user!.userId, institutionId],
          );
          return scoped.rows[0] ?? null;
        }
        const r = await client.query<{ id: string }>(
          `SELECT id FROM user_memberships
           WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
           LIMIT 1`,
          [tenantId, req.user!.userId],
        );
        return r.rows[0] ?? null;
      },
    );

    if (!verified) {
      throw new ApiError(
        'FORBIDDEN_TENANT',
        'No active membership for tenant',
        HttpStatus.FORBIDDEN,
      );
    }

    req.tenantId = tenantId;
    req.membershipId = verified.id;
    req.actingInstitutionId = institutionId;
    return true;
  }
}
