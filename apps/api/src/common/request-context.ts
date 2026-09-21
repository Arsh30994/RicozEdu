import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  userId: string;
  authorizationVersion: number;
  sessionId: string;
  email?: string;
}

export interface RequestContext {
  user?: AuthUser;
  tenantId?: string;
  membershipId?: string;
  correlationId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    return req.user;
  },
);

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<{ tenantId?: string }>();
    return req.tenantId;
  },
);

export const CorrelationId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ correlationId?: string }>();
    return req.correlationId ?? '';
  },
);

export const MembershipId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<{ membershipId?: string }>();
    return req.membershipId;
  },
);
