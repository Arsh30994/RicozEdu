import { type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { isValidObjectId, Types } from 'mongoose';
import { Membership, Tenant, User, type ApiRole } from './models';
import { ApiRequest, asyncRoute, HttpError } from './http';
import { accessSecret } from './auth';

export const authenticate: RequestHandler = asyncRoute(async (request, _response, next) => {
  const authorization = request.header('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');

  let claims: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(match[1], accessSecret());
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string'
      || typeof decoded.av !== 'number' || typeof decoded.sid !== 'string') {
      throw new Error('Invalid claims');
    }
    claims = decoded;
  } catch {
    throw new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired access token.');
  }

  if (!isValidObjectId(claims.sub)) throw new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired access token.');
  const user = await User.findById(claims.sub).select('email status authorizationVersion');
  if (!user || user.status !== 'active' || user.authorizationVersion !== claims.av) {
    throw new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired access token.');
  }
  (request as ApiRequest).auth = {
    userId: user._id,
    email: user.email,
    authorizationVersion: user.authorizationVersion,
    sessionId: claims.sid,
  };
  next();
});

export const requireTenant: RequestHandler = asyncRoute(async (request, _response, next) => {
  const apiRequest = request as ApiRequest;
  const tenantId = request.header('x-tenant-id');
  if (!tenantId) throw new HttpError(400, 'TENANT_REQUIRED', 'X-Tenant-Id is required.');
  if (!isValidObjectId(tenantId)) throw new HttpError(400, 'INVALID_TENANT_ID', 'X-Tenant-Id must be a valid workspace ID.');
  if (!apiRequest.auth) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');

  const [tenant, membership] = await Promise.all([
    Tenant.findOne({ _id: tenantId, status: 'active' }).select('_id'),
    Membership.findOne({ tenantId, userId: apiRequest.auth.userId, status: 'active' }).select('_id role permissions'),
  ]);
  if (!tenant || !membership) throw new HttpError(403, 'TENANT_FORBIDDEN', 'You do not have access to this workspace.');
  apiRequest.tenant = {
    tenantId: tenant._id,
    membershipId: membership._id,
    role: membership.role,
    permissions: membership.permissions ?? [],
  };
  next();
});

export const rolePermissions: Record<ApiRole, readonly string[]> = {
  owner: ['*'],
  admin: ['institution.manage', 'access.read', 'access.manage', 'students.read', 'students.write', 'academics.manage', 'imports.manage', 'privacy.manage', 'audit.read'],
  faculty: ['students.read', 'students.write', 'academics.manage'],
  finance: ['students.read', 'finance.read', 'finance.write'],
  guardian: ['students.read.self'],
  student: ['students.read.self'],
};

export function hasPermission(role: ApiRole, granted: string[], permission: string): boolean {
  const defaults = rolePermissions[role];
  return [...defaults, ...granted].some((entry) => entry === '*' || entry === permission || entry === `${permission.split('.')[0]}.*`);
}

export function requireRoles(...roles: ApiRole[]): RequestHandler {
  return (request, _response, next) => {
    const role = (request as ApiRequest).tenant?.role;
    if (!role) return next(new HttpError(403, 'TENANT_REQUIRED', 'An active workspace membership is required.'));
    if (!roles.includes(role)) return next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    next();
  };
}

export function requirePermissions(...permissions: string[]): RequestHandler {
  return (request, _response, next) => {
    const tenant = (request as ApiRequest).tenant;
    if (!tenant) return next(new HttpError(403, 'TENANT_REQUIRED', 'An active workspace membership is required.'));
    if (!permissions.every((permission) => hasPermission(tenant.role, tenant.permissions, permission))) {
      return next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    }
    next();
  };
}
