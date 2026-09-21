import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HttpStatus } from '@nestjs/common';
import { PermissionCode } from '@ricozedu/shared-auth';
import { PermissionService } from './permission.service';
import { ScopeResolver } from './scope-resolver';
import { ApiError } from '../common/api-error';
import { AuthUser } from '../common/request-context';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';
import { SKIP_TENANT_KEY } from './tenant-membership.guard';
import { ResourceRef } from './permission-evaluator';
import { AuditWriter } from '../common/audit-writer';
import { DatabaseService } from '../database/database.service';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...perms: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);

/** Mark handler as sensitive: bypass permission cache and re-load grants. */
export const SENSITIVE_KEY = 'sensitiveAuthz';
export const SensitiveAuthz = () => SetMetadata(SENSITIVE_KEY, true);

/** Optional metadata: build resource ref from request params/body/headers. */
export const RESOURCE_SCOPE_KEY = 'resourceScope';
export type ResourceScopeFactory = (req: Record<string, unknown>) => Partial<ResourceRef>;
export const WithResourceScope = (factory: ResourceScopeFactory) =>
  SetMetadata(RESOURCE_SCOPE_KEY, factory);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly permissions: PermissionService,
    private readonly scopes: ScopeResolver,
    private readonly reflector: Reflector,
    private readonly audit: AuditWriter,
    private readonly db: DatabaseService,
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

    const required = this.reflector.getAllAndOverride<PermissionCode[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{
      user?: AuthUser;
      tenantId?: string;
      membershipId?: string;
      correlationId?: string;
      headers: Record<string, string | string[] | undefined>;
      params: Record<string, string>;
      body: Record<string, unknown>;
    }>();

    if (!req.user || !req.tenantId) {
      throw new ApiError('FORBIDDEN', 'Missing auth context', HttpStatus.FORBIDDEN);
    }

    // Never trust tenant_id from body
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'tenantId')) {
      throw new ApiError(
        'VALIDATION',
        'tenantId must not be supplied in the request body',
        HttpStatus.BAD_REQUEST,
      );
    }

    const sensitive = this.reflector.getAllAndOverride<boolean>(SENSITIVE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const factory = this.reflector.getAllAndOverride<ResourceScopeFactory | undefined>(
      RESOURCE_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const headerScope = this.scopes.mergeRequestScopeHeaders(
      req.tenantId,
      req.headers,
    );

    const resource: ResourceRef = {
      tenantId: req.tenantId,
      ...headerScope,
      ...(factory
        ? factory({
            params: req.params,
            body: req.body,
            headers: req.headers,
            tenantId: req.tenantId,
          })
        : {}),
    };

    if (sensitive || factory) {
      const { allowed } = await this.scopes.authorize(
        req.user.userId,
        req.tenantId,
        required,
        resource,
        { revalidate: true },
      );
      if (!allowed) {
        await this.deny(req, required);
        return false;
      }
      return true;
    }

    const granted = await this.permissions.getPermissions(
      req.user.userId,
      req.tenantId,
      req.user.authorizationVersion,
    );
    const ok = required.every((p) => granted.has(p));
    if (!ok) {
      await this.deny(req, required);
      return false;
    }
    return true;
  }

  private async deny(
    req: {
      user?: AuthUser;
      tenantId?: string;
      membershipId?: string;
      correlationId?: string;
    },
    required: string[],
  ): Promise<never> {
    if (req.tenantId && req.user) {
      try {
        await this.db.withTenantTx(req.tenantId, req.user.userId, async (client) => {
          await this.audit.write(client, {
            tenantId: req.tenantId!,
            actorUserId: req.user!.userId,
            actorMembershipId: req.membershipId ?? null,
            action: 'permission.denied',
            resourceType: 'permission',
            resourceId: null,
            correlationId: req.correlationId ?? '00000000-0000-0000-0000-000000000000',
            metadata: { required },
          });
        });
      } catch {
        /* never block deny path on audit failure */
      }
    }
    throw new ApiError(
      'FORBIDDEN',
      'Missing required permission',
      HttpStatus.FORBIDDEN,
      { required },
    );
  }
}
