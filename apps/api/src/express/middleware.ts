import { type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { isValidObjectId, Types } from 'mongoose';
import { Membership, Tenant, User } from './models';
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
    Membership.findOne({ tenantId, userId: apiRequest.auth.userId, status: 'active' }).select('_id role'),
  ]);
  if (!tenant || !membership) throw new HttpError(403, 'TENANT_FORBIDDEN', 'You do not have access to this workspace.');
  apiRequest.tenant = {
    tenantId: tenant._id,
    membershipId: membership._id,
    role: membership.role,
  };
  next();
});

export function requireRoles(...roles: Array<'owner' | 'admin' | 'faculty' | 'student'>): RequestHandler {
  return (request, _response, next) => {
    const role = (request as ApiRequest).tenant?.role;
    if (!role) return next(new HttpError(403, 'TENANT_REQUIRED', 'An active workspace membership is required.'));
    if (!roles.includes(role)) return next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    next();
  };
}
