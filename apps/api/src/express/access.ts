import { Router, type Router as ExpressRouter } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { AuditEvent, Membership, User, type ApiRole } from './models';
import { ApiRequest, asyncRoute, HttpError } from './http';
import { requirePermissions, requireTenant, rolePermissions } from './middleware';

const roles = ['owner', 'admin', 'faculty', 'finance', 'guardian', 'student'] as const;
const customPermissionSchema = z.string().trim().regex(/^[a-z]+\.(?:[a-z]+|\*)$/, 'Use a namespace.action permission.').max(80);
const membershipUpdateSchema = z.object({
  role: z.enum(roles).optional(),
  permissions: z.array(customPermissionSchema).max(30).optional(),
  status: z.enum(['active', 'suspended']).optional(),
}).strict();

function serializeMembership(membership: {
  _id: { toString(): string };
  userId: { toString(): string };
  role: ApiRole;
  permissions?: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}, names: Map<string, { email: string; fullName: string }>) {
  const user = names.get(membership.userId.toString());
  return {
    id: membership._id.toString(),
    userId: membership.userId.toString(),
    user: user ?? null,
    role: membership.role,
    permissions: membership.permissions ?? [],
    status: membership.status,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  };
}

export const accessRouter: ExpressRouter = Router();
accessRouter.use(requireTenant);

accessRouter.get('/access/permissions', requirePermissions('access.read'), (_request, response) => {
  response.json({ roles: rolePermissions });
});

accessRouter.get('/memberships', requirePermissions('access.read'), asyncRoute(async (request, response) => {
  const apiRequest = request as ApiRequest;
  const memberships = await Membership.find({ tenantId: apiRequest.tenant!.tenantId }).sort({ createdAt: 1 });
  const users = await User.find({ _id: { $in: memberships.map((membership) => membership.userId) } }).select('email fullName');
  const names = new Map(users.map((user) => [user._id.toString(), { email: user.email, fullName: user.fullName }]));
  response.json({ items: memberships.map((membership) => serializeMembership(membership, names)) });
}));

accessRouter.patch('/memberships/:id', requirePermissions('access.manage'), asyncRoute(async (request, response) => {
  if (!isValidObjectId(request.params.id)) throw new HttpError(400, 'INVALID_ID', 'The membership ID is invalid.');
  if (request.body && typeof request.body === 'object' && 'tenantId' in request.body) {
    throw new HttpError(400, 'BODY_TENANT_ID_NOT_ALLOWED', 'Choose the workspace using X-Tenant-Id, not the request body.');
  }
  const input = membershipUpdateSchema.parse(request.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'NO_CHANGES', 'Provide at least one membership setting to update.');
  const apiRequest = request as ApiRequest;
  const membership = await Membership.findOne({ _id: request.params.id, tenantId: apiRequest.tenant!.tenantId });
  if (!membership) throw new HttpError(404, 'MEMBERSHIP_NOT_FOUND', 'Membership not found.');
  if (membership._id.equals(apiRequest.tenant!.membershipId) && (input.role || input.status)) {
    throw new HttpError(409, 'SELF_MEMBERSHIP_CHANGE_FORBIDDEN', 'Use a different owner to change your own role or access status.');
  }
  if (input.role === 'owner' && apiRequest.tenant!.role !== 'owner') {
    throw new HttpError(403, 'FORBIDDEN', 'Only an owner can grant the owner role.');
  }
  if (membership.role === 'owner' && apiRequest.tenant!.role !== 'owner') {
    throw new HttpError(403, 'FORBIDDEN', 'Only an owner can change another owner membership.');
  }

  membership.set(input);
  await membership.save();
  await AuditEvent.create({
    tenantId: apiRequest.tenant!.tenantId,
    actorUserId: apiRequest.auth!.userId,
    action: 'membership.updated',
    resourceType: 'membership',
    resourceId: membership._id.toString(),
    correlationId: apiRequest.correlationId,
    metadata: { changed: Object.keys(input) },
  });
  const user = await User.findById(membership.userId).select('email fullName');
  const names = new Map<string, { email: string; fullName: string }>();
  if (user) names.set(user._id.toString(), { email: user.email, fullName: user.fullName });
  response.json(serializeMembership(membership, names));
}));
